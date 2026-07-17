import { Given, Then, When } from '@badeball/cypress-cucumber-preprocessor';

// Path note (see task-C3-report.md for the full derivation/verification):
// this file lives at
// step_definitions/login/features/invalid-credentials/login.steps.ts, NOT
// step_definitions/login/login.steps.ts as the originating plan literally
// said. cypress.config.ts's `step_definitions/[filepath]/*.steps.ts`
// pattern substitutes [filepath] with the feature file's path relative to
// the preprocessor's "implicit integration folder" (the common ancestor
// directory of every discovered .feature file's own directory), which —
// given every feature lives under src/core/tests/<domain>/features/ for
// many different <domain> values — resolves to src/core/tests. For
// src/core/tests/login/features/invalid-credentials.feature that yields
// [filepath] = "login/features/invalid-credentials", hence this directory.
//
// Reimplements (does not import) the subset of LoginRoute's behavior this
// one feature needs, directly against cy.* — LoginRoute itself is wired to
// sendIntent and cannot be reused as-is from a Cypress spec context.
function getByLogicalKey(key: string): Cypress.Chainable<JQuery<HTMLElement>> {
    return cy.task('resolveCypressLocator', { key }).then((selector) => cy.get(selector as string));
}

Given('the OmniPizza login screen is open', () => {
    // The common Before hook (step_definitions/common/hooks.ts) already
    // navigated to baseUrl; the login screen is the landing route for an
    // unauthenticated session.
    getByLogicalKey('loginScreen').should('be.visible');
});

When(
    'the user attempts to log in with username {string} and password {string}',
    (username: string, password: string) => {
        if (username) getByLogicalKey('usernameInput').type(username);
        if (password) getByLogicalKey('passwordInput').type(password);
        getByLogicalKey('loginButton').click();
    },
);

Then('the login error message contains {string}', (expected: string) => {
    getByLogicalKey('loginError').should('contain.text', expected);
});
