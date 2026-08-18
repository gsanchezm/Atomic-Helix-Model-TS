import { readFileSync } from 'fs';
import { basename, resolve } from 'path';
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { MobSfActionContext } from '@plugins/mobsf/actions/MobSfActionContext';
import { setMobSfReport } from '@plugins/mobsf/mobsf-state';

interface MobSfConfig {
    filePath: string;
    baseUrl?: string;
    apiKey?: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function checkedJson(url: string, init: RequestInit, label: string): Promise<Record<string, unknown>> {
    const response = await fetch(url, init);
    const body = await response.text();
    if (!response.ok) throw new Error(`[MobSF] ${label} failed (${response.status}): ${body.slice(0, 1000)}`);
    return JSON.parse(body) as Record<string, unknown>;
}

export const RunMobSfApkScanAction: ActionHandler<MobSfActionContext> = {
    name: 'RUN_MOBSF_APK_SCAN',
    async execute({ target, sessionId }) {
        const config = JSON.parse(target) as MobSfConfig;
        if (!config.filePath) throw new Error('[MobSF] filePath is required.');
        const filePath = resolve(config.filePath);
        const baseUrl = (config.baseUrl ?? process.env.MOBSF_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
        const apiKey = config.apiKey ?? process.env.MOBSF_API_KEY;
        if (!apiKey) throw new Error('[MobSF] apiKey or MOBSF_API_KEY is required.');
        const headers = { 'X-Mobsf-Api-Key': apiKey };

        const form = new FormData();
        form.append('file', new Blob([readFileSync(filePath)]), basename(filePath));
        const upload = await checkedJson(`${baseUrl}/api/v1/upload`, { method: 'POST', headers, body: form }, 'upload');
        const hash = String(upload.hash ?? '');
        const fileName = String(upload.file_name ?? basename(filePath));
        const scanType = String(upload.scan_type ?? (filePath.toLowerCase().endsWith('.apk') ? 'apk' : 'ipa'));
        if (!hash) throw new Error(`[MobSF] Upload response did not include hash: ${JSON.stringify(upload)}`);

        const scanBody = new URLSearchParams({ hash, file_name: fileName, scan_type: scanType });
        await checkedJson(`${baseUrl}/api/v1/scan`, {
            method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }, body: scanBody,
        }, 'scan');

        const deadline = Date.now() + (config.timeoutMs ?? 20 * 60_000);
        let lastError = '';
        while (Date.now() < deadline) {
            try {
                const report = await checkedJson(
                    `${baseUrl}/api/v1/report_json`,
                    {
                        method: 'POST',
                        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({ hash }),
                    },
                    'report_json',
                );
                setMobSfReport(sessionId, report);
                return JSON.stringify({ hash, fileName, scanType, report });
            } catch (error) {
                lastError = (error as Error).message;
                await delay(config.pollIntervalMs ?? 5000);
            }
        }
        throw new Error(`[MobSF] report polling timed out. Last error: ${lastError}`);
    },
};
