import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveVisualTarget } from '@core/contracts/visual-target-resolver';

// checkoutHeader (checkout.locators.json) is an untouched-domain fixture:
// "web": "h1:has-text(\"Checkout\")", "mobile": "~text-section-address".
// zipCodeInput.mobile.android/ios = "~input-zipcode".

test('resolveVisualTarget resolves an untouched domain unchanged under PLATFORM=web', () => {
    process.env.PLATFORM = 'web';
    const result = resolveVisualTarget({ id: 's1', regionRef: 'checkoutHeader', maskRefs: ['zipCodeInput'] });
    assert.equal(result.resolvedRegion, 'h1:has-text("Checkout")');
    assert.equal(result.resolvedMasks[0], '[data-testid=\'zip-code\']');
    assert.equal(result.unresolvedRefs.length, 0);
    delete process.env.PLATFORM;
});

test('resolveVisualTarget resolves an untouched domain unchanged under PLATFORM=android', () => {
    process.env.PLATFORM = 'android';
    const result = resolveVisualTarget({ id: 's2', regionRef: 'checkoutHeader', maskRefs: ['zipCodeInput'] });
    assert.equal(result.resolvedRegion, '~text-section-address');
    assert.equal(result.resolvedMasks[0], '~input-zipcode');
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
