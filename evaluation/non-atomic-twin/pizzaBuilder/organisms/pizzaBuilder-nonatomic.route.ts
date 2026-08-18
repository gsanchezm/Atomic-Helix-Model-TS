import {
    selectSize,
    assertTotalReflectsSize,
} from '@core/tests/pizzaBuilder/molecules/pizzaBuilder-size.molecule';
import {
    addToppings as addToppingsMolecule,
    assertTotalReflectsToppings,
} from '@core/tests/pizzaBuilder/molecules/pizzaBuilder-toppings.molecule';
import {
    clickConfirmAddToCart,
    assertBuilderClosed,
    assertNavbarCartCount,
} from '@core/tests/pizzaBuilder/molecules/pizzaBuilder-confirm.molecule';
import type { CheckoutWorld } from '@core/tests/support/world';

// EVALUATION ARTIFACT — see ../../README.md and
// docs/paper/atomic-testing-formal-definition.md §8.3. Pairs 1:1 with
// src/core/tests/pizzaBuilder/organisms/pizzaBuilder.route.ts.
//
// Deliberately NOT PizzaBuilderRoute reused wholesale: that class's own
// openBuilder() is a standalone re-entry point (its own market/token/
// pizza-id lookup + its own navigation), used when the atomic pizzaBuilder
// suite is exercised in isolation. Using it here would bypass the journey's
// real catalog card click (see the catalog slice), undercutting the "the
// user browsed the catalog" claim. So this route composes the SAME
// pizzaBuilder molecules directly, with its draft seeded from whatever the
// catalog slice's real card click already resolved
// (world.catalogLastOpenedItem) instead of from its own lookup.
//
// Draft lives on the World, not on instance fields: step_definitions files
// (this slice's own, and the checkout slice's) each instantiate their route
// fresh per binding call — the same reason CatalogRoute/PizzaBuilderRoute
// hang their own per-scenario state off the World instead of `this` (see
// catalog.route.ts's "Catalog state lives on the World" comment). Since the
// checkout slice needs to read this draft too, its accessor lives here as a
// plain exported function over the World, not a method needing a shared
// instance.

// catalog.route.ts's own CatalogWorldShape (which carries this field) is not
// exported — same local-extension pattern the codebase already uses
// (e.g. PizzaBuilderWorldShape in the atomic pizzaBuilder.route.ts).
export interface PizzaBuilderDraft {
    pizzaId: string;
    itemName: string;
    size?: string;
    toppings: string[];
}

export interface JourneyWorldShape extends CheckoutWorld {
    catalogLastOpenedItem?: { id: string; name: string };
    journeyPizzaBuilderDraft?: PizzaBuilderDraft;
}

/** Read by the checkout slice's prepareCheckoutContext. */
export function readPizzaBuilderDraft(world: JourneyWorldShape): PizzaBuilderDraft {
    const draft = world.journeyPizzaBuilderDraft;
    if (!draft) {
        throw new Error('Journey: no pizza-builder draft — run selectSize first.');
    }
    return draft;
}

export class PizzaBuilderNonAtomicRoute {
    constructor(private readonly world: JourneyWorldShape) {}

    async selectSize(size: string): Promise<void> {
        const opened = this.world.catalogLastOpenedItem;
        if (!opened) {
            throw new Error('Journey: no pizza opened from the catalog yet — run the catalog slice first.');
        }
        this.world.journeyPizzaBuilderDraft = {
            pizzaId: opened.id,
            itemName: opened.name,
            size,
            toppings: [],
        };
        await selectSize(size);
        await assertTotalReflectsSize(size);
    }

    async addToppings(commaSeparated: string): Promise<void> {
        const draft = readPizzaBuilderDraft(this.world);
        draft.toppings = await addToppingsMolecule(commaSeparated);
        await assertTotalReflectsToppings(draft.size ?? '', commaSeparated);
    }

    async confirmAddToCart(): Promise<void> {
        await clickConfirmAddToCart();
    }

    async verifyBuilderClosed(): Promise<void> {
        await assertBuilderClosed();
    }

    async verifyCartCount(expected: string): Promise<void> {
        await assertNavbarCartCount(expected);
    }
}
