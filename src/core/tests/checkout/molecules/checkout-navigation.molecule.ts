import { sendIntent } from '@kernel/client';
import { logger } from '@utils/logger';
import { INTENT } from '@kernel/intents';
import { BROWSER_COMMAND } from '@kernel/browser-command';
import { sendBrowserCommand } from '@core/tests/support/browser-command';

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
        // Step 1: confirm we landed on the checkout screen (empty or loaded)
        // screen-checkout-empty is shown while the cart hydration API call is in flight
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'checkoutScreenLanding||8000');
        // Step 2: wait for cart hydration — screen flips to screen-checkout once API responds
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'checkoutHeader||15000');
        // Step 3: form inputs confirm the checkout form is fully rendered.
        // First scenario of a run hits a cold JS bundle; 20 s absorbs that
        // cold start while still surfacing real regressions quickly on later
        // scenarios where the bundle is already warm.
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, 'streetInput||20000');
        log.info({ market }, 'Deep linked to checkout screen (atomic mobile path)');
        return;
    }

    // Web path: navigate via URL
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
        throw new Error('Missing required env var: BASE_URL');
    }
    await sendIntent(INTENT.NAVIGATE, `${baseUrl}${CHECKOUT_PATH}`);

    const diagnostics = await sendBrowserCommand(BROWSER_COMMAND.GET_CHECKOUT_DIAGNOSTICS);
    log.info(JSON.parse(diagnostics.payload || '{}'), 'Checkout page loaded');
}
