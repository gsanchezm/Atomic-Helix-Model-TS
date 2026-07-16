Feature: OmniPizza API surface passes the automated security gate

  Contract-shaped security (login.security.json). The authenticated backend
  origin is the natural "front door" for the active API scan + schema fuzz —
  it is the one surface every domain's api.contract.json already targets. A
  single, non-outline scenario so the (expensive) scan runs exactly once.

  @security @api
  Scenario: The authenticated API surface passes the automated security gate
    Given the OmniPizza user is logged in as "standard_user"
    Then the API surface passes the automated security gate
