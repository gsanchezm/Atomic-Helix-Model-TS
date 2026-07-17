import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';

const CONTRACTS_DIR = __dirname;

test('profile.locators.json no longer exists — content was redistributed, not duplicated', () => {
    assert.equal(fs.existsSync(path.join(CONTRACTS_DIR, 'profile.locators.json')), false);
});

test('profile.webdriver.locators.json is valid JSON, has all 22 original keys, values verbatim', () => {
    const webdriver = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'profile.webdriver.locators.json'), 'utf-8'));
    assert.equal(Object.keys(webdriver).length, 22);
    assert.deepEqual(webdriver.addressInput, {
        webdriverio: {
            responsive: "[data-testid='profile-address-responsive']",
            desktop: "[data-testid='profile-address-desktop']",
        },
    });
    assert.equal(webdriver.addressInput.appium, undefined);
});

test('profile.wright.locators.json is valid JSON with playwright testId + mobilewright explicit entries for all 22 keys', () => {
    const wright = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, 'profile.wright.locators.json'), 'utf-8'));
    assert.equal(Object.keys(wright).length, 22);
    assert.deepEqual(wright.saveButton, {
        playwright: {
            responsive: { kind: 'testId', value: 'profile-save-btn-responsive' },
            desktop: { kind: 'testId', value: 'profile-save-btn-desktop' },
        },
        mobilewright: { kind: 'testId', value: 'btn-save-profile' },
    });
    assert.equal(wright.addressInput.mobilewright, undefined);
});
