#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');
const { selectedBrowsers } = require('./browser-selection');

const ROOT = process.cwd();
const SCRIPT_BY_BROWSER = {
    chromium: 'test:chrome',
    firefox: 'test:firefox',
    webkit: 'test:safari',
};

function run(browser) {
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const child = spawn(pnpm, ['run', SCRIPT_BY_BROWSER[browser]], {
        cwd: ROOT,
        env: {
            ...process.env,
            BROWSER: browser,
            DRIVER: 'playwright',
            PLATFORM: 'web',
        },
        stdio: 'inherit',
        shell: false,
    });
    return new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (signal) reject(new Error(`${browser} terminated by ${signal}`));
            else resolve(code ?? 1);
        });
    });
}

async function main() {
    const browsers = selectedBrowsers();
    console.log(`[cross-browser] Running in parallel: ${browsers.join(', ')}`);
    const exitCodes = await Promise.all(browsers.map(run));
    if (exitCodes.some((code) => code !== 0)) process.exitCode = 1;
}

main().catch((error) => {
    console.error(`[cross-browser] ${error.message}`);
    process.exitCode = 1;
});
