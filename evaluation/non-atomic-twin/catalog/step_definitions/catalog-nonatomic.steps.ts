import { Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import { CatalogRoute } from '@core/tests/catalog/organisms/catalog.route';
import type { CheckoutWorld } from '@core/tests/support/world';

// EVALUATION ARTIFACT — see ../../README.md. Pairs 1:1 with
// src/core/tests/catalog/step_definitions/catalog.steps.ts.
//
// Catalog browsing is NOT an R3 target in this journey: the atomic catalog
// suite already drives it via real UI regardless of arm (it's the behavior
// under test there too, not a precondition). So this slice adds NO new
// route/composition code — it re-instantiates the SAME CatalogRoute the
// atomic suite uses, unmodified, purely so its steps are reachable from the
// nonAtomicTwin cucumber profile (which does not `require` the atomic
// suites' step_definitions — see cucumber.js).

setDefaultTimeout(600_000);

function route(world: unknown): CatalogRoute {
    return new CatalogRoute(world as CheckoutWorld);
}

// Cucumber matches step text regardless of keyword (Given/When/And are all
// the same registry) — one binding covers the journey's `When they are
// browsing...` even though the atomic catalog suite phrases the same text
// as a `Given`.
When(
    'they are browsing the catalog in market {string} using language {string}',
    async function (market: string, language: string) {
        await route(this).browseCatalog(market, language);
    },
);

Then('the catalog screen is fully displayed', async function () {
    await route(this).verifyCatalogDisplayed();
});

When('they open the pizza {string}', async function (item: string) {
    await route(this).openPizza(item);
});

Then('the pizza builder is displayed for {string}', async function (item: string) {
    await route(this).verifyBuilderDisplayed(item);
});
