// Cypress's own native support file, for Cypress-idiomatic global e2e setup
// (e.g. custom commands, global config) — unrelated to Cucumber's
// `Before`/`After` hooks, which must live in a loaded step-definition file
// instead (see step_definitions/common/hooks.ts) because
// `@badeball/cypress-cucumber-preprocessor` only registers them from files
// its stepDefinitions glob picks up, not from Cypress's support file. Empty
// because nothing has needed Cypress-native support-file setup yet, not
// because hooks were deferred here.
