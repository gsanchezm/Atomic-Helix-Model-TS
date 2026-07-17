import path from 'node:path';
import { defineConfig } from 'cypress';
import createBundler from '@bahmutov/cypress-esbuild-preprocessor';
import { addCucumberPreprocessorPlugin } from '@badeball/cypress-cucumber-preprocessor';
// createEsbuildPlugin lives on the package's dedicated esbuild subpath, not
// its main entry, in the installed major (@badeball/cypress-cucumber-preprocessor@24) —
// confirmed against node_modules/@badeball/cypress-cucumber-preprocessor/dist/subpath-entrypoints/esbuild.d.ts
// and the package's own quick-start docs (github.com/badeball/cypress-cucumber-preprocessor/blob/master/docs/quick-start.md).
import { createEsbuildPlugin } from '@badeball/cypress-cucumber-preprocessor/esbuild';

// specPattern reaches back into the shared feature-file tree — Cypress
// reuses the exact same .feature files cucumber-js runs, per §4's Option A.
//
// Built from __dirname rather than left as a bare relative string: verified
// empirically (Task C1 Step 7, `cypress run --config-file
// src/plugins/cypress/cypress.config.ts` run from the repo root, with
// DEBUG=cypress:* tracing) that Cypress resolves e2e.specPattern/supportFile
// relative to `projectRoot`, which it sets to the shell's cwd at invocation
// time — NOT to this config file's own directory, contrary to this plan's
// original assumption. A bare '../../core/tests/**/*.feature' therefore only
// works when the CLI happens to be invoked from this file's own directory;
// an absolute path anchored on __dirname (this module's real location,
// regardless of process.cwd()) works from any invocation cwd, including the
// `plugin:cypress` package.json script (which runs from the repo root).
const pluginDir = __dirname;

// `@badeball/cypress-cucumber-preprocessor` re-derives the spec list itself
// (via the `find-cypress-specs` package) once per feature file, purely to
// compute its own "implicit integration folder" for the `[filepath]` token
// (dist/template.js -> commonAncestorPath(...getSpecs(...))). That inner
// `getSpecs()` call passes our specPattern straight into `globby` without
// `windowsPathsNoEscape` — verified empirically (Task C1 Step 7, DEBUG=
// cypress-cucumber-preprocessor,find-cypress-specs) that on Windows this
// silently matches 0 files for an absolute, backslash-separated pattern
// (Cypress's own native spec-scanner tolerates backslashes fine; this one
// doesn't), which crashes compilation with "Reduce of empty array with no
// initial value" for every feature file. Posix-style (forward-slash)
// absolute paths are accepted identically by Windows' own filesystem APIs
// and sidestep the bug, so every glob-bearing path below is normalized
// through toPosixPath rather than left as a raw path.join() result.
const toPosixPath = (value: string): string => value.split(path.sep).join('/');

// This does NOT reuse cucumber.js's own step_definitions glob (src/core/tests/
// **/step_definitions/**) — step-definitions are pointed at this plugin's
// own directory instead, to avoid plain `cucumber-js` runs trying to
// require() cy.*-based files (§2 — cucumber.js:11's require glob would
// otherwise pick them up and crash with "cy is not defined").
//
// This is set via config.env.stepDefinitions below rather than a
// `.cypress-cucumber-preprocessorrc.json` file (this plan's original Step 3),
// which was verified empirically NOT to work in this repo:
// `addCucumberPreprocessorPlugin` resolves that file via cosmiconfig's
// `search(cypressConfig.projectRoot)` (dist/preprocessor-configuration.js),
// which only checks `projectRoot` and its ANCESTOR directories — never
// descendants — so an rc file living under src/plugins/cypress/ (a
// descendant of projectRoot, which Cypress sets to the invocation cwd / repo
// root, confirmed via the specPattern/supportFile finding above) is
// unreachable no matter its contents. Separately, even a discoverable rc
// file's own `stepDefinitions` glob strings are resolved with
// `{ cwd: projectRoot }` (dist/step-definitions.js, getStepDefinitionPaths),
// not relative to the rc file's own directory — so bare
// "step_definitions/..." patterns would look under the repo root, not this
// plugin's directory, regardless. Absolute, __dirname-anchored patterns set
// directly in config.env sidestep both problems and are honored first in
// preprocessor-configuration.js's override precedence
// (overrides.stepDefinitions ?? file-config ?? defaults).
const stepDefinitions = [
    toPosixPath(path.join(pluginDir, 'step_definitions/common/*.ts')),
    toPosixPath(path.join(pluginDir, 'step_definitions/[filepath]/*.steps.ts')),
];

export default defineConfig({
    // Cypress's own default output dirs (`cypress/screenshots`,
    // `cypress/videos`) are, like specPattern/supportFile above, resolved
    // relative to projectRoot (the repo root here) rather than this config
    // file's directory — verified empirically (Task C1 Step 7: an unscoped
    // run left a stray `cypress/screenshots/` at the repo root instead of
    // under this plugin's own directory). Anchored here to keep this
    // plugin's output self-contained under src/plugins/cypress/, matching
    // the .gitignore entries this task adds.
    screenshotsFolder: path.join(pluginDir, 'screenshots'),
    videosFolder: path.join(pluginDir, 'videos'),
    e2e: {
        baseUrl: process.env.BASE_URL,
        specPattern: toPosixPath(path.join(pluginDir, '../../core/tests/**/*.feature')),
        supportFile: toPosixPath(path.join(pluginDir, 'support/e2e.ts')),
        env: {
            stepDefinitions,
        },
        async setupNodeEvents(on, config) {
            await addCucumberPreprocessorPlugin(on, config);
            on('file:preprocessor', createBundler({ plugins: [createEsbuildPlugin(config)] }));
            return config;
        },
    },
});
