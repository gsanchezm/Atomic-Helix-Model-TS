import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveVisualTarget } from '@core/contracts/visual-target-resolver';

// legacyFallbackHeader / legacyFallbackTestId live in
// src/core/tests/_fixtures/legacy-fallback.locators.json, a dedicated
// fixture that intentionally carries only the legacy web/mobile shape
// (no webdriverio/appium branch) — an untouched-domain fixture that stays
// stable regardless of which real domains get migrated to family files.
// legacyFallbackHeader: "web": 'h1:has-text("Legacy Fallback")', "mobile": "~legacy-fallback-header".
// legacyFallbackTestId.mobile.android/ios = "~legacy-fallback-id".
//
// Skipped by decision: no real production consumer since the family-file
// migration completed — excluded from normal runs, kept for manual/
// occasional verification.
const SKIP_LEGACY_FALLBACK = { skip: 'legacy web/mobile locator shape has no real production consumer since the family-file migration completed — excluded from normal runs, kept for manual/occasional verification' };

test('resolveVisualTarget resolves an untouched domain unchanged under PLATFORM=web', SKIP_LEGACY_FALLBACK, () => {
    process.env.PLATFORM = 'web';
    const result = resolveVisualTarget({ id: 's1', regionRef: 'legacyFallbackHeader', maskRefs: ['legacyFallbackTestId'] });
    assert.equal(result.resolvedRegion, 'h1:has-text("Legacy Fallback")');
    assert.equal(result.resolvedMasks[0], '[data-testid=\'legacy-fallback\']');
    assert.equal(result.unresolvedRefs.length, 0);
    delete process.env.PLATFORM;
});

test('resolveVisualTarget resolves an untouched domain unchanged under PLATFORM=android', SKIP_LEGACY_FALLBACK, () => {
    process.env.PLATFORM = 'android';
    const result = resolveVisualTarget({ id: 's2', regionRef: 'legacyFallbackHeader', maskRefs: ['legacyFallbackTestId'] });
    assert.equal(result.resolvedRegion, '~legacy-fallback-header');
    assert.equal(result.resolvedMasks[0], '~legacy-fallback-id');
    delete process.env.PLATFORM;
});

// login (migrated domain): usernameInput now has BOTH a webdriverio branch
// (bare CSS, per-viewport) and a wright/playwright branch (JSON {kind,...}).
// This resolver must keep returning the bare CSS string, not the JSON one.

test('resolveVisualTarget resolves a migrated domain to bare CSS under PLATFORM=web (not JSON)', () => {
    process.env.PLATFORM = 'web';
    process.env.VIEWPORT = 'desktop';
    const result = resolveVisualTarget({ id: 's3', regionRef: 'loginScreen', maskRefs: ['usernameInput', 'passwordInput'] });
    assert.equal(result.resolvedRegion, 'body');
    assert.equal(result.resolvedMasks[0], "[data-testid='username-desktop']");
    assert.equal(result.resolvedMasks[1], "[data-testid='password-desktop']");
    assert.equal(result.unresolvedRefs.length, 0);
    delete process.env.PLATFORM;
    delete process.env.VIEWPORT;
});

test('resolveVisualTarget resolves a migrated domain to a bare accessibility-id string under PLATFORM=android', () => {
    process.env.PLATFORM = 'android';
    const result = resolveVisualTarget({ id: 's4', regionRef: 'loginScreen', maskRefs: ['usernameInput'] });
    assert.equal(result.resolvedRegion, '~screen-login');
    assert.equal(result.resolvedMasks[0], '~input-username');
    delete process.env.PLATFORM;
});
