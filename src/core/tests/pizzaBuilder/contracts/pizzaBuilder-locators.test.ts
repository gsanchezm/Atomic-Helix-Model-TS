import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';

const CONTRACTS_DIR = __dirname;

test('pizzaBuilder.locators.json no longer exists — content was redistributed, not duplicated', () => {
    assert.equal(fs.existsSync(path.join(CONTRACTS_DIR, 'pizzaBuilder.locators.json')), false);
});

test('pizzaBuilder.webdriver.locators.json is valid JSON, has all 20 original keys, values verbatim', () => {
    const webdriver = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'pizzaBuilder.webdriver.locators.json'), 'utf-8'));
    assert.equal(Object.keys(webdriver).length, 20);
    assert.deepEqual(webdriver.pizzaBuilderScreen, {
        webdriverio: 'div[class*="max-h-[90vh]"]',
        appium: {
            android: 'android=new UiSelector().resourceId("screen-pizza-builder")',
            ios: '~screen-pizza-builder',
        },
    });
});

test('pizzaBuilder.wright.locators.json omits the 5 regex/prefix-only Appium mobile keys (§6-style gap)', () => {
    const wright = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'pizzaBuilder.wright.locators.json'), 'utf-8'));
    assert.equal(Object.keys(wright).length, 15);
    assert.deepEqual(wright.pizzaBuilderScreen, {
        playwright: { kind: 'css', value: 'div[class*="max-h-[90vh]"]' },
        mobilewright: { kind: 'testId', value: 'screen-pizza-builder' },
    });
    for (const key of ['sizeOptionLabel', 'sizeOptionPrice', 'toppingGroupList', 'toppingGroupTitle', 'toppingLabel']) {
        assert.equal(wright[key], undefined, `${key} should be absent — no web value and no bare-~ mobile branch`);
    }
});
