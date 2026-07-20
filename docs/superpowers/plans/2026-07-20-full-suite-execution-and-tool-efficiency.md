# Full-Suite Clean Execution + Tool Efficiency Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reach a genuinely clean, all-green run across Web (Playwright, WebdriverIO), Mobile (Mobilewright, Appium), Performance (Gatling smoke/load/stress), API, Visual (Pixel Match), Accessibility (Axe), and Security (ZAP, MobSF), in that order, and add a new "Tool Efficiency" dashboard section that charts each tool's wall-clock execution time, comparing only genuinely equivalent tools (Playwright vs WebdriverIO, Mobilewright vs Appium; every other tool gets its own solo trend).

**Architecture:** Three independently-testable slices, built in this order: (A) two small stabilization fixes plus one investigative fix in existing test code; (B) additive dashboard data model + server route + client charts, built and tested against a hand-written fixture so it doesn't need to wait on live infrastructure; (C) an extended local orchestrator script that wraps every tool invocation with timing capture and feeds it into the existing ingest pipeline. A final, non-code execution phase runs the real thing end-to-end, fixes whatever the recon pass finds still red, and produces the first real data for slice B's charts.

**Tech Stack:** TypeScript (Node ESM), Cucumber-js + Gherkin, Express (dashboard server), React + react-router-dom (dashboard client, hand-rolled inline SVG, no charting library), Bash (orchestrator scripts), Gatling (`@gatling.io/cli`).

## Global Constraints

- No charting library — every chart is hand-rolled inline SVG/CSS, matching `Speedometer.tsx`/`PassFailDonut.tsx`.
- `chaos-proxy.ts` binds a hardcoded port (`SERVER_PORT_NUMBER = 50051`, no env override) — only one chaos-proxy-backed stack can run at a time locally.
- `@writes-shared-state`-tagged scenarios acquire/release a real lock via `INTENT.ACQUIRE_WRITE_LOCK`/`RELEASE_WRITE_LOCK`, handled by a single in-process `WriteLock` inside `chaos-proxy.ts` — trust it for correctness across concurrent driver invocations against the *same* stack; don't re-implement serialization at the script level.
- Gatling load/stress must run exclusive of every other category (shared backend under test); Gatling smoke may overlap freely.
- Timing granularity is pure tool-execution wall-clock (suite start → suite end), captured by wrapping orchestrator-level invocations — never modify the 10 individual plugin servers to add this.
- `reports/` does not exist in this repo yet (gitignored, created on first ingest) — the efficiency charts must render correctly with a single data point.
- `/api/efficiency` is capped to the most recent 20 runs.
- Security's ZAP (web) and MobSF (mobile) are never paired in a chart — each is its own solo trend group.
- UI copy is English, matching 100% of existing dashboard copy.

---

## Phase A — Stabilization (independent tasks, can run in parallel)

### Task 1: Mobilewright `ScrollTo` action

**Files:**
- Create: `src/plugins/mobilewright/actions/ScrollTo.ts`
- Modify: `src/plugins/mobilewright/actions/registerMobilewrightActions.ts`

**Interfaces:**
- Consumes: `ActionHandler<MobilewrightActionContext>` (`src/plugins/shared/ActionHandler.ts`), `parseLocator`/`locate` from `src/plugins/mobilewright/actions/MobilewrightActionContext.ts` (`locate(driver, strategy): Promise<Locator>`, and `Locator` already exposes `.scrollIntoViewIfNeeded()` — used today by `ClearText.ts`).
- Produces: an action registered under the name `'SCROLL_TO'` in the mobilewright registry, matching the name every other driver already uses (`src/plugins/playwright/actions/ScrollTo.ts`, `src/plugins/appium/actions/ScrollTo.ts`, `src/plugins/webdriverio/actions/ScrollTo.ts` all export `name: 'SCROLL_TO'`).

- [ ] **Step 1: Write the new action file**

```ts
// src/plugins/mobilewright/actions/ScrollTo.ts
import { ActionHandler } from '@plugins/shared/ActionHandler';
import {
    MobilewrightActionContext,
    parseLocator,
    locate,
} from '@plugins/mobilewright/actions/MobilewrightActionContext';

export const ScrollToAction: ActionHandler<MobilewrightActionContext> = {
    name: 'SCROLL_TO',
    async execute({ driver, target }) {
        const strategy = parseLocator(target);
        const locator = await locate(driver, strategy);
        await locator.scrollIntoViewIfNeeded();
        return `Scrolled to mobilewright element: ${strategy.kind}=${strategy.value}`;
    },
};
```

This mirrors `ClearText.ts`'s exact shape (`locate` then call a `Locator` method) and reuses the same `.scrollIntoViewIfNeeded()` call `ClearText.ts` already depends on, so it's calling a method that's proven to exist on the `mobilewright` package's `Locator` type — no speculative API surface.

- [ ] **Step 2: Register it**

Modify `src/plugins/mobilewright/actions/registerMobilewrightActions.ts`:

```ts
import { ActionRegistry } from '@plugins/shared/ActionRegistry';
import { MobilewrightActionContext } from '@plugins/mobilewright/actions/MobilewrightActionContext';
import { NavigateAction } from '@plugins/mobilewright/actions/Navigate';
import { DeepLinkAction } from '@plugins/mobilewright/actions/DeepLink';
import { ClickAction } from '@plugins/mobilewright/actions/Click';
import { TypeAction } from '@plugins/mobilewright/actions/Type';
import { SelectOptionAction } from '@plugins/mobilewright/actions/SelectOption';
import { ClearTextAction } from '@plugins/mobilewright/actions/ClearText';
import { AssertTextAction } from '@plugins/mobilewright/actions/AssertText';
import { ReadTextAction } from '@plugins/mobilewright/actions/ReadText';
import { WaitForElementAction } from '@plugins/mobilewright/actions/WaitForElement';
import { ScrollToAction } from '@plugins/mobilewright/actions/ScrollTo';

let cachedRegistry: ActionRegistry<MobilewrightActionContext> | null = null;

export function getMobilewrightActionRegistry(): ActionRegistry<MobilewrightActionContext> {
    if (cachedRegistry) return cachedRegistry;

    const registry = new ActionRegistry<MobilewrightActionContext>({ plugin: 'mobilewright' });
    registry
        .register(NavigateAction)
        .register(DeepLinkAction)
        .register(ClickAction)
        .register(TypeAction)
        .register(SelectOptionAction)
        .register(ClearTextAction)
        .register(AssertTextAction)
        .register(ReadTextAction)
        .register(WaitForElementAction)
        .register(ScrollToAction);

    cachedRegistry = registry;
    return registry;
}

export function resetMobilewrightActionRegistry(): void {
    cachedRegistry = null;
}
```

(Only change: new import + one new `.register(ScrollToAction)` chained call.)

- [ ] **Step 3: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Verify against a real run**

There is no per-action unit test convention in this codebase for plugin actions (`ClearText.ts`/`WaitForElement.ts` have none) — mobilewright actions are only exercised through real Appium/mobilewright e2e scenarios. Defer functional verification to Task 12 (the recon pass) / Task 16 (full clean run): confirm the mobilewright `@android` suite runs with no `"action not registered: SCROLL_TO"` error, and that any scenario needing an off-screen element (e.g. a profile-form field, per the existing note in `src/plugins/appium/actions/ScrollTo.ts` about "the profile form" needing scroll) succeeds under mobilewright.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/mobilewright/actions/ScrollTo.ts src/plugins/mobilewright/actions/registerMobilewrightActions.ts
git commit -m "feat(mobilewright): add SCROLL_TO action, matching playwright/appium/webdriverio"
```

---

### Task 2: Checkout automated accessibility scenario

**Files:**
- Create: `src/core/tests/checkout/contracts/checkout.a11y.json`
- Modify: `src/core/tests/checkout/organisms/checkout.route.ts`
- Modify: `src/core/tests/checkout/step_definitions/checkout.steps.ts`
- Modify: `src/core/tests/checkout/features/place-delivery-order.feature`

**Interfaces:**
- Consumes: `AccessibilityContractLoader.load(feature: string): AccessibilityContract` (`src/core/contracts/accessibility-contract-loader.ts`, reads `src/core/tests/<feature>/contracts/<feature>.a11y.json`), `sendIntent` + `INTENT.RUN_ACCESSIBILITY_AUDIT` / `INTENT.VALIDATE_ACCESSIBILITY_THRESHOLDS` (`@kernel/client`, `@kernel/intents`), `appendAxeRecord`/`AxeRecord` (`@core/tests/support/security-report-writer`) — all consumed exactly as `catalog.route.ts`'s existing `verifyAccessibilityGate()` already does.
- Produces: `CheckoutRoute.verifyAccessibilityGate(): Promise<void>`, wired to a **new, distinct** Gherkin step text `Then the checkout page passes the automated accessibility gate`.

**⚠️ Do not reuse catalog's exact step text.** Cucumber-js step definitions are global, not file-scoped. `catalog.steps.ts` already registers `Then('the current page passes the automated accessibility gate', ...)` bound to `CatalogRoute`. Registering the identical string again in `checkout.steps.ts` bound to `CheckoutRoute` produces an ambiguous-step error the moment either feature file runs. Use different, checkout-specific step text.

- [ ] **Step 1: Add the accessibility contract**

```json
// src/core/tests/checkout/contracts/checkout.a11y.json
{
  "feature": "checkout",
  "version": "1.0.0",
  "defaults": {
    "ruleTags": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
    "thresholds": { "impacts": ["critical", "serious"], "maxViolations": 0 }
  },
  "audits": [
    {
      "id": "checkout_screen",
      "description": "Automated WCAG 2.0/2.1 A/AA scan (plus the opt-in WCAG 2.2 target-size rule) of the checkout screen after delivery details are entered. A regression gate against automatable rules, not a certification — mirrors the catalog contract's scope and thresholds."
    }
  ]
}
```

(Exact same `defaults`/threshold shape as `catalog.a11y.json` — no new contract semantics, just a new feature-scoped file. `AccessibilityContractLoader.load('checkout')` resolves this via its existing `contractPath()` convention with no loader changes needed.)

- [ ] **Step 2: Add `verifyAccessibilityGate()` to `CheckoutRoute`**

Modify `src/core/tests/checkout/organisms/checkout.route.ts` — add these imports near the top (alongside the existing ones):

```ts
import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { AccessibilityContractLoader } from '@core/contracts/accessibility-contract-loader';
import { appendAxeRecord, type AxeRecord } from '@core/tests/support/security-report-writer';
```

(`sendIntent`/`INTENT` are likely already imported for other steps — check before duplicating; `checkout.route.ts:34` already imports `INTENT` per the file's current top section. Only add `AccessibilityContractLoader` and `appendAxeRecord` if not already present.)

Add this method to the `CheckoutRoute` class, alongside the other `// -- step intents --` methods:

```ts
    /**
     * Runs the checkout `*.a11y.json` contract audits against the live
     * page. Reuses the catalog pattern exactly (see catalog.route.ts):
     * no-ops unless PLUGIN_AXE is enabled and the driver is playwright.
     * Called explicitly as a Then step (not an After hook) so it fires
     * in-sequence before checkout's own After-hook session reset can
     * navigate away.
     */
    async verifyAccessibilityGate(): Promise<void> {
        if (this.world.driver !== 'playwright' || process.env.PLUGIN_AXE?.toLowerCase() !== 'true') {
            log.info({ driver: this.world.driver }, 'verifyAccessibilityGate skipped (PLUGIN_AXE off or non-web driver)');
            return;
        }
        const contract = AccessibilityContractLoader.load('checkout');
        const market = this.world.orderContext?.market ?? 'unknown';

        for (const audit of contract.audits) {
            const ruleTags = audit.ruleTags?.length ? audit.ruleTags : contract.defaults?.ruleTags;
            const auditOptions: Record<string, unknown> = {};
            if (ruleTags?.length) auditOptions.tags = ruleTags;
            if (audit.include?.length) auditOptions.include = audit.include;
            if (audit.exclude?.length) auditOptions.exclude = audit.exclude;

            const auditResult = await sendIntent(
                INTENT.RUN_ACCESSIBILITY_AUDIT,
                `checkout||${audit.id}-${market}||${JSON.stringify(auditOptions)}`,
            );

            try {
                appendAxeRecord(JSON.parse(auditResult.payload) as AxeRecord);
            } catch (err) {
                log.warn({ err: (err as Error).message }, 'Failed to persist axe audit record');
            }

            const thresholds = audit.thresholds ?? contract.defaults?.thresholds ?? {};
            await sendIntent(INTENT.VALIDATE_ACCESSIBILITY_THRESHOLDS, JSON.stringify(thresholds));
        }
    }
```

**Confirm during implementation**: `catalog.route.ts` reads `this.driver` (a plain field) while checking the driver in `verifyCatalogDisplayed()`, but `checkout.route.ts` doesn't visibly expose an equivalent `this.driver` field in the excerpt read for this plan — it may live on `this.world.driver` instead (per `CheckoutWorld`) or as a constructor-injected field like catalog's. Read the full class before landing this step and use whichever field checkout's other methods (e.g. `verifyOrderAccepted`) already use to check driver — don't introduce a second, inconsistent way to read it.

- [ ] **Step 3: Add the step definition**

Modify `src/core/tests/checkout/step_definitions/checkout.steps.ts` — add near the existing `Then('the order is accepted', ...)`:

```ts
Then('the checkout page passes the automated accessibility gate', async function () {
    await route(this).verifyAccessibilityGate();
});
```

- [ ] **Step 4: Add the scenario**

Modify `src/core/tests/checkout/features/place-delivery-order.feature` — add a new scenario after the existing two Scenario Outlines, deliberately **without** `@writes-shared-state` (it never places an order) and **without** the market-matrix Examples table (one market is enough for an accessibility regression gate — matches catalog's single-audit-per-render pattern, not a cross-market visual/functional matrix):

```gherkin
  @desktop @a11y
  Scenario: Checkout screen passes the automated accessibility gate
    Given they are ordering in market "US"
    And they have an order with "Pepperoni" size "Large" quantity 1
    When they provide delivery details "123 Luxury Avenue" "90210", "" for "Julian Casablancas" "+1 415 555 0101"
    Then the checkout page passes the automated accessibility gate
```

This stops right after delivery details are entered (which navigates to/renders the checkout screen per `navigateToCheckout`, called from within the delivery-fill flow) — it never selects a payment method or calls "the order is accepted", so it never mutates `standard_user`'s order history and correctly carries no `@writes-shared-state` tag.

**Confirm during implementation**: verify `fillDelivery`/`navigateToCheckout` really does render the full checkout screen (address + payment section) without requiring a payment method to already be selected — read `checkout-address.molecule.ts` and `checkout-navigation.molecule.ts` if this isn't obvious from a first local run, since the a11y scan needs the real rendered screen, not a partial state.

- [ ] **Step 5: Run it locally**

Run (from repo root, stack already up per `ci/steps/start-stack.sh web` with `PLUGIN_AXE=true`):
```bash
PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_AXE=true \
  ./node_modules/.bin/cucumber-js --tags "@a11y" --format progress
```
Expected: 1 scenario, 4 steps, all passed. If it fails on a real WCAG violation, that's real signal — fix the underlying OmniPizza checkout markup issue or, if it's a false positive against a known/accepted pattern, add a scoped `exclude` selector to the contract's audit entry (same escape hatch the catalog contract structure already supports) rather than loosening `maxViolations`.

**Guard against a false green**: `verifyAccessibilityGate()` silently returns without running any audit when `PLUGIN_AXE` isn't `'true'` or the driver isn't `playwright` — a "passed" scenario here could mean either "0 real violations" or "0 audits ever ran." After this run, check `reports/axe.json` and confirm it actually gained a new `checkout_screen` audit entry (`grep -c checkout_screen reports/axe.json` or open it directly) — a passing scenario with no corresponding audit record means the gate no-op'd, not that checkout is accessible.

- [ ] **Step 6: Commit**

```bash
git add src/core/tests/checkout/contracts/checkout.a11y.json src/core/tests/checkout/organisms/checkout.route.ts src/core/tests/checkout/step_definitions/checkout.steps.ts src/core/tests/checkout/features/place-delivery-order.feature
git commit -m "feat(a11y): add automated Checkout accessibility scenario, closing the axe-Checkout gap"
```

---

### Task 3: Appium login locator fix (investigative)

**Files:**
- Modify: `src/core/tests/login/contracts/login.webdriver.locators.json`

**Interfaces:**
- Consumes: nothing new — same JSON shape already consumed by `src/core/tests/login/contracts/login-locators.test.ts` and the login step definitions/organism that read this contract per driver key.
- Produces: corrected `appium` strategy values for `welcomeTitleText`, `usernameInput`, and any sibling login locators using the same `~content-desc` convention.

This is root-caused but not yet fixed: `.superpowers/sdd/progress.md` (Task 6) diagnosed via `adb shell uiautomator dump` against device `R5CX71NFF9H` that the built APK exposes these elements via Android resource-id, not content-desc — but didn't record the corrected values. This step can't be pre-written with a fabricated resource-id; it requires a live device.

- [ ] **Step 1: Read the current contract**

Run: `cat src/core/tests/login/contracts/login.webdriver.locators.json`
Note every key with an `"appium": "~..."` value (content-desc strategy) — these are the candidates.

- [ ] **Step 2: Dump the real UI hierarchy from a connected device/emulator**

```bash
adb devices                      # confirm a device is in "device" state
adb shell uiautomator dump /sdcard/window_dump.xml
adb pull /sdcard/window_dump.xml ./window_dump.xml
```

- [ ] **Step 3: Find the correct resource-id per element**

```bash
grep -o 'resource-id="[^"]*"[^>]*text="Welcome[^"]*"' window_dump.xml
grep -B2 'text="Username"' window_dump.xml   # or whatever the field's visible label/hint is
```
Confirm each flagged element's actual `resource-id` attribute (e.g. `com.omnipizza.app:id/welcome_title`, `.../username_input`) — Appium's `id=` strategy (`android=new UiSelector().resourceId("...")` or the shorthand `id:<resource-id>` depending on how this repo's `parseLocator`-equivalent for Appium's `LocatorStrategy` accepts an id-based selector — check `src/plugins/appium/actions/AppiumActionContext.ts` or wherever Appium's locator parsing lives, mirroring how mobilewright's `parseLocator` supports a `testId:` shorthand) resolves these correctly.

- [ ] **Step 4: Update the contract**

Edit `login.webdriver.locators.json`, replacing each `"appium": "~text-welcome-title"`-style value with the resource-id-based selector confirmed in Step 3, in whatever exact syntax Appium's locator parser in this repo expects (confirm against an existing working `id`-based Appium locator elsewhere in the repo, if any exist, for the exact accepted string format before guessing at syntax).

- [ ] **Step 5: Verify against the real device**

```bash
PLATFORM=android DRIVER=appium bash ci/steps/start-stack.sh android
PLATFORM=android DRIVER=appium PLUGIN_APPIUM=true \
  ./node_modules/.bin/cucumber-js --tags "@android and @login" --format progress
bash ci/steps/teardown.sh
```
Expected: login scenarios that previously failed on `welcomeTitleText`/`usernameInput` now pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/tests/login/contracts/login.webdriver.locators.json
git commit -m "fix(appium): correct login locators to resource-id strategy for the built APK"
```

---

## Phase B — Dashboard Tool Efficiency data model & server (independent of Phase A; can build against a fixture before any real timing data exists)

### Task 4: `ToolTiming` shared type + fixture

**Files:**
- Modify: `apps/dashboard/src/shared/types.ts`
- Create: `apps/dashboard/test/fixtures/timing.json`

**Interfaces:**
- Produces: `ToolTiming` and `EfficiencyRunPoint`, consumed by Tasks 5–10.

- [ ] **Step 1: Add the types**

Modify `apps/dashboard/src/shared/types.ts` — add near the bottom, after `RunPayload`:

```ts
export interface ToolTiming {
  tool: string;
  category: ToolKind;
  subtype: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

/** One entry per run that has a timing.json, used by the Efficiency charts. */
export interface EfficiencyRunPoint {
  runId: string;
  startedAt: string;
  timings: ToolTiming[];
}
```

- [ ] **Step 2: Add a fixture for the tasks below to test against**

```json
[
  { "tool": "playwright", "category": "web_ui", "subtype": "desktop", "startedAt": "2026-07-20T10:00:00.000Z", "endedAt": "2026-07-20T10:04:03.000Z", "durationMs": 243000 },
  { "tool": "webdriverio", "category": "web_ui", "subtype": "web", "startedAt": "2026-07-20T10:00:00.000Z", "endedAt": "2026-07-20T10:05:47.000Z", "durationMs": 347000 },
  { "tool": "mobilewright", "category": "mobile_ui", "subtype": "android", "startedAt": "2026-07-20T10:10:00.000Z", "endedAt": "2026-07-20T10:18:22.000Z", "durationMs": 502000 },
  { "tool": "appium", "category": "mobile_ui", "subtype": "android", "startedAt": "2026-07-20T10:10:00.000Z", "endedAt": "2026-07-20T10:22:15.000Z", "durationMs": 735000 },
  { "tool": "gatling", "category": "performance", "subtype": "smoke", "startedAt": "2026-07-20T10:25:00.000Z", "endedAt": "2026-07-20T10:26:30.000Z", "durationMs": 90000 },
  { "tool": "api", "category": "api", "subtype": "standalone", "startedAt": "2026-07-20T10:30:00.000Z", "endedAt": "2026-07-20T10:30:47.000Z", "durationMs": 47000 },
  { "tool": "pixelmatch", "category": "visual", "subtype": "desktop", "startedAt": "2026-07-20T10:32:00.000Z", "endedAt": "2026-07-20T10:34:10.000Z", "durationMs": 130000 },
  { "tool": "axe", "category": "accessibility", "subtype": "a11y", "startedAt": "2026-07-20T10:36:00.000Z", "endedAt": "2026-07-20T10:36:52.000Z", "durationMs": 52000 },
  { "tool": "zap", "category": "security", "subtype": "web", "startedAt": "2026-07-20T10:38:00.000Z", "endedAt": "2026-07-20T10:44:30.000Z", "durationMs": 390000 },
  { "tool": "mobsf", "category": "security", "subtype": "android", "startedAt": "2026-07-20T10:38:00.000Z", "endedAt": "2026-07-20T10:41:12.000Z", "durationMs": 192000 }
]
```

- [ ] **Step 3: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/shared/types.ts apps/dashboard/test/fixtures/timing.json
git commit -m "feat(dashboard): add ToolTiming/EfficiencyRunPoint types + test fixture"
```

---

### Task 5: `write-timing.js` orchestrator helper script

**Files:**
- Create: `scripts/write-timing.js`
- Test: `scripts/write-timing.test.js`

**Interfaces:**
- Consumes: `ToolKind` values as plain strings (no TS import — this runs standalone under plain Node from the orchestrator, matching `scripts/visual-regen.js`'s existing plain-JS convention).
- Produces: `reports/<runId>/timing/<tool>-<subtype>.json`, written in the exact `ToolTiming` shape from Task 4 (duplicated here as a plain-JS shape since this script isn't compiled through the dashboard's TS project).

- [ ] **Step 1: Write the failing test**

```js
// scripts/write-timing.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeTiming } from './write-timing.js';

test('writeTiming writes the expected shape and filename', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ahm-timing-'));
  try {
    const file = await writeTiming({
      reportsDir: dir,
      runId: 'run-1',
      tool: 'playwright',
      category: 'web_ui',
      subtype: 'desktop',
      startedAt: '2026-07-20T10:00:00.000Z',
      endedAt: '2026-07-20T10:04:03.000Z',
    });
    assert.equal(file, path.join(dir, 'run-1', 'timing', 'playwright-desktop.json'));
    const written = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(written, {
      tool: 'playwright',
      category: 'web_ui',
      subtype: 'desktop',
      startedAt: '2026-07-20T10:00:00.000Z',
      endedAt: '2026-07-20T10:04:03.000Z',
      durationMs: 243000,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/write-timing.test.js`
Expected: FAIL — `write-timing.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```js
// scripts/write-timing.js
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Writes reports/<runId>/timing/<tool>-<subtype>.json — a sidecar the
 * dashboard's ingest-run.ts reads to build the Tool Efficiency charts.
 * Never touches any existing per-tool report shape.
 */
export async function writeTiming({ reportsDir, runId, tool, category, subtype, startedAt, endedAt }) {
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const dir = path.join(reportsDir, runId, 'timing');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${tool}-${subtype}.json`);
  const payload = { tool, category, subtype, startedAt, endedAt, durationMs };
  await writeFile(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return file;
}

// CLI entry point — invoked by orchestrate-full-run.sh's run_timed() wrapper.
async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce((pairs, arg, i, arr) => {
      if (arg.startsWith('--')) pairs.push([arg.slice(2), arr[i + 1]]);
      return pairs;
    }, []),
  );
  const file = await writeTiming({
    reportsDir: args['reports-dir'] ?? 'reports',
    runId: args['run-id'],
    tool: args.tool,
    category: args.category,
    subtype: args.subtype,
    startedAt: args.started,
    endedAt: args.ended,
  });
  console.log(`[write-timing] wrote ${file}`);
}

// Only run as CLI when invoked directly (not when imported by the test above).
// Compare via pathToFileURL rather than a hand-built `file://${path}` string —
// on Windows, process.argv[1] is a drive-letter path ("C:\...") whose correct
// file:// form needs an extra slash and forward-slash normalization, which a
// naive template string gets wrong, making this guard silently never match
// under Git Bash/win32 (main() would never run, and no timing files would be
// written despite the orchestrator invoking this script with `node ...`).
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/write-timing.test.js`
Expected: PASS

- [ ] **Step 5: Verify the CLI entry point actually fires on this machine**

The unit test only exercises `writeTiming()` directly (imported, not run as a CLI), so it can't catch a broken `main()`-invocation guard. Run the script exactly as the orchestrator will:
```bash
node scripts/write-timing.js --tool test --category web_ui --subtype smoke \
  --started 2026-07-20T10:00:00.000Z --ended 2026-07-20T10:00:01.000Z \
  --run-id manual-check --reports-dir /tmp/ahm-write-timing-check
cat /tmp/ahm-write-timing-check/manual-check/timing/test-smoke.json   # Git Bash; use a Windows-style temp path if this errors
rm -rf /tmp/ahm-write-timing-check
```
Expected: prints `[write-timing] wrote ...` and the JSON file exists with the right shape. If nothing prints and no file is written, the `import.meta.url`/`pathToFileURL` guard isn't matching on this platform — fix it before moving on; this exact failure mode (a silently-never-firing CLI guard) would otherwise surface only much later, as an empty Tool Efficiency dashboard after a multi-hour Task 15 run, with no error anywhere to point at it.

- [ ] **Step 6: Commit**

```bash
git add scripts/write-timing.js scripts/write-timing.test.js
git commit -m "feat(scripts): add write-timing.js for orchestrator-level tool duration capture"
```

---

### Task 6: `getTiming()` server read + `/api/efficiency` route

**Files:**
- Modify: `apps/dashboard/src/server/runs-repo.ts`
- Create: `apps/dashboard/src/server/routes/efficiency.ts`
- Modify: `apps/dashboard/src/server/app.ts` (or wherever `runsRouter`/`runsErrorHandler` are mounted — confirm exact file during implementation; not read in this plan's research pass)
- Test: `apps/dashboard/test/server/efficiency.test.ts`

**Interfaces:**
- Consumes: `ToolTiming`/`EfficiencyRunPoint` (Task 4), `listRuns()` (existing, `runs-repo.ts`), `safeResolve()` (existing, `runs-repo.ts`).
- Produces: `getTiming(runId: string): Promise<ToolTiming[]>` on `runs-repo.ts`; `GET /api/efficiency` returning `EfficiencyRunPoint[]`.

- [ ] **Step 1: Write the failing test for `getTiming()`**

```ts
// apps/dashboard/test/server/efficiency.test.ts (part 1 — extend in Step 5 below)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let REPORTS_DIR: string;

describe('getTiming', () => {
  beforeEach(async () => {
    REPORTS_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'ahm-eff-'));
    process.env.REPORTS_DIR = REPORTS_DIR;
  });
  afterEach(async () => {
    delete process.env.REPORTS_DIR;
    await fs.rm(REPORTS_DIR, { recursive: true, force: true });
  });

  it('reads reports/<runId>/timing.json', async () => {
    const { getTiming } = await import('../../src/server/runs-repo.js');
    await fs.mkdir(path.join(REPORTS_DIR, 'run-1'), { recursive: true });
    const timings = [{ tool: 'playwright', category: 'web_ui', subtype: 'desktop', startedAt: 'a', endedAt: 'b', durationMs: 100 }];
    await fs.writeFile(path.join(REPORTS_DIR, 'run-1', 'timing.json'), JSON.stringify(timings));

    const { getTiming: getTimingFresh } = await import('../../src/server/runs-repo.js?t=' + Date.now());
    expect(await getTimingFresh('run-1')).toEqual(timings);
  });

  it('returns [] when timing.json is missing', async () => {
    const { getTiming } = await import('../../src/server/runs-repo.js?t=' + (Date.now() + 1));
    await fs.mkdir(path.join(REPORTS_DIR, 'run-2'), { recursive: true });
    expect(await getTiming('run-2')).toEqual([]);
  });
});
```

**Confirm during implementation**: `REPORTS_DIR` in `runs-repo.ts` is computed once at module load (`export const REPORTS_DIR = path.resolve(process.env.REPORTS_DIR ?? ...)`), so setting `process.env.REPORTS_DIR` after the module is first imported has no effect — the cache-busting `?t=timestamp` re-import above is a workaround; confirm this matches how `apps/dashboard/test/` already handles this for its other `runs-repo.ts` tests (grep for existing `REPORTS_DIR` test setup) and reuse whatever pattern is already established rather than inventing a second one.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test efficiency.test.ts` (or the repo's actual test invocation for `apps/dashboard` — confirm exact script name in `apps/dashboard/package.json` during implementation)
Expected: FAIL — `getTiming` is not exported.

- [ ] **Step 3: Implement `getTiming()`**

Modify `apps/dashboard/src/server/runs-repo.ts` — add after `getRawToolReport`:

```ts
import type { ManifestEntry, RunInfo, ToolTiming } from '../shared/types.js';

// ... (existing code unchanged) ...

export async function getTiming(runId: string): Promise<ToolTiming[]> {
  const filePath = safeResolve(runId, 'timing.json');
  try {
    return await readJson<ToolTiming[]>(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}
```

(Only the import line and this one function are new — everything else in the file is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2.
Expected: PASS

- [ ] **Step 5: Write the failing test for the route, in the same file**

```ts
// apps/dashboard/test/server/efficiency.test.ts (part 2 — append to the file from Step 1)
import express from 'express';
import request from 'supertest'; // confirm this repo already depends on supertest (grep apps/dashboard/package.json); if not, use Node's fetch against a listening server instead — do not add a new dependency for one test file.

describe('GET /api/efficiency', () => {
  beforeEach(async () => {
    REPORTS_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'ahm-eff-route-'));
    process.env.REPORTS_DIR = REPORTS_DIR;
  });
  afterEach(async () => {
    delete process.env.REPORTS_DIR;
    await fs.rm(REPORTS_DIR, { recursive: true, force: true });
  });

  it('returns EfficiencyRunPoint[] for runs that have timing data, excluding runs that do not', async () => {
    await fs.writeFile(
      path.join(REPORTS_DIR, 'manifest.json'),
      JSON.stringify([
        { runId: 'run-1', project: 'AHM', buildId: 'b1', branch: 'main', startedAt: '2026-07-20 10:00:00' },
        { runId: 'run-2', project: 'AHM', buildId: 'b2', branch: 'main', startedAt: '2026-07-19 10:00:00' },
      ]),
    );
    await fs.mkdir(path.join(REPORTS_DIR, 'run-1'), { recursive: true });
    const timings = [{ tool: 'playwright', category: 'web_ui', subtype: 'desktop', startedAt: 'a', endedAt: 'b', durationMs: 100 }];
    await fs.writeFile(path.join(REPORTS_DIR, 'run-1', 'timing.json'), JSON.stringify(timings));
    await fs.mkdir(path.join(REPORTS_DIR, 'run-2'), { recursive: true }); // no timing.json

    const { efficiencyRouter } = await import('../../src/server/routes/efficiency.js?t=' + Date.now());
    const app = express();
    app.use(efficiencyRouter);
    const res = await request(app).get('/api/efficiency');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ runId: 'run-1', startedAt: '2026-07-20 10:00:00', timings }]);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Expected: FAIL — `routes/efficiency.ts` doesn't exist.

- [ ] **Step 7: Implement the route**

```ts
// apps/dashboard/src/server/routes/efficiency.ts
import { Router } from 'express';

import type { EfficiencyRunPoint } from '../../shared/types.js';
import { getTiming, listRuns } from '../runs-repo.js';

const MAX_RUNS = 20;

export const efficiencyRouter = Router();

efficiencyRouter.get('/api/efficiency', async (_req, res, next) => {
  try {
    const runs = (await listRuns()).slice(0, MAX_RUNS);
    const points: EfficiencyRunPoint[] = [];
    for (const run of runs) {
      const timings = await getTiming(run.runId);
      if (timings.length === 0) continue;
      points.push({ runId: run.runId, startedAt: run.startedAt, timings });
    }
    res.json(points);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 8: Mount the router**

Find where `runsRouter`/`runsErrorHandler` are wired into the Express app (grep `runsRouter` outside `routes/runs.ts` to find the exact file — likely `apps/dashboard/src/server/app.ts` or `index.ts`) and add `app.use(efficiencyRouter)` alongside the existing `app.use(runsRouter)`, importing from `./routes/efficiency.js`.

- [ ] **Step 9: Run test to verify it passes**

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/dashboard/src/server/runs-repo.ts apps/dashboard/src/server/routes/efficiency.ts apps/dashboard/test/server/efficiency.test.ts apps/dashboard/src/server/app.ts
git commit -m "feat(dashboard): add getTiming() + GET /api/efficiency route"
```

---

## Phase C — Dashboard Tool Efficiency client (depends on Task 4's types; `EfficiencyChart.tsx` itself has no data dependency and can be built alongside Task 6)

### Task 7: `efficiency-meta.ts`

**Files:**
- Create: `apps/dashboard/src/client/efficiency-meta.ts`

**Interfaces:**
- Consumes: `ToolKind` (`@shared/kinds`).
- Produces: `EFFICIENCY_GROUPS`, consumed by Task 9's `EfficiencyView.tsx`.

- [ ] **Step 1: Write the file**

```ts
// apps/dashboard/src/client/efficiency-meta.ts
import type { ToolKind } from '@shared/kinds';

export interface EfficiencyGroup {
  title: string;
  category: ToolKind;
  tools: readonly string[];
}

// Paired groups compare genuinely equivalent tools only (e.g. Playwright vs
// WebdriverIO, never vs Appium). Solo groups get their own run-over-run
// trend. Security is deliberately split into two solo groups — ZAP (web)
// and MobSF (mobile) scan different targets and aren't a fair comparison.
export const EFFICIENCY_GROUPS: readonly EfficiencyGroup[] = [
  { title: 'Web', category: 'web_ui', tools: ['playwright', 'webdriverio'] },
  { title: 'Mobile', category: 'mobile_ui', tools: ['mobilewright', 'appium'] },
  { title: 'Performance', category: 'performance', tools: ['gatling'] },
  { title: 'API', category: 'api', tools: ['api'] },
  { title: 'Visual', category: 'visual', tools: ['pixelmatch'] },
  { title: 'Accessibility', category: 'accessibility', tools: ['axe'] },
  { title: 'Security — Web', category: 'security', tools: ['zap'] },
  { title: 'Security — Mobile', category: 'security', tools: ['mobsf'] },
] as const;
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/client/efficiency-meta.ts
git commit -m "feat(dashboard): add EFFICIENCY_GROUPS tool-pairing table"
```

---

### Task 8: `EfficiencyChart.tsx`

**Files:**
- Create: `apps/dashboard/src/client/components/EfficiencyChart.tsx`
- Test: `apps/dashboard/test/components/EfficiencyChart.test.tsx`

**Interfaces:**
- Consumes: `ToolTiming` (Task 4).
- Produces: `<EfficiencyChart series={...} title={...} />`, consumed by Task 9.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/dashboard/test/components/EfficiencyChart.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EfficiencyChart } from '../../src/client/components/EfficiencyChart';

const oneSeries = [{ tool: 'gatling', points: [{ runId: 'r1', durationMs: 90000 }] }];
const twoSeries = [
  { tool: 'playwright', points: [{ runId: 'r1', durationMs: 200000 }, { runId: 'r2', durationMs: 210000 }] },
  { tool: 'webdriverio', points: [{ runId: 'r1', durationMs: 300000 }, { runId: 'r2', durationMs: 290000 }] },
];

describe('EfficiencyChart', () => {
  it('renders the title', () => {
    render(<EfficiencyChart series={oneSeries} title="Performance: Gatling" />);
    expect(screen.getByText('Performance: Gatling')).toBeInTheDocument();
  });

  it('renders a single marker with no line for a lone data point', () => {
    const { container } = render(<EfficiencyChart series={oneSeries} title="t" />);
    expect(container.querySelectorAll('circle').length).toBe(1);
    expect(container.querySelectorAll('polyline, path.series-line').length).toBe(0);
  });

  it('renders one polyline per series for multi-point data', () => {
    const { container } = render(<EfficiencyChart series={twoSeries} title="t" />);
    expect(container.querySelectorAll('polyline').length).toBe(2);
    expect(container.querySelectorAll('circle').length).toBe(4);
  });

  it('renders an empty state for an empty series list', () => {
    render(<EfficiencyChart series={[]} title="t" />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter dashboard test EfficiencyChart.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement the component**

```tsx
// apps/dashboard/src/client/components/EfficiencyChart.tsx
export interface EfficiencySeriesPoint {
  runId: string;
  durationMs: number;
}

export interface EfficiencySeries {
  tool: string;
  points: EfficiencySeriesPoint[]; // oldest-first
}

interface EfficiencyChartProps {
  series: EfficiencySeries[];
  title: string;
}

const PALETTE = [
  'oklch(0.72 0.15 295)', // primary purple, matches the existing gauge gradient start
  'oklch(0.78 0.15 330)', // secondary pink, matches the gauge gradient end
];

const WIDTH = 480;
const HEIGHT = 160;
const PAD = 28;

export function EfficiencyChart({ series, title }: EfficiencyChartProps) {
  const withData = series.filter((s) => s.points.length > 0);

  if (withData.length === 0) {
    return (
      <div className="efficiency-chart">
        <div className="label">{title}</div>
        <div className="empty" style={{ height: HEIGHT }}>No data</div>
      </div>
    );
  }

  const allDurations = withData.flatMap((s) => s.points.map((p) => p.durationMs));
  const maxMs = Math.max(...allDurations, 1);
  const maxPoints = Math.max(...withData.map((s) => s.points.length), 1);

  const x = (i: number) => (maxPoints === 1 ? WIDTH / 2 : PAD + (i / (maxPoints - 1)) * (WIDTH - 2 * PAD));
  const y = (ms: number) => HEIGHT - PAD - (ms / maxMs) * (HEIGHT - 2 * PAD);

  return (
    <div className="efficiency-chart">
      <div className="label">{title}</div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT}>
        {withData.map((s, si) => {
          const color = PALETTE[si % PALETTE.length];
          const pts = s.points.map((p, i) => [x(i), y(p.durationMs)] as const);
          return (
            <g key={s.tool}>
              {pts.length > 1 && (
                <polyline
                  points={pts.map(([px, py]) => `${px},${py}`).join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                />
              )}
              {pts.map(([px, py], i) => (
                <circle key={i} cx={px} cy={py} r={4} fill={color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {withData.map((s, si) => (
          <span key={s.tool} className="legend-item">
            <span className="swatch" style={{ background: PALETTE[si % PALETTE.length] }} />
            {s.tool}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter dashboard test EfficiencyChart.test.tsx`
Expected: PASS

**Confirm during implementation**: check whether `apps/dashboard` already has `@testing-library/react` as a dependency (used by any existing component test, e.g. `PerfTypeTabs.test.tsx` per the earlier performance-tabs plan) — reuse the exact same render/query setup those tests use rather than introducing a new testing pattern.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/client/components/EfficiencyChart.tsx apps/dashboard/test/components/EfficiencyChart.test.tsx
git commit -m "feat(dashboard): add hand-rolled EfficiencyChart SVG component"
```

---

### Task 9: `EfficiencyView.tsx` + routing + nav link

**Files:**
- Create: `apps/dashboard/src/client/views/EfficiencyView.tsx`
- Modify: `apps/dashboard/src/client/router.tsx`
- Modify: `apps/dashboard/src/client/components/Topbar.tsx`
- Modify: `apps/dashboard/src/client/api.ts` (add `fetchEfficiency`, mirroring the existing `fetchRun`/`fetchRuns` pattern — read the file during implementation to match its exact error-handling/`ApiError` conventions before adding a third fetch function)

**Interfaces:**
- Consumes: `EFFICIENCY_GROUPS` (Task 7), `EfficiencyChart` (Task 8), `EfficiencyRunPoint` (Task 4), `GET /api/efficiency` (Task 6).
- Produces: route `/efficiency`, a `Topbar` nav link to it.

- [ ] **Step 1: Add `fetchEfficiency` to `api.ts`**

Read `apps/dashboard/src/client/api.ts` in full first (not read during this plan's research pass) and add a `fetchEfficiency(signal?: AbortSignal): Promise<EfficiencyRunPoint[]>` that calls `GET /api/efficiency`, following the exact same base-URL/`ApiError`-throwing pattern `fetchRuns`/`fetchRun` already use — do not invent a different fetch wrapper.

- [ ] **Step 2: Write `EfficiencyView.tsx`**

```tsx
// apps/dashboard/src/client/views/EfficiencyView.tsx
import { useEffect, useState } from 'react';

import type { EfficiencyRunPoint } from '@shared/types';
import { EFFICIENCY_GROUPS } from '../efficiency-meta';
import { EfficiencyChart, type EfficiencySeries } from '../components/EfficiencyChart';
import { ApiError, fetchEfficiency } from '../api';

export function EfficiencyView() {
  const [points, setPoints] = useState<EfficiencyRunPoint[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchEfficiency(ac.signal)
      .then(setPoints)
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err);
      });
    return () => ac.abort();
  }, []);

  if (error) {
    const detail = error instanceof ApiError ? `${error.status} · ${error.url}` : error.message;
    return <div className="state"><div className="title">Couldn't load efficiency data</div><div>{detail}</div></div>;
  }
  if (!points) return <div className="state">Loading…</div>;

  // Oldest-first per series, matching EfficiencyChart's expected point order.
  const runsOldestFirst = [...points].reverse();

  function seriesFor(tools: readonly string[]): EfficiencySeries[] {
    return tools.map((tool) => ({
      tool,
      points: runsOldestFirst
        .map((run) => {
          const t = run.timings.find((tm) => tm.tool === tool);
          return t ? { runId: run.runId, durationMs: t.durationMs } : null;
        })
        .filter((p): p is { runId: string; durationMs: number } => p !== null),
    }));
  }

  return (
    <div className="efficiency-view">
      <h1>Tool Efficiency</h1>
      <p className="subtitle">Wall-clock execution time per tool, across the last {points.length} run(s). Only genuinely comparable tools are charted together.</p>
      <div className="efficiency-grid">
        {EFFICIENCY_GROUPS.map((group) => (
          <EfficiencyChart key={group.title} title={group.title} series={seriesFor(group.tools)} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the route**

Modify `apps/dashboard/src/client/router.tsx`:

```tsx
import { createBrowserRouter } from 'react-router-dom';

import { App } from './App';
import { Overview } from './views/Overview';
import { ToolDetail } from './views/ToolDetail';
import { RootRedirect } from './views/RootRedirect';
import { NotFound } from './views/NotFound';
import { EfficiencyView } from './views/EfficiencyView';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <RootRedirect /> },
      { path: 'runs', element: <RootRedirect /> },
      { path: 'runs/:runId', element: <Overview /> },
      { path: 'runs/:runId/:toolId', element: <ToolDetail /> },
      { path: 'efficiency', element: <EfficiencyView /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
```

- [ ] **Step 4: Add a nav link in `Topbar.tsx`**

Modify `apps/dashboard/src/client/components/Topbar.tsx` — add a `Link` import from `react-router-dom` and render it next to `RunPicker`:

```tsx
import { Link } from 'react-router-dom';
```

Inside the `.brand` div, after the `RunPicker` block:

```tsx
        <Link to="/efficiency" className="pill" style={{ textDecoration: 'none' }}>
          ⏱ Tool Efficiency
        </Link>
```

(Reuses the existing `.pill` class already used for the "Live"/"duration"/"started" badges elsewhere in this same file, rather than inventing new nav-link styling.)

- [ ] **Step 5: Manual verification**

Run: `pnpm dashboard` (or whatever the repo's actual dev-server script is — confirm in `apps/dashboard/package.json`), navigate to `/efficiency`, confirm the page loads (empty-state charts are fine before Task 4's fixture or any real run exists — confirm each of the 8 `EFFICIENCY_GROUPS` renders its title and an empty/"No data" chart with zero console errors).

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/client/views/EfficiencyView.tsx apps/dashboard/src/client/router.tsx apps/dashboard/src/client/components/Topbar.tsx apps/dashboard/src/client/api.ts
git commit -m "feat(dashboard): add /efficiency view with nav link"
```

---

## Phase D — Orchestrator + timing capture (depends on Phase A tasks 1–3 landing, and Task 4's `ToolTiming` shape)

### Task 10: `run_timed` wrapper + extended orchestrator phases

**Files:**
- Modify: `scripts/orchestrate-full-run.sh`

**Interfaces:**
- Consumes: `scripts/write-timing.js` (Task 5) via its CLI entry point.
- Produces: `reports/<runId>/timing/<tool>-<subtype>.json` for every phase, consumed by Task 11's ingest wiring.

**Correction discovered during implementation, before writing this task's code**: the plan's original design assumed Playwright+WebdriverIO (and Mobilewright+Appium, and ZAP+MobSF) could share one running stack and execute concurrently, relying on the write-lock for correctness. Reading `ci/steps/start-stack.sh` in full during implementation disproved this: **every single profile** (`api`, `web`, `android`, `ios`, `mobilewright`, `zap`, `mobsf`, `webdriverio`) independently runs `run_bg proxy.log src/kernel/chaos-proxy.ts` — each starts its *own* chaos-proxy attempt on the hardcoded port 50051. There is no shared-stack mechanism; CI's apparent parallelism (e.g. running the `zap` and `mobsf` jobs "concurrently") only works because each GitHub Actions job runs on a separate runner (separate machine, separate port space) — a local machine has exactly one port 50051. Two `start-stack.sh` calls for different profiles running at the same time on this machine would collide.

**Corrected design**: every one of the 7 categories runs fully sequentially — its own `start-stack.sh <profile>` → run → `teardown.sh` cycle, one at a time, in the requested order. This is a real, evidence-based answer to "parallelize where possible": given this architecture, essentially nothing among the 9 tool invocations is safe to run concurrently locally (Gatling is the only standalone one, and its own smoke/load/stress profiles must stay sequential anyway per the backend-contention reasoning in the spec). The user should be told this plainly — it's a smaller amount of real parallelism than either of us assumed going in.

- [ ] **Step 1: Replace the file with the corrected, fully-sequential version**

The full new file (every existing phase preserved; `run_timed` wrapper added; WebdriverIO, Mobile, full 3-profile Gatling, API, Accessibility, and Security phases added — all sequential; order matches the requested Web → Mobile → Performance → API → Visual → Accessibility → Security sequence):

```bash
#!/usr/bin/env bash
# One-shot local orchestration across all 7 categories, in order:
# Web (Playwright, WebdriverIO) -> Mobile (Mobilewright, Appium) ->
# Performance (Gatling smoke/load/stress) -> API -> Visual -> Accessibility -> Security (ZAP, MobSF).
# Every tool invocation is wrapped by run_timed(), which records wall-clock
# duration to reports/<runId>/timing/<tool>-<subtype>.json for the dashboard's
# Tool Efficiency section. Continues through test failures (we want results
# captured even if some scenarios fail; retry:1 in cucumber.js absorbs cold-start flakes).
#
# Fully sequential by design: ci/steps/start-stack.sh's every profile (api,
# web, android, ios, mobilewright, zap, mobsf, webdriverio) independently
# starts its own chaos-proxy on the hardcoded port 50051 -- there is no
# shared-stack mechanism, so two profiles cannot run at once on one machine
# (CI's apparent parallelism relies on separate runners, not a shared proxy).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
source ci/steps/lib/common.sh
LOG=".ahm-orch-logs"
mkdir -p "$LOG"
SUMMARY="$LOG/summary.log"
: > "$SUMMARY"

CUKE="./node_modules/.bin/cucumber-js"
TS="$(date +%Y-%m-%dT%H-%M)"
RUN_ID="real-$TS"

say(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$SUMMARY"; }

# run_timed <tool> <category> <subtype> <command...>
# Wraps a tool invocation with wall-clock start/end capture, written via
# scripts/write-timing.js. Never affects the wrapped command's exit status.
run_timed() {
  local tool="$1" category="$2" subtype="$3"; shift 3
  local started ended status
  started="$(node -e 'console.log(new Date().toISOString())')"
  "$@"
  status=$?
  ended="$(node -e 'console.log(new Date().toISOString())')"
  node scripts/write-timing.js --tool "$tool" --category "$category" --subtype "$subtype" \
    --started "$started" --ended "$ended" --run-id "$RUN_ID" --reports-dir reports \
    || say "WARN — failed to write timing sidecar for $tool/$subtype"
  return $status
}

# Stale mobile scratch from a PRIOR run must not leak into THIS run's ingest: one
# run = one ingest. The per-run ingested copies (reports/<runId>/appium.json) are the
# durable record and are untouched; only the top-level scratch is cleared.
rm -f reports/android.json reports/ios.json

# ==================== 1. WEB (desktop + responsive Playwright, then WebdriverIO) ====================
say "PHASE 1a — web desktop: starting stack"
if PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_PIXELMATCH=false bash ci/steps/start-stack.sh web; then
  say "PHASE 1a — stack up; running cucumber @desktop"
  PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PIXELMATCH=false \
    run_timed playwright web_ui desktop bash ci/steps/run-suite.sh "@desktop" playwright-desktop \
    > "$LOG/phase1a.log" 2>&1
  say "PHASE 1a — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase1a.log" | tail -1))"
else
  say "PHASE 1a — STACK FAILED to come up (see proxy/playwright/api logs)"
fi
bash ci/steps/teardown.sh

say "PHASE 1b — web responsive: starting stack"
if PLATFORM=web VIEWPORT=responsive DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_PIXELMATCH=false bash ci/steps/start-stack.sh web; then
  say "PHASE 1b — stack up; running cucumber @responsive"
  PLATFORM=web VIEWPORT=responsive DRIVER=playwright HEADLESS=true PLUGIN_PIXELMATCH=false \
    run_timed playwright web_ui responsive bash ci/steps/run-suite.sh "@responsive" playwright-responsive \
    > "$LOG/phase1b.log" 2>&1
  say "PHASE 1b — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase1b.log" | tail -1))"
else
  say "PHASE 1b — STACK FAILED to come up"
fi
bash ci/steps/teardown.sh

say "PHASE 1c — webdriverio: starting stack (brings up its own selenium-standalone container)"
if PLATFORM=web DRIVER=webdriverio bash ci/steps/start-stack.sh webdriverio; then
  say "PHASE 1c — stack up; running cucumber @desktop"
  PLATFORM=web DRIVER=webdriverio \
    run_timed webdriverio web_ui web bash ci/steps/run-suite.sh "@desktop" webdriverio \
    > "$LOG/phase1c.log" 2>&1
  say "PHASE 1c — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase1c.log" | tail -1))"
else
  say "PHASE 1c — STACK FAILED to come up (needs Docker for selenium-standalone)"
fi
bash ci/steps/teardown.sh

# ==================== 2. MOBILE (Mobilewright, then Appium — sequential, distinct start-stack profiles) ====================
say "PHASE 2a — mobilewright: starting stack"
if PLATFORM=android DRIVER=mobilewright bash ci/steps/start-stack.sh mobilewright; then
  say "PHASE 2a — stack up; running cucumber @android"
  PLATFORM=android DRIVER=mobilewright \
    run_timed mobilewright mobile_ui android bash ci/steps/run-suite.sh "@android" mobilewright \
    > "$LOG/phase2a.log" 2>&1
  say "PHASE 2a — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase2a.log" | tail -1))"
else
  say "PHASE 2a — STACK FAILED to come up (see proxy/mobilewright-plugin logs)"
fi
bash ci/steps/teardown.sh

say "PHASE 2b — appium: pre-flight (adb device + Appium daemon :4723)"
if ! command -v adb >/dev/null 2>&1; then
  say "PHASE 2b — SKIP: adb not on PATH"
elif [ -z "$(adb devices | awk 'NR>1 && $2=="device"{print $1}')" ]; then
  say "PHASE 2b — SKIP: no adb device in 'device' state (connect a phone or start an emulator)"
elif ! node -e "require('net').connect(4723,'127.0.0.1').on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)})" 2>/dev/null; then
  say "PHASE 2b — SKIP: Appium daemon not reachable on :4723 (start it with \`appium\`)"
else
  ANDROID_DEV="$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')"
  say "PHASE 2b — device $ANDROID_DEV + daemon up; starting android stack"
  if PLATFORM=android DRIVER=appium bash ci/steps/start-stack.sh android; then
    say "PHASE 2b — stack up; running cucumber @android (single Appium session, ~60min)"
    PLATFORM=android DRIVER=appium PLUGIN_APPIUM=true PLUGIN_API=true \
      run_timed appium mobile_ui android bash ci/steps/run-suite.sh "@android" android \
      > "$LOG/phase2b.log" 2>&1
    say "PHASE 2b — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase2b.log" | tail -1))"
  else
    say "PHASE 2b — STACK FAILED to come up (see proxy/appium-plugin logs)"
  fi
  bash ci/steps/teardown.sh
fi

# ==================== 3. PERFORMANCE (Gatling smoke, load, stress — strictly sequential, exclusive of everything else) ====================
say "PHASE 3 — gatling smoke: checkout-load"
run_timed gatling performance smoke bash -c 'PERF_PROFILE=smoke pnpm perf:smoke' > "$LOG/phase3-smoke.log" 2>&1
say "PHASE 3 — smoke exit=$?"
say "PHASE 3 — gatling load: checkout-load"
run_timed gatling performance load bash -c 'PERF_PROFILE=load pnpm perf:load' > "$LOG/phase3-load.log" 2>&1
say "PHASE 3 — load exit=$?"
say "PHASE 3 — gatling stress: checkout-load"
run_timed gatling performance stress bash -c 'PERF_PROFILE=stress pnpm perf:stress' > "$LOG/phase3-stress.log" 2>&1
say "PHASE 3 — stress exit=$?"

# ==================== 4. API ====================
say "PHASE 4 — API: starting stack"
if PLATFORM=api DRIVER=api bash ci/steps/start-stack.sh api; then
  say "PHASE 4 — stack up; running cucumber @api"
  PLATFORM=api DRIVER=api \
    run_timed api api standalone bash ci/steps/run-suite.sh "@api" api > "$LOG/phase4.log" 2>&1
  say "PHASE 4 — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase4.log" | tail -1))"
else
  say "PHASE 4 — STACK FAILED to come up"
fi
bash ci/steps/teardown.sh

# ==================== 5. VISUAL (desktop + responsive) ====================
say "PHASE 5a — visual desktop: starting stack (pixelmatch on)"
if PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_PIXELMATCH=true bash ci/steps/start-stack.sh web; then
  say "PHASE 5a — stack up; running visual-regen desktop"
  run_timed pixelmatch visual desktop bash -c 'PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true node scripts/visual-regen.js desktop' \
    > "$LOG/phase5a.log" 2>&1
  say "PHASE 5a — visual-regen exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase5a.log" | tail -1))"
else
  say "PHASE 5a — STACK FAILED to come up"
fi
bash ci/steps/teardown.sh

say "PHASE 5b — visual responsive: starting stack (pixelmatch on)"
if PLATFORM=web VIEWPORT=responsive DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_PIXELMATCH=true bash ci/steps/start-stack.sh web; then
  say "PHASE 5b — stack up; running visual-regen responsive"
  run_timed pixelmatch visual responsive bash -c 'PLATFORM=web VIEWPORT=responsive DRIVER=playwright HEADLESS=true node scripts/visual-regen.js responsive' \
    > "$LOG/phase5b.log" 2>&1
  say "PHASE 5b — visual-regen exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase5b.log" | tail -1))"
else
  say "PHASE 5b — STACK FAILED to come up"
fi
bash ci/steps/teardown.sh

# ==================== 6. ACCESSIBILITY (dedicated @a11y pass, PLUGIN_AXE on) ====================
say "PHASE 6 — accessibility: starting stack (axe on)"
if PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_AXE=true bash ci/steps/start-stack.sh web; then
  say "PHASE 6 — stack up; running cucumber @a11y"
  PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_AXE=true \
    run_timed axe accessibility a11y bash ci/steps/run-suite.sh "@a11y" a11y \
    > "$LOG/phase6.log" 2>&1
  say "PHASE 6 — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase6.log" | tail -1))"
else
  say "PHASE 6 — STACK FAILED to come up"
fi
bash ci/steps/teardown.sh

# ==================== 7. SECURITY (ZAP, then MobSF — sequential, distinct start-stack profiles) ====================
# Exact commands mirrored from .github/workflows/ahm-execution-helix.yml's
# security-zap and security-mobsf jobs (found during implementation — there
# is no ci/steps/run-security.sh; both tools go through the same generic
# run-suite.sh every other profile uses).
say "PHASE 7a — zap: starting stack"
if PLATFORM=api DRIVER=api PLUGIN_ZAP=true PLUGIN_API=true bash ci/steps/start-stack.sh zap; then
  say "PHASE 7a — stack up; running @security (hard-gating active scan + schema fuzz)"
  PLATFORM=api DRIVER=api PLUGIN_ZAP=true \
    run_timed zap security web bash ci/steps/run-suite.sh "@security" zap security \
    > "$LOG/phase7a-security.log" 2>&1
  say "PHASE 7a — @security exit=$?"
  say "PHASE 7a — running @security-infra (ZAP baseline + TLS; MobSF self-skips, PLUGIN_MOBSF unset)"
  PLATFORM=api DRIVER=api PLUGIN_ZAP=true \
    bash ci/steps/run-suite.sh "@security-infra" zap security-infra \
    > "$LOG/phase7a-security-infra.log" 2>&1
  say "PHASE 7a — @security-infra exit=$?"
else
  say "PHASE 7a — STACK FAILED to come up (see proxy/zap-plugin logs; needs Docker)"
fi
bash ci/steps/teardown.sh

say "PHASE 7b — mobsf: starting stack (brings up its own long-lived mobsf container)"
if PLATFORM=api DRIVER=api PLUGIN_MOBSF=true PLUGIN_API=true MOBSF_URL="http://127.0.0.1:8000" \
    bash ci/steps/start-stack.sh mobsf; then
  say "PHASE 7b — stack up; running @security-infra (MobSF static scan; ZAP self-skips, PLUGIN_ZAP unset)"
  PLATFORM=api DRIVER=api PLUGIN_MOBSF=true MOBSF_URL="http://127.0.0.1:8000" \
    run_timed mobsf security android bash ci/steps/run-suite.sh "@security-infra" mobsf security-infra \
    > "$LOG/phase7b.log" 2>&1
  say "PHASE 7b — @security-infra exit=$?"
else
  say "PHASE 7b — STACK FAILED to come up (see proxy/mobsf-plugin logs; needs Docker)"
fi
bash ci/steps/teardown.sh

# ---------------- Ingest ----------------
rm -f reports/playwright.json

say "INGEST — dashboard ingest as run-id $RUN_ID"
PROJECT="AHM" pnpm dashboard:ingest --run-id "$RUN_ID" > "$LOG/ingest.log" 2>&1
say "INGEST — exit=$?"
tail -12 "$LOG/ingest.log" | tee -a "$SUMMARY"

say "DONE — run-id: $RUN_ID"
```

**Resolved during implementation** (superseding the plan's original placeholders): the exact ZAP/MobSF commands above are copied verbatim from `.github/workflows/ahm-execution-helix.yml`'s `security-zap`/`security-mobsf` jobs (there is no separate `ci/steps/run-security.sh` — both go through the same generic `run-suite.sh` every other profile uses, confirmed by reading `ci/steps/run-suite.sh` in full). `DRIVER=mobilewright` and its dedicated `start-stack.sh mobilewright` profile (distinct from `android`, which is Appium's profile) are confirmed via `ci/steps/start-stack.sh` and the CI workflow's `e2e-mobilewright` job. The concurrency risk flagged in the original draft turned out to be a real problem, not a hypothetical one — see the correction note above Step 1: every `start-stack.sh` profile starts its own chaos-proxy on the fixed port 50051, so this script is fully sequential, no backgrounded `run_timed` calls anywhere.

**Still open, genuinely deferred to Task 12's recon pass** (needs a live run to answer, not further reading):
1. Whether `PLUGIN_AXE=true` reliably reaches the cucumber process when set inline before `run_timed` (a shell function) — see the false-green guard added to Task 12 below.
2. Whether the `@desktop` tag expression is the right one for WebdriverIO's Phase 1c (mirroring Playwright's tag, since no CI job reference for a standalone local WebdriverIO run was found) — confirm scenario count looks sane in the recon pass, adjust if `@desktop` scenarios assume Playwright-specific behavior WebdriverIO's plugin doesn't yet support.

- [ ] **Step 2: Shellcheck**

Run: `shellcheck scripts/orchestrate-full-run.sh` (if available; otherwise `bash -n scripts/orchestrate-full-run.sh` for a syntax-only check)
Expected: no errors (warnings about `set -uo pipefail` and unquoted globs matching the existing file's pre-existing style are acceptable — don't introduce new ones).

- [ ] **Step 3: Commit**

```bash
git add scripts/orchestrate-full-run.sh
git commit -m "feat(scripts): extend orchestrator to all 7 categories with timing capture"
```

(Do not run this script for real yet — Task 12 (recon pass) is the first real invocation, after Task 11's ingest wiring lands.)

---

### Task 11: `ingest-run.ts` timing.json wiring

**Files:**
- Modify: `apps/dashboard/scripts/ingest-run.ts`

**Interfaces:**
- Consumes: `reports/<runId>/timing/*.json` (Task 10's `run_timed` output), `ToolTiming` (Task 4).
- Produces: `reports/<runId>/timing.json` (consolidated array), consumed by Task 6's `getTiming()`.

- [ ] **Step 1: Add a glob-and-merge step to `main()`**

Modify `apps/dashboard/scripts/ingest-run.ts` — add near the top-level imports:

```ts
import type { ToolTiming } from '../src/shared/types.js';
```

Add a new function near the other `build*`/`ingest*` helpers (e.g. after `ingestPixelmatch` usage, before `main`):

```ts
async function collectTiming(runDir: string): Promise<ToolTiming[]> {
  const timingDir = path.join(runDir, 'timing');
  let files: string[];
  try {
    files = await fs.readdir(timingDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const timings: ToolTiming[] = [];
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    try {
      const raw = await fs.readFile(path.join(timingDir, file), 'utf8');
      timings.push(JSON.parse(raw) as ToolTiming);
    } catch (err) {
      console.error(`[ingest] skipping unreadable timing file ${file}: ${(err as Error).message}`);
    }
  }
  return timings;
}
```

In `main()`, add this block right before the `// ---- run.json + manifest ----` section (after all the `wroteTools.push(...)` calls, before `runInfo` is built):

```ts
  // ---- timing (Tool Efficiency) -----------------------------------------
  const timings = await collectTiming(runDir);
  if (timings.length > 0) {
    await writeJson(path.join(runDir, 'timing.json'), timings);
    console.log(`[ingest] wrote timing.json (${timings.length} tool timing entr${timings.length === 1 ? 'y' : 'ies'})`);
  }
```

- [ ] **Step 2: Verify with a hand-built fixture**

```bash
mkdir -p reports/test-timing-run/timing
cp apps/dashboard/test/fixtures/timing.json reports/test-timing-run/timing/all.json
node --experimental-strip-types apps/dashboard/scripts/ingest-run.ts --run-id test-timing-run
cat reports/test-timing-run/timing.json
rm -rf reports/test-timing-run
```
Expected: `timing.json` contains the merged fixture entries (confirm the exact `ingest-run.ts` invocation command against `apps/dashboard/package.json`'s `dashboard:ingest` script — it may already wrap this with `tsx`/`ts-node` rather than the flag above; use whatever that script actually uses).

**Note:** this fixture-based smoke test writes a *fake* `timing.json` directly into `timing/` for the merge step alone — it doesn't exercise any of the other `build*Tool()` ingesters, so `main()` may exit early via the `wroteTools.length === 0` guard before reaching the new timing block if no other tool JSON exists in `reports/`. If that happens, also drop a minimal `reports/api.json` (or any other real tool JSON already lying around from prior local testing) alongside it, or temporarily reorder the timing-collection call earlier in `main()` for this manual check only — don't leave `main()`'s control flow reordered in the committed version.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/scripts/ingest-run.ts
git commit -m "feat(dashboard): ingest reports/<runId>/timing/*.json into timing.json"
```

---

## Phase E — Execution (operational, not TDD code tasks — run after Phases A–D land)

These tasks run real infrastructure directly via Bash, never through isolated/parallel agents (per the spec's §4 decision: live execution needs one coordinating process with real shared state — the write-lock, the fixed proxy port, the single MobSF container, real device contention).

### Task 12: Recon pass

- [ ] Run each category once cheap (existing smoke/read-only scenarios only) using the Task 10 script's phases, to ground-truth actual current state before investing further debugging time. This also produces the first real `timing.json`, validating the timing → ingest → chart pipeline end-to-end against live data.
- [ ] For each phase that goes red, capture the failure mode (log excerpt, exit code) before moving on — don't debug inline yet, just inventory.
- [ ] **Don't trust exit code 0 alone — check that each phase actually did something.** Several of this repo's gates can "pass" by silently doing nothing: `verifyAccessibilityGate()` no-ops if `PLUGIN_AXE` isn't `'true'` at the point cucumber actually runs (not just at the point the orchestrator set it — env vars set inline before a shell function call that backgrounds a subshell are exactly the kind of thing that's looked right before and wasn't, per this project's own history with `PLUGIN_*`/`VIEWPORT`/`HEADLESS` propagation). Per phase, confirm real work happened, not just a clean exit:
  - **Accessibility**: `reports/axe.json` gained new audit entries (not just an unchanged file).
  - **WebdriverIO / Mobilewright / Appium**: the cucumber summary line (`grep -aoE '[0-9]+ scenarios' .ahm-orch-logs/phase*.log`) shows the expected scenario count for that tag filter, not suspiciously "1 scenario" or "0 scenarios."
  - **ZAP / MobSF**: the resulting `reports/zap.json`/`reports/mobsf-*.json` contain real findings/scores, not an empty/default shape.
  - **Every phase**: `reports/<runId>/timing/<tool>-<subtype>.json` was actually written (confirms `write-timing.js`'s CLI guard fired — see Task 5 Step 5) and `durationMs` is a plausible, non-near-zero number for what that phase actually does.
- [ ] Confirm the Efficiency dashboard (`/efficiency`, Task 9) renders real data from this run without errors.

### Task 13: WebdriverIO investigation (only if recon reproduces the "only first scenario" symptom)

- [ ] If WebdriverIO's run genuinely only executes/reports one scenario, root-cause via the session-reuse lead from the spec (§5): `ensureSession()` in `src/plugins/webdriverio/webdriverio.ts` caches one `Browser` per run with no per-scenario teardown hook — check whether a `Before`/`After` hook needs to reset browser state (cookies, localStorage, navigation) between scenarios, mirroring whatever hook Playwright's `PLAYWRIGHT_HOSTED_DRIVERS` path already does for session lifecycle.
- [ ] Use `superpowers:systematic-debugging` for this investigation if the root cause isn't immediately obvious from the above lead — this is unscoped debugging, not a pre-specified fix.
- [ ] Fix, verify the full WebdriverIO phase goes green, commit.

### Task 14: Mobilewright 403 investigation (only if recon reproduces it)

- [ ] Confirm the currently-pinned `assets/apps/android/omnipizza-release.apk` build includes the app-side auth-token-wait fix referenced in prior session history (external to this repo — check the APK's version/build metadata if extractable, e.g. `aapt dump badging`).
- [ ] If the reproduced 403 is confirmed to be an app-side issue (old APK build), this is not an AHM code fix — document the finding and flag the APK version to whoever owns updating `assets/apps/android/omnipizza-release.apk`, matching the prior finding that this was resolved on the OmniPizza app side, not the harness side.
- [ ] If investigation instead finds a harness-side cause (e.g. a mobilewright deep-link timing issue independent of the app build), treat it as a new, unscoped bug — use `superpowers:systematic-debugging`.

### Task 15: Full clean run

- [ ] Run `scripts/orchestrate-full-run.sh` end-to-end.
- [ ] Fix any remaining red category at its root cause (not by loosening a threshold or skipping a tag) — repeat until every one of the 7 categories is genuinely green.
- [ ] Confirm `pnpm dashboard:ingest` succeeds and the resulting run shows all-green in the Overview, and populated (non-empty) charts in `/efficiency` across as many of the 8 `EFFICIENCY_GROUPS` as this run actually exercised.
- [ ] Commit any fix commits generated along the way (each fix should already have been committed at the point it was made, per the tasks above — this step is a final confirmation, not a batch commit).

---

## Self-Review Notes (from writing this plan)

- **Spec coverage**: §5 (Phase 0 stabilization) → Tasks 1–3. §6 (orchestrator + timing) → Tasks 10–11. §7 (dashboard section) → Tasks 4, 6–9. §6.1 (recon) → Task 12. Verification-first items (WebdriverIO, mobilewright-403) → Tasks 13–14. The full clean run acceptance bar → Task 15.
- **Known gaps carried forward as explicit "confirm during implementation" notes** (not silently assumed): the exact security run script name for Phase 7 (Task 10), the exact `apps/dashboard` test-runner invocation and existing `REPORTS_DIR`-env-var test pattern (Task 6), whether `checkout.route.ts` reads driver from `this.driver` or `this.world.driver` (Task 2), whether `fillDelivery` alone renders the full checkout screen without a payment method selected (Task 2), and where the Express app mounts `runsRouter`/adds new routers (Task 6). Each is flagged with the exact command or file to check, not left as a bare "TODO."
- **Type consistency checked**: `ToolTiming`/`EfficiencyRunPoint` (Task 4) are the same shape used verbatim in `write-timing.js`'s plain-JS output (Task 5), `getTiming()`'s return type (Task 6), the `/api/efficiency` response (Task 6), `EfficiencyChart`'s consumed series shape (Task 8), and `collectTiming()`'s parsed type (Task 11) — `tool`/`category`/`subtype`/`startedAt`/`endedAt`/`durationMs` field names match everywhere.
