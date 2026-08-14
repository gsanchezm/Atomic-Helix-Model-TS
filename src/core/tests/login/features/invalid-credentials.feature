Feature: Invalid login credentials surface an accurate auth error
  The OmniPizza login form rejects an unrecognized username, a wrong password,
  or missing fields with a single, generic message that never leaks which side
  of the comparison failed. A locked-out account is a distinct, deliberate
  case — confirmed by OmniPizza's own test suite (Cypress/pytest/jest all
  assert this) — and surfaces its own specific message instead, so the user
  knows to contact support rather than retry a password.

    As an OmniPizza user,
    I want an accurate error when login fails,
    So that I cannot enumerate valid usernames by reading error text, and I
    know when my account (not my credentials) is the problem.

  Background:
    Given the OmniPizza login screen is open

  @desktop @responsive @android @ios @api @performance @visual @invalid
  Scenario Outline: Login rejected when <case>
    When the user attempts to log in with username "<username>" and password "<password>"
    Then the login error message contains "<expectedMessage>"

    Examples:
      | case                  | username        | password    | expectedMessage      |
      | username is missing   |                 | pizza123    | Invalid credentials  |
      | password is missing   | standard_user   |             | Invalid credentials  |
      | both fields are empty |                 |             | Invalid credentials  |
      | credentials are wrong | not_a_user      | not_a_pass  | Invalid credentials  |
      | user is locked out    | locked_out_user | pizza123    | locked out           |
