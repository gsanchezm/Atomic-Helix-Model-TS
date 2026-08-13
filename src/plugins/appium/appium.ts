import { remote, Browser } from 'webdriverio';
import { logger } from '@utils/logger';
import { getAppiumActionRegistry } from '@plugins/appium/actions/registerAppiumActions';
import {
    PLATFORM,
    appiumHelpers,
    dismissAndroidSystemDialog,
    setCachedAppId,
} from '@plugins/appium/appium-helpers';
import { DeviceLoader } from '@devices/device-loader';
import { AppiumAdapter } from '@devices/adapters/appium-adapter';

// --- Capability Profile Loader (delegates to driver-agnostic device passport) ---

function resolveUdidOverride(passportPlatform: 'android' | 'ios', sessionId: string): string | undefined {
    // Per-worker UDID: ANDROID_UDID_0/IOS_UDID_0/… for parallel simulators/devices.
    const perWorker = process.env[`${passportPlatform.toUpperCase()}_UDID_${sessionId}`];
    if (perWorker) return perWorker;
    const single = process.env[`${passportPlatform.toUpperCase()}_UDID`];
    if (single) return single;
    return undefined;
}

function resolveBinaryPathOverride(passportPlatform: 'android' | 'ios'): string | undefined {
    return passportPlatform === 'android'
        ? process.env.ANDROID_APP_PATH
        : process.env.IOS_APP_PATH;
}

function loadCapabilities(sessionId: string = '0'): Record<string, unknown> {
    const passport = DeviceLoader.forWorker(sessionId);

    if (passport.platform !== PLATFORM) {
        // PLATFORM env decides registry lookups (helpers, screenshot source);
        // mismatch with the passport platform would silently target the wrong driver.
        throw new Error(
            `[Appium] PLATFORM='${PLATFORM}' but passport '${passport.id}' is platform='${passport.platform}'. ` +
            `Set PLATFORM=${passport.platform} or pick a different DEVICE_PROFILE.`,
        );
    }

    const caps = AppiumAdapter.toAppiumCapabilities(passport, {
        sessionId,
        udidOverride: resolveUdidOverride(passport.platform, sessionId),
        binaryPathOverride: resolveBinaryPathOverride(passport.platform),
    });

    const deviceName = process.env[`${PLATFORM.toUpperCase()}_DEVICE_NAME`];
    if (deviceName) caps['appium:deviceName'] = deviceName;

    // Cache app identifier for DEEP_LINK (read once from caps at session creation time)
    if (PLATFORM === 'android') setCachedAppId(caps['appium:appPackage'] as string | undefined);
    if (PLATFORM === 'ios') setCachedAppId(caps['appium:bundleId'] as string | undefined);

    logger.info(
        { profile: passport.id, platform: PLATFORM, sessionId, udid: caps['appium:udid'] ?? 'auto' },
        '[Appium] Capabilities loaded',
    );
    return caps;
}

// --- Configuration ---

const APPIUM_HOST = process.env.APPIUM_HOST || '127.0.0.1';
const APPIUM_PORT = parseInt(process.env.APPIUM_PORT || '4723', 10);

// --- Session Map (mirrors Playwright pattern for parallel isolation) ---

const sessions: Map<string, Browser> = new Map();

async function ensureSession(sessionId: string): Promise<Browser> {
    if (sessions.has(sessionId)) return sessions.get(sessionId)!;

    const capabilities = loadCapabilities(sessionId);
    const wdioOptions = {
        hostname: APPIUM_HOST,
        port: APPIUM_PORT,
        logLevel: 'error' as const,
        // First-run bootstrap on a fresh simulator can take several minutes:
        // WDA xcodebuild + app install + WDA launch. Match the server-side
        // wdaLaunchTimeout (4 min) with headroom for the app install step.
        connectionRetryTimeout: 360000,
        connectionRetryCount: 0,
        capabilities,
    };

    logger.info({ sessionId, platform: PLATFORM }, '[Appium] Bootstrapping session...');
    // Retry the bootstrap on transient emulator/WDA hiccups. The docker-android
    // image flakily fails when Appium enables the io.appium.settings UnicodeIME
    // before the settings app finishes installing ("ime enable ... UnicodeIME
    // ... cannot be enabled", adbExec exit 255). unicodeKeyboard/resetKeyboard
    // are required for CJK (JP/ja) text entry, so we keep them and instead
    // re-attempt the whole session — the next try lands once the settings app /
    // uiautomator2 server is in place. Also covers transient iOS WDA bring-up.
    let driver: Browser | undefined;
    const MAX_BOOTSTRAP_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_BOOTSTRAP_ATTEMPTS; attempt++) {
        try {
            driver = await remote(wdioOptions);
            break;
        } catch (err) {
            const msg = (err as Error)?.message ?? String(err);
            const transient =
                /UnicodeIME|ime enable|cannot be enabled|adbExec|uiautomator2|instrumentation|socket hang up|ECONNREFUSED|not installed|WDA/i.test(
                    msg,
                );
            if (attempt >= MAX_BOOTSTRAP_ATTEMPTS || !transient) throw err;
            const backoffMs = 5000 * attempt;
            logger.warn(
                { sessionId, attempt, backoffMs, err: msg },
                '[Appium] Transient session bootstrap failure — retrying',
            );
            await new Promise((r) => setTimeout(r, backoffMs));
        }
    }
    sessions.set(sessionId, driver!);
    logger.info({ sessionId, total: sessions.size }, '[Appium] Session created');
    return driver!;
}

async function teardown(sessionId: string): Promise<void> {
    const driver = sessions.get(sessionId);
    if (driver) {
        await driver.deleteSession();
        sessions.delete(sessionId);
        logger.info(`[Appium] Session "${sessionId}" closed (remaining: ${sessions.size})`);
    }
}

// --- Read-only session accessors ---
//
// Used by the Visual plugin to capture screenshots from the *existing*
// active driver without booting a new Appium session. Throws when no
// session is active.

export function getActiveDriver(sessionId: string = '0'): Browser {
    const driver = sessions.get(sessionId);
    if (!driver) {
        throw new Error(
            `[Appium] No active session for sessionId='${sessionId}'. ` +
            `Visual oracle must run after a UI action that creates the session.`,
        );
    }
    return driver;
}

export function hasActiveDriver(sessionId: string = '0'): boolean {
    return sessions.has(sessionId);
}

// --- Public API ---

export async function teardownAllSessions(): Promise<void> {
    const ids = [...sessions.keys()];
    await Promise.all(ids.map(teardown));
    logger.info('[Appium] All sessions closed');
}

const registry = getAppiumActionRegistry();

// RN mirrors `testID` into both `content-desc` and `resource-id` by default,
// but a node with an explicit `accessibilityLabel` (screen-reader text like
// "Add Pepperoni" on a button whose testID is `btn-add-pizza-p02`) overrides
// content-desc while resource-id keeps the raw testID. UiAutomator2's `~`
// accessibility-id strategy matches content-desc, so any `~key` selector
// whose element carries a distinct label never resolves — confirmed
// on-device 2026-08-13 via WaitForElement's page-source dump (content-desc
// "Add to Cart" / resource-id "btn-add-to-cart"), which manifested as a
// silent scroll-to-end-of-list followed by "element wasn't found"/timeout.
// resource-id has been reliable for every inspected element (including ones
// where content-desc does equal the testID), so on Android prefer it
// unconditionally rather than only as a fallback. iOS's XCUITest
// accessibility-id resolution doesn't have this split.
function androidizeAccessibilitySelector(target: string): string {
    if (PLATFORM !== 'android') return target;
    const sepIndex = target.indexOf('||');
    const selector = sepIndex === -1 ? target : target.slice(0, sepIndex);
    const rest = sepIndex === -1 ? '' : target.slice(sepIndex);
    if (!selector.startsWith('~')) return target;
    const key = selector.slice(1);
    return `android=new UiSelector().resourceId("${key}")${rest}`;
}

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    // TEARDOWN is session-scoped — never boot a driver just to close it.
    if (normalizedAction === 'TEARDOWN') {
        await teardown(sessionId);
        return 'Appium execution environment terminated securely.';
    }

    const driver = await ensureSession(sessionId);
    await dismissAndroidSystemDialog(driver);

    const result = await registry.execute(normalizedAction, {
        driver,
        target: androidizeAccessibilitySelector(targetSelector),
        actionId: normalizedAction,
        sessionId,
        platform: PLATFORM,
        helpers: appiumHelpers,
        metadata: { plugin: 'appium' },
    });

    await dismissAndroidSystemDialog(driver);
    return result;
}
