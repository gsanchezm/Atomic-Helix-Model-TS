import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';

const CONTRACTS_DIR = __dirname;

test('login.locators.json no longer exists — content was redistributed, not duplicated', () => {
    assert.equal(fs.existsSync(path.join(CONTRACTS_DIR, 'login.locators.json')), false);
});

test('login.webdriver.locators.json is valid JSON, has all 18 original keys, values verbatim', () => {
    const webdriver = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'login.webdriver.locators.json'), 'utf-8'));
    assert.equal(Object.keys(webdriver).length, 18);
    assert.deepEqual(webdriver.loginScreen, { webdriverio: 'body', appium: '~screen-login' });
    assert.deepEqual(webdriver.togglePasswordButton, { webdriverio: "[data-testid='toggle-password']" });
    // appium.android switched from a `~content-desc` strategy to a resource-id
    // UiSelector — root-caused against a real device (R5CX71NFF9H, uiautomator
    // dump): this APK's testID-derived elements expose Android resource-id, not
    // content-desc (content-desc instead carries the accessibility display text,
    // e.g. "OmniPizza" for text-app-name, not the testID). ios is left at its
    // original `~`-prefixed value, unverified/unchanged (no iOS device available
    // to confirm whether the same mismatch applies there).
    assert.deepEqual(webdriver.appLogo.appium, {
        android: 'android=new UiSelector().resourceId("img-logo")',
        ios: '~img-logo',
    });
    assert.equal(webdriver.appLogo.webdriverio, undefined);
    assert.deepEqual(webdriver.marketButtonList.appium, {
        android: 'android=new UiSelector().descriptionStartsWith("btn-market-")',
        ios: "-ios class chain:**/XCUIElementTypeOther[`name BEGINSWITH 'btn-market-'`]",
    });
});

test('login.wright.locators.json is valid JSON with playwright testId + mobilewright explicit entries', () => {
    const wright = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'login.wright.locators.json'), 'utf-8'));
    assert.equal(Object.keys(wright).length, 16);
    assert.deepEqual(wright.usernameInput.mobilewright, { kind: 'testId', value: 'input-username' });
    assert.deepEqual(wright.usernameInput.playwright.desktop, { kind: 'testId', value: 'username-desktop' });
    assert.deepEqual(wright.loginScreen.playwright, { kind: 'css', value: 'body' });
    // marketFlag and quickLoginUserLabel have no wright-family equivalent (§6 gap) — must be absent, not empty objects.
    assert.equal(wright.marketFlag, undefined);
    assert.equal(wright.quickLoginUserLabel, undefined);
});
