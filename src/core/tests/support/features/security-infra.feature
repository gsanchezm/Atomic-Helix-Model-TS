@security-infra
Feature: OmniPizza's deployed footprint is checked for exposed security risk

  These checks have no single owning domain — one crawls the entire running
  frontend for exposed vulnerabilities, one inspects the deployed backend's
  transport security, and one statically analyzes the mobile app binaries as
  a whole. They live in support/ (the cross-cutting glue layer) and RECORD
  findings to the dashboard rather than block the build. Run once, out of
  band, selected by the security-infra tag.

  Scenario: The deployed app's frontend, backend, and mobile binaries are checked for exposed security risk
    When the live frontend is crawled for exposed vulnerabilities
    And the backend's transport security is inspected
    And the mobile app binaries are statically analyzed for exposed vulnerabilities
    Then the findings are captured for review
