import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';
import type { CountryCode } from '@core/tests/checkout/dao/checkout.types';
import { BROWSER_COMMAND } from '@kernel/browser-command';
import {
    seedWebPersistedStores as seedPersistedStores,
    sendBrowserCommand,
} from '@core/tests/support/browser-command';
import { mobileTestId } from '@core/tests/support/mobile-selector';

const log = logger.child({ layer: 'molecule', action: 'catalog-browse' });

// The catalog screen is the post-login landing page on web. We seed the
// Zustand-persisted localStorage keys (`omnipizza-auth`, `omnipizza-country`,
// plus the loose `token`/`countryCode`/`chLang` entries the app reads
// imperatively) and then NAVIGATE to BASE_URL. Mirrors the order-success
// seedWebPersistedStores pattern (see order-success-screen.molecule.ts).
// Mobile path is a deep link with `accessToken` + `market` (+ `lang` for CH).
const CATALOG_WAIT_TARGET = 'catalogScreen';
// Sized to absorb a Render free-tier cold start that slipped past the BeforeAll
// warm-up (see support/warm-up.ts). The 30s ceiling used to undercut the 600s
// per-step budget in catalog.steps.ts and was the proximate cause of the
// catalog-browse cold-start flake on 2026-05-27.
const CATALOG_WAIT_TIMEOUT_MS = 90_000;

export type LanguageCode = 'en' | 'es' | 'de' | 'fr' | 'ja' | 'ar';

interface OpenCatalogArgs {
    market: CountryCode;
    language: LanguageCode;
    accessToken: string;
}

/**
 * Lands directly on the catalog screen.
 *
 * Driver dispatch:
 *  - api: no-op (the route uses CatalogDao to assert against the API surface
 *    instead of the UI).
 *  - appium / mobilewright: deep link `omnipizza://catalog?...` carrying the
 *    market + language + token. The app's deep-link handler hydrates the
 *    Zustand auth + country stores from the params, then navigates to the
 *    catalog tab. CH needs an explicit `lang` param because that's the only
 *    market with a runtime language picker (verified via login slice).
 *  - playwright: seed localStorage + NAVIGATE to BASE_URL. The SPA's
 *    post-login home view IS the catalog, so the root path is the right
 *    landing target.
 */
export async function openCatalogScreen(args: OpenCatalogArgs): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();

    if (driver === 'api') {
        log.info({ market: args.market, language: args.language }, 'Catalog open no-op (api driver)');
        return;
    }

    if (driver === 'appium' || driver === 'mobilewright') {
        const params = new URLSearchParams({
            market: args.market,
            accessToken: args.accessToken,
        });
        if (needsLangParam(args.market, args.language)) {
            params.set('lang', args.language);
        }
        const url = `omnipizza://catalog?${params.toString()}`;
        log.info({ market: args.market, language: args.language }, 'Deep linking to catalog');
        await sendIntent(INTENT.DEEP_LINK, url);
        await sendIntent(
            INTENT.WAIT_FOR_ELEMENT,
            `${CATALOG_WAIT_TARGET}||${CATALOG_WAIT_TIMEOUT_MS}`,
        );
        return;
    }

    // playwright
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
        throw new Error('Missing required env var: BASE_URL');
    }
    const root = baseUrl.replace(/\/+$/, '');

    // Prime the origin before seeding localStorage — about:blank has no
    // localStorage scope (browser commands throw SecurityError there). Same dance
    // the order_success slice runs through.
    log.info({ baseUrl: root }, 'Priming origin before localStorage seed');
    await sendIntent(INTENT.NAVIGATE, root);
    await seedPersistedStores({
        market: args.market,
        language: args.language,
        token: args.accessToken,
    });

    // After seeding, navigate again so the boot-time hydration picks up the
    // freshly-written stores. The catalog renders on this second navigation.
    log.info({ market: args.market, language: args.language }, 'Navigating to catalog (web)');
    await sendIntent(INTENT.NAVIGATE, root);
    await sendIntent(
        INTENT.WAIT_FOR_ELEMENT,
        `${CATALOG_WAIT_TARGET}||${CATALOG_WAIT_TIMEOUT_MS}`,
    );
}

/**
 * Asserts that the catalog screen rendered. Used by the "catalog is fully
 * displayed" Then step.
 */
export async function assertCatalogDisplayed(): Promise<void> {
    await sendIntent(
        INTENT.WAIT_FOR_ELEMENT,
        `${CATALOG_WAIT_TARGET}||${CATALOG_WAIT_TIMEOUT_MS}`,
    );
}

/**
 * Reads the JSON-serialized list of currently-rendered pizza card names off
 * the DOM. Used by the "only pizzas containing X" / "only category X" Then
 * steps so the assertion can compare against a structured set rather than a
 * single text blob.
 *
 * The script reads every `[data-testid^='pizza-name-']` element's text. The
 * locator JSON describes the same pattern via `pizzaName` / `pizzaCardList`,
 * but the resolver returns a raw selector for a `pizzaCard` key (not the
 * substituted form), so the molecule shapes the query inline. Mobile path
 * uses an equivalent UiSelector + iOS class-chain probe; the route gates
 * mobile out via the UI driver check.
 */
// Demo backend pizza id space (p01..p12). Used as the probe set on mobile
// when the route doesn't pass the cached ids — the catalog has a stable,
// small id range so this stays cheap.
const DEFAULT_PIZZA_IDS = Array.from({ length: 12 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);

export async function readVisiblePizzaNames(candidateIds?: string[]): Promise<string[]> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'api') {
        // The route handles api-driver assertions via CatalogDao; this
        // molecule never gets called on that path. Defensive return.
        return [];
    }
    if (driver === 'appium' || driver === 'mobilewright') {
        // Mobile carries each name via `~text-pizza-name-{id}`. There's no
        // list-by-pattern intent, so probe the candidate ids (the cached
        // catalog ids when the route passes them, else the p01..p12 range)
        // and collect the ones currently in the accessibility tree. RN
        // virtualizes the grid, so this returns the on-screen subset — which
        // is exactly "what's visible" for the narrowing/containment checks.
        const ids = candidateIds && candidateIds.length ? candidateIds : DEFAULT_PIZZA_IDS;
        const names: string[] = [];
        for (const id of ids) {
            const r = await sendIntent(INTENT.READ_TEXT, mobileTestId(`text-pizza-name-${id.toLowerCase()}`))
                .catch(() => null);
            const t = (r?.payload ?? '').trim();
            if (t) names.push(t);
        }
        return names;
    }
    const result = await sendBrowserCommand(BROWSER_COMMAND.GET_VISIBLE_PIZZA_NAMES);
    try {
        const parsed = JSON.parse(result.payload ?? '[]');
        return Array.isArray(parsed) ? parsed.map((s) => String(s)) : [];
    } catch {
        return [];
    }
}

/**
 * Asserts the localized add-to-cart label is visible on at least one pizza
 * card. The locator key `addToCartLabel` is mobile-only (the web cards
 * embed the label inside the `addToCartButton`), so the assertion picks the
 * appropriate strategy at runtime.
 */
export async function assertAddToCartLabelVisible(label: string): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'appium' || driver === 'mobilewright') {
        // Mobile catalog cards show a "+" icon (`~btn-add-pizza-{id}`), not a
        // text label. The localized add-to-cart label lives on the builder's
        // primary CTA (`~text-add-to-cart`) — exactly as the web path reads
        // it off the customizer modal. Open the builder for the first pizza,
        // read the CTA label, assert, then close. Verified on-device
        // 2026-05-28 the CTA is correctly localized (en "Add to Cart" /
        // es "Agregar" / de "Hinzufügen" / fr "Ajouter").
        await sendIntent(INTENT.CLICK, mobileTestId('btn-add-pizza-p01'));
        await sendIntent(INTENT.WAIT_FOR_ELEMENT, `${mobileTestId('text-add-to-cart')}||${CATALOG_WAIT_TIMEOUT_MS}`);
        const read = await sendIntent(INTENT.READ_TEXT, mobileTestId('text-add-to-cart'));
        const actual = (read.payload ?? '').trim();
        await sendIntent(INTENT.CLICK, mobileTestId('btn-close-builder')).catch(() => { /* best-effort close */ });
        if (!actual.toLowerCase().includes(label.trim().toLowerCase())) {
            throw new Error(
                `[catalog] add-to-cart label "${label}" not found on the builder CTA — got "${actual}".`,
            );
        }
        return;
    }
    // Web: the per-card add-to-cart control is an icon-only "+" button (no
    // text node, no aria-label — by design, confirmed by OmniPizza on
    // 2026-05-24). The localized "Add to cart" / "Agregar" / "Hinzufügen" /
    // "Ajouter" / "追加" string lives on the customizer modal's primary CTA
    // (`[data-testid='confirm-add-to-cart']`). To verify the label we have
    // to open the modal — pick the first visible pizza card, click it, read
    // the modal's button text, assert, then close the modal so the visual
    // After hook captures the catalog and not a leftover modal.
    // testid shape is add-to-cart-<id>-<viewport> — strip both ends.
    const idResult = await sendBrowserCommand(BROWSER_COMMAND.GET_FIRST_PIZZA_ID);
    const pizzaId = (idResult.payload ?? '').trim();
    if (!pizzaId) {
        throw new Error(
            '[catalog] no pizza card found to open — addToCartLabel assertion needs at least one rendered card.',
        );
    }

    await openPizzaCardById(pizzaId);
    await sendIntent(INTENT.WAIT_FOR_ELEMENT, `confirmAddToCartButton||${CATALOG_WAIT_TIMEOUT_MS}`);

    const readResult = await sendIntent(INTENT.READ_TEXT, 'confirmAddToCartButton');
    const actual = (readResult.payload ?? '').trim();
    const wanted = label.trim();

    // Close the modal before returning so the next assertion / visual snapshot
    // doesn't see a leftover overlay. Try the dedicated close button first;
    // if that testid isn't present, dispatch an Escape key as a fallback
    // (the OmniPizza modal binds Escape → close). Both are best-effort —
    // the assertion result is what matters and the next scenario re-NAVIGATEs.
    await sendIntent(INTENT.CLICK, 'closeBuilderButton').catch(async () => {
        await sendBrowserCommand(BROWSER_COMMAND.DISPATCH_ESCAPE)
            .catch(() => { /* best-effort */ });
    });

    if (!actual.includes(wanted)) {
        throw new Error(
            `[catalog] add-to-cart label "${wanted}" not found on confirm-add-to-cart button. ` +
            `Modal button text: "${actual}".`,
        );
    }
}

// Click the catalog card's "+" button by pizza id. Inlined here (rather than
// importing from catalog-card.molecule) to keep this molecule callable from
// the catalog feature's "label visible" Then step without a circular import.
async function openPizzaCardById(id: string): Promise<void> {
    const viewport = (process.env.VIEWPORT ?? 'desktop').toLowerCase();
    const suffix = viewport === 'responsive' ? 'responsive' : 'desktop';
    await sendIntent(INTENT.CLICK, `[data-testid='add-to-cart-${id}-${suffix}']`);
}

/**
 * Asserts the localized section title (e.g. "Pizzas", "Pizzen", "ピザ") is
 * visible. The `sectionTitleText` locator is mobile-only in the contract
 * (the web layout doesn't expose a single section header testid), so on
 * web we probe the document for the heading text directly.
 */
export async function assertSectionTitle(title: string): Promise<void> {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver === 'appium' || driver === 'mobilewright') {
        // The mobile catalog has no dedicated section-title node; the
        // localized pizza term surfaces on the "All" category pill
        // (`~text-category-all`: "All Pizza" / "Todas las Pizzas" /
        // "Alle Pizzen" / "すべてのピザ"). Assert that pill carries the
        // localized title (case-insensitive; tolerate singular/plural so
        // "Pizzas" matches "All Pizza"). Verified on-device 2026-05-28.
        const read = await sendIntent(INTENT.READ_TEXT, mobileTestId('text-category-all'));
        const actual = (read.payload ?? '').trim().toLowerCase();
        const wanted = title.trim().toLowerCase();
        if (!actual.includes(wanted) && !actual.includes(wanted.replace(/s$/, ''))) {
            throw new Error(
                `[catalog] localized section title "${title}" not found on the All-category pill — got "${read.payload}".`,
            );
        }
        return;
    }
    // Web: scan all headings for the localized text.
    const result = await sendBrowserCommand(BROWSER_COMMAND.HAS_HEADING_TEXT, { text: title });
    if ((result.payload ?? '').trim() !== 'true') {
        throw new Error(`[catalog] section title "${title}" not found in any heading`);
    }
}

// -- helpers ----------------------------------------------------------------

function needsLangParam(market: CountryCode, lang: LanguageCode): boolean {
    // CH is the only market that exposes a runtime language picker (DE/FR);
    // other markets carry an implicit locale derived from `market` alone.
    // Mirrors the rule in order-success-screen.molecule.ts.
    return market === 'CH' && (lang === 'de' || lang === 'fr');
}
