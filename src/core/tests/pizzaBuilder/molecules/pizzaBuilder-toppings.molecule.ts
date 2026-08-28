import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';
import { mobileTestId } from '@core/tests/support/mobile-selector';

const log = logger.child({ layer: 'molecule', domain: 'pizzaBuilder', action: 'toppings' });

function isMobileDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'appium' || driver === 'mobilewright';
}

// Topping ids in the feature carry latin-letter accents (e.g. jalapeño) and
// the FE catalog uses snake_case ids (mozzarella, black_olives, …). Slug to
// a stable testid-safe form: strip diacritics + lower-case, but preserve
// underscores AND hyphens so the slug matches the FE's `topping-<it.id>`
// attribute verbatim for both kebab and snake-cased ids.
function slugify(value: string): string {
    return value
        .normalize('NFD')
        // Strip combining diacritical marks (U+0300–U+036F) so "jalapeño"
        // collapses to "jalapeno" before the testid lookup.
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function toppingButtonSelector(topping: string): string {
    const slug = slugify(topping);
    return isMobileDriver()
        ? mobileTestId(`btn-topping-${slug}`)
        : `[data-testid='topping-${slug}']`;
}

/**
 * Parses the feature's comma-separated topping list and returns trimmed
 * non-empty values. Exposed for the route so the api driver can populate
 * its `/api/cart` payload with the same parsing rules.
 */
export function parseToppings(commaSeparated: string): string[] {
    return commaSeparated
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
}

export async function addToppings(commaSeparated: string): Promise<string[]> {
    const driver = process.env.DRIVER ?? 'playwright';
    const toppings = parseToppings(commaSeparated);
    if (driver === 'api') {
        log.info({ toppings, driver }, 'addToppings no-op (api driver)');
        return toppings;
    }
    for (const topping of toppings) {
        log.info({ topping, driver }, 'Adding topping');
        // NOT a WAIT_FOR_ELEMENT-then-CLICK pair — tried that 2026-08-27 after a twin-android dispatch
        // hit "element wasn't found" on this exact click (root cause: a genuine timing race, not a
        // deterministic defect — the atomic suite's identical operation passed in the same CI run).
        // The "fix" was itself a regression, caught by a follow-up smoke dispatch: WaitForElementAction
        // (src/plugins/appium/actions/WaitForElement.ts) only polls `waitForDisplayed`, with no
        // scrolling — but the topping buttons are below the fold on Android and only get scrolled into
        // view by CLICK's own internal `scrollIntoViewSafe` (src/plugins/appium/actions/Click.ts).
        // Waiting for "displayed" before anything has scrolled the element into view timed out 100% of
        // the time (6/6 atomic scenarios, ~16/16 twin rows) — turning a rare race into a deterministic
        // failure. Reverted. The remaining mitigation is chaos-proxy.ts's TRANSIENT_SIGNATURE_REGEX
        // widening (kept — it's a passive retry classifier, doesn't have this scroll-ordering problem)
        // plus CLICK's own existing scroll-then-click flow, which is what actually handles this element
        // correctly. If the race recurs, fix it inside CLICK/scrollIntoViewSafe (platform-aware scroll
        // logic), not by adding a passive wait in front of an element that needs an active scroll.
        await sendIntent(INTENT.CLICK, toppingButtonSelector(topping));
    }
    return toppings;
}

const PRICE_PRESENCE_MS = 5_000;

/**
 * Asserts the customizer total renders after toppings are added. Same
 * pragmatic assertion as the size step — without a known price formula,
 * the contract is "the total text exists and is non-empty"; a stricter
 * arithmetic check lives in the visual / contract layer.
 */
export async function assertTotalReflectsToppings(
    size: string,
    commaSeparated: string,
): Promise<void> {
    const driver = process.env.DRIVER ?? 'playwright';
    if (driver === 'api') {
        log.info({ size, toppings: commaSeparated, driver }, 'assertTotalReflectsToppings no-op (api driver)');
        return;
    }
    const key = driver === 'playwright' ? 'customizerPriceText' : 'estimatedTotalValue';
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `${key}||${PRICE_PRESENCE_MS}`);
    const result = await sendIntent(INTENT.READ_TEXT, key);
    const text = (result.payload ?? '').trim();
    if (!text) {
        throw new Error(
            `[${key}] empty after toppings — size "${size}", toppings "${commaSeparated}".`,
        );
    }
    log.info({ size, toppings: commaSeparated, total: text }, 'Total reflected toppings');
}
