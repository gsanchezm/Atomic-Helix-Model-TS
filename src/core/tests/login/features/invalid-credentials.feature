Feature: Invalid login credentials surface the same auth error
  The OmniPizza login form rejects a bad or missing username/password with a
  single, generic message so a caller cannot enumerate valid usernames by
  reading error text. The one deliberate exception is a locked-out account:
  that state is surfaced explicitly (not folded into the generic message) —
  an intentional design decision for this test/practice platform, confirmed
  with the app owner on 2026-07-16, since a locked-out account is not itself
  a secret worth hiding behind enumeration-safe wording.

    As an OmniPizza user,
    I want a consistent error when login fails,
    So that I cannot enumerate valid usernames by reading error text.

  Background:
    Given the OmniPizza login screen is open

  @desktop @responsive @android @ios @api @performance @visual @invalid
  Scenario Outline: Login rejected when <case>
    When the user attempts to log in with username "<username>" and password "<password>"
    Then the login error message contains "<errorMessage>"

    Examples:
      | case                  | username        | password   | errorMessage        |
      | username is missing   |                 | pizza123   | Invalid credentials |
      | password is missing   | standard_user   |            | Invalid credentials |
      | both fields are empty |                 |            | Invalid credentials |
      | credentials are wrong | not_a_user      | not_a_pass | Invalid credentials |
      | user is locked out    | locked_out_user | pizza123   | locked out          |
