// Navbar header-language molecule.
//
// CH is the only market with a header language switcher (DE/FR). The
// navbar.locators.json defines a `languageDEButton` / `languageFRButton`
// pair (desktop web header, and the login screen), a `mobileLanguageDEButton`
// / `mobileLanguageFRButton` pair (the same toggle duplicated inside the
// web-responsive hamburger drawer — the desktop copy sits in a
// `hidden md:flex` container and is never visible below 768px), and a
// `headerLanguageDEButton` / `headerLanguageFRButton` pair specific to the
// native mobile header. We pick the right key by driver + viewport.
//
// The verification step `Then the catalog add-to-cart label reflects "<x>"`
// is intentionally cross-slice: switching the navbar language must drive
// the catalog to re-render with the new translations. Rather than couple
// to a catalog molecule that doesn't yet exist (the catalog slice's
// molecules/ folder is empty), we read the add-to-cart label here.
//
// Implementation notes for that read:
//   - Catalog's `addToCartButton` locator embeds a literal `{id}` token —
//     it's NOT runtime-interpolated; the locator-resolver passes unknown
//     keys through as raw selectors. So we cannot READ_TEXT on the bare
//     key for an arbitrary pizza.
//   - Web (playwright): use a fixed browser command to query a matching add-to-cart
//     button by its `[data-testid^='add-to-cart-']` prefix and read its
//     textContent. This is platform-neutral across markets/pizzas.
//   - Native mobile (appium / mobilewright): the bottom-strip switch
//     fires only on CH scenarios. We bind to a known CH pizza (Marinara,
//     id `marinara` — matches order_success fixtures) by templating the
//     mobile `addToCartLabel` selector ourselves and passing the raw
//     selector through the locator-resolver fallback.

import { sendIntent } from '@kernel/client';
import { logger } from '@utils/logger';
import { INTENT } from '@kernel/intents';
import { getDriver, isApiDriver, isNativeMobileDriver, isWebDriver, isWebResponsive, openMobileMenu } from './navbar-shell.molecule';
import { BROWSER_COMMAND } from '@kernel/browser-command';
import { sendBrowserCommand } from '@core/tests/support/browser-command';
import { mobileTestId } from '@core/tests/support/mobile-selector';

const log = logger.child({ layer: 'molecule', domain: 'navbar', action: 'language' });

const POST_SWITCH_RENDER_WAIT_MS = 8_000;

// CH-only target languages — the header switcher exposes DE and FR.
export type CHLanguageCode = 'de' | 'fr';

// The CH catalog reliably ships Marinara across all OmniPizza markets that
// stock it (see order_success ORDER_FIXTURES). We use it as the witness
// pizza for the post-switch label read on native mobile only.
const CH_WITNESS_PIZZA_ID = 'marinara';

// -- switcher click ---------------------------------------------------

/**
 * Clicks the header language switcher button matching `targetLanguage`.
 *
 * Self-skips on api driver.
 *
 * Locator key selection:
 *   - native mobile: `headerLanguageDEButton` / `headerLanguageFRButton`
 *     (RN's in-app header, distinct from the login-screen switcher).
 *   - web desktop: `languageDEButton` / `languageFRButton` (the navbar
 *     surfaces the same testid set as the login screen).
 *   - web responsive: the toggle is duplicated inside the hamburger drawer
 *     under `mobileLanguageDEButton` / `mobileLanguageFRButton` — open the
 *     drawer first, since the desktop copy is never visible below 768px.
 *
 * Waits briefly for a re-render anchor (`catalogScreen`) after the click
 * so downstream catalog reads don't race the i18n re-flow.
 */
export async function switchHeaderLanguage(targetLanguage: CHLanguageCode): Promise<void> {
    if (isApiDriver()) {
        log.info({ targetLanguage }, 'switchHeaderLanguage skipped (api driver)');
        return;
    }

    if (isWebResponsive()) {
        await openMobileMenu();
    }

    const key = pickLanguageButtonKey(targetLanguage);
    log.info({ targetLanguage, driver: getDriver(), locatorKey: key }, 'Switching header language');
    await sendIntent(INTENT.CLICK, key);
    // The catalog screen stays mounted while i18n re-renders. Wait for the
    // anchor to be present (no-op when it already is) and add a brief
    // settle window so the new translations are committed before the
    // assertion reads them.
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `catalogScreen||${POST_SWITCH_RENDER_WAIT_MS}`);
}

function pickLanguageButtonKey(lang: CHLanguageCode): string {
    if (isNativeMobileDriver()) {
        return lang === 'fr' ? 'headerLanguageFRButton' : 'headerLanguageDEButton';
    }
    if (isWebResponsive()) {
        return lang === 'fr' ? 'mobileLanguageFRButton' : 'mobileLanguageDEButton';
    }
    // Web desktop. The login screen and desktop navbar share `languageDEButton`
    // / `languageFRButton` testids.
    return lang === 'fr' ? 'languageFRButton' : 'languageDEButton';
}

// -- cross-slice catalog assertion ------------------------------------

/**
 * Asserts that the catalog's add-to-cart button label reflects the
 * post-switch language. This is the navbar slice's verification of the
 * language switcher's side effect, kept localized here per the slice
 * design notes (avoids importing a catalog molecule that doesn't exist).
 *
 * Self-skips on api driver.
 */
export async function assertAddToCartLabelReflects(expected: string): Promise<void> {
    if (isApiDriver()) {
        log.info({ expected }, 'assertAddToCartLabelReflects skipped (api driver)');
        return;
    }

    const actual = await readAddToCartLabel();
    if (!actual.toLowerCase().includes(expected.toLowerCase())) {
        throw new Error(
            `[navbar:language] add-to-cart label mismatch — expected to contain "${expected}", ` +
            `got "${actual}" (driver=${getDriver()}).`,
        );
    }
}

const MODAL_OPEN_WAIT_MS = 15_000;
/** How long to keep re-reading the catalog after a language switch re-render. */
const CATALOG_REREAD_POLL_MS = 15_000;

async function readAddToCartLabel(): Promise<string> {
    if (isWebDriver()) {
        // The catalog's per-card "+" button is icon-only (no text, no
        // aria-label — by design, OmniPizza confirmed 2026-05-24). The
        // localized "Add to cart" / "Hinzufügen" / "Ajouter" string lives on
        // the customizer modal's primary CTA (`[data-testid='confirm-add-to-cart']`).
        // Open the modal on the first card, read the label, then close it
        // so the visual snapshot bucket captures the catalog and not a
        // leftover modal.
        const pizzaId = await firstCatalogPizzaIdOrEmpty();
        // Returning '' here made the caller report `expected "Ajouter", got ""`,
        // which reads as a translation bug in the app when it is really "the
        // catalog never re-rendered". Name the actual condition.
        if (!pizzaId) {
            throw new Error(
                '[navbar:language] no catalog cards after the language switch — ' +
                `no [data-testid^='add-to-cart-'] element within ${CATALOG_REREAD_POLL_MS}ms, ` +
                'so the add-to-cart label could not be read at all.',
            );
        }

        const viewport = (process.env.VIEWPORT ?? 'desktop').toLowerCase();
        const suffix = viewport === 'responsive' ? 'responsive' : 'desktop';
        await sendIntent(INTENT.CLICK, `[data-testid='add-to-cart-${pizzaId}-${suffix}']`);
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `confirmAddToCartButton||${MODAL_OPEN_WAIT_MS}`);
        const result = await sendIntent(INTENT.READ_TEXT, 'confirmAddToCartButton');
        const label = (result.payload ?? '').trim();
        // Close best-effort: dedicated close button if it exists, else Escape.
        await sendIntent(INTENT.CLICK, 'closeBuilderButton').catch(async () => {
            await sendBrowserCommand(BROWSER_COMMAND.DISPATCH_ESCAPE)
                .catch(() => { /* best-effort */ });
        });
        return label;
    }

    if (isNativeMobileDriver()) {
        // The locator file's `addToCartLabel` mobile selector is
        // `~text-add-pizza-{id}` — `{id}` is literal, not interpolated by
        // the resolver. Build the raw accessibility-id locally and pass
        // it through; locator-resolver passes unknown keys/raw selectors
        // through with a warning.
        const rawSelector = mobileTestId(`text-add-pizza-${CH_WITNESS_PIZZA_ID}`);
        const result = await sendIntent(INTENT.READ_TEXT, rawSelector);
        return (result.payload ?? '').trim();
    }

    // Shouldn't reach here — api was already short-circuited.
    return '';
}

async function firstCatalogPizzaIdOrEmpty(): Promise<string> {
    // The language switch re-renders the catalog: `catalogScreen` (the
    // container `switchHeaderLanguage` waits on) can be present again before
    // the per-pizza cards have re-mounted, so a bare command here races the
    // i18n re-flow and reads zero cards → '' → the assertion fails with an
    // empty label. Wait for at least one add-to-cart button to re-appear
    // first. Best-effort: a genuine absence still falls through to '' so the
    // caller's contract (return '' when there's no catalog) is preserved.
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `[data-testid^='add-to-cart-']||${MODAL_OPEN_WAIT_MS}`)
        .catch((err: unknown) => {
            // Do NOT discard this. When the catalog never comes back, this
            // rejection is the only description of why, and the caller can
            // otherwise only report an empty label — which is exactly what made
            // this failure masquerade as a translation mismatch for two runs.
            log.warn(
                { err: (err as Error)?.message },
                'add-to-cart wait rejected; polling for the catalog anyway',
            );
        });
    // The wait and the read are two separate round trips, so a re-render landing
    // in between still yielded ''. Poll the read instead of taking it single-shot:
    // whichever half of the race we lose, a later poll picks the catalog up once
    // its cards have re-mounted. A genuine absence still returns '' at the
    // deadline, preserving the caller's contract.
    const deadline = Date.now() + CATALOG_REREAD_POLL_MS;
    for (;;) {
        const result = await sendBrowserCommand(BROWSER_COMMAND.GET_FIRST_PIZZA_ID);
        const pizzaId = (result.payload ?? '').trim();
        if (pizzaId || Date.now() >= deadline) return pizzaId;
        await new Promise((r) => setTimeout(r, 100));
    }
}
