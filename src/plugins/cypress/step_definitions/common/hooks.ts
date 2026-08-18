import { Before } from '@badeball/cypress-cucumber-preprocessor';

// Matches the `step_definitions/common/*.ts` pattern registered in
// cypress.config.ts's `stepDefinitions` array (Task C1) — this file is
// loaded ahead of every feature's `Background` step regardless of which
// domain the spec belongs to, since that pattern is not filepath-scoped.
//
// `Cypress.config('baseUrl')` (rather than reading `process.env.BASE_URL`
// directly) is used deliberately: this file executes inside the browser
// spec context, not Node, so `process.env` isn't available here anyway —
// `Cypress.config('baseUrl')` is the sanctioned way to read a value Cypress
// itself already resolved from `process.env.BASE_URL` at config-load time
// (see cypress.config.ts's `e2e.baseUrl: process.env.BASE_URL`). In this
// sandbox BASE_URL is unset, so this resolves to `undefined` and
// `cy.visit(undefined)` fails fast with a Cypress-native error — see
// task-C3-report.md for why that failure is expected and doesn't block
// this task.
Before(() => {
    cy.visit(Cypress.config('baseUrl') as string);
});
