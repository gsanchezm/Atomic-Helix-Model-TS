import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

test('parseLocator treats a plain string as a raw css strategy (backward-compatible default)', () => {
    assert.deepEqual(parseLocator("[data-testid='foo']"), { kind: 'css', value: "[data-testid='foo']" });
});

test('parseLocator treats CSS containing colons as raw css, not JSON', () => {
    assert.deepEqual(parseLocator('h1:has-text("Checkout")'), { kind: 'css', value: 'h1:has-text("Checkout")' });
});

test('parseLocator parses a JSON {kind,value} target', () => {
    assert.deepEqual(parseLocator('{"kind":"testId","value":"logout-btn"}'), { kind: 'testId', value: 'logout-btn' });
});

test('parseLocator parses a JSON target with extra options', () => {
    assert.deepEqual(
        parseLocator('{"kind":"role","value":"button","name":"Submit","exact":true}'),
        { kind: 'role', value: 'button', name: 'Submit', exact: true },
    );
});

function fakePage() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const locatorStub = { __calls: calls };
    const page: any = { __calls: calls };
    for (const method of ['getByTestId', 'getByRole', 'getByText', 'getByLabel', 'getByPlaceholder', 'getByAltText', 'getByTitle', 'locator']) {
        page[method] = (...args: unknown[]) => {
            calls.push({ method, args });
            return locatorStub;
        };
    }
    return page;
}

test('locate dispatches "testId" to page.getByTestId', () => {
    const page = fakePage();
    locate(page, { kind: 'testId', value: 'logout-btn' });
    assert.deepEqual(page.__calls, [{ method: 'getByTestId', args: ['logout-btn'] }]);
});

test('locate dispatches "role" to page.getByRole with name/exact options', () => {
    const page = fakePage();
    locate(page, { kind: 'role', value: 'button', name: 'Submit', exact: true });
    assert.deepEqual(page.__calls, [{ method: 'getByRole', args: ['button', { name: 'Submit', exact: true }] }]);
});

test('locate dispatches "text" to page.getByText', () => {
    const page = fakePage();
    locate(page, { kind: 'text', value: 'Checkout', exact: false });
    assert.deepEqual(page.__calls, [{ method: 'getByText', args: ['Checkout', { exact: false }] }]);
});

test('locate dispatches "label" to page.getByLabel', () => {
    const page = fakePage();
    locate(page, { kind: 'label', value: 'Username' });
    assert.deepEqual(page.__calls, [{ method: 'getByLabel', args: ['Username', { exact: undefined }] }]);
});

test('locate dispatches "placeholder" to page.getByPlaceholder', () => {
    const page = fakePage();
    locate(page, { kind: 'placeholder', value: 'Enter zip' });
    assert.deepEqual(page.__calls, [{ method: 'getByPlaceholder', args: ['Enter zip', { exact: undefined }] }]);
});

test('locate dispatches "altText" to page.getByAltText', () => {
    const page = fakePage();
    locate(page, { kind: 'altText', value: 'Logo' });
    assert.deepEqual(page.__calls, [{ method: 'getByAltText', args: ['Logo', { exact: undefined }] }]);
});

test('locate dispatches "title" to page.getByTitle', () => {
    const page = fakePage();
    locate(page, { kind: 'title', value: 'Close' });
    assert.deepEqual(page.__calls, [{ method: 'getByTitle', args: ['Close', { exact: undefined }] }]);
});

test('locate dispatches "css" to page.locator', () => {
    const page = fakePage();
    locate(page, { kind: 'css', value: "[data-testid='foo']" });
    assert.deepEqual(page.__calls, [{ method: 'locator', args: ["[data-testid='foo']"] }]);
});

test('locate dispatches "xpath" to page.locator with an xpath= prefix', () => {
    const page = fakePage();
    locate(page, { kind: 'xpath', value: '//button' });
    assert.deepEqual(page.__calls, [{ method: 'locator', args: ['xpath=//button'] }]);
});
