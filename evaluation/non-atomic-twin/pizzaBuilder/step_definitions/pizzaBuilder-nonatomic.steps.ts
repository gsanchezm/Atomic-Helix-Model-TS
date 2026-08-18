import { Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import {
    PizzaBuilderNonAtomicRoute,
    type JourneyWorldShape,
} from '../organisms/pizzaBuilder-nonatomic.route';

// EVALUATION ARTIFACT — see ../../README.md. Pairs 1:1 with
// src/core/tests/pizzaBuilder/step_definitions/pizzaBuilder.steps.ts.

setDefaultTimeout(600_000);

function route(world: unknown): PizzaBuilderNonAtomicRoute {
    return new PizzaBuilderNonAtomicRoute(world as JourneyWorldShape);
}

When('they select size {string}', async function (size: string) {
    await route(this).selectSize(size);
});

When('they add toppings {string}', async function (commaSeparated: string) {
    await route(this).addToppings(commaSeparated);
});

Then('the navbar cart count is {string}', async function (count: string) {
    await route(this).verifyCartCount(count);
});

When('they confirm add to cart', async function () {
    await route(this).confirmAddToCart();
});

Then('the pizza builder is closed', async function () {
    await route(this).verifyBuilderClosed();
});
