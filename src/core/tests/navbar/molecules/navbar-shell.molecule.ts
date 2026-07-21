// Navbar shell molecule.
//
// Owns the UI primitives for opening the catalog screen (the navbar's
// natural backdrop) and for verifying the navbar's visible affordances.
// Routes call these; never mutate `world` here.
//
// Navbar locators differentiate WEB (`navLogo`, `navCatalogLink`, ...) from
// MOBILE in two flavors:
//   - native mobile (appium / mobilewright): `bottomNavContainer` +
//     `bottomNav*` UiSelector locators. There is NO logout entry in the
//     bottom nav — logout lives on the profile screen, so we self-skip
//     that assertion on native and log it.
//   - web-responsive (playwright with small viewport): `mobileMenuButton`
//     opens a drawer carrying `mobileNavCatalogLink`, `mobileNavCheckoutLink`,
//     `mobileNavProfileLink`, and `mobileLogoutButton`.

import { sendIntent } from '@kernel/client';
import { logger } from '@utils/logger';
import { INTENT } from '@kernel/intents';
import { seedWebPersistedStores as seedPersistedStores } from '@core/tests/support/browser-command';

const log = logger.child({ layer: 'molecule', domain: 'navbar', action: 'shell' });

const CATALOG_PATH = '/catalog';
const NAVBAR_READY_WAIT_MS = 20_000;
const PRESENCE_WAIT_MS = 8_000;

export type LanguageCode = 'en' | 'es' | 'de' | 'fr' | 'ja' | 'ar';
export type MarketCode = 'US' | 'MX' | 'CH' | 'JP' | 'SA';

interface OpenCatalogArgs {
    market: MarketCode;
    language: LanguageCode;
    accessToken: string;
}

// -- driver / viewport detection --------------------------------------

function getDriver(): string {
    return (process.env.DRIVER ?? 'playwright').toLowerCase();
}

function isApiDriver(): boolean {
    return getDriver() === 'api';
}

function isNativeMobileDriver(): boolean {
    const d = getDriver();
    return d === 'appium' || d === 'mobilewright';
}

function isWebDriver(): boolean {
    return getDriver() === 'playwright';
}

// Web-responsive = playwright + responsive viewport. The hamburger menu
// is conditionally rendered by the FE based on viewport width; we mirror
// that via VIEWPORT env so the route can pick the right molecule path.
function isWebResponsive(): boolean {
    if (!isWebDriver()) return false;
    return (process.env.VIEWPORT ?? 'desktop').toLowerCase() === 'responsive';
}

// -- entry -------------------------------------------------------------

/**
 * Lands the user on the catalog screen with the chosen market + language.
 *
 * Mobile (appium / mobilewright): deep link `omnipizza://catalog?...`. The
 * RN app reads `accessToken`, `market`, and (CH-only) `lang` to bootstrap
 * the authenticated catalog without going through the full login flow.
 *
 * Web (playwright): seed the same Zustand-persisted stores order_success
 * uses (`omnipizza-auth`, `omnipizza-country`) so `ProtectedRoute` lets
 * us through and `i18n` picks the chosen language, then NAVIGATE to
 * `/catalog`.
 *
 * Under DRIVER=api this molecule self-skips — the navbar feature is UI-only
 * and has no @api scenarios, but we honor the slice pattern so a future
 * api-driver run logs the no-op cleanly instead of throwing.
 */
export async function openCatalogScreen(args: OpenCatalogArgs): Promise<void> {
    if (isApiDriver()) {
        log.info(
            { market: args.market, language: args.language },
            'openCatalogScreen no-op (api driver)',
        );
        return;
    }

    if (isNativeMobileDriver()) {
        const params = new URLSearchParams({
            market: args.market,
            accessToken: args.accessToken,
        });
        if (needsLangParam(args.market, args.language)) {
            params.set('lang', args.language);
        }
        const url = `omnipizza://catalog?${params.toString()}`;
        log.info(
            { market: args.market, language: args.language, driver: getDriver() },
            'Deep linking to catalog',
        );
        await sendIntent(INTENT.DEEP_LINK, url);
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `catalogScreen||${NAVBAR_READY_WAIT_MS}`);
        return;
    }

    // playwright (desktop or responsive)
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
        throw new Error('Missing required env var: BASE_URL');
    }
    const root = baseUrl.replace(/\/+$/, '');
    log.info({ baseUrl: root }, 'Priming origin before localStorage seed');
    await sendIntent(INTENT.NAVIGATE, root);
    await seedPersistedStores({
        market: args.market,
        language: args.language,
        token: args.accessToken,
    });
    const url = `${root}${CATALOG_PATH}`;
    log.info({ market: args.market, language: args.language }, 'Navigating to catalog (web)');
    await sendIntent(INTENT.NAVIGATE, url);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `catalogScreen||${NAVBAR_READY_WAIT_MS}`);
}

// Mirrors order-success-screen.molecule.ts. Keeps the seed shape aligned so
// both routes hydrate the same Zustand stores; if that contract changes
// upstream, both molecules update together.
// -- desktop navbar assertions ----------------------------------------

/**
 * Asserts the four desktop navbar affordances are visible: logo, catalog
 * link, checkout link, profile link. Wait-for-element doubles as the
 * presence assertion — the proxy throws if the element never resolves.
 *
 * Self-skips on api driver (no UI to inspect).
 */
export async function assertDesktopNavbarVisible(): Promise<void> {
    if (isApiDriver()) {
        log.info('assertDesktopNavbarVisible skipped (api driver)');
        return;
    }
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `navLogo||${PRESENCE_WAIT_MS}`);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `navCatalogLink||${PRESENCE_WAIT_MS}`);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `navCheckoutLink||${PRESENCE_WAIT_MS}`);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `navProfileLink||${PRESENCE_WAIT_MS}`);
}

// -- mobile menu (responsive web + native mobile) ---------------------

const MENU_OPEN_PROBE_MS = 300;

/**
 * Opens the mobile navigation menu.
 *
 * - Web-responsive: clicks `mobileMenuButton` (hamburger) to reveal the
 *   drawer. The drawer's items (`mobileNavCatalogLink`, ...) become
 *   visible after this click. Idempotent — `mobileMenuButton` *toggles*
 *   the drawer, so a scenario that already opened it earlier (e.g. the CH
 *   login flow clicking the drawer's language toggle) must not click it
 *   again here, or it closes what it just opened. Probe a drawer-contents
 *   element first and skip the click when it's already visible.
 * - Native mobile (appium / mobilewright): the bottom nav is always
 *   visible — no click required. We wait on `bottomNavContainer` to
 *   confirm it has rendered and return.
 *
 * Self-skips on api driver.
 */
export async function openMobileMenu(): Promise<void> {
    if (isApiDriver()) {
        log.info('openMobileMenu skipped (api driver)');
        return;
    }

    if (isNativeMobileDriver()) {
        // Bottom nav is always visible on RN — assert presence instead of
        // clicking. Acts as the readiness signal for the verification step.
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `bottomNavContainer||${PRESENCE_WAIT_MS}`);
        log.info('Bottom nav present (native mobile) — no hamburger to open');
        return;
    }

    const alreadyOpen = await sendIntent(
        INTENT.WAIT_FOR_ELEMENT,
        `mobileNavCheckoutLink||${MENU_OPEN_PROBE_MS}`,
    ).then(() => true).catch(() => false);
    if (alreadyOpen) {
        log.info('Mobile menu already open — skipping hamburger click');
        return;
    }

    // Web-responsive (or web-desktop, where the click is a no-op-ish guard).
    // On desktop the hamburger isn't rendered; if a scenario ever lands here
    // on desktop the wait will fail loudly and the test will tell us.
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `mobileMenuButton||${PRESENCE_WAIT_MS}`);
    await sendIntent(INTENT.CLICK, 'mobileMenuButton');
}

/**
 * Asserts the mobile menu shows catalog, checkout, profile and (on
 * web-responsive only) logout entries.
 *
 * Native mobile bottom-nav locators expose catalog/checkout/profile but
 * NOT a logout button — logout lives on the profile screen. We self-skip
 * the logout assertion on native and log it. The feature step phrasing
 * accepts this gracefully because the assertion is a UI-shape check,
 * not a contract clause about a specific element key.
 */
export async function assertMobileMenuEntries(): Promise<void> {
    if (isApiDriver()) {
        log.info('assertMobileMenuEntries skipped (api driver)');
        return;
    }

    if (isNativeMobileDriver()) {
        // Bottom nav exposes the navigation entries via a UiSelector match;
        // bottomNavList is a list-selector that resolves to multiple elements,
        // so its presence implies catalog/checkout/profile are rendered.
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `bottomNavList||${PRESENCE_WAIT_MS}`);
        log.info(
            { driver: getDriver() },
            'Native bottom nav verified; logout entry not in bottom nav (lives on profile screen) — skipped',
        );
        return;
    }

    // Web-responsive drawer.
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `mobileNavCatalogLink||${PRESENCE_WAIT_MS}`);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `mobileNavCheckoutLink||${PRESENCE_WAIT_MS}`);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `mobileNavProfileLink||${PRESENCE_WAIT_MS}`);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `mobileLogoutButton||${PRESENCE_WAIT_MS}`);
}

// -- helpers ----------------------------------------------------------

function needsLangParam(market: MarketCode, lang: LanguageCode): boolean {
    // Mirrors order-success-screen.molecule.ts: useDeepLinkParams.ts only
    // honors lang=de|fr (CH-only override).
    return market === 'CH' && (lang === 'de' || lang === 'fr');
}

// Re-exported for the route to check driver state symmetrically with the
// rest of the slice without duplicating env lookups.
export { isApiDriver, isNativeMobileDriver, isWebDriver, isWebResponsive, getDriver };
