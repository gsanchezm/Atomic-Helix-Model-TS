import { After, Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import { CheckoutNonAtomicRoute } from '../organisms/checkout-nonatomic.route';
import type { JourneyWorldShape } from '../../pizzaBuilder/organisms/pizzaBuilder-nonatomic.route';

// EVALUATION ARTIFACT — see ../../README.md. Pairs 1:1 with
// src/core/tests/checkout/step_definitions/checkout.steps.ts. Also owns the
// journey's login steps — see the doc comment on CheckoutNonAtomicRoute for
// why (mirrors the atomic suite's own precedent of checkout.steps.ts owning
// the shared login Background step).

setDefaultTimeout(600_000);

function route(world: unknown): CheckoutNonAtomicRoute {
    return new CheckoutNonAtomicRoute(world as JourneyWorldShape);
}

// -- login ------------------------------------------------------------------

Given('the OmniPizza login screen is open', async function () {
    await route(this).openLoginScreen();
});

When('they log in as {string}', async function (userAlias: string) {
    await route(this).loginViaUi(userAlias);
});

// -- connective glue (disclosed — no atomic counterpart to pair with; see
// CheckoutNonAtomicRoute.prepareCheckoutContext's doc comment) --------------

When('they proceed to checkout in market {string} with the built cart', async function (market: string) {
    await route(this).prepareCheckoutContext(market);
});

// -- checkout -----------------------------------------------------------------

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

After(async function () {
    try {
        await route(this).resetClientState();
    } catch {
        // Proxy may not be running (e.g. a dry parse / DAO-only invocation).
    }
});
