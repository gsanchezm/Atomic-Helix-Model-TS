import * as fs from 'fs';
import * as path from 'path';

const TESTS_DIR = path.resolve(__dirname, '../core/tests');

let locatorsCache: Record<string, any> | null = null;
let locatorWatcher: fs.FSWatcher | null = null;

function watchLocatorFiles(): void {
    if (locatorWatcher || (process.env.TOM_LOCATOR_WATCH ?? 'true').toLowerCase() === 'false') return;

    try {
        locatorWatcher = fs.watch(TESTS_DIR, { recursive: true }, (_event, filename) => {
            if (!filename || !filename.toString().endsWith('.locators.json')) return;
            locatorsCache = null;
        });
        // Loading locators in a short-lived script must not keep the process alive.
        locatorWatcher.unref();
    } catch (error) {
        process.stderr.write(`[Proxy] Locator hot-reload disabled: ${(error as Error).message}\n`);
    }
}

function resolveMobile(node: any, os: 'android' | 'ios'): string | undefined {
    if (typeof node.mobile === 'string') return node.mobile;
    return node.mobile?.[os];
}

const LOCATOR_STRATEGIES: Record<string, (node: any, viewport: string) => string | undefined> = {
    web: (node, viewport) => typeof node.web === 'string' ? node.web : node.web?.[viewport],
    android: (node) => resolveMobile(node, 'android'),
    ios: (node) => resolveMobile(node, 'ios'),
};

function getPlatform(): string {
    return (process.env.PLATFORM || 'web').toLowerCase();
}

function getViewport(): string {
    return (process.env.VIEWPORT || 'desktop').toLowerCase();
}

// --- Tool-keyed (family-file) resolution ---
//
// A locator node may carry legacy `web`/`mobile` branches (untouched
// domains), explicit driver-name branches (`playwright`/`appium`/
// `mobilewright`/...), or both — loadLocators() merges every branch it
// finds for a logical key into one node, regardless of which file
// contributed it. AXIS_KEYS identifies the two axis-object shapes a
// branch's value can take: {desktop,responsive} (playwright/webdriverio)
// or {android,ios} (appium/mobilewright).
const AXIS_KEYS = new Set(['desktop', 'responsive', 'android', 'ios']);

function isAxisObject(value: any): boolean {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.length > 0 && keys.every((key) => AXIS_KEYS.has(key));
}

export function resolveAxis(value: any, axisKey: string | undefined): any {
    if (axisKey === undefined) return value;
    if (!isAxisObject(value)) return value;
    return value[axisKey];
}

export function axisKeyFor(driver: string): string | undefined {
    if (driver === 'playwright') return getViewport();
    if (driver === 'appium') return getPlatform();
    return undefined;
}

function validateStructuredLocator(value: any): void {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`[Proxy] Malformed locator value: expected a {kind, value} object, got ${JSON.stringify(value)}.`);
    }
    if (typeof value.kind !== 'string' || typeof value.value !== 'string') {
        throw new Error(`[Proxy] Malformed locator value: "kind" and "value" must both be strings, got ${JSON.stringify(value)}.`);
    }
}

/** Resolve one driver's branch (already axis-selected) into the wire string
 *  resolveLocator/resolveMobileSelector return: a raw string as-is, or a
 *  {kind,...} object serialized to JSON. */
export function resolveDriverValue(rawValue: any, driver: string): string | undefined {
    const value = resolveAxis(rawValue, axisKeyFor(driver));
    if (value === undefined) return undefined;
    if (typeof value === 'string') return value;
    validateStructuredLocator(value);
    return JSON.stringify(value);
}

/** mobilewright-specific priority: an explicit `node.mobilewright` branch
 *  (flat or {android,ios}-axis) wins; otherwise fall back to the shared
 *  `node.mobile.*` value appium also reads (unchanged legacy behavior). */
export function resolveMobilewrightValue(node: any, platform: 'android' | 'ios'): string | undefined {
    if (node.mobilewright !== undefined) {
        const value = resolveAxis(node.mobilewright, platform);
        if (value === undefined) return undefined;
        validateStructuredLocator(value);
        return JSON.stringify(value);
    }
    return resolveMobile(node, platform);
}

function collectLocatorFiles(dir: string, results: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectLocatorFiles(fullPath, results);
        } else if (entry.isFile() && entry.name.endsWith('.locators.json')) {
            results.push(fullPath);
        }
    }
    return results;
}

function loadLocators(): Record<string, any> {
    if (locatorsCache) return locatorsCache;

    const files = collectLocatorFiles(TESTS_DIR);
    if (files.length === 0) {
        throw new Error(`[Proxy] Critical Failure: No *.locators.json files found under ${TESTS_DIR}`);
    }

    const merged: Record<string, any> = {};
    // Tracks which file contributed each (logicalKey, branch) pair. Two
    // family files legitimately sharing a logical key (each contributing a
    // different tool branch) merge; the same (key, branch) defined twice
    // is still a real collision and still fails loudly.
    const branchOwner: Record<string, string> = {};

    for (const filePath of files) {
        let parsed: Record<string, any>;
        try {
            parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, any>;
        } catch (error: any) {
            throw new Error(`[Proxy] Critical Failure: Cannot load locator artifact at ${filePath}. ${error.message}`);
        }

        for (const key of Object.keys(parsed)) {
            const incomingNode = parsed[key];
            if (merged[key] === undefined) merged[key] = {};
            const targetNode = merged[key];

            for (const branch of Object.keys(incomingNode)) {
                const branchKey = `${key}::${branch}`;
                const previous = branchOwner[branchKey];
                if (previous) {
                    throw new Error(
                        `[Proxy] Locator key collision: "${key}" -> "${branch}" is defined in both ` +
                        `${previous} and ${filePath}. Rename one — (key, branch) pairs are global across all *.locators.json.`,
                    );
                }
                branchOwner[branchKey] = filePath;
                targetNode[branch] = incomingNode[branch];
            }
        }
    }

    locatorsCache = merged;
    watchLocatorFiles();
    return merged;
}

export function invalidateLocatorCache(): void {
    locatorsCache = null;
}

export function hasLocatorKey(logicalKey: string): boolean {
    return Object.prototype.hasOwnProperty.call(loadLocators(), logicalKey);
}

// Mobilewright bypasses `resolveLocator` (chaos-proxy passes its logical key
// through unchanged) because its own parseLocator() speaks testId/label/
// text/role/placeholder/type, not the web CSS-selector strings/Appium
// selector strings `resolveLocator` returns for other drivers. This gives
// the plugin the same mobile-side registry lookup other mobile drivers get,
// keyed off the session's actual device platform rather than the
// process-wide PLATFORM env var.
export function resolveMobileSelector(logicalKey: string, platform: 'android' | 'ios'): string | undefined {
    const node = loadLocators()[logicalKey];
    if (!node) return undefined;
    return resolveMobilewrightValue(node, platform);
}

function legacyResolve(node: any, platform: string): string | undefined {
    const strategy = LOCATOR_STRATEGIES[platform];
    return strategy ? strategy(node, getViewport()) : undefined;
}

export function resolveLocator(logicalKey: string, driver: string): string {
    const platform = getPlatform();

    // 1. Guard Clause: Bypass Resolution for Network Rings
    if (platform === 'api' || platform === 'gatling') return logicalKey;

    // 2. Load Artifact
    const node = loadLocators()[logicalKey];

    // 3. Guard Clause: Fallback for undefined keys
    if (!node) {
        console.warn(`[Proxy] Logical key '${logicalKey}' not found in artifact. Passing as raw selector.`);
        return logicalKey;
    }

    // 4. Resolve via the driver's explicit branch, or fall back to the
    //    legacy web/mobile.* shape when this key has no driver branch.
    const resolvedSelector = node[driver] === undefined
        ? legacyResolve(node, platform)
        : resolveDriverValue(node[driver], driver);

    // 5. Guard Clause: Strict Mathematical Enforcement
    if (!resolvedSelector || resolvedSelector.trim() === '') {
        throw new Error(
            `[Proxy] Resolution failed: Locator for '${logicalKey}' is empty or undefined ` +
            `for driver='${driver}', PLATFORM='${platform}' and VIEWPORT='${getViewport()}'.`,
        );
    }

    return resolvedSelector;
}
