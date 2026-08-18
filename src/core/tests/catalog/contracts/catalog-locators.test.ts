import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';

const CONTRACTS_DIR = __dirname;

test('catalog.locators.json no longer exists — content was redistributed, not duplicated', () => {
    assert.equal(fs.existsSync(path.join(CONTRACTS_DIR, 'catalog.locators.json')), false);
});

test('catalog.webdriver.locators.json is valid JSON, has all 19 original keys, values verbatim', () => {
    const webdriver = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'catalog.webdriver.locators.json'), 'utf-8'));
    assert.equal(Object.keys(webdriver).length, 19);
    assert.deepEqual(webdriver.catalogScreen, { webdriverio: "[data-testid='screen-catalog']", appium: '~screen-catalog' });
    assert.equal(webdriver.categoryById.appium, '~btn-category-{id}');
    assert.deepEqual(webdriver.categoryList.appium, {
        android: 'android=new UiSelector().descriptionStartsWith("btn-category-")',
        ios: "-ios class chain:**/XCUIElementTypeOther[`name BEGINSWITH 'btn-category-'`]",
    });
});

test('catalog.wright.locators.json is valid JSON with playwright testId/css + mobilewright explicit entries', () => {
    const wright = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'catalog.wright.locators.json'), 'utf-8'));
    assert.equal(Object.keys(wright).length, 19);
    // templated {id} keys still transform mechanically — molecules bypass
    // resolveLocator for these (they hand-build the substituted selector),
    // so the registry entry is documentation, but it must stay lossless.
    assert.deepEqual(wright.categoryById, {
        playwright: { kind: 'testId', value: 'category-{id}' },
        mobilewright: { kind: 'testId', value: 'btn-category-{id}' },
    });
    assert.deepEqual(wright.categoryList, { playwright: { kind: 'css', value: "[data-testid^='category-']" } });
    assert.equal(wright.categoryList.mobilewright, undefined);
});
