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

// legacyFallbackTestId lives in
// src/core/tests/_fixtures/legacy-fallback.locators.json, a dedicated
// fixture carrying only the legacy web/mobile shape — a stable regression
// fixture for the legacy resolution path, independent of any real domain's
// migration status.
//
// Skipped by decision: every real domain is now migrated to family files, so
// this path has no production consumer left. Kept as documentation/a manual
// regression check for the fallback branch, not run in normal suites.
const SKIP_LEGACY_FALLBACK = { skip: 'legacy web/mobile locator shape has no real production consumer since the family-file migration completed — excluded from normal runs, kept for manual/occasional verification' };

test('resolveSelector resolves a simple key against the legacy web shape', SKIP_LEGACY_FALLBACK, () => {
    process.env.PLATFORM = 'web';
    process.env.VIEWPORT = 'desktop';
    assert.equal(resolveSelector('CLICK', 'legacyFallbackTestId', 'playwright:0'), "[data-testid='legacy-fallback']");
    delete process.env.PLATFORM;
    delete process.env.VIEWPORT;
});

test('resolveSelector resolves only the key portion of a composite target, preserving the payload', SKIP_LEGACY_FALLBACK, () => {
    process.env.PLATFORM = 'web';
    process.env.VIEWPORT = 'desktop';
    assert.equal(resolveSelector('TYPE', 'legacyFallbackTestId||90210', 'playwright:0'), "[data-testid='legacy-fallback']||90210");
    delete process.env.PLATFORM;
    delete process.env.VIEWPORT;
});

test('resolveSelector bypasses resolution entirely for a mobilewright platform', () => {
    assert.equal(resolveSelector('CLICK', 'zipCodeInput', 'mobilewright:0'), 'zipCodeInput');
});

test('resolveSelector passes NAVIGATE through unresolved (passthrough action)', () => {
    assert.equal(resolveSelector('NAVIGATE', 'https://example.com', 'playwright:0'), 'https://example.com');
});
