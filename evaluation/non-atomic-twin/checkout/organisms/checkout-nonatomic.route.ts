import { UsersDataSource } from '@core/test-data/users.data-source';
import { LoginDao } from '@core/tests/login/dao/login.dao';
import { CheckoutDao } from '@core/tests/checkout/dao/checkout.dao';
import { LoginRoute } from '@core/tests/login/organisms/login.route';
import {
    CheckoutRoute,
    type DeliveryAddress,
    type ContactDetails,
} from '@core/tests/checkout/organisms/checkout.route';
import type { CountryCode } from '@core/tests/checkout/dao/checkout.types';
import { logger } from '@utils/logger';
import {
    readPizzaBuilderDraft,
    type JourneyWorldShape,
} from '../../pizzaBuilder/organisms/pizzaBuilder-nonatomic.route';

const log = logger.child({ layer: 'route', domain: 'non-atomic-twin-checkout' });

// EVALUATION ARTIFACT — see ../../README.md and
// docs/paper/atomic-testing-formal-definition.md §8.2-8.4. Pairs 1:1 with
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
     * Disclosed plumbing exception: submitCredentials() does not populate
     * world.auth.token (it's a UI-only flow — see login-session.molecule's
     * own comment). The catalog/checkout DAOs used across this journey need
     * a bearer token for pizza-id resolution and cart read-back, exactly
     * like the atomic reference suites also require even on their own
     * UI-driver legs (CatalogRoute.browseCatalog throws without one). So
     * this method makes one direct LoginDao.login() call purely to obtain
     * that token — NOT a second, hidden precondition-establishment path;
     * the user is already authenticated by the UI click above. It is
     * bookkeeping, not setup. See the paper's §8.3 and this artifact's
     * README.md.
     */
    async loginViaUi(userAlias: string): Promise<void> {
        await this.loginRoute.loginAs(userAlias);

        const user = await this.users.getUser(userAlias);
        const loginResponse = await this.loginDao.login({
            username: user.username,
            email: user.email,
            password: user.password,
        });
        const token = this.loginDao.extractToken(loginResponse);
        if (!token) {
            throw new Error(`Journey: plumbing token fetch failed for "${userAlias}".`);
        }
        if (!this.world.auth) {
            throw new Error('Journey: loginRoute.loginAs() did not populate world.auth as expected.');
        }
        this.world.auth = { ...this.world.auth, token };
    }

    // -- connective glue (disclosed) ---------------------------------------

    /**
     * Assembles world.orderContext from what the catalog/pizzaBuilder
     * slices' UI-driven cart building already produced, instead of
     * CheckoutRoute.addToOrder()'s API $S_0$ injection. The
     * CheckoutDao.getCart() call here is a READ-BACK of state the UI's
     * confirmAddToCart() click already wrote server-side, not an injection —
     * it mirrors exactly what the atomic addToOrder() itself does after its
     * own POST ("POST only stores IDs; GET enriches with unit_price and
     * pizza object").
     */
    async prepareCheckoutContext(market: string): Promise<void> {
        const draft = readPizzaBuilderDraft(this.world);
        const { token } = this.requireAuth();
        const countryCode = market.toUpperCase() as CountryCode;

        const countries = await this.checkoutDao.getCountries();
        const country = countries.find((c) => c.code === countryCode);
        if (!country) {
            throw new Error(`Journey: unsupported market "${countryCode}".`);
        }

        const cart = await this.checkoutDao.getCart({ token, countryCode });
        const cartItems = cart.cart_items ?? [];

        this.world.orderContext = {
            market: countryCode,
            countryInfo: country,
            availableLanguages: country.languages,
            requiredFields: country.required_fields,
            currency: country.currency,
            currencySymbol: country.currency_symbol,
            item: draft.itemName,
            size: draft.size ?? '',
            qty: 1,
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

    // -- checkout (reused as-is) --------------------------------------------
    //
    // fillDelivery/selectPayment/enterCard/verifyOrderAccepted are the
    // atomic suite's OWN behavior under test (filling the delivery form,
    // submitting), not a precondition, so they are intentionally NOT
    // transformed. Note fillDelivery() internally calls
    // injectBrowserSession() (a CheckoutRoute implementation detail,
    // unchanged here) even though this journey's browser is already
    // authenticated via the real UI login above; that is a harmless,
    // pre-existing side effect of reusing CheckoutRoute as-is, not a new
    // violation introduced by this class.

    async fillDelivery(address: DeliveryAddress, contact: ContactDetails): Promise<void> {
        await this.checkoutRoute.fillDelivery(address, contact);
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
