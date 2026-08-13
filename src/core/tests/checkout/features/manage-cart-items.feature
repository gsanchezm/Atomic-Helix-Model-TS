Feature: Manage individual cart lines via the atomic test-setup API
  PUT/DELETE /api/cart/items/{item_id} let a scenario create, replace, or
  remove one cart line without reseeding the whole cart.

    As a test author,
    I want to upsert or remove a single cart line by id,
    So that preconditions for other scenarios can be shaped precisely
    without an extra GET round-trip to discover generated ids.

  These are test-setup infrastructure, not a user-facing flow — no UI calls
  them (the mobile app's "Remove" cart-line button only ever mutates local
  client state, never the backend), so every scenario here is api-only. The
  cart is scoped to the login session (sid), not the username, so none of
  this needs the writes-shared-state tag.

  Background:
    Given the OmniPizza user is logged in as "standard_user"
    And they are ordering in market "US"

  @api
  Scenario: PUT creates a new cart line when the item_id is unknown
    When they put cart item "ITEM-NEW-1" as "Pepperoni" size "Large" quantity 2
    Then the cart contains item "ITEM-NEW-1" with quantity 2

  @api
  Scenario: PUT replaces an existing cart line in full
    Given they have a cart line "ITEM-REPLACE-1" with "Pepperoni" size "Large" quantity 1
    When they put cart item "ITEM-REPLACE-1" as "Margherita" size "Medium" quantity 3
    Then the cart contains item "ITEM-REPLACE-1" with quantity 3

  @api
  Scenario: PUT ignores any item_id carried in the request body
    When they put cart item "ITEM-URL-WINS" as "Pepperoni" size "Large" quantity 1 with a conflicting body item_id "ITEM-BODY-DECOY"
    Then the cart contains item "ITEM-URL-WINS" with quantity 1
    And the cart does not contain item "ITEM-BODY-DECOY"

  @api
  Scenario: DELETE removes an existing cart line
    Given they have a cart line "ITEM-DELETE-1" with "Pepperoni" size "Large" quantity 1
    When they delete cart item "ITEM-DELETE-1"
    Then the cart does not contain item "ITEM-DELETE-1"

  @api
  Scenario: DELETE on an unknown item_id is rejected with 404
    When they delete cart item "ITEM-DOES-NOT-EXIST"
    Then the cart-item request is rejected with status 404
