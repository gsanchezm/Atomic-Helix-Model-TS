import { spawn } from 'child_process';

export interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

/**
 * Marks "this executable could not be started", as opposed to "it started and
 * failed". Only the spawn-error path below ever emits it, and that path carries
 * no output from whatever the tool was pointed at — so callers can key off it
 * without a scanned target being able to forge it.
 *
 * That distinction is security-relevant: the non-zero-exit path splices tool
 * stdout/stderr (which echoes target responses) into its error message, so
 * sniffing those messages for ENOENT-shaped text lets a target that replies
 * "No such file or directory" — precisely the payload of a path-disclosure
 * finding — get itself reclassified as "scanner not installed" and dropped
 * from the failure count.
 */
export const COMMAND_NOT_EXECUTABLE = '[COMMAND_NOT_EXECUTABLE]';

// Wraps a value in single quotes for the DEVICE's POSIX shell, escaping any
// literal single quotes it might contain (`'` -> `'\''`). Needed whenever a
// value (e.g. a deep-link URL) gets shelled into `adb shell <command>` —
// `adb shell` sends the command as one raw string that the device's own
// shell re-tokenizes, so unquoted metacharacters like `&` split it into
// multiple statements on that end, independent of how the value was quoted
// (or not) for the local/Windows side.
export function posixQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
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
        child.once('error', (err: NodeJS.ErrnoException) => {
            if (timeout) clearTimeout(timeout);
            // ENOENT/EACCES here mean the executable itself could not be
            // started — never anything about the target being inspected.
            if (err.code === 'ENOENT' || err.code === 'EACCES') {
                reject(new Error(`${COMMAND_NOT_EXECUTABLE} ${command}: ${err.code}`));
                return;
            }
            reject(err);
        });
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
