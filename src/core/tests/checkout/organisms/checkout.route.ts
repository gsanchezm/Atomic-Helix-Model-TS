import { sendIntent } from '@kernel/client';
import { logger } from '@utils/logger';
import { HttpError } from '@plugins/api/http';
import { UsersDataSource } from '@core/test-data/users.data-source';
import { LoginDao } from '@core/tests/login/dao/login.dao';
import { CheckoutDao } from '@core/tests/checkout/dao/checkout.dao';
import type {
    CartItemRequest,
    CartItemResponse,
    CheckoutRequest,
    CheckoutResponse,
    CountryCode,
    CountryInfo,
    Pizza,
} from '@core/tests/checkout/dao/checkout.types';
import {
    injectBrowserSession,
    BrowserSessionState,
} from '@core/tests/checkout/molecules/checkout-session.molecule';
import { navigateToCheckout } from '@core/tests/checkout/molecules/checkout-navigation.molecule';
import {
    fillDeliveryAddress,
    fillContactInfo,
    SecondaryAddressField,
} from '@core/tests/checkout/molecules/checkout-address.molecule';
import {
    selectPaymentMethod,
    fillCardDetails,
} from '@core/tests/checkout/molecules/checkout-payment.molecule';
import {
    placeOrder,
    verifyOrderAccepted as verifyOrderOnUI,
} from '@core/tests/checkout/molecules/checkout-order.molecule';
import { BROWSER_COMMAND } from '@kernel/browser-command';
import { sendBrowserCommand } from '@core/tests/support/browser-command';
import type { CheckoutWorld } from '@core/tests/support/world';
import { INTENT } from '@kernel/intents';
import { AccessibilityContractLoader } from '@core/contracts/accessibility-contract-loader';
import { appendAxeRecord, type AxeRecord } from '@core/tests/support/security-report-writer';

const log = logger.child({ layer: 'route', domain: 'checkout' });

// -- types --

export type Driver = 'playwright' | 'appium' | 'mobilewright' | 'api';

export interface DeliveryAddress {
    street: string;
    zip: string;
    suburb?: string;
}

export interface ContactDetails {
    name: string;
    phone: string;
}

// -- form-field routing tables --
//
// Most markets reuse the zipcode slot for their country-specific primary field.
// SA is deliberately different: district has its own control and must never be
// routed through input-zipcode.
const ZIP_SLOT_PRIMARY_BY_FIELD: Record<string, 'zip' | 'suburb'> = {
    prefectura: 'suburb',
};

// Fields that are rendered alongside the zipcode slot in the checkout form.
// Today only MX's `colonia` lives there. JP's `prefectura` is NOT a secondary
// — it replaces the zip in the single market-specific address slot.
const SECONDARY_ADDRESS_FIELDS = new Set(['colonia', 'district']);

// Backend accepts the literals 'card' / 'cash' / 'paypal' for payment_method;
// features carry the UI label so the same matrix can drive both UI clicks
// and API submissions. This map is the single translation point used by
// the api branch of the route.
export function toApiPaymentMethod(uiLabel: string): 'card' | 'cash' | 'paypal' {
    const v = (uiLabel || '').toLowerCase();
    if (v.includes('paypal')) return 'paypal';
    if (v.includes('cash')) return 'cash';
    return 'card';
}

// -- route --

export class CheckoutRoute {
    private readonly users: UsersDataSource;
    private readonly login: LoginDao;
    private readonly checkout: CheckoutDao;

    constructor(private readonly world: CheckoutWorld) {
        this.users = new UsersDataSource();
        this.login = new LoginDao();
        this.checkout = new CheckoutDao();
    }

    // -- step intents --

    async loginAs(userAlias: string): Promise<void> {
        log.info({ userAlias }, 'Logging in user');
        const user = await this.users.getUser(userAlias);

        const loginResponse = await this.login.login({
            username: user.username,
            email: user.email,
            password: user.password,
        });

        const token = this.login.extractToken(loginResponse);
        if (!token) throw new Error(`Login failed for "${userAlias}". No token received.`);

        log.info({ userAlias, behavior: user.behavior }, 'Login successful');

        this.world.auth = {
            userAlias,
            username: user.username,
            password: user.password,
            behavior: user.behavior,
            token,
            loginResponse,
        };
    }

    async setMarket(market: string): Promise<void> {
        log.info({ market }, 'Selecting market');
        const countries = await this.checkout.getCountries();
        if (!countries?.length) {
            throw new Error('Countries API returned empty response. Verify API_BASE_URL and /api/countries.');
        }

        const country = countries.find((c) => c.code === market);
        if (!country) {
            const supported = countries.map((c) => c.code).join(', ');
            throw new Error(`Unsupported market "${market}". Supported: ${supported}`);
        }
        if (!country.currency || !country.currency_symbol) {
            throw new Error(`Market "${market}" is missing currency configuration.`);
        }

        log.info({ market, requiredFields: country.required_fields }, 'Market selected');

        this.world.orderContext = {
            market: country.code,
            countryInfo: country,
            availableLanguages: country.languages,
            requiredFields: country.required_fields,
            currency: country.currency,
            currencySymbol: country.currency_symbol,
            item: '',
            size: '',
            qty: 0,
            pizzaId: '',
            pizzaName: '',
            unitPrice: 0,
            cartItems: [],
        };
    }

    async addToOrder(item: string, size: string, qty: number): Promise<void> {
        const { token, market } = this.requireAuthAndMarket('order setup');

        const pizza = await this.findPizza(token, market, item);

        // $S_0$ state injection via API (faster than UI cart manipulation).
        await this.checkout.addToCart({
            token,
            countryCode: market,
            items: [{ pizza_id: pizza.id, size, quantity: qty }],
        });

        // POST only stores IDs; GET enriches with unit_price and pizza object.
        const enriched = await this.checkout.getCart({ token, countryCode: market });
        const enrichedItems = enriched.cart_items;

        const ctx = this.world.orderContext!;
        this.world.orderContext = {
            ...ctx,
            item,
            size,
            qty,
            pizzaId: pizza.id,
            pizzaName: pizza.name,
            unitPrice: enrichedItems[0]?.unit_price ?? pizza.price,
            cartItems: enrichedItems,
        };
    }

    async fillDelivery(address: DeliveryAddress, contact: ContactDetails): Promise<void> {
        const { token, market } = this.requireAuthAndMarket('delivery');
        const ctx = this.world.orderContext!;

        log.info({ ...address, ...contact, driver: this.driver }, 'Filling delivery details');

        // Persist for the api branch, which submits via CheckoutDao in verifyOrderAccepted.
        this.world.deliveryAddress = address;
        this.world.contact = contact;

        if (this.driver === 'api') return;

        const auth = this.world.auth!;
        const session: BrowserSessionState = {
            token,
            username: auth.username,
            password: auth.password,
            countryCode: market,
            cartItems: ctx.cartItems,
            countryInfo: ctx.countryInfo,
        };

        // Routes know which plugin runs each leg:
        // - injectBrowserSession: playwright only (mobile/api skip via DRIVER check inside the molecule)
        // - navigateToCheckout / fill*: playwright or appium (chosen by chaos-proxy from DRIVER)
        await injectBrowserSession(session);
        await navigateToCheckout(market, token);

        const zipSlot = this.pickZipSlot(ctx.countryInfo, address);
        const secondary = this.pickSecondaryAddressField(ctx.countryInfo, address);

        await fillDeliveryAddress(address.street, zipSlot, secondary);
        await fillContactInfo(contact.name, contact.phone);
    }

    /**
     * Runs the checkout `*.a11y.json` contract audits against the live
     * page. Mirrors catalog.route.ts's verifyAccessibilityGate exactly:
     * no-ops unless PLUGIN_AXE is enabled and the driver is playwright.
     * Called explicitly as a Then step (not an After hook) so it fires
     * in-sequence before checkout's own After-hook session reset can
     * navigate away.
     */
    async verifyAccessibilityGate(): Promise<void> {
        if (this.driver !== 'playwright' || (process.env.PLUGIN_AXE ?? 'false').toLowerCase() !== 'true') {
            log.info({ driver: this.driver }, 'verifyAccessibilityGate skipped (PLUGIN_AXE off or non-web driver)');
            return;
        }
        const contract = AccessibilityContractLoader.load('checkout');
        const market = this.world.orderContext?.market ?? 'unknown';

        for (const audit of contract.audits) {
            const ruleTags = audit.ruleTags?.length ? audit.ruleTags : contract.defaults?.ruleTags;
            const auditOptions: Record<string, unknown> = {};
            if (ruleTags?.length) auditOptions.tags = ruleTags;
            if (audit.include?.length) auditOptions.include = audit.include;
            if (audit.exclude?.length) auditOptions.exclude = audit.exclude;

            const auditResult = await sendIntent(
                INTENT.RUN_ACCESSIBILITY_AUDIT,
                `checkout||${audit.id}-${market}||${JSON.stringify(auditOptions)}`,
            );

            try {
                appendAxeRecord(JSON.parse(auditResult.payload) as AxeRecord);
            } catch (err) {
                log.warn({ err: (err as Error).message }, 'Failed to persist axe audit record');
            }

            const thresholds = audit.thresholds ?? contract.defaults?.thresholds ?? {};
            await sendIntent(INTENT.VALIDATE_ACCESSIBILITY_THRESHOLDS, JSON.stringify(thresholds));
        }
    }

    async selectPayment(method: string): Promise<void> {
        log.info({ method, driver: this.driver }, 'Selecting payment method');
        this.world.payment = { ...this.world.payment, method };
        if (this.driver === 'api') return;
        await selectPaymentMethod(method);
    }

    async enterCard(card: string, exp: string, cvv: string): Promise<void> {
        log.info({ cardLastFour: card.slice(-4), driver: this.driver }, 'Entering card details');
        this.world.payment = {
            ...this.world.payment,
            method: this.world.payment?.method ?? 'Credit Card',
            cardNumber: card,
            cardExpiry: exp,
            cardCvv: cvv,
        };
        if (this.driver === 'api') return;
        await fillCardDetails(card, exp, cvv, this.world.contact?.name);
    }

    async verifyOrderAccepted(): Promise<void> {
        const country = this.world.orderContext?.countryInfo;
        if (!country) throw new Error('Missing country metadata. Run market step before verification.');

        log.info({ market: country.code, driver: this.driver }, 'Verifying order acceptance');

        if (this.driver === 'api') {
            this.world.checkoutResult = await this.submitOrderViaApi(country);
            return;
        }

        await placeOrder();
        await verifyOrderOnUI(country, this.world.orderContext!.cartItems);
    }

    // -- cart-item management (PUT/DELETE /api/cart/items/{item_id}) --
    //
    // Test-setup infrastructure, same category as addToOrder's addToCart
    // call — no UI surface exists for editing/removing a single cart line
    // (the mobile app's "Remove" button only mutates local Zustand state,
    // never the backend), so these run @api-only.

    /** Upsert one cart line. `conflictingBodyItemId`, when set, proves the
     * backend ignores any item_id in the body — the URL id always wins. */
    async putCartItem(
        itemId: string,
        pizzaName: string,
        size: string,
        qty: number,
        conflictingBodyItemId?: string,
    ): Promise<void> {
        const { token, market } = this.requireAuthAndMarket('put cart item');
        const pizza = await this.findPizza(token, market, pizzaName);

        const item: CartItemRequest = { pizza_id: pizza.id, size, quantity: qty };
        if (conflictingBodyItemId) item.item_id = conflictingBodyItemId;

        try {
            const session = await this.checkout.updateCartItem({ token, itemId, item });
            this.world.cartItemResult = { ok: true, status: 200, session };
        } catch (err) {
            this.recordCartItemError(err);
        }
    }

    async deleteCartItem(itemId: string): Promise<void> {
        const token = this.world.auth?.token;
        if (!token) throw new Error('Missing auth token at "delete cart item" stage. Run login step first.');

        try {
            const session = await this.checkout.removeCartItem({ token, itemId });
            this.world.cartItemResult = { ok: true, status: 200, session };
        } catch (err) {
            this.recordCartItemError(err);
        }
    }

    verifyCartContainsItem(itemId: string, expectedQty: number): void {
        const result = this.world.cartItemResult;
        if (!result?.ok) throw new Error(`Expected a successful cart-item response, got: ${JSON.stringify(result)}`);
        const line = result.session?.cart_items.find((i) => i.item_id === itemId);
        if (!line) throw new Error(`Expected cart to contain item_id "${itemId}". Got: ${JSON.stringify(result.session?.cart_items)}`);
        if (line.quantity !== expectedQty) {
            throw new Error(`Expected item "${itemId}" to have quantity ${expectedQty}, got ${line.quantity}.`);
        }
    }

    verifyCartDoesNotContainItem(itemId: string): void {
        const result = this.world.cartItemResult;
        if (!result?.ok) throw new Error(`Expected a successful cart-item response, got: ${JSON.stringify(result)}`);
        const found = result.session?.cart_items.some((i) => i.item_id === itemId);
        if (found) throw new Error(`Expected cart NOT to contain item_id "${itemId}", but it did.`);
    }

    verifyCartItemRequestStatus(expectedStatus: number): void {
        const result = this.world.cartItemResult;
        if (!result) throw new Error('No cart-item request result recorded. Run a PUT/DELETE step first.');
        if (result.ok) throw new Error(`Expected the cart-item request to fail with status ${expectedStatus}, but it succeeded.`);
        if (result.status !== expectedStatus) {
            throw new Error(`Expected status ${expectedStatus}, got ${result.status} ("${result.message}").`);
        }
    }

    // -- order cancellation (PATCH /api/orders/{order_id}) --
    //
    // Real business capability, but still no UI trigger today (the
    // "Cancel" button in the pre-order confirmation modal just dismisses
    // that modal — it never PATCHes an existing order), so @api-only for
    // now, same reasoning as the cart-item endpoints above.

    /** Places a minimal real order via the API as setup for cancellation
     * scenarios — deliberately bypasses the multi-step UI checkout flow
     * (fillDelivery/selectPayment/etc.) since the behavior under test here
     * is cancellation, not checkout placement. */
    async placeQuickOrder(pizzaName: string, size: string, qty: number): Promise<void> {
        const { token, market } = this.requireAuthAndMarket('order-cancel setup');
        const country = this.world.orderContext!.countryInfo;
        const pizza = await this.findPizza(token, market, pizzaName);

        const body: CheckoutRequest = {
            country_code: market,
            items: [{ pizza_id: pizza.id, size, quantity: qty }],
            name: 'QA Bot',
            address: '123 Test Street',
            phone: '+1 415 555 0199',
            payment_method: 'card',
        };
        this.applyMarketFields(body, country, { zip: '00000', suburb: 'Roma Norte' });

        const result = await this.checkout.placeOrder({ token, countryCode: market, body });
        if (!result.order_id) {
            throw new Error(`API placeOrder rejected the setup order. Response: ${JSON.stringify(result)}`);
        }
        this.world.placedOrderId = result.order_id;
        log.info({ orderId: result.order_id }, 'Order placed as cancellation setup');
    }

    /** Cancels the order set up by placeQuickOrder, as the currently logged-in user. */
    async cancelOrder(): Promise<void> {
        const token = this.world.auth?.token;
        if (!token) throw new Error('Missing auth token at "cancel order" stage. Run login step first.');
        await this.cancelOrderWithToken(this.requirePlacedOrderId(), token);
    }

    /** Cancels the order set up by placeQuickOrder, as a different logged-in
     * user — independent login, does not touch world.auth (the Background's
     * primary user stays logged in for later steps). */
    async cancelOrderAs(userAlias: string): Promise<void> {
        const orderId = this.requirePlacedOrderId();
        const user = await this.users.getUser(userAlias);
        const loginResponse = await this.login.login({
            username: user.username,
            email: user.email,
            password: user.password,
        });
        const token = this.login.extractToken(loginResponse);
        if (!token) throw new Error(`Login failed for "${userAlias}". No token received.`);
        await this.cancelOrderWithToken(orderId, token);
    }

    /** Cancels an explicit order id (e.g. a nonexistent one) as the current user. */
    async cancelOrderById(orderId: string): Promise<void> {
        const token = this.world.auth?.token;
        if (!token) throw new Error('Missing auth token at "cancel order" stage. Run login step first.');
        await this.cancelOrderWithToken(orderId, token);
    }

    verifyOrderStatus(expectedStatus: string): void {
        const result = this.world.orderCancelResult;
        if (!result?.ok) throw new Error(`Expected a successful order-cancel response, got: ${JSON.stringify(result)}`);
        if (result.order?.status !== expectedStatus) {
            throw new Error(`Expected order status "${expectedStatus}", got "${result.order?.status}".`);
        }
    }

    verifyOrderCancelRequestStatus(expectedStatus: number): void {
        const result = this.world.orderCancelResult;
        if (!result) throw new Error('No order-cancel request result recorded. Run a cancel step first.');
        if (result.ok) throw new Error(`Expected the order-cancel request to fail with status ${expectedStatus}, but it succeeded.`);
        if (result.status !== expectedStatus) {
            throw new Error(`Expected status ${expectedStatus}, got ${result.status} ("${result.message}").`);
        }
    }

    // -- lifecycle --

    // Reset strategies dispatched by DRIVER env. Adding a new driver = add an entry,
    // no conditional to extend (Open/Closed).
    private readonly resetStrategies: Record<Driver, () => Promise<void>> = {
        // App auth state lives in Zustand — clear via deep link, which returns to Login.
        'appium': async () => {
            await sendIntent(INTENT.DEEP_LINK, 'omnipizza://login?resetSession=true');
        },
        'mobilewright': async () => {
            await sendIntent(INTENT.DEEP_LINK, 'omnipizza://login?resetSession=true');
        },
        'playwright': async () => {
            const baseUrl = process.env.BASE_URL;
            if (!baseUrl) return; // nothing to navigate to; safe no-op
            await sendBrowserCommand(BROWSER_COMMAND.CLEAR_STORAGE);
            await sendIntent(INTENT.NAVIGATE, baseUrl);
        },
        // No client state to clear for pure API runs.
        'api': async () => { /* noop */ },
    };

    /** Reset client-side state between scenarios. Plugin chosen by DRIVER env. */
    async resetClientState(): Promise<void> {
        await this.resetStrategies[this.driver]();
    }

    // -- internals --

    private get driver(): Driver {
        return (process.env.DRIVER ?? 'playwright') as Driver;
    }

    private requireAuthAndMarket(stage: string): { token: string; market: CountryCode } {
        const token = this.world.auth?.token;
        if (!token) throw new Error(`Missing auth token at "${stage}" stage. Run login step first.`);
        const market = this.world.orderContext?.market;
        if (!market) throw new Error(`Missing market context at "${stage}" stage. Run market step first.`);
        return { token, market };
    }

    // Shared by addToOrder and placeQuickOrder — both need a real, priced
    // pizza id resolved from a human-readable name before writing to the cart
    // or submitting a checkout body.
    private async findPizza(token: string, market: CountryCode, name: string): Promise<Pizza> {
        log.info({ market, item: name }, 'Fetching pizzas');
        const pizzas = await this.checkout.getPizzas({ token, countryCode: market });
        if (!pizzas?.length) {
            throw new Error(`Pizzas API empty for market "${market}". Verify /api/pizzas.`);
        }

        const pizza = pizzas.find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (!pizza) {
            const available = pizzas.map((p) => p.name).join(', ');
            throw new Error(`Pizza "${name}" not found for "${market}". Available: ${available}`);
        }
        if (!pizza.id || pizza.price <= 0) {
            throw new Error(`Pizza "${name}" has invalid data: id="${pizza.id}", price=${pizza.price}`);
        }

        log.info({ pizzaId: pizza.id, pizzaName: pizza.name, price: pizza.price }, 'Pizza selected');
        return pizza;
    }

    // Shared by submitOrderViaApi and placeQuickOrder — maps a generic
    // address into whichever field COUNTRY_CONFIG requires for that market
    // (colonia/prefectura/plz/zip_code/district), plus the market's
    // percentage-tip field, which the backend requires present even when 0.
    private applyMarketFields(
        body: CheckoutRequest,
        country: CountryInfo,
        address: { zip?: string; suburb?: string },
    ): void {
        for (const field of country.required_fields ?? []) {
            if (field === 'colonia')         body.colonia    = address.suburb;
            else if (field === 'prefectura') body.prefectura = address.suburb ?? address.zip;
            else if (field === 'plz')        body.plz        = address.zip;
            else if (field === 'zip_code')   body.zip_code   = address.zip;
            else if (field === 'district')   body.district   = address.suburb ?? address.zip;
        }
        if (country.tip_field) body[country.tip_field] = 0;
    }

    private requirePlacedOrderId(): string {
        const orderId = this.world.placedOrderId;
        if (!orderId) throw new Error('No placed order to cancel. Run the order-setup step first.');
        return orderId;
    }

    private async cancelOrderWithToken(orderId: string, token: string): Promise<void> {
        try {
            const order = await this.checkout.cancelOrder({ token, orderId });
            this.world.orderCancelResult = { ok: true, status: 200, order };
        } catch (err) {
            if (!(err instanceof HttpError)) throw err;
            this.world.orderCancelResult = { ok: false, status: err.status, message: err.message };
        }
    }

    private recordCartItemError(err: unknown): void {
        if (!(err instanceof HttpError)) throw err;
        this.world.cartItemResult = { ok: false, status: err.status, message: err.message };
    }

    // Submit the accumulated checkout state via the DAO. Mirrors the UI path's
    // placeOrder + success-screen wait: a populated `order_id` is the API's
    // analogue of the success screen rendering.
    private async submitOrderViaApi(country: CountryInfo): Promise<CheckoutResponse> {
        const { token, market } = this.requireAuthAndMarket('verifyOrderAccepted (api)');
        const ctx = this.world.orderContext!;
        const address = this.world.deliveryAddress;
        const contact = this.world.contact;
        const payment = this.world.payment;
        if (!address) throw new Error('Missing delivery address — run the fill-delivery step first.');
        if (!contact)  throw new Error('Missing contact info — run the fill-delivery step first.');
        if (!payment?.method) throw new Error('Missing payment method — run the payment step first.');

        // Backend uses a Pydantic Literal["card","cash","paypal"] for payment_method,
        // but features carry the UI label ("Credit Card" / "Cash") since
        // that's what the user sees and clicks. The web frontend translates
        // before POSTing; the API path bypasses the UI, so we replicate
        // the same translation here. Anything not matching maps to "card"
        // as a safe default (the existing matrix only uses these two).
        const body: CheckoutRequest = {
            country_code: market,
            items: [{ pizza_id: ctx.pizzaId, size: ctx.size, quantity: ctx.qty }],
            name: contact.name,
            address: address.street,
            phone: contact.phone,
            payment_method: toApiPaymentMethod(payment.method),
        };

        this.applyMarketFields(body, country, address);

        const isCard = payment.method.toLowerCase().includes('card');
        if (isCard) {
            body.card_number = payment.cardNumber;
            body.card_expiry = payment.cardExpiry;
            body.card_cvv    = payment.cardCvv;
        }

        const result = await this.checkout.placeOrder({ token, countryCode: market, body });
        if (!result.order_id) {
            throw new Error(`API placeOrder rejected the order. Response: ${JSON.stringify(result)}`);
        }
        log.info({
            orderId: result.order_id,
            status: result.status,
            total: result.total,
            currency: result.currency,
        }, 'Order accepted (api driver)');
        return result;
    }

    private pickZipSlot(country: CountryInfo, address: DeliveryAddress): string | undefined {
        return pickZipSlot(country, address);
    }

    private pickSecondaryAddressField(
        country: CountryInfo,
        address: DeliveryAddress,
    ): SecondaryAddressField | undefined {
        return pickSecondaryAddressField(country, address);
    }
}

// Exported standalone (the class methods above delegate to these) so
// evaluation/non-atomic-twin's checkout organism can reuse the exact same
// country-specific field-routing logic without duplicating it.
export function pickZipSlot(country: CountryInfo, address: DeliveryAddress): string | undefined {
    if (country.required_fields.includes('district')) return undefined;
    for (const field of country.required_fields ?? []) {
        const source = ZIP_SLOT_PRIMARY_BY_FIELD[field];
        if (source) return address[source] || undefined;
    }
    return address.zip || undefined;
}

export function pickSecondaryAddressField(
    country: CountryInfo,
    address: DeliveryAddress,
): SecondaryAddressField | undefined {
    const field = country.required_fields.find((f) => SECONDARY_ADDRESS_FIELDS.has(f));
    if (!field) return undefined;
    const value = address.suburb || (field === 'district' ? address.zip : undefined);
    if (!value) return undefined;
    return { locatorKey: `${field}Input`, value };
}
