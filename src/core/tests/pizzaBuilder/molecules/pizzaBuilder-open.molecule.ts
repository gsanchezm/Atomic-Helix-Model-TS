import { sendIntent } from '@kernel/client';
import { logger } from '@utils/logger';
import { INTENT } from '@kernel/intents';
import { openPizzaCard } from '@core/tests/catalog/molecules/catalog-card.molecule';
import { openCatalogScreen } from '@core/tests/catalog/molecules/catalog-browse.molecule';
import type { CountryCode } from '@core/tests/pizzaBuilder/dao/pizzaBuilder.types';
import { seedWebPersistedStores as seedPersistedStores } from '@core/tests/support/browser-command';
import { mobileTestId } from '@core/tests/support/mobile-selector';

const log = logger.child({ layer: 'molecule', domain: 'pizzaBuilder', action: 'open' });

// The customizer is a modal opened from the catalog (PizzaCustomizerModal,
// confirmed by OmniPizza on 2026-05-22 — there is no /customizer URL route).
// Web: wait for `screen-catalog`, click the pizza card, then wait for
// `confirmAddToCartButton` (modal's primary CTA). Mobile retains the deep-
// link path because Appium/mobilewright actually drive a native screen.
const CATALOG_WAIT_TARGET_WEB = 'catalogScreen';
const WAIT_TARGET_WEB = 'confirmAddToCartButton';
// NOTE 2026-06-04: on iOS 1.0.8 the builder modal renders correctly but does
// NOT expose the `~screen-pizza-builder` container id that this gate used
// (30s timeout while the modal is visibly open — verified via failure
// screenshot; other screens DO expose `~screen-<name>`). Re-anchor the
// "builder is open" gate on the confirm CTA `~btn-add-to-cart`, which the
// builder authors verified present on-device (see verifyPriceAndConfirmVisible).
// TODO(verify): confirm on the next @ios run that this recovers the builder
// scenarios; if OmniPizza adds a screen-level id to the iOS modal, prefer it.
function waitTargetMobile(): string {
    return mobileTestId('btn-add-to-cart');
}
const WAIT_TIMEOUT_MS = 30_000;

export type LanguageCode = 'en' | 'es' | 'de' | 'fr' | 'ja' | 'ar';

interface OpenBuilderArgs {
    market: CountryCode;
    language: LanguageCode;
    pizzaId: string;
    itemName: string;
    accessToken: string;
}

/**
 * Lands directly on the pizza-builder screen for the given item, market and
 * language. Atomic, deep-linked entry — mirrors order_success.
 *
 * Web (playwright): NAVIGATE to root (so browser storage has an origin — about:blank
 * throws SecurityError on localStorage access), seed the omnipizza-auth +
 * omnipizza-country Zustand-persisted stores, NAVIGATE to `/catalog`, wait
 * for `screen-catalog`, click the pizza card (`pizza-card-<pizzaId>-<viewport>`)
 * to open the customizer MODAL, wait for the modal's confirm CTA.
 *
 * Mobile (appium / mobilewright): DEEP_LINK to
 * `omnipizza://customizer?item=<pizzaId>&market=<m>&language=<l>`.
 *
 * The `?item=` value (mobile) is the RESOLVED pizza id (looked up by name
 * via `/api/pizzas`), not the human-readable name — so the FE has a stable
 * key. `itemName` is carried only for log/audit purposes.
 */
export async function openPizzaBuilder(args: OpenBuilderArgs): Promise<void> {
    const driver = process.env.DRIVER ?? 'playwright';

    if (driver === 'api') {
        // No UI to open under api — the route's confirm step still POSTs to
        // /api/cart via the DAO, but builder-render assertions self-skip.
        log.info({ driver, pizzaId: args.pizzaId, market: args.market }, 'Builder open no-op (api driver)');
        return;
    }

    if (driver === 'appium' || driver === 'mobilewright') {
        // The mobile app has NO `omnipizza://customizer` deep-link route — the
        // builder is a native screen opened by tapping a catalog card's add
        // ("+") button (verified on-device 2026-05-28: the customizer URI
        // silently falls back to the catalog). So land on the catalog via its
        // deep link, then open the builder for the resolved pizza id exactly
        // as the "open a pizza card" catalog flow does.
        await openCatalogScreen({
            market: args.market,
            language: args.language,
            accessToken: args.accessToken,
        });
        log.info({ market: args.market, language: args.language, pizzaId: args.pizzaId }, 'Opening builder via catalog add button (mobile)');
        await openPizzaCard(args.pizzaId);
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `${waitTargetMobile()}||${WAIT_TIMEOUT_MS}`);
        return;
    }

    if (driver === 'playwright') {
        const baseUrl = process.env.BASE_URL;
        if (!baseUrl) {
            throw new Error('Missing required env var: BASE_URL');
        }
        const root = baseUrl.replace(/\/+$/, '');

        // Prime the origin so the localStorage seed doesn't throw SecurityError
        // on about:blank.
        log.info({ baseUrl: root }, 'Priming origin before localStorage seed');
        await sendIntent(INTENT.NAVIGATE, root);
        await seedPersistedStores({
            market: args.market,
            language: args.language,
            token: args.accessToken,
        });

        // The customizer lives as a modal on /catalog (no URL route). Land
        // on the catalog, wait for it to finish loading, then click the
        // card — opens the PizzaCustomizerModal.
        const catalogUrl = `${root}/catalog`;
        log.info({ market: args.market, language: args.language, pizzaId: args.pizzaId }, 'Navigating to catalog (web) to open customizer modal');
        await sendIntent(INTENT.NAVIGATE, catalogUrl);
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `${CATALOG_WAIT_TARGET_WEB}||${WAIT_TIMEOUT_MS}`);
        await openPizzaCard(args.pizzaId);
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `${WAIT_TARGET_WEB}||${WAIT_TIMEOUT_MS}`);
        return;
    }

    throw new Error(
        `pizzaBuilder feature requires DRIVER in {playwright, mobilewright, appium, api}; got "${driver}".`,
    );
}

// -- builder-rendered assertions ---------------------------------------

const PRESENCE_WAIT_MS = 10_000;

export async function verifySizeAndToppingsRendered(): Promise<void> {
    // Mobile keys read the grouped containers; web reads the testid-prefix
    // queries. WAIT_FOR_ELEMENT asserts attached+visible.
    const driver = process.env.DRIVER ?? 'playwright';
    if (driver === 'playwright') {
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `sizeOptionsList||${PRESENCE_WAIT_MS}`);
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `toppingsList||${PRESENCE_WAIT_MS}`);
        return;
    }
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `sizeOptionsContainer||${PRESENCE_WAIT_MS}`);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `toppingGroupList||${PRESENCE_WAIT_MS}`);
}

export async function verifyPriceAndConfirmVisible(): Promise<void> {
    const driver = process.env.DRIVER ?? 'playwright';
    if (driver === 'playwright') {
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `customizerPriceText||${PRESENCE_WAIT_MS}`);
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `confirmAddToCartButton||${PRESENCE_WAIT_MS}`);
        return;
    }
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `estimatedTotalValue||${PRESENCE_WAIT_MS}`);
    // The mobile builder's confirm CTA is `btn-add-to-cart` (verified
    // on-device 2026-05-28). Assert it's present so "the confirm-add-to-cart
    // affordance is visible" is a real check, not just the price block.
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `${mobileTestId('btn-add-to-cart')}||${PRESENCE_WAIT_MS}`);
}

// Case-insensitive contains assertion against rendered label text.
function assertContainsCaseInsensitive(label: string, actual: string, expected: string): void {
    if (!actual.toLowerCase().includes(expected.toLowerCase())) {
        throw new Error(
            `[${label}] expected text to contain "${expected}", got "${actual}"`,
        );
    }
}

export async function assertSectionLabels(
    sizeSection: string,
    toppingsSection: string,
): Promise<void> {
    const sizeText = await sendIntent(INTENT.READ_TEXT, 'sectionSizeText');
    assertContainsCaseInsensitive('sectionSizeText', (sizeText.payload ?? '').trim(), sizeSection);
    const tText = await sendIntent(INTENT.READ_TEXT, 'sectionToppingsText');
    assertContainsCaseInsensitive('sectionToppingsText', (tText.payload ?? '').trim(), toppingsSection);
}

export async function assertEstimatedTotalLabel(expected: string): Promise<void> {
    const driver = process.env.DRIVER ?? 'playwright';
    // Web exposes the running total via `customizerPriceText`; mobile splits
    // the label and the value across two text nodes. The feature step asserts
    // the LABEL text ("Estimated total" / "Total estimado" / …), so on web —
    // where there is no separate label element — we self-skip.
    if (driver === 'playwright') {
        log.info({ expected }, 'estimatedTotalLabel assertion skipped on web (no separate label node)');
        return;
    }
    const result = await sendIntent(INTENT.READ_TEXT, 'estimatedTotalLabel');
    assertContainsCaseInsensitive('estimatedTotalLabel', (result.payload ?? '').trim(), expected);
}
