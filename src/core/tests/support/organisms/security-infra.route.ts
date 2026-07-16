import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { basename, resolve } from 'path';
import { logger } from '@utils/logger';
import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { SecurityContractLoader } from '@core/contracts/security-contract-loader';
import {
    writeWebSecuritySection,
    writeMobsfReport,
    type MobsfFinding,
    type MobsfPlatformReport,
} from '@core/tests/support/security-report-writer';
import type { MobsfSpec } from '@core/contracts/security-contract.types';

const log = logger.child({ layer: 'route', domain: 'security-infra' });
const REPO_ROOT = resolve(__dirname, '../../../../..');

interface ZapSummary {
    findings: Array<{ name: string; risk: string; confidence: string; instances: number }>;
    byRisk: Record<string, number>;
}

/**
 * Infra-shaped security (whole-app). Unlike the contract-shaped login gate,
 * these are broad, noisy, one-shot scans with no single owning domain —
 * they RECORD to the dashboard rather than gate the build (each catch keeps
 * one failing tool from blocking the rest). The gate that actually enforces
 * a ceiling is LoginRoute.verifySecurityGate (ZAP active API scan).
 */
export class SecurityInfraRoute {
    private get zapEnabled(): boolean {
        return (process.env.PLUGIN_ZAP ?? 'false').toLowerCase() === 'true';
    }

    private get mobsfEnabled(): boolean {
        return (process.env.PLUGIN_MOBSF ?? 'false').toLowerCase() === 'true';
    }

    /** Passive ZAP crawl of the running frontend. Recorded, never gated. */
    async runBaselineScan(): Promise<void> {
        const contract = SecurityContractLoader.load('support');
        const spec = contract.web?.zapBaselineScan;
        if (spec?.enabled === false || !spec?.targetUrl) return;
        if (!this.zapEnabled) {
            log.warn('runBaselineScan: PLUGIN_ZAP off — skipping ZAP baseline crawl');
            return;
        }
        try {
            log.info({ targetUrl: spec.targetUrl }, 'Running ZAP baseline (passive) crawl');
            await sendIntent(
                INTENT.RUN_ZAP_BASELINE_SCAN,
                JSON.stringify({ targetUrl: spec.targetUrl, timeoutMs: spec.timeoutMs }),
                'zap',
            );
            const parsed = await sendIntent(INTENT.PARSE_ZAP_REPORT, '', 'zap');
            const summary = JSON.parse(parsed.payload) as ZapSummary;
            writeWebSecuritySection({
                targetUrl: spec.targetUrl,
                baseline: { byRisk: summary.byRisk, findings: summary.findings },
            });
            log.info({ byRisk: summary.byRisk }, 'ZAP baseline complete');
        } catch (err) {
            log.error({ err: (err as Error).message }, 'ZAP baseline failed (recorded, non-fatal)');
        }
    }

    /** testssl.sh inspection of the deployed API host. Recorded, non-fatal. */
    async runTlsCheck(): Promise<void> {
        const contract = SecurityContractLoader.load('support');
        const spec = contract.web?.tls;
        if (spec?.enabled === false || !spec?.targetUrl) return;
        try {
            log.info({ targetUrl: spec.targetUrl }, 'Running TLS check');
            const result = await sendIntent(
                INTENT.RUN_TLS_CHECK,
                JSON.stringify({ targetUrl: spec.targetUrl, timeoutMs: spec.timeoutMs }),
                'api',
            );
            const { reportPath } = JSON.parse(result.payload) as { reportPath: string };
            writeWebSecuritySection({ tls: { pass: true, reportPath } });
            log.info({ reportPath }, 'TLS check passed');
        } catch (err) {
            writeWebSecuritySection({ tls: { pass: false, reportPath: 'reports/security/testssl/testssl.json' } });
            log.warn({ err: (err as Error).message }, 'TLS check reported issues (recorded, non-fatal)');
        }
    }

    /** MobSF static analysis of each platform binary. Recorded, non-fatal. */
    async runMobsfScans(): Promise<void> {
        const contract = SecurityContractLoader.load('support');
        const specs = contract.mobile?.mobsf ?? [];
        if (!specs.length) return;
        if (!this.mobsfEnabled) {
            log.warn('runMobsfScans: PLUGIN_MOBSF off — skipping MobSF static analysis');
            return;
        }
        for (const spec of specs) {
            if (spec.enabled === false) continue;
            await this.scanOne(spec);
        }
    }

    private async scanOne(spec: MobsfSpec): Promise<void> {
        let artifact: string;
        try {
            artifact = this.resolveArtifact(spec);
        } catch (err) {
            log.error({ platform: spec.platform, err: (err as Error).message }, 'MobSF artifact prep failed');
            return;
        }
        try {
            log.info({ platform: spec.platform, artifact }, 'Running MobSF static scan');
            const scan = await sendIntent(
                INTENT.RUN_MOBSF_APK_SCAN,
                JSON.stringify({ filePath: artifact, timeoutMs: spec.timeoutMs }),
                'mobsf',
            );
            void scan;
            const parsed = await sendIntent(INTENT.PARSE_MOBSF_REPORT, '', 'mobsf');
            const summary = JSON.parse(parsed.payload) as {
                securityScore: number | null;
                high: number;
                warning: number;
                report: Record<string, unknown>;
            };
            const report: MobsfPlatformReport = {
                platform: spec.platform,
                appFile: basename(artifact),
                securityScore: summary.securityScore,
                high: Number(summary.high ?? 0),
                warning: Number(summary.warning ?? 0),
                info: extractInfoCount(summary.report),
                findings: extractFindings(summary.report),
                raw: undefined,
            };
            writeMobsfReport(report);
            log.info(
                { platform: spec.platform, securityScore: report.securityScore, high: report.high, warning: report.warning },
                'MobSF scan complete',
            );
        } catch (err) {
            log.error({ platform: spec.platform, err: (err as Error).message }, 'MobSF scan failed (recorded, non-fatal)');
        }
    }

    /**
     * MobSF ingests a file. The Android APK is already one; the iOS artifact
     * is a simulator `.app` directory, which MobSF cannot read directly, so
     * we wrap it in the Payload/ IPA layout on the fly. Simulator builds only
     * yield partial static findings (no device entitlements), which is called
     * out in the report — enough to exercise the pipeline end-to-end.
     */
    private resolveArtifact(spec: MobsfSpec): string {
        const abs = resolve(REPO_ROOT, spec.filePath);
        if (!existsSync(abs)) throw new Error(`app artifact not found: ${abs}`);
        if (spec.platform === 'ios' && statSync(abs).isDirectory() && abs.endsWith('.app')) {
            return packageIpa(abs);
        }
        return abs;
    }
}

/** Build a Payload/<App>.app/ IPA next to the .app so MobSF can consume it. */
function packageIpa(appDir: string): string {
    const stageRoot = resolve(REPO_ROOT, 'reports/security/ios-pkg');
    const payload = resolve(stageRoot, 'Payload');
    const ipaPath = resolve(REPO_ROOT, 'reports/security/OmniPizza.ipa');
    rmSync(stageRoot, { recursive: true, force: true });
    rmSync(ipaPath, { force: true });
    mkdirSync(payload, { recursive: true });
    execFileSync('cp', ['-R', appDir, payload + '/']);
    // -y stores symlinks as-is; keep it quiet; produce a standard IPA zip.
    execFileSync('zip', ['-q', '-r', '-y', ipaPath, 'Payload'], { cwd: stageRoot });
    return ipaPath;
}

/** MobSF (newer) exposes findings under `appsec.{high,warning,info,secure}`. */
function extractFindings(report: Record<string, unknown>): MobsfFinding[] {
    const appsec = report.appsec as Record<string, unknown> | undefined;
    if (!appsec) return [];
    const out: MobsfFinding[] = [];
    const buckets: Array<MobsfFinding['severity']> = ['high', 'warning', 'info', 'secure'];
    for (const severity of buckets) {
        const list = appsec[severity];
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            if (item && typeof item === 'object') {
                const rec = item as Record<string, unknown>;
                out.push({
                    severity,
                    title: String(rec.title ?? rec.name ?? rec.description ?? 'Finding'),
                    description: typeof rec.description === 'string' ? rec.description : undefined,
                });
            } else if (typeof item === 'string') {
                out.push({ severity, title: item });
            }
        }
    }
    return out;
}

function extractInfoCount(report: Record<string, unknown>): number {
    const appsec = report.appsec as Record<string, unknown> | undefined;
    const list = appsec?.info;
    if (Array.isArray(list)) return list.length;
    return Number((report.info as number | undefined) ?? 0);
}
