import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveMobilewrightTarget } from '@plugins/mobilewright/mobilewright';

// Skipped by decision: legacyFallback* keys have no real production consumer
// since the family-file migration completed — excluded from normal runs,
// kept for manual/occasional verification of the legacy-borrow path.
const SKIP_LEGACY_FALLBACK = { skip: 'legacy web/mobile locator shape has no real production consumer since the family-file migration completed — excluded from normal runs, kept for manual/occasional verification' };

test('resolveMobilewrightTarget strips a bare accessibility-id legacy borrow (unchanged happy path)', SKIP_LEGACY_FALLBACK, () => {
    assert.equal(resolveMobilewrightTarget('legacyFallbackTestId', 'android'), 'legacy-fallback-id');
});

test('resolveMobilewrightTarget preserves the composite payload after the || separator', SKIP_LEGACY_FALLBACK, () => {
    assert.equal(resolveMobilewrightTarget('legacyFallbackTestId||90210', 'android'), 'legacy-fallback-id||90210');
});

test('resolveMobilewrightTarget passes an explicit mobilewright override through as JSON', () => {
    assert.equal(
        resolveMobilewrightTarget('usernameInput', 'android'),
        JSON.stringify({ kind: 'testId', value: 'input-username' }),
    );
});

test('resolveMobilewrightTarget throws a clear error for an Appium-only borrow it cannot interpret', SKIP_LEGACY_FALLBACK, () => {
    assert.throws(
        () => resolveMobilewrightTarget('legacyFallbackList', 'android'),
        /legacyFallbackList.*Appium-only selector/,
    );
});

test('resolveMobilewrightTarget passes an unregistered raw target through unchanged', () => {
    assert.equal(resolveMobilewrightTarget('~already-raw-target', 'android'), '~already-raw-target');
});

test('resolveMobilewrightTarget throws for a migrated domain key with no mobilewright override (§6 gap)', () => {
    // marketButtonList (login.webdriver.locators.json) has no node.mobile —
    // Task 5 renamed it to node.appium — and no mobilewright override. This
    // reproduces a live E2E finding: without borrowing from node.appium, the
    // hardened-prefix check never runs and the raw key silently gets used
    // as a literal testId instead of throwing.
    assert.throws(
        () => resolveMobilewrightTarget('marketButtonList', 'android'),
        /marketButtonList.*Appium-only selector/,
    );
});
