import { dirname, resolve } from 'path';
import { mkdirSync } from 'fs';
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { runCommand } from '@plugins/shared/command-runner';
import { ApiActionContext } from '@plugins/api/actions/ApiActionContext';

interface SchemaFuzzConfig {
    specUrl?: string;
    authToken?: string;
    reportPath?: string;
    timeoutMs?: number;
    executable?: string;
}

export const RunSchemaFuzzAction: ActionHandler<ApiActionContext> = {
    name: 'RUN_SCHEMA_FUZZ',
    async execute({ target }) {
        const config = target ? JSON.parse(target) as SchemaFuzzConfig : {};
        const baseUrl = process.env.API_BASE_URL?.replace(/\/+$/, '');
        const specUrl = config.specUrl ?? (baseUrl ? `${baseUrl}/api/openapi.json` : undefined);
        if (!specUrl) throw new Error('[Schemathesis] specUrl or API_BASE_URL is required.');
        const reportPath = resolve(config.reportPath ?? 'reports/security/schemathesis-junit.xml');
        mkdirSync(dirname(reportPath), { recursive: true });
        const args = ['run', '--checks', 'all', '--report-junit-path', reportPath];
        if (config.authToken) args.push('-H', `Authorization: Bearer ${config.authToken}`);
        args.push(specUrl);
        const result = await runCommand(config.executable ?? 'schemathesis', args, {
            timeoutMs: config.timeoutMs ?? 20 * 60_000,
        });
        if (result.exitCode !== 0) {
            throw new Error(`[Schemathesis] fuzz run failed (exit=${result.exitCode}): ${result.stdout.slice(-2000)}${result.stderr.slice(-2000)}`);
        }
        return JSON.stringify({ reportPath, exitCode: result.exitCode });
    },
};
