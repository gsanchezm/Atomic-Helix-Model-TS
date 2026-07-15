import { spawn } from 'child_process';

export interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

export function runCommand(
    command: string,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: { ...process.env, ...options.env },
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timeout = options.timeoutMs
            ? setTimeout(() => {
                timedOut = true;
                child.kill('SIGTERM');
                setTimeout(() => child.kill('SIGKILL'), 3000).unref();
            }, options.timeoutMs)
            : undefined;
        timeout?.unref();

        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (timeout) clearTimeout(timeout);
            if (timedOut) {
                reject(new Error(`${command} timed out after ${options.timeoutMs}ms.`));
                return;
            }
            if (signal) {
                reject(new Error(`${command} terminated by ${signal}.`));
                return;
            }
            resolve({ exitCode: code ?? 1, stdout, stderr });
        });
    });
}
