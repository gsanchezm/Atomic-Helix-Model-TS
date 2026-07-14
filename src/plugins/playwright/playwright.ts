import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright';
import { logger } from '@utils/logger';
import { getPlaywrightActionRegistry } from '@plugins/playwright/actions/registerPlaywrightActions';

// --- Viewport Profiles ---
// desktop: null viewport + --start-maximized lets the OS control window size
// responsive: fixed mobile dimensions, no maximizing

const isDesktop = (process.env.VIEWPORT ?? 'desktop') === 'desktop';
const VIEWPORT_TAG = isDesktop ? 'desktop' : 'responsive';
const RESPONSIVE_VIEWPORT = { width: 390, height: 844 };  // iPhone 14 Pro

// --- Browser-per-engine pool + per-session context map ---
// Each parallel Cucumber worker gets its own isolated BrowserContext → Page.
// The browser engine is encoded in the session ID by client.ts, allowing
// concurrent Chromium/Firefox/WebKit invocations to share one plugin process.

const browsers: Map<string, Promise<Browser>> = new Map();
const sessions: Map<string, { context: BrowserContext; page: Page; engine: string }> = new Map();
const SUPPORTED_ENGINES = new Set(['chromium', 'chrome', 'edge', 'msedge', 'firefox', 'webkit']);
const BROWSER_CHANNELS: Readonly<Record<string, 'chrome' | 'msedge' | undefined>> = {
    chromium: undefined,
    chrome: 'chrome',
    edge: 'msedge',
    msedge: 'msedge',
};

function resolveBrowserEngine(sessionId: string): string {
    const encodedEngine = sessionId.split('-')[0]?.trim().toLowerCase();
    const configuredEngine = (process.env.BROWSER ?? 'chromium').trim().toLowerCase();
    const engine = SUPPORTED_ENGINES.has(encodedEngine) ? encodedEngine : configuredEngine;

    if (!SUPPORTED_ENGINES.has(engine)) {
        logger.warn(`[Playwright Adapter] Unknown BROWSER="${engine}", falling back to chromium.`);
        return 'chromium';
    }
    return engine;
}

async function ensureBrowser(engine: string): Promise<Browser> {
    const existing = browsers.get(engine);
    if (existing) return existing;

    const launch = launchBrowser(engine);
    browsers.set(engine, launch);
    try {
        return await launch;
    } catch (error) {
        if (browsers.get(engine) === launch) browsers.delete(engine);
        throw error;
    }
}

async function launchBrowser(engine: string): Promise<Browser> {

    const headless = process.env.HEADLESS !== 'false';

    // --start-maximized is a chromium-only flag; firefox/webkit reject it.
    const isChromiumFamily = engine === 'chromium' || engine === 'chrome' || engine === 'edge' || engine === 'msedge';
    const launchArgs = isChromiumFamily && isDesktop && !headless ? ['--start-maximized'] : [];

    const channel = BROWSER_CHANNELS[engine];

    const channelLabel = channel ? ` (channel: ${channel})` : '';
    logger.info(`[Playwright Adapter] Launching browser engine: ${engine}${channelLabel} (viewport: ${isDesktop ? 'maximized' : '390x844'}, headless: ${headless})...`);

    const launchChromium = () => chromium.launch({
        headless,
        args: launchArgs,
        ...(channel ? { channel } : {}),
    });
    const launchers: Readonly<Record<string, () => Promise<Browser>>> = {
        chromium: launchChromium,
        chrome: launchChromium,
        edge: launchChromium,
        msedge: launchChromium,
        firefox: () => firefox.launch({ headless }),
        webkit: () => webkit.launch({ headless }),
    };
    const launch = launchers[engine];
    if (!launch) throw new Error(`[Playwright Adapter] Unsupported browser engine: ${engine}`);
    return launch();
}

async function ensureSession(sessionId: string): Promise<{ browser: Browser; page: Page }> {
    if (sessions.has(sessionId)) {
        const s = sessions.get(sessionId)!;
        return { browser: await browsers.get(s.engine)!, page: s.page };
    }

    const engine = resolveBrowserEngine(sessionId);
    const b = await ensureBrowser(engine);
    const context = await b.newContext({ viewport: isDesktop ? null : RESPONSIVE_VIEWPORT });
    const page = await context.newPage();
    sessions.set(sessionId, { context, page, engine });
    logger.info(`[Playwright Adapter] Session "${sessionId}" created (total active: ${sessions.size})`);
    return { browser: b, page };
}

async function teardown(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (!session) return;

    await session.context.close();
    sessions.delete(sessionId);
    logger.info(`[Playwright Adapter] Session "${sessionId}" closed (remaining: ${sessions.size})`);

    const engineStillActive = [...sessions.values()].some(({ engine }) => engine === session.engine);
    if (engineStillActive) return;

    const browser = browsers.get(session.engine);
    if (browser) await (await browser).close();
    browsers.delete(session.engine);
    logger.info(`[Playwright Adapter] ${session.engine} browser closed — no active sessions remain`);
}

// --- Read-only session accessors ---
//
// Used by the Visual plugin to capture screenshots from the *existing*
// active page without booting a new browser context. Throws when no
// session is active so the Visual oracle can return a precise error
// instead of silently creating UI state.

export function getActivePage(sessionId: string = '0'): Page {
    const s = sessions.get(sessionId);
    if (!s) {
        throw new Error(
            `[Playwright] No active session for sessionId='${sessionId}'. ` +
            `Visual oracle must run after a UI action that creates the session.`,
        );
    }
    return s.page;
}

export function hasActivePage(sessionId: string = '0'): boolean {
    return sessions.has(sessionId);
}

// --- Public API ---

const registry = getPlaywrightActionRegistry();

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    // TEARDOWN is session-scoped — never boot a browser just to close it.
    if (normalizedAction === 'TEARDOWN') {
        await teardown(sessionId);
        return 'Playwright execution environment terminated securely.';
    }

    const { browser: b, page: p } = await ensureSession(sessionId);

    return registry.execute(normalizedAction, {
        browser: b,
        page: p,
        driver: p,
        target: targetSelector,
        actionId: normalizedAction,
        sessionId,
        platform: 'web',
        viewport: VIEWPORT_TAG,
        metadata: { plugin: 'playwright' },
    });
}
