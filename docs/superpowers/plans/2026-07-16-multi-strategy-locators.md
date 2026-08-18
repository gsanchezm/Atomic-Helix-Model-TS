# Multi-Strategy Locators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make locator resolution choose the appropriate strategy per test tool (Playwright `getByRole`/`getByText`/`getByTestId`, Appium's native selector strings, mobilewright's own `testId`/`role`/`text` engine) instead of being limited to raw CSS/one shape, without touching any of the 5 untouched locator domains' current behavior.

**Architecture:** `locator-resolver.ts` merges every `*.locators.json` file into one node per logical key, keyed by driver name (`playwright`, `appium`, `mobilewright`, ...); `resolveLocator(key, driver)` resolves a driver's branch (axis + `{kind,value}` structured strategy or raw string) with a byte-identical fallback to today's `web`/`mobile.*` shape when no driver-keyed branch exists. Each plugin owns its own strategy vocabulary and translator (mirroring mobilewright's existing `parseLocator`/`locate` pattern); the kernel stays tool-agnostic.

**Tech Stack:** TypeScript, `ts-node` (no `tsc` build step — see Global Constraints), Node's built-in `node:test` + `node:assert/strict`, Playwright, WebdriverIO/Appium, `mobilewright` npm package, Cucumber.

**Design doc:** `docs/superpowers/specs/2026-07-16-multi-strategy-locators-design.md` — read it before implementing; every task below implements a specific section of it.

## Global Constraints

- No `tsc` build step. Everything runs via `ts-node -r tsconfig-paths/register`. Verify each task with `npx tsc --noEmit` (type-check only, no build artifact) plus the task's own test command.
- Path aliases: `@kernel/*` → `src/kernel/*`, `@plugins/*` → `src/plugins/*`, `@core/*` → `src/core/*`, `@utils/*` → `src/utils/*` (see `tsconfig.json`).
- Existing unit tests run via `npm run test:unit` (`node --test -r ts-node/register -r tsconfig-paths/register src/kernel/*.test.ts`) — new kernel tests must live under `src/kernel/*.test.ts` to be picked up by it. Tests outside `src/kernel/` are run with their own explicit `node --test` command (documented per task).
- Never touch the 5 non-pilot domains' `*.locators.json` files (`catalog`, `checkout`, `navbar`, `order_success`, `pizzaBuilder`, `profile`, `support`) — every task's tests that need real locator data use an EXISTING key from one of these untouched files as a stable regression fixture.
- `resolveLocator`'s only existing caller is `chaos-proxy.ts`'s selector-resolution logic (Task 2 extracts it to its own module — see Task 2's rationale).
- Never run `git commit` with `--no-verify`. Follow the repo's existing commit style (short, present-tense, no ticket references).

## Parallelization plan (worktrees, up to 5 agents)

Dependency graph, not an arbitrary split — task boundaries are drawn at file ownership so parallel worktrees never touch the same file:

- **Phase 1 — 3 agents in parallel** (no dependencies on each other): Task 1 (`src/kernel/locator-resolver.ts`), Task 3 (`src/plugins/playwright/actions/*`), Task 5 (`src/core/tests/login/contracts/*.locators.json`).
- **Phase 2 — 2 agents in parallel**, starts only after Phase 1 is merged (both depend on Task 1's new exports): Task 2 (`src/kernel/chaos-proxy.ts` + new `src/kernel/selector-resolution.ts`), Task 4 (`src/plugins/mobilewright/mobilewright.ts`).
- **Phase 3 — 1 agent, sequential**, starts only after Phase 2 is merged (needs everything): Task 6, end-to-end verification.

Peak concurrency is 3, not 5 — the true dependency graph only supports 3 genuinely independent tasks at once (Task 2 and Task 4 both call into Task 1's new function signatures, so they can't usefully start before Task 1 exists; Task 6 needs the whole pipeline wired). Forcing more concurrency than the graph supports would mean a task can't independently pass its own tests until another task lands — which breaks the "each task ends with an independently testable deliverable" requirement this plan is built on.

---

### Task 1: Kernel — tool-keyed resolution in `locator-resolver.ts`

**Files:**
- Modify: `src/kernel/locator-resolver.ts` (entire file — see below for the exact new content)
- Test: `src/kernel/locator-resolver.test.ts` (new)

**Interfaces:**
- Consumes: nothing new (same `fs`/`path` as today).
- Produces (all exported from `@kernel/locator-resolver`, consumed by Task 2 and Task 4):
  - `resolveLocator(logicalKey: string, driver: string): string` — **signature change** (was `(logicalKey: string)`).
  - `resolveMobileSelector(logicalKey: string, platform: 'android' | 'ios'): string | undefined` — same signature, new priority (checks `node.mobilewright` first).
  - `resolveAxis(value: any, axisKey: string | undefined): any` — new, pure.
  - `axisKeyFor(driver: string): string | undefined` — new, pure (reads `VIEWPORT`/`PLATFORM` env vars).
  - `resolveDriverValue(rawValue: any, driver: string): string | undefined` — new, pure.
  - `resolveMobilewrightValue(node: any, platform: 'android' | 'ios'): string | undefined` — new, pure.
  - `hasLocatorKey`, `invalidateLocatorCache` — unchanged.

- [ ] **Step 1: Write the failing tests for the new pure functions**

Create `src/kernel/locator-resolver.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    resolveAxis,
    axisKeyFor,
    resolveDriverValue,
    resolveMobilewrightValue,
    resolveLocator,
    resolveMobileSelector,
} from '@kernel/locator-resolver';

// --- resolveAxis ---

test('resolveAxis passes a plain string through unchanged', () => {
    assert.equal(resolveAxis('~foo', 'android'), '~foo');
});

test('resolveAxis passes a {kind,value} object through unchanged (not an axis shape)', () => {
    const value = { kind: 'testId', value: 'foo' };
    assert.deepEqual(resolveAxis(value, 'android'), value);
});

test('resolveAxis selects the requested branch of a {desktop,responsive} axis object', () => {
    const value = { desktop: 'a', responsive: 'b' };
    assert.equal(resolveAxis(value, 'desktop'), 'a');
    assert.equal(resolveAxis(value, 'responsive'), 'b');
});

test('resolveAxis selects the requested branch of an {android,ios} axis object', () => {
    const value = { android: { kind: 'testId', value: 'a' }, ios: { kind: 'testId', value: 'i' } };
    assert.deepEqual(resolveAxis(value, 'android'), { kind: 'testId', value: 'a' });
});

test('resolveAxis returns the value unchanged when axisKey is undefined', () => {
    const value = { desktop: 'a', responsive: 'b' };
    assert.deepEqual(resolveAxis(value, undefined), value);
});

// --- axisKeyFor ---

test('axisKeyFor reads VIEWPORT for playwright', () => {
    process.env.VIEWPORT = 'responsive';
    assert.equal(axisKeyFor('playwright'), 'responsive');
    delete process.env.VIEWPORT;
});

test('axisKeyFor defaults to desktop for playwright when VIEWPORT is unset', () => {
    delete process.env.VIEWPORT;
    assert.equal(axisKeyFor('playwright'), 'desktop');
});

test('axisKeyFor reads PLATFORM for appium', () => {
    process.env.PLATFORM = 'ios';
    assert.equal(axisKeyFor('appium'), 'ios');
    delete process.env.PLATFORM;
});

test('axisKeyFor returns undefined for a driver with no axis', () => {
    assert.equal(axisKeyFor('mobilewright'), undefined);
    assert.equal(axisKeyFor('webdriverio'), undefined);
});

// --- resolveDriverValue ---

test('resolveDriverValue returns a raw string as-is', () => {
    assert.equal(resolveDriverValue('~screen-login', 'appium'), '~screen-login');
});

test('resolveDriverValue resolves an axis object then returns the branch as-is', () => {
    process.env.PLATFORM = 'android';
    const value = { android: '~a', ios: '~i' };
    assert.equal(resolveDriverValue(value, 'appium'), '~a');
    delete process.env.PLATFORM;
});

test('resolveDriverValue serializes a {kind,value} object to JSON', () => {
    const value = { kind: 'testId', value: 'logout-btn' };
    assert.equal(resolveDriverValue(value, 'playwright'), JSON.stringify(value));
});

test('resolveDriverValue throws on a structured value missing "kind"', () => {
    assert.throws(() => resolveDriverValue({ value: 'x' }, 'playwright'), /kind.*value.*must both be strings/);
});

test('resolveDriverValue throws on a structured value missing "value"', () => {
    assert.throws(() => resolveDriverValue({ kind: 'css' }, 'playwright'), /kind.*value.*must both be strings/);
});

test('resolveDriverValue returns undefined when the axis branch is absent', () => {
    process.env.PLATFORM = 'ios';
    assert.equal(resolveDriverValue({ android: '~a' }, 'appium'), undefined);
    delete process.env.PLATFORM;
});

// --- resolveMobilewrightValue ---

test('resolveMobilewrightValue prefers an explicit flat node.mobilewright over node.mobile', () => {
    const node = { mobile: '~legacy', mobilewright: { kind: 'testId', value: 'explicit' } };
    assert.equal(resolveMobilewrightValue(node, 'android'), JSON.stringify({ kind: 'testId', value: 'explicit' }));
    assert.equal(resolveMobilewrightValue(node, 'ios'), JSON.stringify({ kind: 'testId', value: 'explicit' }));
});

test('resolveMobilewrightValue resolves an axis-shaped node.mobilewright per OS', () => {
    const node = {
        mobilewright: {
            android: { kind: 'testId', value: 'a' },
            ios: { kind: 'testId', value: 'i' },
        },
    };
    assert.equal(resolveMobilewrightValue(node, 'android'), JSON.stringify({ kind: 'testId', value: 'a' }));
    assert.equal(resolveMobilewrightValue(node, 'ios'), JSON.stringify({ kind: 'testId', value: 'i' }));
});

test('resolveMobilewrightValue falls back to node.mobile.* when node.mobilewright is absent', () => {
    const node = { mobile: { android: '~a', ios: '~i' } };
    assert.equal(resolveMobilewrightValue(node, 'android'), '~a');
});

// --- resolveLocator / resolveMobileSelector integration (real files, untouched domain) ---
// checkoutHeader / zipCodeInput live in checkout.locators.json, which this
// plan never modifies — a stable regression fixture for the legacy path.

test('resolveLocator resolves the legacy web shape unchanged when no driver branch exists', () => {
    process.env.PLATFORM = 'web';
    process.env.VIEWPORT = 'desktop';
    assert.equal(resolveLocator('zipCodeInput', 'playwright'), "[data-testid='zip-code']");
    delete process.env.PLATFORM;
    delete process.env.VIEWPORT;
});

test('resolveLocator resolves the legacy mobile shape unchanged when no driver branch exists', () => {
    process.env.PLATFORM = 'android';
    assert.equal(resolveLocator('zipCodeInput', 'appium'), '~input-zipcode');
    delete process.env.PLATFORM;
});

test('resolveMobileSelector falls back to node.mobile.* for a key with no mobilewright override', () => {
    assert.equal(resolveMobileSelector('zipCodeInput', 'android'), '~input-zipcode');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test -r ts-node/register -r tsconfig-paths/register src/kernel/locator-resolver.test.ts`
Expected: FAIL — `resolveAxis`, `axisKeyFor`, `resolveDriverValue`, `resolveMobilewrightValue` are not exported yet, and `resolveLocator('zipCodeInput', 'playwright')` doesn't type-check against the current 1-arg signature.

- [ ] **Step 3: Replace `src/kernel/locator-resolver.ts` with the new implementation**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test -r ts-node/register -r tsconfig-paths/register src/kernel/locator-resolver.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no NEW errors attributable to `locator-resolver.ts` (the `resolveLocator` signature change will surface every call site that still passes 1 argument — Task 2 fixes the only real one; ignore errors in files Task 2/3/4/5 haven't touched yet if running this in isolation before those land).

- [ ] **Step 6: Commit**

```bash
git add src/kernel/locator-resolver.ts src/kernel/locator-resolver.test.ts
git commit -m "feat(locators): resolve tool-keyed locator branches with legacy fallback"
```

---

### Task 2: Kernel — extract selector resolution out of `chaos-proxy.ts`, thread `driver` through

**Why a new file:** `chaos-proxy.ts` calls `main()` unconditionally at the bottom of the file (no `require.main` guard — same as every other plugin `server.ts` in this repo, so guarding it would be a new, unprecedented pattern). Importing `chaos-proxy.ts` directly to unit-test `resolveSelector` would therefore start a real gRPC server as a side effect. Extracting the pure resolution logic into its own module keeps `chaos-proxy.ts`'s bootstrap behavior byte-identical while making the logic actually testable.

**Files:**
- Create: `src/kernel/selector-resolution.ts`
- Modify: `src/kernel/chaos-proxy.ts` (remove the extracted code, import from the new module)
- Test: `src/kernel/selector-resolution.test.ts` (new)

**Interfaces:**
- Consumes: `resolveLocator(logicalKey: string, driver: string): string` from Task 1.
- Produces: `resolveSelector(actionId: string, rawSelector: string, platform: string): string`, `driverOf(platform: string): string`, `isMobilewrightPlatform(platform: string): boolean` — all exported from `@kernel/selector-resolution`. `chaos-proxy.ts`'s `handleExecuteIntent` calls `resolveSelector` exactly as it does today (same 3-arg call, same return type) — no other kernel file changes.

- [ ] **Step 1: Write the failing tests**

Create `src/kernel/selector-resolution.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { driverOf, isMobilewrightPlatform, resolveSelector } from '@kernel/selector-resolution';

test('driverOf extracts the driver name from "driver:sessionId", case-insensitively', () => {
    assert.equal(driverOf('playwright:0'), 'playwright');
    assert.equal(driverOf('APPIUM:3'), 'appium');
});

test('isMobilewrightPlatform is true only for the mobilewright driver', () => {
    assert.equal(isMobilewrightPlatform('mobilewright:0'), true);
    assert.equal(isMobilewrightPlatform('appium:0'), false);
});

// zipCodeInput lives in checkout.locators.json, which this plan never
// modifies — a stable regression fixture for the legacy resolution path.

test('resolveSelector resolves a simple key against the legacy web shape', () => {
    process.env.PLATFORM = 'web';
    process.env.VIEWPORT = 'desktop';
    assert.equal(resolveSelector('CLICK', 'zipCodeInput', 'playwright:0'), "[data-testid='zip-code']");
    delete process.env.PLATFORM;
    delete process.env.VIEWPORT;
});

test('resolveSelector resolves only the key portion of a composite target, preserving the payload', () => {
    process.env.PLATFORM = 'web';
    process.env.VIEWPORT = 'desktop';
    assert.equal(resolveSelector('TYPE', 'zipCodeInput||90210', 'playwright:0'), "[data-testid='zip-code']||90210");
    delete process.env.PLATFORM;
    delete process.env.VIEWPORT;
});

test('resolveSelector bypasses resolution entirely for a mobilewright platform', () => {
    assert.equal(resolveSelector('CLICK', 'zipCodeInput', 'mobilewright:0'), 'zipCodeInput');
});

test('resolveSelector passes NAVIGATE through unresolved (passthrough action)', () => {
    assert.equal(resolveSelector('NAVIGATE', 'https://example.com', 'playwright:0'), 'https://example.com');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test -r ts-node/register -r tsconfig-paths/register src/kernel/selector-resolution.test.ts`
Expected: FAIL — module `@kernel/selector-resolution` does not exist yet.

- [ ] **Step 3: Create `src/kernel/selector-resolution.ts`**

```ts
import { resolveLocator } from '@kernel/locator-resolver';
import { INTENT, LEGACY_INTENT_ALIASES } from '@kernel/intents';

export const ACTION_TYPE_SEPARATOR = '||';

// Actions that carry no logical target, or that resolve their own targets
// internally (visual/API/security/performance contracts) — see each
// entry's origin comment in the original chaos-proxy.ts if history is needed.
export const PASSTHROUGH_ACTIONS = new Set<string>([
    INTENT.NAVIGATE, INTENT.TEARDOWN, INTENT.BROWSER_COMMAND, INTENT.HIDE_KEYBOARD,
    INTENT.ACQUIRE_WRITE_LOCK, INTENT.RELEASE_WRITE_LOCK,
    INTENT.SCREENSHOT,
    INTENT.CAPTURE_SNAPSHOT, INTENT.COMPARE_SNAPSHOT, INTENT.VALIDATE_VISUAL_CONTRACT, INTENT.UPDATE_BASELINE,
    INTENT.RUN_ACCESSIBILITY_AUDIT, INTENT.VALIDATE_ACCESSIBILITY_THRESHOLDS,
    INTENT.RUN_ZAP_BASELINE_SCAN, INTENT.RUN_ZAP_API_SCAN, INTENT.PARSE_ZAP_REPORT,
    INTENT.VALIDATE_ZAP_THRESHOLDS, INTENT.RUN_MOBSF_APK_SCAN, INTENT.PARSE_MOBSF_REPORT,
    INTENT.RUN_SCHEMA_FUZZ, INTENT.RUN_TLS_CHECK,
    INTENT.EXECUTE_CONTRACT_ENDPOINT, INTENT.VALIDATE_CONTRACT_ENDPOINT,
    INTENT.RUN_SIMULATION, INTENT.RUN_CHECKOUT_LOAD, INTENT.PARSE_GATLING_STATS, INTENT.VALIDATE_THRESHOLDS,
    ...LEGACY_INTENT_ALIASES,
]);

// Actions that use the "logicalKey||payload" format.
// TYPE:             logicalKey||text
// WAIT_FOR_ELEMENT: logicalKey||timeoutMs
// ASSERT_TEXT:      logicalKey||expectedText
export const COMPOSITE_ACTIONS = new Set<string>([
    INTENT.TYPE,
    INTENT.SELECT_OPTION,
    INTENT.WAIT_FOR_ELEMENT,
    INTENT.ASSERT_TEXT,
]);

export function driverOf(platform: string): string {
    return platform.split(':')[0].toLowerCase();
}

export function isMobilewrightPlatform(platform: string): boolean {
    return driverOf(platform) === 'mobilewright';
}

export function resolveSelector(actionId: string, rawSelector: string, platform: string): string {
    const normalized = actionId.toUpperCase();

    // NAVIGATE, TEARDOWN and BROWSER_COMMAND pass structured/raw values without locator resolution.
    if (PASSTHROUGH_ACTIONS.has(normalized)) {
        return rawSelector;
    }

    // Mobilewright resolves locators inside its own plugin (parseLocator +
    // Locator.root().getByTestId()/getByLabel()/...). The proxy must pass
    // through both halves of composite targets unchanged so the plugin sees
    // the logical key (treated as testId by default) plus the payload.
    if (isMobilewrightPlatform(platform)) {
        return rawSelector;
    }

    const driver = driverOf(platform);

    // Composite actions: resolve solely the key portion; preserve the payload succeeding the || separator.
    if (COMPOSITE_ACTIONS.has(normalized) && rawSelector.includes(ACTION_TYPE_SEPARATOR)) {
        const sepIndex = rawSelector.indexOf(ACTION_TYPE_SEPARATOR);
        const logicalKey = rawSelector.slice(0, sepIndex);
        const textPayload = rawSelector.slice(sepIndex);
        return resolveLocator(logicalKey, driver) + textPayload;
    }

    return resolveLocator(rawSelector, driver);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test -r ts-node/register -r tsconfig-paths/register src/kernel/selector-resolution.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `chaos-proxy.ts` to import from the new module**

In `src/kernel/chaos-proxy.ts`:
1. Remove the `import { resolveLocator } from '@kernel/locator-resolver';` line.
2. Add `import { resolveSelector } from '@kernel/selector-resolution';` alongside the other kernel imports.
3. Delete the entire `--- 7. TYPE-Aware Locator Resolution ---` section (the `PASSTHROUGH_ACTIONS` const, `COMPOSITE_ACTIONS` const, `ACTION_TYPE_SEPARATOR` const, `isMobilewrightPlatform` function, and `resolveSelector` function) — all of it now lives in `selector-resolution.ts`.
4. Leave `handleExecuteIntent`'s call `resolveSelector(actionId, targetSelector, platform)` (inside the try block, "THE INDIRECTION BOUNDARY" comment) exactly as-is — it now resolves to the imported function.

- [ ] **Step 6: Type-check and confirm the proxy still boots**

Run: `npx tsc --noEmit`
Expected: no errors in `chaos-proxy.ts` or `selector-resolution.ts`.

Run: `npx ts-node -r tsconfig-paths/register -r dotenv/config src/kernel/chaos-proxy.ts &` then check its startup log line, then stop it.
Expected: the same `[p-TOM] Microkernel listening on ...` startup line as before this task — bootstrap behavior is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/kernel/selector-resolution.ts src/kernel/selector-resolution.test.ts src/kernel/chaos-proxy.ts
git commit -m "refactor(kernel): extract selector resolution into a testable module, thread driver through"
```

---

### Task 3: Playwright plugin — structured `kind` locators

**Files:**
- Create: `src/plugins/playwright/actions/PlaywrightLocator.ts`
- Test: `src/plugins/playwright/actions/PlaywrightLocator.test.ts` (new)
- Modify: `src/plugins/playwright/actions/Click.ts`
- Modify: `src/plugins/playwright/actions/Type.ts`
- Modify: `src/plugins/playwright/actions/ClearText.ts`
- Modify: `src/plugins/playwright/actions/AssertText.ts`
- Modify: `src/plugins/playwright/actions/ReadText.ts`
- Modify: `src/plugins/playwright/actions/ScrollTo.ts`
- Modify: `src/plugins/playwright/actions/WaitForElement.ts`
- Modify: `src/plugins/playwright/actions/SelectOption.ts`

**Interfaces:**
- Consumes: nothing from other tasks — `target` strings arrive already resolved (raw CSS or a `{kind,...}` JSON string) regardless of how they got there.
- Produces: `parseLocator(target: string): PlaywrightLocatorStrategy`, `locate(page: Page, strategy: PlaywrightLocatorStrategy): Locator`, exported from `@plugins/playwright/actions/PlaywrightLocator` — used by all 8 modified handlers.

- [ ] **Step 1: Write the failing tests**

Create `src/plugins/playwright/actions/PlaywrightLocator.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

test('parseLocator treats a plain string as a raw css strategy (backward-compatible default)', () => {
    assert.deepEqual(parseLocator("[data-testid='foo']"), { kind: 'css', value: "[data-testid='foo']" });
});

test('parseLocator treats CSS containing colons as raw css, not JSON', () => {
    assert.deepEqual(parseLocator('h1:has-text("Checkout")'), { kind: 'css', value: 'h1:has-text("Checkout")' });
});

test('parseLocator parses a JSON {kind,value} target', () => {
    assert.deepEqual(parseLocator('{"kind":"testId","value":"logout-btn"}'), { kind: 'testId', value: 'logout-btn' });
});

test('parseLocator parses a JSON target with extra options', () => {
    assert.deepEqual(
        parseLocator('{"kind":"role","value":"button","name":"Submit","exact":true}'),
        { kind: 'role', value: 'button', name: 'Submit', exact: true },
    );
});

function fakePage() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const locatorStub = { __calls: calls };
    const page: any = { __calls: calls };
    for (const method of ['getByTestId', 'getByRole', 'getByText', 'getByLabel', 'getByPlaceholder', 'getByAltText', 'getByTitle', 'locator']) {
        page[method] = (...args: unknown[]) => {
            calls.push({ method, args });
            return locatorStub;
        };
    }
    return page;
}

test('locate dispatches "testId" to page.getByTestId', () => {
    const page = fakePage();
    locate(page, { kind: 'testId', value: 'logout-btn' });
    assert.deepEqual(page.__calls, [{ method: 'getByTestId', args: ['logout-btn'] }]);
});

test('locate dispatches "role" to page.getByRole with name/exact options', () => {
    const page = fakePage();
    locate(page, { kind: 'role', value: 'button', name: 'Submit', exact: true });
    assert.deepEqual(page.__calls, [{ method: 'getByRole', args: ['button', { name: 'Submit', exact: true }] }]);
});

test('locate dispatches "text" to page.getByText', () => {
    const page = fakePage();
    locate(page, { kind: 'text', value: 'Checkout', exact: false });
    assert.deepEqual(page.__calls, [{ method: 'getByText', args: ['Checkout', { exact: false }] }]);
});

test('locate dispatches "label" to page.getByLabel', () => {
    const page = fakePage();
    locate(page, { kind: 'label', value: 'Username' });
    assert.deepEqual(page.__calls, [{ method: 'getByLabel', args: ['Username', { exact: undefined }] }]);
});

test('locate dispatches "placeholder" to page.getByPlaceholder', () => {
    const page = fakePage();
    locate(page, { kind: 'placeholder', value: 'Enter zip' });
    assert.deepEqual(page.__calls, [{ method: 'getByPlaceholder', args: ['Enter zip', { exact: undefined }] }]);
});

test('locate dispatches "altText" to page.getByAltText', () => {
    const page = fakePage();
    locate(page, { kind: 'altText', value: 'Logo' });
    assert.deepEqual(page.__calls, [{ method: 'getByAltText', args: ['Logo', { exact: undefined }] }]);
});

test('locate dispatches "title" to page.getByTitle', () => {
    const page = fakePage();
    locate(page, { kind: 'title', value: 'Close' });
    assert.deepEqual(page.__calls, [{ method: 'getByTitle', args: ['Close', { exact: undefined }] }]);
});

test('locate dispatches "css" to page.locator', () => {
    const page = fakePage();
    locate(page, { kind: 'css', value: "[data-testid='foo']" });
    assert.deepEqual(page.__calls, [{ method: 'locator', args: ["[data-testid='foo']"] }]);
});

test('locate dispatches "xpath" to page.locator with an xpath= prefix', () => {
    const page = fakePage();
    locate(page, { kind: 'xpath', value: '//button' });
    assert.deepEqual(page.__calls, [{ method: 'locator', args: ['xpath=//button'] }]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test -r ts-node/register -r tsconfig-paths/register src/plugins/playwright/actions/PlaywrightLocator.test.ts`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create `src/plugins/playwright/actions/PlaywrightLocator.ts`**

```ts
import type { Locator, Page } from 'playwright';

export type PlaywrightLocatorStrategy =
    | { kind: 'testId'; value: string }
    | { kind: 'role'; value: string; name?: string; exact?: boolean }
    | { kind: 'text'; value: string; exact?: boolean }
    | { kind: 'label'; value: string; exact?: boolean }
    | { kind: 'placeholder'; value: string; exact?: boolean }
    | { kind: 'altText'; value: string; exact?: boolean }
    | { kind: 'title'; value: string; exact?: boolean }
    | { kind: 'css'; value: string }
    | { kind: 'xpath'; value: string };

function parseJsonLocator(target: string): PlaywrightLocatorStrategy | undefined {
    if (!target.startsWith('{')) return undefined;

    try {
        const parsed = JSON.parse(target) as PlaywrightLocatorStrategy;
        if (!parsed || typeof parsed !== 'object' || !('kind' in parsed) || !('value' in parsed)) {
            return undefined;
        }
        return parsed;
    } catch {
        return undefined;
    }
}

/** Parse a resolved target string into a structured locator strategy.
 *  - `{"kind":"testId","value":"..."}` JSON — structured `wright`-family locator.
 *  - anything else — raw CSS selector (legacy shape / webdriver-family passthrough).
 */
export function parseLocator(target: string): PlaywrightLocatorStrategy {
    return parseJsonLocator(target) ?? { kind: 'css', value: target };
}

/** Apply a parsed strategy against the page, returning a Locator. */
export function locate(page: Page, strategy: PlaywrightLocatorStrategy): Locator {
    switch (strategy.kind) {
        case 'testId': return page.getByTestId(strategy.value);
        case 'role': return page.getByRole(strategy.value as Parameters<Page['getByRole']>[0], { name: strategy.name, exact: strategy.exact });
        case 'text': return page.getByText(strategy.value, { exact: strategy.exact });
        case 'label': return page.getByLabel(strategy.value, { exact: strategy.exact });
        case 'placeholder': return page.getByPlaceholder(strategy.value, { exact: strategy.exact });
        case 'altText': return page.getByAltText(strategy.value, { exact: strategy.exact });
        case 'title': return page.getByTitle(strategy.value, { exact: strategy.exact });
        case 'xpath': return page.locator(`xpath=${strategy.value}`);
        case 'css': return page.locator(strategy.value);
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test -r ts-node/register -r tsconfig-paths/register src/plugins/playwright/actions/PlaywrightLocator.test.ts`
Expected: PASS.

- [ ] **Step 5: Route all 8 action handlers through `locate()`**

`src/plugins/playwright/actions/Click.ts`:
```ts
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const ClickAction: ActionHandler<PlaywrightActionContext> = {
    name: 'CLICK',
    async execute({ page, target }) {
        await locate(page, parseLocator(target)).click();
        return `Click executed on element: ${target}`;
    },
};
```

`src/plugins/playwright/actions/Type.ts`:
```ts
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const TypeAction: ActionHandler<PlaywrightActionContext> = {
    name: 'TYPE',
    async execute({ page, target }) {
        const { selector, value } = parseSelectorValue(target, 'TYPE action');
        await locate(page, parseLocator(selector)).fill(value);
        return `Typed text into element: ${selector}`;
    },
};
```

`src/plugins/playwright/actions/ClearText.ts`:
```ts
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const ClearTextAction: ActionHandler<PlaywrightActionContext> = {
    name: 'CLEAR_TEXT',
    async execute({ page, target }) {
        await locate(page, parseLocator(target)).fill('');
        return `Cleared text in element: ${target}`;
    },
};
```

`src/plugins/playwright/actions/AssertText.ts` (only the locator construction line changes — the polling loop is untouched):
```ts
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const AssertTextAction: ActionHandler<PlaywrightActionContext> = {
    name: 'ASSERT_TEXT',
    async execute({ page, target }) {
        const { selector, value: expected } = parseSelectorValue(target, 'ASSERT_TEXT action');
        const locator = locate(page, parseLocator(selector));
        const configuredTimeout = Number(process.env.TOM_ASSERT_TIMEOUT_MS ?? '5000');
        const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
            ? configuredTimeout
            : 5000;
        const deadline = performance.now() + timeoutMs;
        const normalizedExpected = expected.trim().toLowerCase();
        let actual = '';

        while (performance.now() < deadline) {
            const remainingMs = Math.max(1, deadline - performance.now());
            actual = await locator.innerText({ timeout: remainingMs });

            if (actual.trim().toLowerCase() === normalizedExpected) return actual;

            await new Promise((resolve) => setTimeout(resolve, Math.min(100, remainingMs)));
        }

        throw new Error(
            `[ASSERT_TEXT] Mismatch on "${selector}" after ${timeoutMs}ms: ` +
            `expected "${expected}", got "${actual}"`,
        );
    },
};
```

`src/plugins/playwright/actions/ReadText.ts` (keep the existing header comment about input-value vs textContent; only the locator construction line changes):
```ts
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const ReadTextAction: ActionHandler<PlaywrightActionContext> = {
    name: 'READ_TEXT',
    // Reads the "user-visible text" of the matched element(s). For inputs /
    // textareas / selects the user-visible text is the `value` property, not
    // `textContent` (which is empty on void/form elements). The branch is
    // keyed off the DOM node's tagName so non-form elements continue to
    // behave exactly as before.
    async execute({ page, target }) {
        const locator = locate(page, parseLocator(target));
        const count = await locator.count();
        if (count === 0) return '';
        const parts: string[] = [];
        for (let i = 0; i < count; i++) {
            const el = locator.nth(i);
            const tag = await el.evaluate((node) => node.nodeName.toUpperCase()).catch(() => '');
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                parts.push(await el.inputValue().catch(() => ''));
            } else {
                parts.push((await el.textContent()) ?? '');
            }
        }
        return parts.join('\n');
    },
};
```

`src/plugins/playwright/actions/ScrollTo.ts`:
```ts
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const ScrollToAction: ActionHandler<PlaywrightActionContext> = {
    name: 'SCROLL_TO',
    async execute({ page, target }) {
        await locate(page, parseLocator(target)).scrollIntoViewIfNeeded();
        return `Scrolled to: ${target}`;
    },
};
```

`src/plugins/playwright/actions/WaitForElement.ts`:
```ts
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorTimeout } from '@plugins/shared/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const WaitForElementAction: ActionHandler<PlaywrightActionContext> = {
    name: 'WAIT_FOR_ELEMENT',
    async execute({ page, target }) {
        const { selector, timeoutMs } = parseSelectorTimeout(target, 5000);
        // .first() so list locators (e.g. `[data-testid^='size-']`) don't
        // trip Playwright's strict-mode 1-element constraint.
        await locate(page, parseLocator(selector)).first().waitFor({ state: 'visible', timeout: timeoutMs });
        return `Element visible: ${selector}`;
    },
};
```

`src/plugins/playwright/actions/SelectOption.ts`:
```ts
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const SelectOptionAction: ActionHandler<PlaywrightActionContext> = {
    name: 'SELECT_OPTION',
    async execute({ page, target }) {
        const { selector, value } = parseSelectorValue(target, 'SELECT_OPTION action');
        await locate(page, parseLocator(selector)).selectOption(value);
        return `Selected option ${value} in element: ${selector}`;
    },
};
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in any of the 8 modified files or `PlaywrightLocator.ts`.

(No handler-level unit tests: these 8 changes are mechanical rewiring — the same `page.click(target)` shape swapped for `locate(page, parseLocator(target)).click()` — with no new branching logic to isolate from a real `Page`. `PlaywrightLocator.ts` (Steps 1-4) already covers the actual new logic in isolation; Task 6's end-to-end run is these 8 handlers' real test cycle.)

- [ ] **Step 7: Commit**

```bash
git add src/plugins/playwright/actions/PlaywrightLocator.ts src/plugins/playwright/actions/PlaywrightLocator.test.ts \
        src/plugins/playwright/actions/Click.ts src/plugins/playwright/actions/Type.ts \
        src/plugins/playwright/actions/ClearText.ts src/plugins/playwright/actions/AssertText.ts \
        src/plugins/playwright/actions/ReadText.ts src/plugins/playwright/actions/ScrollTo.ts \
        src/plugins/playwright/actions/WaitForElement.ts src/plugins/playwright/actions/SelectOption.ts
git commit -m "feat(playwright): add structured kind locators (testId/role/text/...) alongside raw CSS"
```

---

### Task 4: mobilewright plugin — explicit override + hardened borrow

**Files:**
- Modify: `src/plugins/mobilewright/mobilewright.ts`
- Test: `src/plugins/mobilewright/mobilewright.test.ts` (new)

**Interfaces:**
- Consumes: `hasLocatorKey`, `resolveMobileSelector` from Task 1 (already imported today; `resolveMobileSelector`'s new priority — `node.mobilewright` first — is transparent to this file, it just reads whatever string comes back).
- Produces: `resolveMobilewrightTarget(rawTarget: string, platform: MobilewrightPlatform): string` — **now exported** (was module-private) so it's directly testable.

- [ ] **Step 1: Write the failing tests**

Create `src/plugins/mobilewright/mobilewright.test.ts`. Uses two real, untouched fixtures: `checkout.locators.json`'s `zipCodeInput` (bare `~` accessibility-id borrow — the happy path) and `paymentMethodList` (an Android `UiSelector` borrow with no `mobilewright` override anywhere — the now-loud failure path), plus `login.wright.locators.json`'s `usernameInput` (an explicit `mobilewright` override, added by Task 5):

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveMobilewrightTarget } from '@plugins/mobilewright/mobilewright';

test('resolveMobilewrightTarget strips a bare accessibility-id legacy borrow (unchanged happy path)', () => {
    assert.equal(resolveMobilewrightTarget('zipCodeInput', 'android'), 'input-zipcode');
});

test('resolveMobilewrightTarget preserves the composite payload after the || separator', () => {
    assert.equal(resolveMobilewrightTarget('zipCodeInput||90210', 'android'), 'input-zipcode||90210');
});

test('resolveMobilewrightTarget passes an explicit mobilewright override through as JSON', () => {
    assert.equal(
        resolveMobilewrightTarget('usernameInput', 'android'),
        JSON.stringify({ kind: 'testId', value: 'input-username' }),
    );
});

test('resolveMobilewrightTarget throws a clear error for an Appium-only borrow it cannot interpret', () => {
    assert.throws(
        () => resolveMobilewrightTarget('paymentMethodList', 'android'),
        /paymentMethodList.*Appium-only selector/,
    );
});

test('resolveMobilewrightTarget passes an unregistered raw target through unchanged', () => {
    assert.equal(resolveMobilewrightTarget('~already-raw-target', 'android'), '~already-raw-target');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test -r ts-node/register -r tsconfig-paths/register src/plugins/mobilewright/mobilewright.test.ts`
Expected: FAIL — `resolveMobilewrightTarget` is not exported yet, and the `usernameInput` case fails until Task 5's `login.wright.locators.json` is merged (if Task 5 hasn't landed in this worktree yet, skip that one test locally and revisit at Phase-2-start once Phase 1 is merged — Phase 2 does not begin until it is).

- [ ] **Step 3: Update `src/plugins/mobilewright/mobilewright.ts`**

```ts
// Mobilewright plugin — thin orchestrator. Mirrors the shape of the
// mobile-ui (Appium) plugin but delegates to the `mobilewright` npm
// package instead. New actions live under `actions/` and register
// themselves via `registerMobilewrightActions.ts` (Open/Closed).

import { getMobilewrightActionRegistry } from '@plugins/mobilewright/actions/registerMobilewrightActions';
import { ensureSession, teardown, MobilewrightPlatform } from '@plugins/mobilewright/mobilewright-lifecycle';
import { hasLocatorKey, resolveMobileSelector } from '@kernel/locator-resolver';

const registry = getMobilewrightActionRegistry();

// WebdriverIO/Appium-only selector prefixes that mobilewright's own
// testId/label/text/role/placeholder/type engine cannot interpret. A value
// carrying one of these reaching here (via the legacy node.mobile.* borrow)
// means the logical key needs an explicit `mobilewright` override in its
// *.wright.locators.json entry — fail loudly instead of using the raw
// string as a broken literal testId.
const APPIUM_ONLY_PREFIXES = ['android=', '-ios ', 'id=', 'xpath='];

// chaos-proxy passes mobilewright targets through unresolved (its own
// comment: "the plugin sees the logical key ... plus the payload"), on the
// assumption the logical key doubles as the real testId. It doesn't — app
// testIDs (`text-welcome-title`) differ from the shared registry's logical
// key names (`welcomeTitleText`). Resolve the same *.locators.json registry
// other mobile drivers use here, keyed off this session's actual device
// platform. An explicit `node.mobilewright` entry (locator-resolver.ts)
// resolves to a JSON {kind,...} string and is passed straight through for
// parseLocator to parse; a legacy `~foo` accessibility-id borrow has its
// `~` stripped so parseLocator's default testId kind matches; any other
// borrowed shape (Android UiSelector, iOS class chain / predicate) is not
// expressible via mobilewright's testId/label/text/role/placeholder/type
// kinds and throws instead of silently mis-resolving.
export function resolveMobilewrightTarget(rawTarget: string, platform: MobilewrightPlatform): string {
    const sepIndex = rawTarget.indexOf('||');
    const key = sepIndex === -1 ? rawTarget : rawTarget.slice(0, sepIndex);
    const rest = sepIndex === -1 ? '' : rawTarget.slice(sepIndex);

    if (!hasLocatorKey(key)) return rawTarget;
    const resolved = resolveMobileSelector(key, platform);
    if (!resolved) return rawTarget;

    if (resolved.startsWith('{')) return `${resolved}${rest}`;

    if (resolved.startsWith('~')) return `${resolved.slice(1)}${rest}`;

    if (APPIUM_ONLY_PREFIXES.some((prefix) => resolved.startsWith(prefix))) {
        throw new Error(
            `[Mobilewright] Locator '${key}' resolved to an Appium-only selector ` +
            `("${resolved}") that mobilewright cannot interpret. Add an explicit ` +
            `"mobilewright" entry for '${key}' in its *.wright.locators.json file.`,
        );
    }

    return `${resolved}${rest}`;
}

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    // TEARDOWN is session-scoped — never boot a device just to close it.
    if (normalizedAction === 'TEARDOWN') {
        await teardown(sessionId);
        return 'Mobilewright execution environment terminated securely.';
    }

    const session = await ensureSession(sessionId);

    return registry.execute(normalizedAction, {
        driver: session.device,
        target: resolveMobilewrightTarget(targetSelector, session.platform),
        actionId: normalizedAction,
        sessionId,
        platform: session.platform,
        metadata: { plugin: 'mobilewright', profileId: session.profileId },
    });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test -r ts-node/register -r tsconfig-paths/register src/plugins/mobilewright/mobilewright.test.ts`
Expected: PASS (all 5 tests, including the `usernameInput` explicit-override case, since Task 5 is merged by the time Phase 2 starts).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `mobilewright.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/plugins/mobilewright/mobilewright.ts src/plugins/mobilewright/mobilewright.test.ts
git commit -m "fix(mobilewright): read explicit locator override, fail loudly on unsupported Appium-only borrow"
```

---

### Task 5: `login` domain — reference migration

**Files:**
- Create: `src/core/tests/login/contracts/login.webdriver.locators.json`
- Create: `src/core/tests/login/contracts/login.wright.locators.json`
- Delete: `src/core/tests/login/contracts/login.locators.json`
- Test: `src/core/tests/login/contracts/login-locators.test.ts` (new)

**Interfaces:**
- Consumes: nothing — pure data, matching the design doc's §7 exactly.
- Produces: the `login` domain's locator data, consumed by Task 1/Task 4's tests (`usernameInput`'s `mobilewright` branch) and Task 6's end-to-end run.

- [ ] **Step 1: Write the failing test**

Create `src/core/tests/login/contracts/login-locators.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';

const CONTRACTS_DIR = __dirname;

test('login.locators.json no longer exists — content was redistributed, not duplicated', () => {
    assert.equal(fs.existsSync(path.join(CONTRACTS_DIR, 'login.locators.json')), false);
});

test('login.webdriver.locators.json is valid JSON, has all 18 original keys, values verbatim', () => {
    const webdriver = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'login.webdriver.locators.json'), 'utf-8'));
    assert.equal(Object.keys(webdriver).length, 18);
    assert.deepEqual(webdriver.loginScreen, { webdriverio: 'body', appium: '~screen-login' });
    assert.deepEqual(webdriver.togglePasswordButton, { webdriverio: "[data-testid='toggle-password']" });
    assert.equal(webdriver.appLogo.appium, '~img-logo');
    assert.equal(webdriver.appLogo.webdriverio, undefined);
    assert.deepEqual(webdriver.marketButtonList.appium, {
        android: 'android=new UiSelector().descriptionStartsWith("btn-market-")',
        ios: "-ios class chain:**/XCUIElementTypeOther[`name BEGINSWITH 'btn-market-'`]",
    });
});

test('login.wright.locators.json is valid JSON with playwright testId + mobilewright explicit entries', () => {
    const wright = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'login.wright.locators.json'), 'utf-8'));
    assert.equal(Object.keys(wright).length, 16);
    assert.deepEqual(wright.usernameInput.mobilewright, { kind: 'testId', value: 'input-username' });
    assert.deepEqual(wright.usernameInput.playwright.desktop, { kind: 'testId', value: 'username-desktop' });
    assert.deepEqual(wright.loginScreen.playwright, { kind: 'css', value: 'body' });
    // marketFlag and quickLoginUserLabel have no wright-family equivalent (§6 gap) — must be absent, not empty objects.
    assert.equal(wright.marketFlag, undefined);
    assert.equal(wright.quickLoginUserLabel, undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test -r ts-node/register -r tsconfig-paths/register src/core/tests/login/contracts/login-locators.test.ts`
Expected: FAIL — `login.locators.json` still exists, the two new files don't.

- [ ] **Step 3: Create `login.webdriver.locators.json`**

```json
{
  "loginScreen": { "webdriverio": "body", "appium": "~screen-login" },
  "appLogo": { "appium": "~img-logo" },
  "appNameText": { "appium": "~text-app-name" },
  "welcomeTitleText": { "webdriverio": "h2.text-3xl", "appium": "~text-welcome-title" },
  "subtitleText": { "webdriverio": "p.text-gray-400", "appium": "~text-login-subtitle" },
  "marketButtonList": {
    "webdriverio": "[data-testid^='market-']",
    "appium": {
      "android": "android=new UiSelector().descriptionStartsWith(\"btn-market-\")",
      "ios": "-ios class chain:**/XCUIElementTypeOther[`name BEGINSWITH 'btn-market-'`]"
    }
  },
  "switzerlandLanguageList": {
    "webdriverio": "[data-testid^='lang-']",
    "appium": {
      "android": "android=new UiSelector().descriptionStartsWith(\"btn-lang-\")",
      "ios": "-ios class chain:**/XCUIElementTypeOther[`name BEGINSWITH 'btn-lang-'`]"
    }
  },
  "logoutButton": {
    "webdriverio": {
      "desktop": "[data-testid='logout-btn']",
      "responsive": "[data-testid='mobile-logout-btn']"
    },
    "appium": "~btn-logout"
  },
  "usernameInput": {
    "webdriverio": {
      "responsive": "[data-testid='username-responsive']",
      "desktop": "[data-testid='username-desktop']"
    },
    "appium": "~input-username"
  },
  "passwordInput": {
    "webdriverio": {
      "responsive": "[data-testid='password-responsive']",
      "desktop": "[data-testid='password-desktop']"
    },
    "appium": "~input-password"
  },
  "togglePasswordButton": { "webdriverio": "[data-testid='toggle-password']" },
  "marketSelectionContainer": { "appium": "~view-market-selection" },
  "marketFlag": {
    "appium": {
      "android": "android=new UiSelector().descriptionStartsWith(\"text-flag-\")",
      "ios": "-ios class chain:**/XCUIElementTypeStaticText[`name BEGINSWITH 'text-flag-'`]"
    }
  },
  "loginButton": {
    "webdriverio": {
      "responsive": "[data-testid='login-button-responsive']",
      "desktop": "[data-testid='login-button-desktop']"
    },
    "appium": "~btn-login"
  },
  "loginError": { "webdriverio": "[data-testid='login-error']", "appium": "~text-login-error" },
  "quickLoginLabel": { "appium": "~text-quick-login-label" },
  "quickLoginUserList": {
    "webdriverio": "[data-testid^='user-']",
    "appium": {
      "android": "android=new UiSelector().descriptionStartsWith(\"btn-user-\")",
      "ios": "-ios class chain:**/XCUIElementTypeOther[`name BEGINSWITH 'btn-user-'`]"
    }
  },
  "quickLoginUserLabel": {
    "appium": {
      "android": "android=new UiSelector().descriptionStartsWith(\"text-user-label-\")",
      "ios": "-ios class chain:**/XCUIElementTypeStaticText[`name BEGINSWITH 'text-user-label-'`]"
    }
  }
}
```

- [ ] **Step 4: Create `login.wright.locators.json`**

```json
{
  "loginScreen": {
    "playwright": { "kind": "css", "value": "body" },
    "mobilewright": { "kind": "testId", "value": "screen-login" }
  },
  "appLogo": { "mobilewright": { "kind": "testId", "value": "img-logo" } },
  "appNameText": { "mobilewright": { "kind": "testId", "value": "text-app-name" } },
  "welcomeTitleText": {
    "playwright": { "kind": "css", "value": "h2.text-3xl" },
    "mobilewright": { "kind": "testId", "value": "text-welcome-title" }
  },
  "subtitleText": {
    "playwright": { "kind": "css", "value": "p.text-gray-400" },
    "mobilewright": { "kind": "testId", "value": "text-login-subtitle" }
  },
  "marketButtonList": { "playwright": { "kind": "css", "value": "[data-testid^='market-']" } },
  "switzerlandLanguageList": { "playwright": { "kind": "css", "value": "[data-testid^='lang-']" } },
  "logoutButton": {
    "playwright": {
      "desktop": { "kind": "testId", "value": "logout-btn" },
      "responsive": { "kind": "testId", "value": "mobile-logout-btn" }
    },
    "mobilewright": { "kind": "testId", "value": "btn-logout" }
  },
  "usernameInput": {
    "playwright": {
      "responsive": { "kind": "testId", "value": "username-responsive" },
      "desktop": { "kind": "testId", "value": "username-desktop" }
    },
    "mobilewright": { "kind": "testId", "value": "input-username" }
  },
  "passwordInput": {
    "playwright": {
      "responsive": { "kind": "testId", "value": "password-responsive" },
      "desktop": { "kind": "testId", "value": "password-desktop" }
    },
    "mobilewright": { "kind": "testId", "value": "input-password" }
  },
  "togglePasswordButton": { "playwright": { "kind": "testId", "value": "toggle-password" } },
  "marketSelectionContainer": { "mobilewright": { "kind": "testId", "value": "view-market-selection" } },
  "loginButton": {
    "playwright": {
      "responsive": { "kind": "testId", "value": "login-button-responsive" },
      "desktop": { "kind": "testId", "value": "login-button-desktop" }
    },
    "mobilewright": { "kind": "testId", "value": "btn-login" }
  },
  "loginError": {
    "playwright": { "kind": "testId", "value": "login-error" },
    "mobilewright": { "kind": "testId", "value": "text-login-error" }
  },
  "quickLoginLabel": { "mobilewright": { "kind": "testId", "value": "text-quick-login-label" } },
  "quickLoginUserList": { "playwright": { "kind": "css", "value": "[data-testid^='user-']" } }
}
```

- [ ] **Step 5: Delete `login.locators.json`**

```bash
git rm src/core/tests/login/contracts/login.locators.json
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test -r ts-node/register -r tsconfig-paths/register src/core/tests/login/contracts/login-locators.test.ts`
Expected: PASS.

- [ ] **Step 7: Confirm the other 5 domains are untouched**

Run: `git status --short src/core/tests/`
Expected: only `login/contracts/` entries listed (2 new files, 1 deleted). No other domain's `contracts/` directory appears.

- [ ] **Step 8: Commit**

```bash
git add src/core/tests/login/contracts/login.webdriver.locators.json \
        src/core/tests/login/contracts/login.wright.locators.json \
        src/core/tests/login/contracts/login-locators.test.ts
git commit -m "feat(login): migrate locators to webdriver/wright family files"
```

---

### Task 6: End-to-end verification

**Depends on:** Task 1, Task 2, Task 3, Task 4, and Task 5 all merged.

**Files:** none modified — this task runs the real system and records the outcome. If it uncovers a real defect in a prior task, fix it in that task's files and re-run this task from Step 1.

**Scope, grounded in the actual code** (not the general claim in the design doc's §9, which turned out to be imprecise once the molecules were read directly): `src/core/tests/login/features/invalid-credentials.feature` (tags `@desktop @responsive @android @ios @api`) is the one login feature that exercises the migrated keys (`usernameInput`, `passwordInput`, `loginButton`, `loginError`, indirectly `loginScreen`) through the real logical-key resolution path, across all three drivers. The known §6 gap (`marketButtonList` etc.) is **not** naturally exercised by any current feature — `login-market.molecule.ts` builds those specific selectors by hand, bypassing logical-key resolution entirely, and the one feature that calls it (`market-language-localization.feature`) is tagged `@desktop`-only. That gap is already covered by Task 4's `paymentMethodList` unit test; this task does not need to (and will not) reproduce it live.

- [ ] **Step 1: Playwright — start the stack**

```bash
npx cross-env DRIVER=playwright PLATFORM=web VIEWPORT=desktop \
  ts-node -r tsconfig-paths/register -r dotenv/config src/kernel/chaos-proxy.ts &
npx cross-env DRIVER=playwright PLATFORM=web \
  ts-node -r tsconfig-paths/register -r dotenv/config src/plugins/playwright/server.ts &
```

Wait for both to log their "listening" line before continuing.

- [ ] **Step 2: Playwright — run the login pilot feature**

```bash
npx cross-env DRIVER=playwright PLATFORM=web VIEWPORT=desktop BROWSER=chromium \
  cucumber-js src/core/tests/login/features/invalid-credentials.feature --tags "@desktop"
```

Expected: all 5 scenario-outline rows PASS. This is the first real proof that `resolveLocator`'s new `playwright` branch (`{"kind":"testId",...}`) round-trips correctly through gRPC and `PlaywrightLocator.locate()` against the real deployed frontend.

- [ ] **Step 3: Tear down the Playwright stack**

Stop both background processes from Step 1.

- [ ] **Step 4: Appium — start the stack against the connected Android device**

Confirm the device is visible first: `adb devices` (expect it listed as `device`, not `unauthorized`/`offline`).

```bash
npx cross-env DRIVER=appium PLATFORM=android \
  ts-node -r tsconfig-paths/register -r dotenv/config src/kernel/chaos-proxy.ts &
npx cross-env DRIVER=appium PLATFORM=android \
  ts-node -r tsconfig-paths/register -r dotenv/config src/plugins/appium/server.ts &
```

If the Appium server itself isn't already running as its own process (check `APPIUM_HOST`/`APPIUM_PORT` in `.env`, default `127.0.0.1:4723`), start it too: `npx appium --port 4723 &`. Wait for the OmniPizza app (`ANDROID_APP_PATH` in `.env`) to install/launch on the device before running the feature.

- [ ] **Step 5: Appium — run the login pilot feature**

```bash
npx cross-env DRIVER=appium PLATFORM=android \
  cucumber-js src/core/tests/login/features/invalid-credentials.feature --tags "@android"
```

Expected: all 5 rows PASS. Proves the `login.webdriver.locators.json` rename (`mobile` → `appium`) resolves identically to the pre-migration behavior — this is a pure rename, so a regression here means Task 1's legacy-fallback path or the merge logic (Task 1, Step 3) has a bug, not the appium plugin itself.

- [ ] **Step 6: mobilewright — run the login pilot feature against the same device**

Tear down the appium stack first (same physical device, one session at a time). Then:

```bash
npx cross-env DRIVER=mobilewright PLATFORM=android \
  ts-node -r tsconfig-paths/register -r dotenv/config src/kernel/chaos-proxy.ts &
npx cross-env DRIVER=mobilewright PLATFORM=android \
  ts-node -r tsconfig-paths/register -r dotenv/config src/plugins/mobilewright/server.ts &

npx cross-env DRIVER=mobilewright PLATFORM=android \
  cucumber-js src/core/tests/login/features/invalid-credentials.feature --tags "@android"
```

Expected: all 5 rows PASS. This is the real functional proof of Task 4 — mobilewright now resolves `usernameInput`/`passwordInput`/`loginButton`/`loginError` via the **explicit** `login.wright.locators.json` `mobilewright` branch, not the previous implicit `~`-strip borrow (which happened to work for these particular bare-`~` keys, but was never verified against the actual `mobilewright` package's view-tree query engine end-to-end before this task).

- [ ] **Step 7: iOS — do not attempt**

This machine is Windows; there is no iOS simulator or physical iOS device available. Do not attempt `PLATFORM=ios` runs. Record this task's iOS coverage as "commands documented, not executed" — Steps 2/5/6 substituted with `PLATFORM=ios`/`--tags "@ios"` are the exact commands to run on a macOS machine with Xcode and a paired device/simulator, when one is available.

- [ ] **Step 8: Full regression — confirm the 5 untouched domains are unaffected**

```bash
npm run test:unit
```

Expected: PASS (includes Task 1's and Task 2's regression tests against `checkout.locators.json`'s untouched keys).

```bash
node --test -r ts-node/register -r tsconfig-paths/register \
  src/plugins/playwright/actions/PlaywrightLocator.test.ts \
  src/plugins/mobilewright/mobilewright.test.ts \
  src/core/tests/login/contracts/login-locators.test.ts
```

Expected: PASS (all tests from Tasks 3, 4, 5).

- [ ] **Step 9: Tear down**

Stop every background process started in this task (`proxy`, plugin servers, `appium` if started manually). Confirm with `adb shell dumpsys activity` or simply relaunching the app manually that the device is left in a clean, usable state — this task drove a real physical device and should not leave it stuck mid-test.

- [ ] **Step 10: Record the result**

No commit for this task (nothing to add — Step 9 already confirmed a clean working tree via Task 5's Step 7 check, repeated here: `git status --short` should show nothing beyond what Tasks 1-5 already committed). Report the pass/fail outcome of Steps 2, 5, 6, and 8 as this task's deliverable.

---

## Self-review notes

- **Spec coverage:** §3 (all 6 decisions) → Task 1 (merge semantics, resolveLocator/resolveMobileSelector) + Task 5 (family files). §4.1-4.4 → Task 1. §4.5 → Task 3 (playwright, new code) + Task 1/Task 4 (webdriver family, zero new code — confirmed, Task 2's only appium-related change is the `driver` extraction, not the appium plugin itself). §4.6/§7 → Task 5. §5 (error handling) → Task 1 (`validateStructuredLocator`, collision) + Task 4 (hardened borrow). §6 (known gap) → Task 4's `paymentMethodList` test; Task 6 documents why it isn't hit live. §9 (testing plan) → covered per-task above, with the E2E scope correction noted in Task 6's header.
- **Placeholder scan:** no TBD/TODO; every step has literal, runnable code or commands.
- **Type consistency:** `resolveLocator(logicalKey: string, driver: string): string` — same signature used in Task 1's own tests, Task 2's `selector-resolution.ts`, and referenced nowhere else. `PlaywrightLocatorStrategy`'s `kind` field name matches mobilewright's existing `LocatorStrategy` `kind` field (not `strategy`) — consistent naming across both `wright`-family types, confirmed against the design doc.
