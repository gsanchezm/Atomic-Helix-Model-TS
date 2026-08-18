import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';

const CONTRACTS_DIR = __dirname;

test('order_success.locators.json no longer exists — content was redistributed, not duplicated', () => {
    assert.equal(fs.existsSync(path.join(CONTRACTS_DIR, 'order_success.locators.json')), false);
});

test('order_success.webdriver.locators.json is valid JSON, has all 25 original keys, values verbatim', () => {
    const webdriver = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'order_success.webdriver.locators.json'), 'utf-8'));
    assert.equal(Object.keys(webdriver).length, 25);
    assert.deepEqual(webdriver.orderSuccessScreen.appium, {
        android: 'android=new UiSelector().resourceId("screen-order-success")',
        ios: '~btn-order-details',
    });
});

test('order_success.wright.locators.json resolves the genuine android/ios mobilewright divergence as an axis', () => {
    const wright = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'order_success.wright.locators.json'), 'utf-8'));
    assert.equal(Object.keys(wright).length, 25);
    // orderSuccessScreen is the one key across all 6 migrated domains where
    // the bare `~foo` accessibility ids genuinely differ between android and
    // ios — both are eligible (both bare `~`), so it keeps the {android,ios}
    // axis shape (§3.6) instead of collapsing to a flat value.
    assert.deepEqual(wright.orderSuccessScreen.mobilewright, {
        android: { kind: 'testId', value: 'screen-order-success' },
        ios: { kind: 'testId', value: 'btn-order-details' },
    });
    // viewOrderDetailsButton coincidentally borrows the same raw accessibility
    // id ("btn-order-details") that orderSuccessScreen's ios branch uses —
    // different logical keys, no collision (collision tracking is per key).
    assert.deepEqual(wright.viewOrderDetailsButton.mobilewright, { kind: 'testId', value: 'btn-order-details' });
});
