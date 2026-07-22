# EVALUATION ARTIFACT — see ../../README.md and
# docs/paper/atomic-testing-formal-definition.md §8.2-8.4. Pairs 1:1 with
# src/core/tests/checkout/features/place-delivery-order.feature — this is
# where the journey physically lives (one Scenario Outline = one continuous
# cucumber World/session, so it cannot be split across files), but its steps
# are bound across THREE paired slices: catalog/, pizzaBuilder/, and this
# one (checkout/, which also owns login — see checkout-nonatomic.route.ts's
# doc comment for why there is no separate login/ slice).
#
# Mechanically concatenates the atomic step sequences of the catalog,
# pizzaBuilder, and checkout slices (plus the login precondition) into one
# continuous scenario. Every step below is either verbatim atomic step text
# or its already-existing UI-molecule replacement for an atomic
# API-injection step — see the ruleset table in §8.3 for the per-operation
# mapping. This file is NOT free-hand-authored narrative.
#
# Deliberate, disclosed violations relative to the atomic reference suites:
#   R1 — one scenario carries oracles from all three paired slices
#        (structural).
#   R2 — every row below targets the SAME "standard_user" account, and this
#        feature does NOT carry @writes-shared-state, so concurrent rows are
#        NOT serialized by write-lock.hooks.ts (contrast: the atomic
#        checkout suite shares standard_user too, but DOES declare the tag).
#   R3 — login and cart-building go through real UI actions instead of the
#        atomic suites' API $S_0$ injection (LoginDao.login / addToCart).
#   R4 — not transformed directly; predicted consequence of R2 (§8.4).
#
# Concurrency shape: the K rows below are intentionally near-identical (same
# account, same market, same pizza) so `CUCUMBER_PARALLEL = 1, 2, 4, 8` sweeps
# real concurrency against ONE shared account without changing scenario
# count between sweep points — see §8.3 "Concurrency shape" / §8.4 parallel
# safety.

@non-atomic-twin
Feature: Non-atomic horizontal journey — login through order confirmation

  Scenario Outline: Concurrent journey instance <instance> completes login through order confirmation via UI only
    Given the OmniPizza login screen is open
    When they log in as "standard_user"
    And they are browsing the catalog in market "US" using language "en"
    Then the catalog screen is fully displayed

    When they open the pizza "Pepperoni"
    Then the pizza builder is displayed for "Pepperoni"

    When they select size "Large"
    And they add toppings "mushrooms"
    When they confirm add to cart
    Then the pizza builder is closed

    When they proceed to checkout in market "US" with the built cart
    And they provide delivery details "123 Luxury Avenue" "90210", "" for "Julian Casablancas" "+1 415 555 0101"
    And they choose payment method "Credit Card"
    And they enter card details "4242 4242 4242 4242" expiration "12/28" cvv "123"
    Then the order is accepted

    Examples:
      | instance |
      | 1        |
      | 2        |
      | 3        |
      | 4        |
      | 5        |
      | 6        |
      | 7        |
      | 8        |
