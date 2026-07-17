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

/** Translate a parsed strategy into WebdriverIO's documented selector-string
 *  conventions (https://webdriver.io/docs/selectors). `css`/`xpath` pass the
 *  value straight through — WebdriverIO's own selector engine already
 *  understands both natively. The remaining kinds are dispatched explicitly
 *  rather than relying on driver.$()/$$() to re-guess the intent. Exported
 *  (rather than inlined in `locate`) so single-element and multi-element
 *  lookups (e.g. ReadText's `driver.$$()` fan-out) share one mapping. */
export function toSelector(strategy: WebdriverioLocatorStrategy): string {
    switch (strategy.kind) {
        case 'css': return strategy.value;
        case 'xpath': return strategy.value;
        case 'id': return `#${strategy.value}`;
        case 'name': return `[name="${strategy.value}"]`;
        case 'linkText': return `=${strategy.value}`;
        case 'partialLinkText': return `*=${strategy.value}`;
        case 'tagName': return `<${strategy.value} />`;
    }
}

/** Apply a parsed strategy against the session, returning a single
 *  WebdriverIO element (first match only) via `driver.$()`. Used by every
 *  action handler except ReadText, which fans out over *all* matches via
 *  `driver.$$()` instead — see WebDriverIOLocator's `toSelector` above. */
export function locate(driver: Browser, strategy: WebdriverioLocatorStrategy): ChainablePromiseElement {
    return driver.$(toSelector(strategy));
}
