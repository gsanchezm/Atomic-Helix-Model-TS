import type { Browser, ChainablePromiseElement } from 'webdriverio';

export type WebdriverioLocatorStrategy =
    | { kind: 'css'; value: string }
    | { kind: 'xpath'; value: string }
    | { kind: 'id'; value: string }
    | { kind: 'name'; value: string }
    | { kind: 'linkText'; value: string }
    | { kind: 'partialLinkText'; value: string }
    | { kind: 'tagName'; value: string };

const PREFIX_KINDS: ReadonlyArray<[string, WebdriverioLocatorStrategy['kind']]> = [
    ['id=', 'id'],
    ['name=', 'name'],
    ['link=', 'linkText'],
    ['plink=', 'partialLinkText'],
    ['tag=', 'tagName'],
];

/** Parse a resolved `webdriver`-family target (always a raw string — this
 *  family carries no JSON/{kind,value} shape, unlike the `wright` family
 *  Playwright/mobilewright read) into a classified locator strategy.
 *  - `//...` / `(//...` — xpath.
 *  - `id=`/`name=`/`link=`/`plink=`/`tag=` — explicit strategy prefixes,
 *    mirroring Appium's own `~`/`android=`/`-ios ` prefix convention one
 *    level up (a native WebDriver web session has no accessibility-id or
 *    UiSelector concept, so those two don't apply here).
 *  - anything else — raw CSS selector (the overwhelming common case, and
 *    the default for backward compatibility with unclassified strings).
 */
export function parseLocator(target: string): WebdriverioLocatorStrategy {
    if (target.startsWith('//') || target.startsWith('(//')) {
        return { kind: 'xpath', value: target };
    }
    for (const [prefix, kind] of PREFIX_KINDS) {
        if (target.startsWith(prefix)) {
            return { kind, value: target.slice(prefix.length) };
        }
    }
    return { kind: 'css', value: target };
}

/** Apply a parsed strategy against the session, returning a WebdriverIO
 *  element. `css`/`xpath` pass the value straight to `driver.$()` — WebdriverIO's
 *  own selector engine already understands both natively. The remaining
 *  kinds translate into WebdriverIO's documented selector-string
 *  conventions (https://webdriver.io/docs/selectors) so each is dispatched
 *  explicitly rather than relying on driver.$() to re-guess the intent. */
export function locate(driver: Browser, strategy: WebdriverioLocatorStrategy): ChainablePromiseElement {
    switch (strategy.kind) {
        case 'css': return driver.$(strategy.value);
        case 'xpath': return driver.$(strategy.value);
        case 'id': return driver.$(`#${strategy.value}`);
        case 'name': return driver.$(`[name="${strategy.value}"]`);
        case 'linkText': return driver.$(`=${strategy.value}`);
        case 'partialLinkText': return driver.$(`*=${strategy.value}`);
        case 'tagName': return driver.$(`<${strategy.value} />`);
    }
}
