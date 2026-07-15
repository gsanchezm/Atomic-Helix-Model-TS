import { sendIntent } from '@kernel/client';
import { logger } from '@utils/logger';
import { INTENT } from '@kernel/intents';
import type { CountryCode } from '@core/tests/checkout/dao/checkout.types';
import { seedWebPersistedStores as seedPersistedStores } from '@core/tests/support/browser-command';

const log = logger.child({ layer: 'molecule', domain: 'order_success' });

export type LanguageCode = 'en' | 'es' | 'de' | 'fr' | 'ja' | 'ar';

const SUCCESS_SCREEN_WAIT_MS = 90_000;
const PRESENCE_WAIT_MS = 8_000;

// -- entry --------------------------------------------------------------

interface OpenSuccessArgs {
    market: CountryCode;
    language: LanguageCode;
    accessToken: string;
    orderId: string;
}

/**
 * Lands directly on the order-success screen.
 *
 * Mobile (appium / mobilewright): deep link `omnipizza://order-success?...`.
 * `useDeepLinkParams.ts` reads `orderId` and fires
 * `orderService.getOrder(orderId).then(setLastOrder)` so the screen hydrates
 * its data without going through the checkout UI.
 *
 * Web (playwright): seeds Zustand-persisted localStorage (auth + country)
 * so `ProtectedRoute` lets us through and the UI renders in the chosen
 * language, then navigates to `/order-success?orderId=...`. The page's
 * useEffect (OrderSuccess.jsx) fetches the order via the same backend
 * endpoint and calls `useOrderStore.setLastOrder(data)`.
 */
export async function openOrderSuccess(args: OpenSuccessArgs): Promise<void> {
    const driver = process.env.DRIVER ?? 'playwright';

    if (driver === 'appium' || driver === 'mobilewright') {
        const params = new URLSearchParams({
            orderId: args.orderId,
            accessToken: args.accessToken,
            market: args.market,
        });
        if (needsLangParam(args.market, args.language)) {
            params.set('lang', args.language);
        }
        const url = `omnipizza://order-success?${params.toString()}`;
        log.info({ market: args.market, language: args.language }, 'Deep linking to order-success');
        await sendIntent(INTENT.DEEP_LINK, url);
        return;
    }

    if (driver === 'playwright') {
        const baseUrl = process.env.BASE_URL;
        if (!baseUrl) {
            throw new Error('Missing required env var: BASE_URL');
        }
        const root = baseUrl.replace(/\/+$/, '');
        // Playwright starts on about:blank which has no localStorage scope —
        // Browser storage is unavailable there. Navigate to the app's root
        // first so the seed command runs in the right origin,
        // then navigate to /order-success with the orderId.
        log.info({ baseUrl: root }, 'Priming origin before localStorage seed');
        await sendIntent(INTENT.NAVIGATE, root);
        await seedPersistedStores({
            market: args.market,
            language: args.language,
            token: args.accessToken,
        });
        const url = `${root}/order-success?orderId=${encodeURIComponent(args.orderId)}`;
        log.info({ market: args.market, language: args.language }, 'Navigating to order-success (web)');
        await sendIntent(INTENT.NAVIGATE, url);
        return;
    }

    throw new Error(
        `order_success feature requires DRIVER in {playwright, mobilewright, appium}; got "${driver}". ` +
        `The success screen is UI-only; api driver cannot satisfy the assertions.`,
    );
}

// -- wait + presence ---------------------------------------------------

/**
 * Waits for the order-success screen to render. 90 s budget mirrors
 * checkout-order.molecule.ts: covers Render free-tier cold start plus
 * RN's navigation transition. On iOS the locator key resolves to
 * `~btn-order-details` because XCUI reports the RN wrapper itself as
 * invisible (see comment block in checkout-order.molecule.ts).
 */
export async function waitForSuccessScreen(): Promise<void> {
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `orderSuccessScreen||${SUCCESS_SCREEN_WAIT_MS}`);
}

export async function verifyLiveTrackingBadgeVisible(): Promise<void> {
    // Mobile has a dedicated badge container; web only the inner text.
    const key = process.env.DRIVER === 'playwright' ? 'liveTrackingText' : 'liveBadgeContainer';
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `${key}||${PRESENCE_WAIT_MS}`);
}

export async function verifyEstimatedDeliveryTimeVisible(): Promise<void> {
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `timeEstimateText||${PRESENCE_WAIT_MS}`);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `minLabelText||${PRESENCE_WAIT_MS}`);
}

export async function verifyCourierCardVisible(): Promise<void> {
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `courierInfoContainer||${PRESENCE_WAIT_MS}`);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `courierNameText||${PRESENCE_WAIT_MS}`);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `courierVehicleText||${PRESENCE_WAIT_MS}`);
}

export async function verifyViewOrderDetailsButtonVisible(): Promise<void> {
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `viewOrderDetailsButton||${PRESENCE_WAIT_MS}`);
}

// -- text assertions (case-insensitive contains) -----------------------

function assertContainsCaseInsensitive(label: string, actual: string, expected: string): void {
    if (!actual.toLowerCase().includes(expected.toLowerCase())) {
        throw new Error(
            `[${label}] expected text to contain "${expected}", got "${actual}"`,
        );
    }
}

export async function assertStatusTitleContains(expected: string): Promise<void> {
    // Web renders the title as the page's <h1> (orderSuccessTitle); mobile
    // exposes it as text-status-title (statusTitleText). Both render
    // t("outForDelivery"), but the locator keys differ to keep the locator
    // file aligned with each platform's testid surface.
    const key = process.env.DRIVER === 'playwright' ? 'orderSuccessTitle' : 'statusTitleText';
    const result = await sendIntent(INTENT.READ_TEXT, key);
    assertContainsCaseInsensitive('statusTitle', (result.payload ?? '').trim(), expected);
}

export async function assertOrderDetailsLabelContains(expected: string): Promise<void> {
    // The order-details label renders conditionally on `lastOrder` (web:
    // OrderSuccess.jsx wraps it in `{order && ...}`; mobile shows the same
    // affordance once useDeepLinkParams resolves the orderId fetch). Wait
    // for the element before reading so we don't race the hydration.
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `orderDetailsLabel||${PRESENCE_WAIT_MS}`);
    await sendIntent(INTENT.CLICK, 'viewOrderDetailsButton');
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `orderDetailsPanel||${PRESENCE_WAIT_MS}`);
    const result = await sendIntent(INTENT.READ_TEXT, 'orderDetailsLabel');
    assertContainsCaseInsensitive('orderDetailsLabel', (result.payload ?? '').trim(), expected);
}

// -- helpers -----------------------------------------------------------

function needsLangParam(market: CountryCode, lang: LanguageCode): boolean {
    // useDeepLinkParams.ts only honors lang=de|fr (CH-only override). For
    // other markets the language is set by setCountry on the mobile side
    // (MARKET_LANG mapping in useAppStore.ts), so we omit the param.
    return market === 'CH' && (lang === 'de' || lang === 'fr');
}
