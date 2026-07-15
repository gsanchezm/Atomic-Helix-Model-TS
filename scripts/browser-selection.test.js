const assert = require('node:assert/strict');
const test = require('node:test');
const { selectedBrowsers } = require('./browser-selection');

test('defaults to all supported browsers', () => {
    assert.deepEqual(selectedBrowsers(''), ['chromium', 'firefox', 'webkit']);
});

test('accepts a deduplicated subset in requested order', () => {
    assert.deepEqual(selectedBrowsers('webkit, chromium,webkit'), ['webkit', 'chromium']);
});

test('rejects unsupported browser names', () => {
    assert.throws(() => selectedBrowsers('chromium,opera'), /Unsupported BROWSERS.*opera/);
});
