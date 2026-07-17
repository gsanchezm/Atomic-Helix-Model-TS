import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';

const CONTRACTS_DIR = __dirname;

test('checkout.locators.json no longer exists — content was redistributed, not duplicated', () => {
    assert.equal(fs.existsSync(path.join(CONTRACTS_DIR, 'checkout.locators.json')), false);
});

test('checkout.webdriver.locators.json is valid JSON, has all 30 original keys, values verbatim', () => {
    const webdriver = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'checkout.webdriver.locators.json'), 'utf-8'));
    assert.equal(Object.keys(webdriver).length, 30);
    assert.deepEqual(webdriver.checkoutHeader, { webdriverio: 'h1:has-text("Checkout")', appium: '~text-section-address' });
    assert.deepEqual(webdriver.zipCodeInput.appium, { android: '~input-zipcode', ios: '~input-zipcode' });
    assert.deepEqual(webdriver.cardNumberInput.appium, {
        android: 'android=new UiSelector().className("android.widget.EditText").description("input-card-number")',
        ios: "-ios predicate string:type == 'XCUIElementTypeTextField' AND name == 'input-card-number'",
    });
    assert.equal(webdriver.districtInput.webdriverio, "[data-testid='district']");
});

test('checkout.wright.locators.json is valid JSON with playwright testId/css + mobilewright explicit entries', () => {
    const wright = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'checkout.wright.locators.json'), 'utf-8'));
    assert.equal(Object.keys(wright).length, 29);
    assert.deepEqual(wright.zipCodeInput, {
        playwright: { kind: 'testId', value: 'zip-code' },
        mobilewright: { kind: 'testId', value: 'input-zipcode' },
    });
    assert.deepEqual(wright.paymentMethodList, { playwright: { kind: 'css', value: "[role='radiogroup'] [role='radio']" } });
    assert.equal(wright.paymentMethodList.mobilewright, undefined);
    // streetInput and cardNumberInput have a mixed appium android/ios axis
    // (one branch bare `~foo`, the other an Appium-only UiSelector/predicate)
    // — no mobilewright entry is invented for a partial axis (§6-style gap).
    assert.equal(wright.streetInput.mobilewright, undefined);
    assert.equal(wright.cardNumberInput.mobilewright, undefined);
    // checkoutScreenLanding has no web value and a non-`~` mobile axis on both
    // branches — absent entirely, not present as an empty object.
    assert.equal(wright.checkoutScreenLanding, undefined);
});
