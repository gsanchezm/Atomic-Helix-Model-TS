import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { runCommand } from '@plugins/shared/command-runner';
import { ApiActionContext } from '@plugins/api/actions/ApiActionContext';

interface TlsConfig {
    targetUrl: string;
    executable?: string;
    reportDir?: string;
    timeoutMs?: number;
}

export const RunTlsCheckAction: ActionHandler<ApiActionContext> = {
    name: 'RUN_TLS_CHECK',
    async execute({ target }) {
        const config = JSON.parse(target) as TlsConfig;
        if (!config.targetUrl?.startsWith('https://')) {
            throw new Error('[testssl.sh] targetUrl must be an HTTPS deployment URL.');
        }
        const reportDir = resolve(config.reportDir ?? 'reports/security/testssl');
        mkdirSync(reportDir, { recursive: true });
        const result = await runCommand(config.executable ?? 'testssl.sh', [
            '--quiet', '--warnings', 'batch', '--jsonfile-pretty', `${reportDir}/testssl.json`, config.targetUrl,
        ], { timeoutMs: config.timeoutMs ?? 15 * 60_000 });
        if (result.exitCode !== 0) {
            throw new Error(`[testssl.sh] check failed (exit=${result.exitCode}): ${result.stderr.slice(-2000)}`);
        }
        return JSON.stringify({ reportPath: `${reportDir}/testssl.json`, exitCode: result.exitCode });
    },
};
