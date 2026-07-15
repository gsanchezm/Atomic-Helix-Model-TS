import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { runCommand } from '@plugins/shared/command-runner';
import { ZapActionContext } from '@plugins/zap/actions/ZapActionContext';
import { setZapRun } from '@plugins/zap/zap-state';

interface ZapScanConfig {
    targetUrl: string;
    openApiUrl?: string;
    authToken?: string;
    reportDir?: string;
    timeoutMs?: number;
    image?: string;
}

function requireConfig(target: string): ZapScanConfig {
    const config = JSON.parse(target) as ZapScanConfig;
    if (!config.targetUrl) throw new Error('[ZAP] targetUrl is required.');
    return config;
}

function yaml(config: ZapScanConfig, active: boolean): string {
    const jobs = config.openApiUrl
        ? `  - type: openapi\n    parameters:\n      apiUrl: ${JSON.stringify(config.openApiUrl)}\n      targetUrl: ${JSON.stringify(config.targetUrl)}\n`
        : `  - type: spider\n    parameters:\n      url: ${JSON.stringify(config.targetUrl)}\n      maxDuration: 5\n`;
    const scan = active
        ? `  - type: activeScan\n    parameters:\n      policy: Default Policy\n`
        : `  - type: passiveScan-wait\n    parameters:\n      maxDuration: 10\n`;
    return `env:\n  contexts:\n    - name: omnipizza\n      urls:\n        - ${JSON.stringify(config.targetUrl)}\n      includePaths:\n        - ${JSON.stringify(`${config.targetUrl}.*`)}\njobs:\n${jobs}${scan}  - type: report\n    parameters:\n      template: traditional-json\n      reportDir: /zap/wrk\n      reportFile: zap-report.json\n  - type: report\n    parameters:\n      template: traditional-html\n      reportDir: /zap/wrk\n      reportFile: zap-report.html\n`;
}

function action(name: string, active: boolean): ActionHandler<ZapActionContext> {
    return {
        name,
        async execute({ target, sessionId }) {
            const config = requireConfig(target);
            const reportDir = resolve(config.reportDir ?? `reports/security/zap/${sessionId}`);
            mkdirSync(reportDir, { recursive: true });
            writeFileSync(resolve(reportDir, 'zap-plan.yaml'), yaml(config, active), 'utf8');
            const env: NodeJS.ProcessEnv = {};
            if (config.authToken) {
                env.ZAP_AUTH_HEADER = 'Authorization';
                env.ZAP_AUTH_HEADER_VALUE = `Bearer ${config.authToken}`;
            }
            const result = await runCommand('docker', [
                'run', '--rm',
                '-v', `${reportDir}:/zap/wrk:rw`,
                ...(config.authToken ? ['-e', 'ZAP_AUTH_HEADER', '-e', 'ZAP_AUTH_HEADER_VALUE'] : []),
                config.image ?? 'ghcr.io/zaproxy/zaproxy:stable',
                'zap.sh', '-cmd', '-autorun', '/zap/wrk/zap-plan.yaml',
            ], { env, timeoutMs: config.timeoutMs ?? 30 * 60_000 });
            if (result.exitCode !== 0) {
                throw new Error(`[ZAP] scan failed (exit=${result.exitCode}): ${result.stderr.slice(-2000)}`);
            }
            const state = {
                reportPath: resolve(reportDir, 'zap-report.json'),
                htmlReportPath: resolve(reportDir, 'zap-report.html'),
            };
            setZapRun(sessionId, state);
            return JSON.stringify(state);
        },
    };
}

export const RunZapBaselineScanAction = action('RUN_ZAP_BASELINE_SCAN', false);
export const RunZapApiScanAction = action('RUN_ZAP_API_SCAN', true);
