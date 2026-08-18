import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReadTextAction } from '@plugins/webdriverio/actions/ReadText';

// Fake WebdriverIO element: only the two methods ReadText touches.
function fakeElement(opts: { tagName?: string; text?: string; value?: string }) {
    return {
        getTagName: async () => opts.tagName ?? 'div',
        getText: async () => opts.text ?? '',
        getValue: async () => opts.value ?? '',
    };
}

// Fake driver: records the selector string `$$` was called with (so tests can
// assert `parseLocator`/`toSelector` resolved prefixed targets correctly) and
// resolves to whatever fake elements the test supplies.
function fakeDriver(elements: ReturnType<typeof fakeElement>[]) {
    const calls: string[] = [];
    return {
        __calls: calls,
        $$: (selector: string) => {
            calls.push(selector);
            return { getElements: async () => elements };
        },
    } as any;
}

test('READ_TEXT fans out over every element matching a prefix-style selector and joins with "\\n"', async () => {
    const driver = fakeDriver([
        fakeElement({ tagName: 'span', text: 'Market A' }),
        fakeElement({ tagName: 'span', text: 'Market B' }),
        fakeElement({ tagName: 'span', text: 'Market C' }),
    ]);
    const result = await ReadTextAction.execute({ driver, target: "[data-testid^='market-']" } as any);
    assert.equal(result, 'Market A\nMarket B\nMarket C');
});

test('READ_TEXT reads a form control\'s value instead of its rendered text, per matched element', async () => {
    const driver = fakeDriver([
        fakeElement({ tagName: 'input', value: 'alice', text: 'should-be-ignored' }),
        fakeElement({ tagName: 'span', text: 'Alice Smith' }),
    ]);
    const result = await ReadTextAction.execute({ driver, target: "[data-testid='row']" } as any);
    assert.equal(result, 'alice\nAlice Smith');
});

test('READ_TEXT returns an empty string when the selector matches nothing', async () => {
    const driver = fakeDriver([]);
    const result = await ReadTextAction.execute({ driver, target: "[data-testid='missing']" } as any);
    assert.equal(result, '');
});

test('READ_TEXT resolves a non-css strategy (e.g. "name=") to its fan-out selector before calling driver.$$', async () => {
    const driver = fakeDriver([fakeElement({ tagName: 'input', value: 'zip-value' })]);
    const result = await ReadTextAction.execute({ driver, target: 'name=zip' } as any);
    assert.deepEqual(driver.__calls, ['[name="zip"]']);
    assert.equal(result, 'zip-value');
});
