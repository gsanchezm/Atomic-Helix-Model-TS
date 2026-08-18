import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveCypressLocator } from '@plugins/cypress/locators/resolveCypressLocator';

// Fixture substitution (Task C2, see task-C2-report.md for full reasoning):
//
// The originating brief's Step 1 test used `zipCodeInput` from
// src/core/tests/checkout/contracts/checkout.webdriver.locators.json. That
// file does not exist in this worktree — only the `login` domain has been
// migrated to the *.webdriver.locators.json / *.wright.locators.json family
// split (commit dc52dd4); checkout's migration is uncommitted work-in-progress
// elsewhere and out of scope to copy in here.
//
// Substituted with the already-committed `login` domain fixture
// (src/core/tests/login/contracts/login.webdriver.locators.json), which
// exercises the same two behaviors the brief's zipCodeInput example was
// chosen for:
//   1. `usernameInput` has a { desktop, responsive } webdriverio branch —
//      proves resolveCypressLocator delegates to resolveLocator(key,
//      'webdriverio') INCLUDING the viewport-axis resolution path (the
//      mechanism the brief's own zipCodeInput test targeted).
//   2. `loginScreen` has a flat-string webdriverio branch ("body") — proves
//      the passthrough case where a key has no axis object at all.
//
// Expected values traced by hand against src/kernel/locator-resolver.ts:
//   resolveLocator('usernameInput', 'webdriverio') with PLATFORM=web,
//   VIEWPORT=desktop -> node.webdriverio = { responsive: "...", desktop:
//   "[data-testid='username-desktop']" } -> axisKeyFor('webdriverio') is
//   getViewport() = 'desktop' -> isAxisObject(...) is true (keys are a subset
//   of {desktop,responsive,android,ios}) -> resolveAxis picks .desktop ->
//   "[data-testid='username-desktop']" (already a string, no {kind,value}
//   wrapping needed).
//
//   resolveLocator('loginScreen', 'webdriverio') -> node.webdriverio = "body"
//   (a plain string) -> isAxisObject("body") is false (not an object) ->
//   resolveAxis returns "body" unchanged regardless of VIEWPORT.
test('resolveCypressLocator resolves against the webdriverio branch (shared with the WebdriverIO plugin), including viewport-axis resolution', () => {
    process.env.PLATFORM = 'web';
    process.env.VIEWPORT = 'desktop';
    assert.equal(resolveCypressLocator('usernameInput'), "[data-testid='username-desktop']");
    assert.equal(resolveCypressLocator('loginScreen'), 'body');
    delete process.env.PLATFORM;
    delete process.env.VIEWPORT;
});
