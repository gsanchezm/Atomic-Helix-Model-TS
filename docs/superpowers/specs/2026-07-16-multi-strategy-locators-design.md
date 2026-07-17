# Multi-Strategy Locators — Design

**Date:** 2026-07-16
**Status:** Approved (design); implementation pending
**Scope:** Locator resolution (`src/kernel/locator-resolver.ts`, `chaos-proxy.ts`'s resolution boundary), the
Playwright plugin's action handlers, the mobilewright plugin's locator wiring, plus a full reference migration
of the `login` domain's `*.locators.json`. The `appium` plugin's runtime is untouched (see §4.5). No new tool
plugins (Cypress, WebdriverIO-web, Espresso, XCUITest) are implemented in this task — the design only makes
room for them (§8).

## 1. Purpose

Today, web locators are always raw CSS strings, and the two mobile plugins interpret the *same* JSON field
under two incompatible assumptions (see §2). The user's ask: make locator resolution robust enough to choose
the *appropriate* strategy per tool (`getByRole`/`getByText`/`getByTestId` for Playwright; `Id`/`Accessibility
ID`/`iOS UI Automation`/`Android UI Automator` for Appium-family tools), instead of being locked to one type —
and do it in a way that scales to tools not yet implemented (Cypress, WebdriverIO-web, Espresso, XCUITest)
without a future redesign.

## 2. Current-state findings (baseline this design builds on)

- `resolveLocator(logicalKey)` (`locator-resolver.ts:116`) is the single resolution entry point, called only
  from `chaos-proxy.ts:288` (`resolveSelector`). It reads `PLATFORM` (`web|android|ios|api|gatling`) and
  `VIEWPORT` (`desktop|responsive`) from env vars and dispatches through `LOCATOR_STRATEGIES` (lines 29-33) to
  read `node.web` (string or per-viewport object) or `node.mobile.{android,ios}` (string or per-os object).
- `client.ts`'s `sendIntent` composes the gRPC `platform` field as `"<driver>:<sessionId>"`
  (`DRIVER=playwright|appium|mobilewright|...`). `chaos-proxy.ts`'s `getPluginClient` (line 107) already
  extracts the driver via `platform.split(':')[0]` to pick a plugin address — `resolveSelector` never receives
  or uses that driver name today.
- **Appium plugin** (`src/plugins/appium/*`) consumes `node.mobile.*` as a **raw WebdriverIO selector string**
  directly (`driver.$(selector)`), and that string already encodes multiple real Appium strategies via prefix
  convention: `~foo` (accessibility id), `android=new UiSelector()...` (Android UiAutomator2), `-ios class
  chain:...` / `-ios predicate string:...` (iOS). This already works and needs no new runtime capability.
- **mobilewright plugin** does **not** speak WebDriver/Appium at all. It resolves against its own package's
  in-memory view-tree (`mobilecli` backend), via a typed `LocatorStrategy` union already defined in
  `MobilewrightActionContext.ts:15-21`: `testId | label(+exact) | text(+exact) | role(+name) |
  placeholder(+exact) | type`. `mobilewright.ts:23-34`'s `resolveMobilewrightTarget` borrows from the *same*
  `node.mobile.*` field Appium uses, stripping a leading `~` so a bare accessibility-id string becomes a
  `testId` value. Any other shape (`android=...`, `-ios ...`) silently passes through unresolved and is used as
  a literal (broken) testId — a real, pre-existing bug, not hypothetical (see §6).
- **Playwright plugin**: no locator abstraction beyond raw CSS. Every action handler (`Click.ts`, `Type.ts`,
  `ClearText.ts`, `AssertText.ts`, `ReadText.ts`, `ScrollTo.ts`, `WaitForElement.ts`, `SelectOption.ts`) passes
  the resolved string straight into a Playwright page/locator call (`page.click(target)`, `page.fill(selector,
  value)`, `page.locator(selector)`, ...).
- `*.locators.json` files are hand-authored per domain, merged by `loadLocators()` (`locator-resolver.ts:55-92`)
  with a **hard cross-file collision check**: the same logical key in two files throws (lines 76-85).
- No plugins for Cypress, WebdriverIO (web), Espresso, or XCUITest exist in `src/plugins/`.

## 3. Approved decisions

1. **Additive, not a rewrite.** The 5 non-pilot domains' `*.locators.json` are untouched; existing resolution
   behavior for them does not change.
2. **No runtime fallback chains.** Each locator declares one explicit strategy per tool — matching the user's
   own examples (named strategies you pick, not self-healing). The chosen shape (`{kind, value, ...}`) still
   leaves room to add an ordered array later without breaking anything, if flakiness ever justifies it.
3. **Locators are organized by "family" file, not by inline tool-keys in one node** (user's proposal, adopted):
   - `*.webdriver.locators.json` — tools that share the WebdriverIO/Appium native selector-string convention:
     `appium` today, `webdriverio` (web) later. Explicit key = driver name; **value format unchanged** (`~foo`,
     `android=...`, `-ios ...`, raw CSS). This file carries a **full, lossless, verbatim rename** of everything
     the legacy file had — `web` → `webdriverio`, `mobile` → `appium` — even though no `webdriverio` plugin
     exists yet: the CSS values already work as-is for a future webdriverio-web plugin, so nothing is
     re-derived later, and nothing already-working is left behind by the migration.
   - `*.wright.locators.json` — tools that share a semantic, accessibility-first `kind` vocabulary: `playwright`
     and `mobilewright`. New for Playwright; `mobilewright`'s existing `LocatorStrategy` is reused as-is.
   - `*.mix.locators.json` is **not created now** — Cypress/Espresso/XCUITest share no format with each other
     (confirmed: Cypress ≈ CSS/contains-text, Espresso ≈ native Android ViewMatchers, XCUITest ≈ native iOS
     predicates/accessibility id), so a shared file would just need per-tool keying anyway. When one of those
     tools is actually built, it gets a file (or family) chosen with real information in hand.
4. **`login` is the pilot migration**, fully moved from `login.locators.json` into `login.webdriver.locators.json`
   + `login.wright.locators.json` (§7). The other 5 domains are not touched.
5. **Explicit driver-name keys, not `web`/`mobile`, inside family files** — `web`/`mobile` stay reserved for the
   untouched legacy files. Reusing those key names inside `login.webdriver.locators.json` would silently collide
   with the legacy fallback path that Playwright still reads when a driver-keyed entry is absent (a `playwright`
   run with no explicit entry falls back to `node.web` — which would then be a value authored for webdriverio).
6. **mobilewright's node gains an optional android/ios axis.** Its `LocatorStrategy` *type* (§4.5) is unchanged,
   but the JSON slot holding it, `node.mobilewright`, may now be either a flat `{kind, value, ...}` (one value
   serves both OSes — the default, since mobilewright already queries a cross-platform view-tree) or an axis
   object `{android: {kind,...}, ios: {kind,...}}` for the cases where a native app genuinely exposes a
   different testId/label/role per OS for the "same" element. This is support for a case that *may* occur, not
   a claim that it currently does — the `login` pilot (§7) keeps every `mobilewright` entry flat because there
   is no evidence today that any of its values diverge by OS; the axis is documented and available for whenever
   real divergence is found.

## 4. Architecture

### 4.1 Resolution stays a single merged, tool-keyed node per logical key

Regardless of which family file a tool's locator was authored in, `loadLocators()` merges everything for one
logical key into one in-memory node keyed by driver name:

```ts
{
  loginScreen: {
    appium:       "~screen-login",                              // from *.webdriver.locators.json
    playwright:   { kind: "css", value: "body" },                // from *.wright.locators.json
    mobilewright: { kind: "testId", value: "screen-login" },     // from *.wright.locators.json
    // legacy nodes (untouched domains) keep: web / mobile.{android,ios}
  }
}
```

This is not optional plumbing — it is *required* by the user's own stated goal of mixing, e.g., `webdriverio`
(web) with `mobilewright` (mobile) for the same suite: that only works if resolution picks a branch by driver
name, independent of which file contributed it.

### 4.2 `loadLocators()` merge semantics change (real behavior change, not just new files)

Today: same key in two files → **always** throws. New rule: **deep-merge tool-branches by logical key across
files; throw only if the same tool-branch for the same key is defined twice** (e.g. `appium` for `loginScreen`
defined in two different files is still a real collision and still throws). This must live in the shared
`loadLocators()` so both resolution loci (§4.4) see the identical merged view.

### 4.3 Detecting a structured value

Within a family file there is no ambiguity — `*.webdriver.locators.json` is always raw strings, `*.wright.locators.json`
is always `{kind, value, ...}` objects — so no detection is needed at the JSON-parsing layer. Detection is only
needed once, at the point a resolved value is serialized into the single `string` field that crosses the gRPC
wire (`targetSelector`/`target`): a leading `{` marks a JSON-encoded structured value, exactly the convention
`MobilewrightActionContext.parseJsonLocator` already uses (`target.startsWith('{')`) — not a `kind:` prefix,
which would collide with legacy CSS that already contains colons (`h1:has-text("Checkout")`).

**Composite actions (`TYPE`, `SELECT_OPTION`, `WAIT_FOR_ELEMENT`, `ASSERT_TEXT`, format `key||payload`):**
`chaos-proxy.ts` resolves the key portion first (`resolveLocator`) and concatenates the payload after — this
already happens *before* JSON-detection, since the split on `||` happens on the raw composite string, and the
resolved locator (raw or JSON) is a self-contained unit slotted back before the `||`. The one caveat, now
explicit: a `kind`-object's `value` must never contain the literal substring `||` (nothing in this design
requires it to).

### 4.4 Resolution locus stays asymmetric — this is intentional, not an inconsistency to fix

- **`playwright` / `appium`**: resolved **kernel-side**, in `chaos-proxy.ts`, via `resolveLocator(logicalKey,
  driver)`. `driver` is the same string `getPluginClient` already extracts from the gRPC `platform` field
  (`platform.split(':')[0]`) — `resolveSelector` just threads it one call further, into `resolveLocator`.
- **`mobilewright`**: keeps resolving **plugin-side**, off the session's actual device platform
  (`resolveMobileSelector`/`resolveMobilewrightTarget` in `mobilewright.ts`) rather than the process-wide
  `PLATFORM` env var. This is *better* than the kernel-side path (session-scoped, not env-scoped) and is
  preserved as-is — only the lookup source changes: check `node.mobilewright` first (new, explicit); if absent,
  fall back to the existing borrow-from-`mobile.*` + `~`-strip, hardened per §6. Because `resolveMobileSelector`
  already receives the session's real `platform` (`'android'|'ios'`), checking `node.mobilewright` first is a
  two-step lookup: if it's an axis object (`{android, ios}`, §3.6) pick the branch for the session's platform;
  if it's a flat `{kind, value, ...}` use it for both.

`resolveLocator`'s new shape — guard clauses, no nested branching. `resolveAxis` is the one shared helper that
also backs the `mobilewright` axis lookup described above:

```
resolveAxis(value, axisKey):
  # value: whatever node[driver] held. axisKey: the env-derived selector for this driver's
  # axis (VIEWPORT for playwright, PLATFORM for appium/mobilewright), or undefined if the
  # driver has no axis at all.
  if axisKey is undefined: return value
  if value is not an axis object ({desktop,responsive} or {android,ios} shape): return value
  return value[axisKey]

resolveLocator(logicalKey, driver):
  node = loadLocators()[logicalKey]

  if node[driver] is undefined:
      return legacyResolve(node)   # existing LOCATOR_STRATEGIES[PLATFORM_env] over node.web /
                                    # node.mobile.* — unchanged

  value = resolveAxis(node[driver], axisKeyFor(driver))
  if value is a string:
      return value                 # webdriver-family / legacy-shaped raw value, as-is

  return JSON.stringify(value)     # {kind, value, ...} structured strategy
```

`resolveLocator`'s only caller (`chaos-proxy.ts`) is updated to pass `driver`; no other change to its contract
(still returns a `string`, still throws the existing "Resolution failed" error on an empty/missing result).

### 4.5 Strategy vocabulary per tool

- **`webdriver` family — zero new runtime code.** Values keep today's exact WebdriverIO/Appium string
  convention. Only the JSON key names change (`mobile` → `appium`, `web` → `webdriverio`) — no plugin reads
  `webdriverio` yet, so it's inert until that plugin exists, but the working CSS values are preserved verbatim
  rather than only surviving in the semantically-transformed `wright` file. The appium plugin's action handlers
  are untouched.
- **`wright` family — the only place with new code.**
  - New `PlaywrightLocatorStrategy` (mirrors `MobilewrightActionContext.LocatorStrategy` 1:1 in shape):
    `testId | role(+name,+exact) | text(+exact) | label(+exact) | placeholder(+exact) | altText(+exact) |
    title(+exact) | css | xpath`. `css`/`xpath` are the explicit escape hatch for anything with no clean
    semantic equivalent (e.g. `h1:has-text("Checkout")`, list selectors like `[data-testid^='market-']`).
  - New shared file `src/plugins/playwright/actions/PlaywrightLocator.ts`, structurally identical to
    `MobilewrightActionContext.ts`: `parseLocator(target)` (detects `{`-prefixed JSON, else treats the raw
    string as `{kind:'css', value: target}` for backward compatibility with anything not yet migrated) +
    `locate(page, strategy) → Locator` (dispatches to `page.getByRole/getByText/getByTestId/getByLabel/
    getByPlaceholder/getByAltText/getByTitle`, or `page.locator(css)`/`page.locator(xpath)` for the escape
    hatch).
  - **Every Playwright action handler that currently embeds a raw selector string in a page call** must route
    through `locate()` instead, returning a `Locator` and calling `.click()/.fill()/.textContent()/...` on it
    (Playwright's own recommended modern pattern — behaviorally equivalent to today's `page.click(selector)`
    for the raw-string branch). Concretely: `Click.ts`, `Type.ts`, `ClearText.ts`, `AssertText.ts`,
    `ReadText.ts`, `ScrollTo.ts`, `WaitForElement.ts`, `SelectOption.ts` (8 files) — this is the real
    implementation surface of this design.
  - `mobilewright`'s existing `LocatorStrategy`/`parseLocator`/`locate` are reused unchanged; only their input
    source changes (explicit `node.mobilewright`, see §4.4) and the node holding it may now carry an optional
    android/ios axis above the strategy, same shape convention as `appium`'s (§3.6).

### 4.6 File layout example (login pilot, see §7 for full content)

```
src/core/tests/login/contracts/
  login.webdriver.locators.json   # webdriverio (= old `web`, renamed key, values verbatim, inert for now)
                                   # + appium (= old `mobile`, renamed key, values verbatim)
  login.wright.locators.json      # playwright (new `kind`) + mobilewright (explicit, was implicit borrow)
```
`login.locators.json` is deleted, but nothing in it is lost: every value it had is preserved verbatim in
`login.webdriver.locators.json` (renamed keys only), and separately re-expressed semantically in
`login.wright.locators.json`. Nothing is duplicated *within* a file — each key appears once per family file.

## 5. Error handling / validation

- Malformed `{`-leading JSON, or JSON missing `kind`/`value` → explicit resolver error naming the logical key
  and the malformed value — never a silent fallback to treating it as a CSS/raw selector (which today would
  fail downstream with a confusing "element not found").
- Unknown `kind` for a given tool's union → explicit error (TypeScript narrows this at author time for anything
  going through the shared type; a runtime guard covers hand-edited JSON).
- Same tool-branch defined twice for one logical key across family files → explicit error at `loadLocators()`
  time (§4.2), same "fail loud at startup" philosophy the existing cross-file collision check already uses.
- Hardened mobilewright borrow (§4.4, §6): a recognized Appium-only prefix (`android=`, `-ios `, `id=`,
  `xpath=`) reaching the borrow path with no `node.mobilewright` override throws a clear error naming the key
  and instructing that an explicit `mobilewright` entry is required — replacing today's silent mis-resolution.
- `resolveLocator`'s existing empty/undefined guard (`locator-resolver.ts:139-144`) is unchanged.

## 6. Known gap surfaced by the pilot migration (not solved in this task)

5 of `login`'s 18 keys (`marketButtonList`, `switzerlandLanguageList`, `marketFlag`, `quickLoginUserList`,
`quickLoginUserLabel`) are **prefix/list selectors** (`descriptionStartsWith(...)` / `BEGINSWITH`) — matching
*any* element whose test id starts with a given prefix. mobilewright's `LocatorStrategy` has no "starts with"
concept (`exact?: boolean` only). These are **already silently broken for mobilewright today** (the `~`-strip
borrow never touches non-`~` values, so they fall through as a literal broken testId). Under the hardened
borrow (§5) they will fail loudly instead of silently — this is surfacing a pre-existing bug, not introducing a
regression. This design intentionally does **not** invent a fix (extending mobilewright's `kind` vocabulary
with a prefix/substring match would require verifying the actual match semantics of the `mobilewright`
package's query engine against a running app, which is implementation-phase work, not design work). The pilot
migration leaves these 5 keys **without** a `mobilewright` branch; any test that both (a) exercises one of these
5 elements and (b) runs under `DRIVER=mobilewright` will need that gap addressed before it can pass — flagged
explicitly for the implementation plan.

## 7. Reference migration: `login` domain

**`login.webdriver.locators.json`** — a full, lossless, verbatim rename of the original file's content:
`web` → `webdriverio`, `mobile` → `appium`. No values change, no values are dropped:

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
(Keys keep whichever of `webdriverio`/`appium` they originally had — e.g. `togglePasswordButton` never had a
`mobile` value, so it has no `appium` key here either; `appLogo` never had a `web` value, so no `webdriverio`.)

**`login.wright.locators.json`** — `[data-testid='x']` CSS becomes `{kind:"testId", value:"x"}` (a safe,
mechanical, verified-equivalent transform: Playwright's `getByTestId` matches the `data-testid` attribute by
default, identical to what the CSS attribute selector matched). Non-testid CSS (`body`, `h2.text-3xl`,
`p.text-gray-400`) and prefix/list selectors keep `kind:"css"` — no invented role/text mapping without visibility
into the real rendered DOM:

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
(`marketFlag` and `quickLoginUserLabel` had no `web` value originally and have no mobilewright equivalent per
§6 — correctly absent from this file entirely, not present as empty objects.)

Every `mobilewright` entry above is flat (§3.6) — nothing in `login` has known evidence of per-OS divergence.
The axis shape (§4.4), for when a future key needs it, looks like this — **illustrative only, not applied to
any key above**:
```json
"someInput": {
  "mobilewright": {
    "android": { "kind": "testId", "value": "input-foo-android" },
    "ios": { "kind": "testId", "value": "input-foo-ios" }
  }
}
```

## 8. Extensibility for future tools (not implemented now)

Adding Cypress, WebdriverIO-web, Espresso, or XCUITest later requires, per tool: one new `PLUGIN_ADDRESSES`
entry (already the existing extension point), one new tool-key used in a family file (existing family if the
tool's locator format matches `webdriver`/`wright`, otherwise a new family file), and — only if the tool's
strategy vocabulary is genuinely new — that plugin's own `LocatorStrategy` type + `parseLocator`/`locate` pair,
scoped entirely inside that plugin. **Zero changes to `locator-resolver.ts` or `chaos-proxy.ts`** are required
by adding a tool, because resolution already keys off `driver` generically (§4.1, §4.4).

## 9. Testing plan

- **Regression**: all 5 untouched domains resolve identically before/after (existing behavior, unit-tested
  against the unchanged `LOCATOR_STRATEGIES` fallback path).
- **New resolution**: tool-keyed lookup + axis resolution (viewport for `playwright`, os for `appium`) + `kind`
  serialization, for both families.
- **Merge semantics**: same logical key contributed by two family files merges correctly; same tool-branch
  defined twice across files throws.
- **Detection edge cases**: legacy CSS containing `:` is never misread as JSON; `||`-composite targets split
  correctly when the key portion resolves to a JSON kind-object.
- **Playwright translator**: one test per `kind` → correct `page.getBy*`/`page.locator` call.
- **mobilewright hardened borrow**: happy path (bare `~foo`, unchanged behavior) + the now-loud failure path
  (recognized Appium-only prefix, no override).
- **mobilewright os-axis**: flat `node.mobilewright` resolves identically regardless of session platform; an
  axis-shaped `node.mobilewright` (§3.6) resolves the `android` branch for an android session and the `ios`
  branch for an ios session.
- **End-to-end**: the `login` pilot executed against `playwright`, `appium`, and `mobilewright` drivers to
  confirm the full path (family files → merge → `resolveLocator`/`resolveMobileSelector` → plugin action
  handler → real driver call) — this is where the §6 gap will visibly surface (mobilewright run touching one
  of the 5 unmapped keys) and should be captured as a known/expected failure, not silently skipped.

## 10. Out of scope

- Any change to the `appium` plugin's runtime (none needed — §4.5).
- Implementing Cypress, WebdriverIO-web, Espresso, or XCUITest plugins.
- Solving the mobilewright prefix/list-selector gap (§6).
- Migrating any domain other than `login`.
- Runtime fallback/self-healing locator chains (§3.2).
