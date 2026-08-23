import { After, AfterAll, Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import { closeClient, sendIntent } from '@kernel/client';
import { CheckoutRoute } from '@core/tests/checkout/organisms/checkout.route';
import type { CheckoutWorld } from '@core/tests/support/world';
import { INTENT } from '@kernel/intents';

// 10 min covers a cold WDA build on first scenario (~5 min) plus the place-order
// API roundtrip on Render free tier; subsequent scenarios reuse the session.
setDefaultTimeout(600_000);

function route(world: unknown): CheckoutRoute {
    return new CheckoutRoute(world as CheckoutWorld);
}

Given('the OmniPizza user is logged in as {string}', async function (userAlias: string) {
    // Diagnosability harness (build-order step 3): a dispatch targeting a backend/data bucket
    // overrides which seeded chaos user this precondition login authenticates as — see
    // docs/superpowers/specs/2026-08-23-diagnosability-fault-injection-harness-design.md.
    await route(this).loginAs(process.env.DIAGNOSABILITY_CHAOS_USER || userAlias);
});

Given('they are ordering in market {string}', async function (market: string) {
    await route(this).setMarket(market);
});

Given(
    'they have an order with {string} size {string} quantity {int}',
    async function (item: string, size: string, qty: number) {
        await route(this).addToOrder(item, size, qty);
    },
);

When(
    'they provide delivery details {string} {string}, {string} for {string} {string}',
    async function (street: string, zip: string, suburb: string, name: string, phone: string) {
        await route(this).fillDelivery(
            { street, zip, suburb: suburb || undefined },
            { name, phone },
        );
    },
);

When('they choose payment method {string}', async function (method: string) {
    await route(this).selectPayment(method);
});

When(
    'they enter card details {string} expiration {string} cvv {string}',
    async function (card: string, exp: string, cvv: string) {
        await route(this).enterCard(card, exp, cvv);
    },
);

Then('the order is accepted', async function () {
    await route(this).verifyOrderAccepted();
});

// -- cart-item management (PUT/DELETE /api/cart/items/{item_id}) --

Given(
    'they have a cart line {string} with {string} size {string} quantity {int}',
    async function (itemId: string, pizza: string, size: string, qty: number) {
        await route(this).putCartItem(itemId, pizza, size, qty);
    },
);

When(
    'they put cart item {string} as {string} size {string} quantity {int}',
    async function (itemId: string, pizza: string, size: string, qty: number) {
        await route(this).putCartItem(itemId, pizza, size, qty);
    },
);

When(
    'they put cart item {string} as {string} size {string} quantity {int} with a conflicting body item_id {string}',
    async function (itemId: string, pizza: string, size: string, qty: number, conflictingBodyItemId: string) {
        await route(this).putCartItem(itemId, pizza, size, qty, conflictingBodyItemId);
    },
);

When('they delete cart item {string}', async function (itemId: string) {
    await route(this).deleteCartItem(itemId);
});

Then('the cart contains item {string} with quantity {int}', async function (itemId: string, qty: number) {
    route(this).verifyCartContainsItem(itemId, qty);
});

Then('the cart does not contain item {string}', async function (itemId: string) {
    route(this).verifyCartDoesNotContainItem(itemId);
});

Then('the cart-item request is rejected with status {int}', async function (status: number) {
    route(this).verifyCartItemRequestStatus(status);
});

// -- order cancellation (PATCH /api/orders/{order_id}) --

Given(
    'they have a placed order for {string} size {string} quantity {int}',
    async function (pizza: string, size: string, qty: number) {
        await route(this).placeQuickOrder(pizza, size, qty);
    },
);

When('they cancel the order', async function () {
    await route(this).cancelOrder();
});

When('{string} attempts to cancel that order', async function (userAlias: string) {
    await route(this).cancelOrderAs(userAlias);
});

When('they cancel order {string}', async function (orderId: string) {
    await route(this).cancelOrderById(orderId);
});

Then('the order status is {string}', async function (status: string) {
    route(this).verifyOrderStatus(status);
});

Then('the order-cancel request is rejected with status {int}', async function (status: number) {
    route(this).verifyOrderCancelRequestStatus(status);
});

Then('the checkout page passes the automated accessibility gate', async function () {
    await route(this).verifyAccessibilityGate();
});

After(async function () {
    try {
        await route(this).resetClientState();
    } catch {
        // Proxy may not be running (e.g. DAO-only test runs).
    }
});

AfterAll(async function () {
    try {
        await sendIntent(INTENT.TEARDOWN, '');
    } catch {
        // no-op
    }
    closeClient();
});
