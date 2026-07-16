@security-infra
Feature: OmniPizza whole-app security infrastructure scan

  Infra-shaped security. These probes have no single owning domain — the ZAP
  baseline crawls the entire running frontend, testssl inspects the deployed
  API host's certificate, and MobSF statically analyzes the whole APK / IPA.
  They live in support/ (the cross-cutting glue layer) and RECORD findings to
  the dashboard rather than gate the build. Run once, out of band, selected by
  the security-infra tag.

  Scenario: The deployed OmniPizza app passes the infrastructure security scan
    When the ZAP baseline crawl runs against the frontend
    And the TLS configuration of the API host is inspected
    And MobSF statically analyzes the mobile app binaries
    Then the infrastructure security report is captured
