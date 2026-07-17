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
