import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locate, parseLocator } from '@plugins/webdriverio/actions/WebDriverIOLocator';

test('parseLocator treats a plain string as a raw css strategy (default)', () => {
    assert.deepEqual(parseLocator("[data-testid='foo']"), { kind: 'css', value: "[data-testid='foo']" });
});

test('parseLocator treats a class/tag selector as css', () => {
    assert.deepEqual(parseLocator('h2.text-3xl'), { kind: 'css', value: 'h2.text-3xl' });
});

test('parseLocator detects an xpath expression by its leading "//"', () => {
    assert.deepEqual(parseLocator('//button[@id="submit"]'), { kind: 'xpath', value: '//button[@id="submit"]' });
});

test('parseLocator detects a parenthesized xpath expression', () => {
    assert.deepEqual(parseLocator('(//button)[1]'), { kind: 'xpath', value: '(//button)[1]' });
});

test('parseLocator parses an "id=" prefixed target', () => {
    assert.deepEqual(parseLocator('id=submit-btn'), { kind: 'id', value: 'submit-btn' });
});

test('parseLocator parses a "name=" prefixed target', () => {
    assert.deepEqual(parseLocator('name=zip'), { kind: 'name', value: 'zip' });
});

test('parseLocator parses a "link=" prefixed target', () => {
    assert.deepEqual(parseLocator('link=Sign out'), { kind: 'linkText', value: 'Sign out' });
});

test('parseLocator parses a "plink=" prefixed target', () => {
    assert.deepEqual(parseLocator('plink=Sign'), { kind: 'partialLinkText', value: 'Sign' });
});

test('parseLocator parses a "tag=" prefixed target', () => {
    assert.deepEqual(parseLocator('tag=button'), { kind: 'tagName', value: 'button' });
});

function fakeDriver() {
    const calls: string[] = [];
    return { __calls: calls, $: (sel: string) => { calls.push(sel); return { __selector: sel }; } } as any;
}

test('locate dispatches "css" to driver.$ with the value verbatim', () => {
    const driver = fakeDriver();
    locate(driver, { kind: 'css', value: "[data-testid='foo']" });
    assert.deepEqual(driver.__calls, ["[data-testid='foo']"]);
});

test('locate dispatches "xpath" to driver.$ with the value verbatim', () => {
    const driver = fakeDriver();
    locate(driver, { kind: 'xpath', value: '//button' });
    assert.deepEqual(driver.__calls, ['//button']);
});

test('locate dispatches "id" to driver.$ with a "#id" css selector', () => {
    const driver = fakeDriver();
    locate(driver, { kind: 'id', value: 'submit-btn' });
    assert.deepEqual(driver.__calls, ['#submit-btn']);
});

test('locate dispatches "name" to driver.$ with a [name=...] attribute selector', () => {
    const driver = fakeDriver();
    locate(driver, { kind: 'name', value: 'zip' });
    assert.deepEqual(driver.__calls, ['[name="zip"]']);
});

test('locate dispatches "linkText" to driver.$ with the "=" exact-text convention', () => {
    const driver = fakeDriver();
    locate(driver, { kind: 'linkText', value: 'Sign out' });
    assert.deepEqual(driver.__calls, ['=Sign out']);
});

test('locate dispatches "partialLinkText" to driver.$ with the "*=" partial-text convention', () => {
    const driver = fakeDriver();
    locate(driver, { kind: 'partialLinkText', value: 'Sign' });
    assert.deepEqual(driver.__calls, ['*=Sign']);
});

test('locate dispatches "tagName" to driver.$ with the "<tag />" convention', () => {
    const driver = fakeDriver();
    locate(driver, { kind: 'tagName', value: 'button' });
    assert.deepEqual(driver.__calls, ['<button />']);
});
