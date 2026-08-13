Feature: Cancel a pending order
  PATCH /api/orders/{order_id} supports exactly one transition:
  pending -> cancelled.

    As an OmniPizza user,
    I want to cancel an order I placed while it is still pending,
    So that I'm not charged for an order I no longer want.

  No UI triggers this yet — the checkout screen's "Cancel" button only
  dismisses the pre-order confirmation modal, it never PATCHes an existing
  order — so every scenario here is api-only. Cancelling a real order ties
  up the logged-in user's order history, so scenarios that place one carry
  the writes-shared-state tag, matching the existing checkout scenarios'
  tagging; the not-found case never creates or touches an order, so it
  doesn't.

  Background:
    Given the OmniPizza user is logged in as "standard_user"
    And they are ordering in market "MX"

  @api @writes-shared-state
  Scenario: Cancelling a pending order marks it cancelled
    Given they have a placed order for "Margherita" size "Medium" quantity 1
    When they cancel the order
    Then the order status is "cancelled"

  @api @writes-shared-state
  Scenario: Cancelling an already-cancelled order is rejected with 409
    Given they have a placed order for "Margherita" size "Medium" quantity 1
    And they cancel the order
    When they cancel the order
    Then the order-cancel request is rejected with status 409

  @api @writes-shared-state
  Scenario: Cancelling another user's order is rejected with 403
    Given they have a placed order for "Margherita" size "Medium" quantity 1
    When "problem_user" attempts to cancel that order
    Then the order-cancel request is rejected with status 403

  @api @writes-shared-state
  Scenario: security_glitch_user can cancel another user's order (deliberate IDOR bypass)
    Given they have a placed order for "Margherita" size "Medium" quantity 1
    When "security_glitch_user" attempts to cancel that order
    Then the order status is "cancelled"

  @api
  Scenario: Cancelling an unknown order returns 404
    When they cancel order "ORDER-DOES-NOT-EXIST"
    Then the order-cancel request is rejected with status 404
