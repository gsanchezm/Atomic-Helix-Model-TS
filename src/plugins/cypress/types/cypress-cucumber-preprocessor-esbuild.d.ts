// Ambient module shim for `@badeball/cypress-cucumber-preprocessor/esbuild`.
//
// The installed package (v24) exposes this subpath only via its package.json
// "exports" map (`"./*": "./dist/subpath-entrypoints/*.js"`). Resolving
// subpath *types* through an "exports" map requires TypeScript's
// "node16"/"nodenext"/"bundler" moduleResolution — but this repo's shared
// root tsconfig.json (out of scope for this task) uses the classic "node"
// strategy, which does not read "exports" at all and therefore cannot find
// this subpath's declaration file (dist/subpath-entrypoints/esbuild.d.ts),
// even though the file exists.
//
// This has no effect on runtime behavior: Cypress bundles cypress.config.ts
// with its own esbuild-based loader, which (like Node itself) does honor the
// package's "exports" map, so the real implementation resolves correctly
// when `cypress run`/`cypress open` actually executes. This shim only
// restores the type for `tsc --noEmit`.
//
// `Cypress.PluginConfigOptions` comes from Cypress's own ambient types
// (triple-slash-free — the `cypress` devDependency registers them globally).
// The return type is intentionally `any` (not esbuild's own `Plugin` type):
// esbuild is a transitive/peer dependency here, not hoisted to a resolvable
// top-level path under this repo's pnpm layout, so importing its types
// directly from this shim would reintroduce the same class of resolution
// problem this file exists to route around. `any` lets the value flow into
// `@bahmutov/cypress-esbuild-preprocessor`'s own typed `plugins: Plugin[]`
// parameter without a cast.
declare module '@badeball/cypress-cucumber-preprocessor/esbuild' {
  export function createEsbuildPlugin(
    configuration: Cypress.PluginConfigOptions,
    options?: { prettySourceMap: boolean }
  ): any;
  export default createEsbuildPlugin;
}
