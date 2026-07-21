Feature: Market-driven language localization across login + post-login UI
  The OmniPizza UI adapts its language to the selected market+language combo.
  After login, the Logout label must reflect the chosen locale.

    As an OmniPizza user,
    I want the UI translated end-to-end (login screen and post-login chrome),
    So that I can use the app in my native language without surprises.

  @desktop @responsive @visual @localized
  Scenario Outline: Logout label is translated to <language> after market <market>
    Given the OmniPizza login screen is open
    When the user selects the "<market>" market with language "<language>"
    And they log in as "standard_user"
    Then the logout button label is "<logoutLabel>"

    Examples:
      | market | language | logoutLabel |
      | US     | English  | Logout      |
      | MX     | Spanish  | Salir       |
      | CH     | German   | Abmelden    |
      | CH     | French   | Déconnexion |
      | JP     | Japanese | ログアウト    |
      | SA     | Arabic   | تسجيل الخروج |

  # Contract-shaped security (login.security.json). The authenticated backend
  # origin is the natural "front door" for the active API scan + schema fuzz —
  # it is the one surface every domain's api.contract.json already targets. A
  # single, non-outline scenario (not folded into the Outline above) so the
  # (expensive) scan runs exactly once, not once per market/language example.
  @security @api
  Scenario: The authenticated backend has no unresolved security vulnerabilities
    Given the OmniPizza user is logged in as "standard_user"
    Then the authenticated backend has no unresolved security vulnerabilities
