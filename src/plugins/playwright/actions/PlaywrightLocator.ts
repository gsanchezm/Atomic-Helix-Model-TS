import type { Locator, Page } from 'playwright';

export type PlaywrightLocatorStrategy =
    | { kind: 'testId'; value: string }
    | { kind: 'role'; value: string; name?: string; exact?: boolean }
    | { kind: 'text'; value: string; exact?: boolean }
    | { kind: 'label'; value: string; exact?: boolean }
    | { kind: 'placeholder'; value: string; exact?: boolean }
    | { kind: 'altText'; value: string; exact?: boolean }
    | { kind: 'title'; value: string; exact?: boolean }
    | { kind: 'css'; value: string }
    | { kind: 'xpath'; value: string };

function parseJsonLocator(target: string): PlaywrightLocatorStrategy | undefined {
    if (!target.startsWith('{')) return undefined;

    try {
        const parsed = JSON.parse(target) as PlaywrightLocatorStrategy;
        if (!parsed || typeof parsed !== 'object' || !('kind' in parsed) || !('value' in parsed)) {
            return undefined;
        }
        return parsed;
    } catch {
        return undefined;
    }
}

/** Parse a resolved target string into a structured locator strategy.
 *  - `{"kind":"testId","value":"..."}` JSON — structured `wright`-family locator.
 *  - anything else — raw CSS selector (legacy shape / webdriver-family passthrough).
 */
export function parseLocator(target: string): PlaywrightLocatorStrategy {
    return parseJsonLocator(target) ?? { kind: 'css', value: target };
}

/** Apply a parsed strategy against the page, returning a Locator. */
export function locate(page: Page, strategy: PlaywrightLocatorStrategy): Locator {
    switch (strategy.kind) {
        case 'testId': return page.getByTestId(strategy.value);
        case 'role': return page.getByRole(strategy.value as Parameters<Page['getByRole']>[0], { name: strategy.name, exact: strategy.exact });
        case 'text': return page.getByText(strategy.value, { exact: strategy.exact });
        case 'label': return page.getByLabel(strategy.value, { exact: strategy.exact });
        case 'placeholder': return page.getByPlaceholder(strategy.value, { exact: strategy.exact });
        case 'altText': return page.getByAltText(strategy.value, { exact: strategy.exact });
        case 'title': return page.getByTitle(strategy.value, { exact: strategy.exact });
        case 'xpath': return page.locator(`xpath=${strategy.value}`);
        case 'css': return page.locator(strategy.value);
    }
}
