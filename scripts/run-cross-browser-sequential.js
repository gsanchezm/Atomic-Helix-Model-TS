#!/usr/bin/env node

const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { selectedBrowsers } = require('./browser-selection');

const ROOT = process.cwd();
const STARTUP_TIMEOUT_MS = Number(process.env.PLUGIN_STARTUP_TIMEOUT_MS || 180_000);
const STOP_TIMEOUT_MS = 5_000;
const BROWSERS = selectedBrowsers();
const VIEWPORTS = ['desktop', 'responsive'];
const runningProcesses = new Set();

const nodeEntry = (relativePath) => [
    '-r',
    'ts-node/register',
    '-r',
    'tsconfig-paths/register',
    '-r',
    'dotenv/config',
    path.join(ROOT, relativePath),
];

const SERVICES = {
    proxy: {
        port: 50051,
        args: nodeEntry('src/kernel/chaos-proxy.ts'),
    },
    api: {
        port: 50055,
        args: nodeEntry('src/plugins/api/server.ts'),
    },
    playwright: {
        port: 50052,
        args: nodeEntry('src/plugins/playwright/server.ts'),
    },
};

function startProcess(name, args, env = {}) {
    const child = spawn(process.execPath, args, {
        cwd: ROOT,
        env: { ...process.env, ...env },
        stdio: 'inherit',
        shell: false,
    });

    child.processName = name;
    runningProcesses.add(child);
    child.once('exit', () => runningProcesses.delete(child));
    return child;
}

function waitForPort(name, port, child) {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + STARTUP_TIMEOUT_MS;

        const failIfExited = (code, signal) => {
            reject(new Error(`${name} exited before opening port ${port} (code=${code}, signal=${signal})`));
        };

        const probe = () => {
            const socket = net.createConnection({ host: '127.0.0.1', port });

            socket.once('connect', () => {
                socket.destroy();
                child.off('exit', failIfExited);
                resolve();
            });

            socket.once('error', () => {
                socket.destroy();
                if (Date.now() >= deadline) {
                    child.off('exit', failIfExited);
                    reject(new Error(`${name} did not open port ${port} within ${STARTUP_TIMEOUT_MS} ms`));
                    return;
                }
                setTimeout(probe, 200);
            });
        };

        child.once('exit', failIfExited);
        probe();
    });
}

function stopProcess(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(killTimer);
            resolve();
        };
        const killTimer = setTimeout(() => child.kill('SIGKILL'), STOP_TIMEOUT_MS);

        child.once('exit', finish);
        child.kill('SIGTERM');
    });
}

async function stopAll() {
    await Promise.all([...runningProcesses].map(stopProcess));
}

function waitForExit(child) {
    return new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (signal) {
                reject(new Error(`${child.processName} terminated by ${signal}`));
                return;
            }
            resolve(code ?? 1);
        });
    });
}

async function startService(name, env = {}) {
    const service = SERVICES[name];
    if (!service) throw new Error(`Unknown service: ${name}`);

    const child = startProcess(name, service.args, env);
    await waitForPort(name, service.port, child);
    return child;
}

async function runBrowser(viewport, browser, extraArgs) {
    const runId = `local-${Date.now()}-${process.pid}-${viewport}-${browser}`;
    const child = startProcess(
        `${viewport}:${browser}`,
        [path.join(ROOT, 'scripts/run-web-suite.js'), viewport, ...extraArgs],
        {
            BROWSER: browser,
            DRIVER: 'playwright',
            PLATFORM: 'web',
            VIEWPORT: viewport,
            CUCUMBER_PARALLEL: process.env.CUCUMBER_PARALLEL || '4',
            PLUGIN_PIXELMATCH: 'false',
            PROXY_ADDRESS: process.env.PROXY_ADDRESS || '127.0.0.1:50051',
            TOM_RUN_ID: runId,
        },
    );

    return waitForExit(child);
}

async function runViewport(viewport, extraArgs) {
    console.log(`\n[cross-browser] Starting ${viewport} suite...`);
    // The proxy — not just the playwright plugin — resolves viewport-keyed
    // locators (resolveLocator's getViewport() reads process.env.VIEWPORT),
    // so it must be restarted per viewport too, or it keeps serving the
    // desktop branch of every {desktop,responsive}-axis locator for the
    // rest of the run. Mirrors ci/steps/start-stack.sh, which brings up a
    // fresh proxy per phase.
    const proxy = await startService('proxy', { VIEWPORT: viewport });
    const playwright = await startService('playwright', {
        VIEWPORT: viewport,
        PLUGIN_PIXELMATCH: 'false',
    });

    try {
        const exitCodes = await Promise.all(
            BROWSERS.map((browser) => runBrowser(viewport, browser, extraArgs)),
        );
        const failed = exitCodes.some((code) => code !== 0);
        if (failed) throw new Error(`${viewport} suite failed in at least one browser`);
    } finally {
        await stopProcess(playwright);
        await stopProcess(proxy);
    }
}

async function main() {
    const extraArgs = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
    await startService('api');

    for (const viewport of VIEWPORTS) {
        await runViewport(viewport, extraArgs);
    }

    console.log('\n[cross-browser] Desktop and responsive suites completed successfully.');
}

const exitForSignal = (signal) => {
    const signalExitCodes = { SIGINT: 130, SIGTERM: 143 };
    void stopAll().finally(() => process.exit(signalExitCodes[signal] || 1));
};

process.once('SIGINT', () => exitForSignal('SIGINT'));
process.once('SIGTERM', () => exitForSignal('SIGTERM'));

main()
    .catch((error) => {
        console.error(`[cross-browser] ${error.message}`);
        process.exitCode = 1;
    })
    .finally(stopAll);
