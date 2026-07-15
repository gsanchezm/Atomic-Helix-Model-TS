const SUPPORTED_BROWSERS = Object.freeze(['chromium', 'firefox', 'webkit']);

function selectedBrowsers(raw = process.env.BROWSERS) {
    if (!raw || !raw.trim()) return [...SUPPORTED_BROWSERS];

    const requested = [...new Set(raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))];
    const invalid = requested.filter((browser) => !SUPPORTED_BROWSERS.includes(browser));
    if (invalid.length > 0) {
        throw new Error(
            `Unsupported BROWSERS value(s): ${invalid.join(', ')}. `
            + `Expected a comma-separated subset of: ${SUPPORTED_BROWSERS.join(', ')}.`,
        );
    }
    if (requested.length === 0) {
        throw new Error('BROWSERS must contain at least one browser.');
    }
    return requested;
}

module.exports = { SUPPORTED_BROWSERS, selectedBrowsers };
