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
    // mobilewright resolves its own axis separately (session-scoped, see
    // resolveMobilewrightValue) rather than through this env-based lookup.
    assert.equal(axisKeyFor('mobilewright'), undefined);
});

test('axisKeyFor reads VIEWPORT for webdriverio (shares the web-family axis with playwright)', () => {
    process.env.VIEWPORT = 'responsive';
    assert.equal(axisKeyFor('webdriverio'), 'responsive');
    delete process.env.VIEWPORT;
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
