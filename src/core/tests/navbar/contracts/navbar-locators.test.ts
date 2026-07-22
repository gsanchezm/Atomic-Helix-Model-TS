import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';

const CONTRACTS_DIR = __dirname;

test('navbar.locators.json no longer exists — content was redistributed, not duplicated', () => {
    assert.equal(fs.existsSync(path.join(CONTRACTS_DIR, 'navbar.locators.json')), false);
});

test('navbar.webdriver.locators.json is valid JSON, has all 28 original keys, values verbatim', () => {
    const webdriver = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'navbar.webdriver.locators.json'), 'utf-8'));
    assert.equal(Object.keys(webdriver).length, 28);
    assert.deepEqual(webdriver.bottomNavContainer, {
        appium: {
            android: 'android=new UiSelector().resourceId("view-bottom-nav")',
            ios: '~view-bottom-nav',
        },
    });
    assert.deepEqual(webdriver.bottomNavList.appium, {
        android: 'android=new UiSelector().resourceIdMatches("nav-[a-z]+")',
        ios: "-ios class chain:**/XCUIElementTypeOther[`name BEGINSWITH 'nav-'`]",
    });
    assert.equal(webdriver.navLogo.appium, undefined);
});

test('navbar.wright.locators.json is valid JSON with playwright testId + mobilewright explicit entries', () => {
    const wright = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'navbar.wright.locators.json'), 'utf-8'));
    assert.equal(Object.keys(wright).length, 26);
    assert.deepEqual(wright.bottomNavContainer, { mobilewright: { kind: 'testId', value: 'view-bottom-nav' } });
    // The 4 bottomNav* prefix/regex-matching Appium selectors have no bare-`~`
    // branch on either OS — no mobilewright entry is invented (§6-style gap),
    // and there's no web value either, so they're absent entirely.
    assert.equal(wright.bottomNavList, undefined);
    assert.equal(wright.bottomNavLabel, undefined);
    assert.equal(wright.bottomNavBadge, undefined);
    assert.equal(wright.bottomNavBadgeText, undefined);
});
