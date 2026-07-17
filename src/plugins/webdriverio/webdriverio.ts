import { remote, Browser } from 'webdriverio';
import { logger } from '@utils/logger';
import { getWebdriverioActionRegistry } from '@plugins/webdriverio/actions/registerWebdriverioActions';

const isDesktop = (process.env.VIEWPORT ?? 'desktop') === 'desktop';
const VIEWPORT_TAG = isDesktop ? 'desktop' : 'responsive';
const RESPONSIVE_VIEWPORT = { width: 390, height: 844 }; // iPhone 14 Pro — matches Playwright's own constant

// Points at a Selenium standalone/grid endpoint by default. A native
// chromedriver/geckodriver process needs no code change — only different
// env var values (e.g. SELENIUM_PORT=9515, SELENIUM_PATH=/ for chromedriver).
const SELENIUM_HOST = process.env.SELENIUM_HOST || '127.0.0.1';
const SELENIUM_PORT = parseInt(process.env.SELENIUM_PORT || '4444', 10);
const SELENIUM_PATH = process.env.SELENIUM_PATH || '/wd/hub';

// WebDriver/W3C browserName capabilities. 'webkit' has no WebDriver-protocol
// equivalent outside Safari's own safaridriver (macOS-only, not wired up
// here) — see §8 Out of scope.
const BROWSER_NAMES: Readonly<Record<string, string>> = {
    chromium: 'chrome',
    chrome: 'chrome',
    edge: 'MicrosoftEdge',
    msedge: 'MicrosoftEdge',
    firefox: 'firefox',
};

function resolveBrowserName(): string {
    const configured = (process.env.BROWSER ?? 'chromium').trim().toLowerCase();
    const browserName = BROWSER_NAMES[configured];
    if (!browserName) {
        throw new Error(
            `[WebdriverIO Adapter] BROWSER="${configured}" has no native WebDriver capability — ` +
            `supported: chromium/chrome, edge/msedge, firefox.`,
        );
    }
    return browserName;
}

// One Browser session per sessionId — unlike Playwright's browser-per-engine
// pool + per-session BrowserContext, WebdriverIO's remote() always opens a
// fresh top-level session (there is no lightweight-context-reuse concept in
// the WebDriver protocol). This mirrors Appium's own session map shape.
const sessions: Map<string, Browser> = new Map();

async function ensureSession(sessionId: string): Promise<Browser> {
    if (sessions.has(sessionId)) return sessions.get(sessionId)!;

    const browserName = resolveBrowserName();
    logger.info(
        `[WebdriverIO Adapter] Bootstrapping session "${sessionId}" (browserName: ${browserName}, viewport: ${VIEWPORT_TAG})...`,
    );

    const driver = await remote({
        hostname: SELENIUM_HOST,
        port: SELENIUM_PORT,
        path: SELENIUM_PATH,
        logLevel: 'error',
        capabilities: { browserName },
    });

    if (!isDesktop) {
        await driver.setWindowSize(RESPONSIVE_VIEWPORT.width, RESPONSIVE_VIEWPORT.height);
    }

    sessions.set(sessionId, driver);
    logger.info(`[WebdriverIO Adapter] Session "${sessionId}" created (total active: ${sessions.size})`);
    return driver;
}

async function teardown(sessionId: string): Promise<void> {
    const driver = sessions.get(sessionId);
    if (!driver) return;
    await driver.deleteSession();
    sessions.delete(sessionId);
    logger.info(`[WebdriverIO Adapter] Session "${sessionId}" closed (remaining: ${sessions.size})`);
}

// --- Read-only session accessors (mirrors Playwright/Appium's own —
// reserved for a future Visual-oracle co-location, not used yet) ---

export function getActiveDriver(sessionId: string = '0'): Browser {
    const driver = sessions.get(sessionId);
    if (!driver) {
        throw new Error(`[WebdriverIO] No active session for sessionId='${sessionId}'.`);
    }
    return driver;
}

export function hasActiveDriver(sessionId: string = '0'): boolean {
    return sessions.has(sessionId);
}

const registry = getWebdriverioActionRegistry();

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    if (normalizedAction === 'TEARDOWN') {
        await teardown(sessionId);
        return 'WebdriverIO execution environment terminated securely.';
    }

    const driver = await ensureSession(sessionId);

    return registry.execute(normalizedAction, {
        driver,
        target: targetSelector,
        actionId: normalizedAction,
        sessionId,
        platform: 'web',
        viewport: VIEWPORT_TAG,
        metadata: { plugin: 'webdriverio' },
    });
}
