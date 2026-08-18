import { resolveLocator } from '@kernel/locator-resolver';

// Cypress specs cannot dial chaos-proxy or import kernel modules directly —
// they execute inside a browser-sandboxed spec context. This function is
// only ever called from Node (setupNodeEvents / a cy.task handler), never
// from a spec file itself — see cypress.config.ts's registered task.
//
// Resolves against the 'webdriverio' branch deliberately: Cypress speaks
// native CSS, same as WebdriverIO's own webdriver-family locators (§2/§3.2
// of this plan) — reusing that data, not chaos-proxy's resolver *code path*,
// satisfies the "reuse the JSON data itself" requirement from the design
// brief without requiring Cypress to become a gRPC plugin.
export function resolveCypressLocator(logicalKey: string): string {
    return resolveLocator(logicalKey, 'webdriverio');
}
