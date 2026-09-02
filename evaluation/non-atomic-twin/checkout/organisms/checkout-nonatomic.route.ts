import { UsersDataSource } from '@core/test-data/users.data-source';
import { LoginDao } from '@core/tests/login/dao/login.dao';
import { CheckoutDao } from '@core/tests/checkout/dao/checkout.dao';
import { LoginRoute } from '@core/tests/login/organisms/login.route';
import {
    CheckoutRoute,
    pickZipSlot,
    pickSecondaryAddressField,
    type DeliveryAddress,
    type ContactDetails,
} from '@core/tests/checkout/organisms/checkout.route';
import { navigateToCheckout } from '@core/tests/checkout/molecules/checkout-navigation.molecule';
import { fillDeliveryAddress, fillContactInfo } from '@core/tests/checkout/molecules/checkout-address.molecule';
import type { CountryCode, CartItemResponse } from '@core/tests/checkout/dao/checkout.types';
import { logger } from '@utils/logger';
import { sendBrowserCommand } from '@core/tests/support/browser-command';
import { BROWSER_COMMAND } from '@kernel/browser-command';
import {
    readPizzaBuilderDraft,
    type JourneyWorldShape,
} from '../../pizzaBuilder/organisms/pizzaBuilder-nonatomic.route';

const log = logger.child({ layer: 'route', domain: 'non-atomic-twin-checkout' });

// EVALUATION ARTIFACT — see ../../README.md and
// docs/paper/atomic-testing-formal-definition.md §3.2/§4. Pairs 1:1 with
// src/core/tests/checkout/organisms/checkout.route.ts.
//
// Owns the journey's login steps too — mirroring the atomic reference
// suite's OWN precedent: checkout.steps.ts already registers "the OmniPizza
// user is logged in as ..." and catalog/pizzaBuilder's Backgrounds reuse it
// via cucumber's global step registry (see catalog.steps.ts's comment). This
// is why there is no separate "login" slice under evaluation/non-atomic-twin/
// — login here is precondition plumbing for the journey's terminus
// (checkout), exactly as it already is, structurally, in the atomic suites.
export class CheckoutNonAtomicRoute {
    private readonly users: UsersDataSource;
    private readonly loginDao: LoginDao;
    private readonly checkoutDao: CheckoutDao;
    private readonly loginRoute: LoginRoute;
    private readonly checkoutRoute: CheckoutRoute;

    constructor(private readonly world: JourneyWorldShape) {
        this.users = new UsersDataSource();
        this.loginDao = new LoginDao();
        this.checkoutDao = new CheckoutDao();
        this.loginRoute = new LoginRoute(this.world);
        this.checkoutRoute = new CheckoutRoute(this.world);
    }

    // -- login (R3 target) ------------------------------------------------

    async openLoginScreen(): Promise<void> {
        await this.loginRoute.openLoginScreen();
    }

    /**
     * Real UI form submission (LoginRoute.loginAs's non-api branch calls
     * login-session.molecule's submitCredentials — an actual click-through,
     * not LoginDao.login()). This IS the R3 fix for the precondition shared
     * by catalog/pizzaBuilder/checkout in the atomic suites.
     *
     * ROOT-CAUSE CORRECTION (2026-07-23, first live smoke run): this used to
     * make an independent LoginDao.login() call to obtain a bearer token,
     * on the assumption that was harmless bookkeeping ("the user is already
     * authenticated by the UI click above"). That assumption was false and
     * broke every run: /api/auth/login issues a NEW, independent backend
     * session each call, with its own empty cart — unrelated to the real
     * session the UI form submission just established (and whose cart the
     * pizzaBuilder UI steps had just populated). Using that second token
     * downstream (prepareCheckoutContext's getCart, and the checkout page
     * itself post-navigation) read/seeded the WRONG, empty-cart session and
     * the app fell back to the login screen — reproduced and confirmed via
     * failure screenshot.
     *
     * Fix: read the REAL session's token back out of the browser's own
     * `omnipizza-auth` localStorage entry (the same Zustand-persisted key
     * the app itself writes on a real login — see
     * SEED_CHECKOUT_SESSION/SEED_PERSISTED_STORES's matching shape) instead
     * of minting a second session. Playwright/web only: mobile drivers have
     * no persisted browser storage to read back from (Zustand is ephemeral
     * on React Native — see injectBrowserSession's own comment), so they
     * still fall back to a fresh API login. That fallback carries the same
     * empty-cart risk on mobile and is unverified — flagged for whoever
     * builds the Mobilewright leg (see
     * docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md).
     */
    async loginViaUi(userAlias: string): Promise<void> {
        await this.loginRoute.loginAs(userAlias);

        const user = await this.users.getUser(userAlias);
        let token: string | undefined;

        if ((process.env.DRIVER ?? 'playwright') === 'playwright') {
            const raw = await sendBrowserCommand(BROWSER_COMMAND.GET_LOCAL_STORAGE_ITEM, {
                key: 'omnipizza-auth',
            });
            const parsed = raw.payload ? (JSON.parse(raw.payload) as { state?: { token?: string } }) : undefined;
            token = parsed?.state?.token;
            if (!token) {
                throw new Error(
                    `Journey: could not read back the real session token from "omnipizza-auth" for "${userAlias}" after UI login.`,
                );
            }
        } else {
            const loginResponse = await this.loginDao.login({
                username: user.username,
                email: user.email,
                password: user.password,
            });
            token = this.loginDao.extractToken(loginResponse);
            if (!token) {
                throw new Error(`Journey: plumbing token fetch failed for "${userAlias}".`);
            }
        }

        if (!this.world.auth) {
            throw new Error('Journey: loginRoute.loginAs() did not populate world.auth as expected.');
        }
        this.world.auth = { ...this.world.auth, token };
    }

    // -- connective glue (disclosed) ---------------------------------------

    /**
     * Assembles world.orderContext from what the catalog/pizzaBuilder
     * slices' UI-driven cart building already produced.
     *
     * ROOT-CAUSE CORRECTION (2026-07-23, first live smoke run): this used to
     * read the cart via CheckoutDao.getCart() (the atomic suite's API), on
     * the assumption it was a read-back of state the UI's confirmAddToCart()
     * click had already written server-side — mirroring atomic addToOrder()'s
     * own POST-then-GET pattern. That assumption was false: the real app's
     * "add to cart" click writes ONLY to the browser's client-side,
     * Zustand-persisted `omnipizza-cart` localStorage entry (confirmed by a
     * live read immediately after a real add-to-cart click, which showed a
     * fully populated cart) — it never touches /api/cart at all. So
     * CheckoutDao.getCart() always returned an empty cart here, regardless
     * of which token was used. Fixed by reading `omnipizza-cart` directly;
     * its persisted item shape matches CartItemResponse exactly.
     */
    async prepareCheckoutContext(market: string): Promise<void> {
        const draft = readPizzaBuilderDraft(this.world);
        const countryCode = market.toUpperCase() as CountryCode;

        const countries = await this.checkoutDao.getCountries();
        const country = countries.find((c) => c.code === countryCode);
        if (!country) {
            throw new Error(`Journey: unsupported market "${countryCode}".`);
        }

        const cartItems = await this.readCartItems(countryCode);
        if (!cartItems.length) {
            throw new Error(
                `Journey: cart was empty when preparing checkout context for pizza "${draft.pizzaId}" — the UI add-to-cart step may not have completed.`,
            );
        }

        this.world.orderContext = {
            market: countryCode,
            countryInfo: country,
            availableLanguages: country.languages,
            requiredFields: country.required_fields,
            currency: country.currency,
            currencySymbol: country.currency_symbol,
            item: draft.itemName,
            size: draft.size ?? '',
            qty: cartItems[0]?.quantity ?? 1,
            pizzaId: draft.pizzaId,
            pizzaName: draft.itemName,
            unitPrice: cartItems[0]?.unit_price ?? 0,
            cartItems,
        };

        log.info(
            { market: countryCode, pizzaId: draft.pizzaId, cartItemCount: cartItems.length },
            'Journey checkout context prepared from UI-built cart',
        );
    }

    /**
     * Playwright/web: read the real, UI-built cart back from the browser's
     * own storage (see prepareCheckoutContext's doc comment). Mobile
     * (appium/mobilewright) has no persisted browser storage to read back
     * from (Zustand is ephemeral on React Native), so this used to fall back
     * to CheckoutDao.getCart() on the assumption the UI's add-to-cart tap was
     * a thin wrapper over the same /api/cart the web build uses.
     *
     * ROOT-CAUSE CORRECTION (2026-07-24, first live Mobilewright/Android
     * run): that assumption was false, and the empty cart isn't only a
     * read-back problem here — it's why the checkout SCREEN itself never
     * loads. Verified live: a CLICK on `btn-add-to-cart` completes and
     * returns PASS (confirmed via the mobilewright plugin's own ACTION_END
     * log, durationMs 7731, tap target on-screen and unoccluded per a
     * screencap taken during the click), and CheckoutDao.getCart() still
     * comes back empty immediately after — the mobile app's add-to-cart,
     * like the web build's, never touches /api/cart at all (it's on-device
     * client state, e.g. AsyncStorage, not server-synced). Downstream,
     * navigateToCheckout's mobile path deep-links with `hydrateCart=true`,
     * which makes the app fetch the cart from that same empty /api/cart —
     * so the checkout screen renders its empty-cart variant instead of the
     * address form, and the WAIT_FOR_ELEMENT on `checkoutHeader`
     * (text-section-address) times out. Both symptoms are the same fact:
     * there is no server-side cart for mobile's real UI-driven flow.
     *
     * Fix: mirror the atomic suite's own precondition instead of fighting
     * it — CheckoutRoute.addToOrder() calls this "$S_0$ state injection via
     * API" for exactly this reason (deep-link/hydrateCart-based mobile
     * checkout needs a real backend cart to hydrate from). Seed one here
     * with what the UI steps actually built (the pizza-builder draft has
     * pizzaId/size straight from the real clicks), then re-fetch — same
     * POST-then-GET pattern as addToOrder ("POST only stores IDs; GET
     * enriches with unit_price and pizza object"), so price data comes from
     * the server rather than being fabricated locally. api driver is
     * deliberately left on the original bare getCart() path: its own
     * confirmAddToCart is a no-op today (see pizzaBuilder-confirm.molecule's
     * clickConfirmAddToCart), so seeding a cart there would paper over that
     * gap instead of surfacing it.
     */
    private async readCartItems(countryCode: CountryCode): Promise<CartItemResponse[]> {
        const driver = process.env.DRIVER ?? 'playwright';
        if (driver === 'appium' || driver === 'mobilewright') {
            return this.seedAndReadCartFromDraft(countryCode);
        }
        if (driver !== 'playwright') {
            const { token } = this.requireAuth();
            const cart = await this.checkoutDao.getCart({ token, countryCode });
            return cart.cart_items ?? [];
        }
        const raw = await sendBrowserCommand(BROWSER_COMMAND.GET_LOCAL_STORAGE_ITEM, { key: 'omnipizza-cart' });
        if (!raw.payload) return [];
        const parsed = JSON.parse(raw.payload) as { state?: { items?: CartItemResponse[] } };
        return parsed.state?.items ?? [];
    }

    private async seedAndReadCartFromDraft(countryCode: CountryCode): Promise<CartItemResponse[]> {
        const draft = readPizzaBuilderDraft(this.world);
        const { token } = this.requireAuth();
        await this.checkoutDao.addToCart({
            token,
            countryCode,
            items: [{ pizza_id: draft.pizzaId, size: draft.size ?? '', quantity: 1 }],
        });
        const cart = await this.checkoutDao.getCart({ token, countryCode });
        if (!cart.cart_items?.length) {
            throw new Error(
                `Journey: seeded the backend cart for pizza "${draft.pizzaId}" but the read-back was still empty.`,
            );
        }
        return cart.cart_items;
    }

    // -- checkout --------------------------------------------------------
    //
    // selectPayment/enterCard/verifyOrderAccepted are the atomic suite's OWN
    // behavior under test (filling the delivery form, submitting), not a
    // precondition, so they are reused as-is, unmodified.

    /**
     * NOT a thin pass-through to CheckoutRoute.fillDelivery() (unlike the
     * other checkout methods below) — deliberately re-composed.
     *
     * ROOT-CAUSE CORRECTION (2026-07-23, first live smoke run): the atomic
     * fillDelivery() unconditionally calls injectBrowserSession() before
     * navigating to /checkout. That call exists to BOOTSTRAP a session from
     * nothing for the atomic suite's pure-API precondition path (no browser
     * state exists yet at that point in the atomic flow) — its
     * SEED_CHECKOUT_SESSION implementation deliberately
     * `localStorage.removeItem('omnipizza-cart')` as part of that reset.
     * This journey's browser is NOT starting from nothing: the real UI
     * already persisted a valid session (`omnipizza-auth`) and a real,
     * populated cart (`omnipizza-cart`) before this step ever runs.
     * Calling injectBrowserSession() here deleted that real cart moments
     * before navigating to checkout, leaving the checkout page with no cart
     * under any token — it hung on a loading state and fell back to the
     * login screen (reproduced and confirmed via failure screenshot +
     * live localStorage reads). Fix: reuse navigateToCheckout() (the actual
     * click-through navigation, still needed — a direct hard load of
     * /checkout bounces to /catalog per that molecule's own comment) and
     * the fill molecules, but skip injectBrowserSession() entirely — the
     * real, already-persisted session survives the navigation on its own.
     */
    async fillDelivery(address: DeliveryAddress, contact: ContactDetails): Promise<void> {
        const ctx = this.world.orderContext;
        if (!ctx) throw new Error('Journey: missing order context — run prepareCheckoutContext first.');

        this.world.deliveryAddress = address;
        this.world.contact = contact;

        await navigateToCheckout(ctx.market, this.world.auth?.token);

        const zipSlot = pickZipSlot(ctx.countryInfo, address);
        const secondary = pickSecondaryAddressField(ctx.countryInfo, address);

        await fillDeliveryAddress(address.street, zipSlot, secondary);
        await fillContactInfo(contact.name, contact.phone);
    }

    async selectPayment(method: string): Promise<void> {
        await this.checkoutRoute.selectPayment(method);
    }

    async enterCard(card: string, exp: string, cvv: string): Promise<void> {
        await this.checkoutRoute.enterCard(card, exp, cvv);
    }

    async verifyOrderAccepted(): Promise<void> {
        await this.checkoutRoute.verifyOrderAccepted();
    }

    // -- lifecycle ------------------------------------------------------------

    async resetClientState(): Promise<void> {
        await this.checkoutRoute.resetClientState();
    }

    // -- internals --------------------------------------------------------------

    private requireAuth(): { token: string } {
        const token = this.world.auth?.token;
        if (!token) {
            throw new Error('Journey: missing auth token — run loginViaUi first.');
        }
        return { token };
    }
}
