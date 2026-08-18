import { sendIntent } from '@kernel/client';
import { logger } from '@utils/logger';
import { INTENT } from '@kernel/intents';
import { BROWSER_COMMAND } from '@kernel/browser-command';
import { sendBrowserCommand } from '@core/tests/support/browser-command';
import { isWebResponsive, openMobileMenu } from '@core/tests/navbar/molecules/navbar-shell.molecule';

const log = logger.child({ layer: 'molecule', action: 'navigation' });
const CHECKOUT_PATH = '/checkout';

export async function navigateToCheckout(market?: string, accessToken?: string): Promise<void> {
    const driver = process.env.DRIVER ?? 'playwright';

    // Atomic mobile path: deep link directly to the checkout screen, bypassing the
    // full user journey (Login → Catalog → PizzaBuilder). The app hydrates the cart
    // from the backend via hydrateCart=true; market sets the country context;
    // accessToken seeds the Zustand auth store via useDeepLinkParams.
    if (driver === 'appium' || driver === 'mobilewright') {
        const params = new URLSearchParams({ hydrateCart: 'true' });
        if (market) params.set('market', market);
        if (accessToken) params.set('accessToken', accessToken);
        await sendIntent(INTENT.DEEP_LINK, `omnipizza://checkout?${params.toString()}`);
        if (driver === 'appium') {
            // Step 1 (appium only): confirm we landed on the checkout screen
            // (empty or loaded) — screen-checkout-empty is shown while the
            // cart hydration API call is in flight. `checkoutScreenLanding`
            // is an either/or of two testIds (text-cart-empty OR
            // text-section-address), expressed via an Appium UiSelector/
            // predicate regex; mobilewright's single-value testId locator
            // can't express that alternation and has no entry for this key
            // by design (see checkout-locators.test.ts). Step 2 below already
            // covers the "landed on the loaded form" signal for mobilewright,
            // just without this fast, empty-cart-aware early exit.
            await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'checkoutScreenLanding||8000');
        }
        // Step 2: wait for cart hydration — screen flips to screen-checkout once API responds
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'checkoutHeader||15000');
        // Step 3 (appium only): form inputs confirm the checkout form is
        // fully rendered. `streetInput` likewise has no mobilewright entry
        // (checkout-locators.test.ts) — the mobile checkout form's street
        // field isn't yet mapped for the mobilewright driver.
        if (driver === 'appium') {
            // First scenario of a run hits a cold JS bundle; 20 s absorbs that
            // cold start while still surfacing real regressions quickly on later
            // scenarios where the bundle is already warm.
            await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'streetInput||20000');
        }
        log.info({ market }, 'Deep linked to checkout screen (atomic mobile path)');
        return;
    }

    // Web path: a hard NAVIGATE straight to `${baseUrl}/checkout` always
    // bounced back to /catalog, even with a fully-seeded and already-hydrated
    // session (confirmed via GET_CHECKOUT_DIAGNOSTICS immediately beforehand
    // showing valid auth/nav state) — this app only enters the checkout view
    // correctly via client-side routing, not a direct/hard load of that URL.
    // So: land on root via NAVIGATE (same as the catalog path), wait for the
    // authenticated shell to render, then CLICK the real in-app nav link.
    //
    // On web-responsive the desktop nav link is off-screen/hidden behind the
    // hamburger drawer (same viewport-conditional shell navbar-shell.molecule
    // already handles) — open the mobile menu and use its checkout entry
    // instead of clicking the invisible desktop link.
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
        throw new Error('Missing required env var: BASE_URL');
    }
    await sendIntent(INTENT.NAVIGATE, baseUrl);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'navLogo||20000');
    if (isWebResponsive()) {
        await openMobileMenu();
        await sendIntent(INTENT.CLICK, 'mobileNavCheckoutLink');
    } else {
        await sendIntent(INTENT.CLICK, 'navCheckoutLink');
    }
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'streetInput||20000');

    const diagnostics = await sendBrowserCommand(BROWSER_COMMAND.GET_CHECKOUT_DIAGNOSTICS);
    log.info(JSON.parse(diagnostics.payload || '{}'), 'Checkout page loaded');
}
