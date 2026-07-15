# Atomic Helix Model

> **One scenario, one atom of behavior — on every platform.** A reference implementation of the Automated Atomic Testing method: every Gherkin scenario verifies exactly one behavior, owns disjoint state, injects its preconditions through the API, and runs unchanged against Web, Mobile, API, visual and load targets.

[![Node](https://img.shields.io/badge/node-22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

---

## TL;DR

This repository is the companion code for an article on **Automated Atomic Testing** — the *method* of writing tests, as opposed to the architecture that executes them. The execution architecture underneath (the **Test-Oriented Microkernel**, TOM) has its own article and repository: [Test-Oriented-Microkernel-Architecture-TS](https://github.com/gsanchezm/Test-Oriented-Microkernel-Architecture-TS). Here the focus is on how scenarios are written, isolated, and seeded so that they stay **atomic**.

**Under the hood:** tests are written once in Gherkin and dispatched as `ExecuteIntent` gRPC calls to isolated plugin servers (`playwright`, `appium`, `mobilewright`, `gatling`, `api`, `pixelmatch`). The kernel (`chaos-proxy`) handles locator resolution, transient-failure retries, and telemetry — plugins are pure execution engines that don't know about test logic.

## The method

A test is **atomic** when it satisfies four rules:

| Rule | Meaning | Where this repo enforces it |
|------|---------|-----------------------------|
| **Single behavior** | One scenario asserts exactly one thing; if it fails, the diagnosis is unambiguous. | Steps are thin one-line bindings; each scenario ends at a single oracle (functional assert, visual snapshot, or KO-rate gate). |
| **Disjoint state** | $S_{A1} \cap S_{A2} = \emptyset$ — no scenario can observe another scenario's data. | Per-scenario users and fixtures (`src/core/test-data/`); isolation is definitional, not disciplinary. |
| **No UI-driven setup** | Preconditions are *injected* via API ($S_0$ state injection), never rebuilt by clicking through screens. | `<domain>/dao/*.dao.ts` — `Given` steps short-circuit to the `api` plugin instead of driving the UI. |
| **Deterministic outcome** | Transient noise (stale elements, network jitter) is absorbed; real failures fail fast, once. | The kernel's chaos suppression ($\lambda < 0$): exponential-backoff retries for transient errors only. |

Atomicity is what makes everything else in this repo possible: scenarios never build preconditions through the UI, and the same `.feature` can be dispatched to a Playwright browser, an Appium device, or a Gatling load simulation **without modification**. Scenarios that mutate OmniPizza's fixed `standard_user` are explicitly tagged `@writes-shared-state` and serialized; the rest can run without ordering constraints.

The formal model behind the layering (Atomic Helix Model, π-Calculus, $\lambda < 0$ chaos suppression) lives at the bottom of this README — read it if you want, skip it if you just want the suite running.

## Quickstart (≤ 60 s)

```bash
nvm use && pnpm install                              # Node 22, see .nvmrc

# 3 terminals
pnpm run proxy                                       # microkernel  :50051
pnpm run plugins                                     # plugin servers from .env
pnpm test                                            # cucumber-js
```

Filter scenarios:

```bash
./node_modules/.bin/cucumber-js --tags "@smoke and not @wip"
./node_modules/.bin/cucumber-js src/core/tests/checkout/features/place-delivery-order.feature
```

> `pnpm test -- --name X` silently runs the **full** suite. Drop the `--` or call `cucumber-js` directly.

## How it flows

```
Cucumber step
  └─→ CheckoutRoute (orchestration + plugin selection)
        └─→ molecule (UI action wrapper)
              └─→ sendIntent(INTENT.CLICK, "loginButton")
                    └─→ chaos-proxy :50051
                          ├─ resolves logical key → platform selector
                          ├─ retries transient failures (StaleElement, Timeout, …)
                          └─ forwards to the right plugin server
                                ├─ playwright  :50052   Web UI
                                ├─ appium      :50053   Mobile UI (legacy)
                                ├─ gatling     :50054   Load / performance
                                ├─ api         :50055   fetch + HttpClient
                                ├─ pixelmatch  :50056   Visual oracle
                                └─ mobilewright:50057   Mobile UI (Playwright)
```

Five things to know:
1. **Steps are thin** — they just call route methods.
2. **Routes pick the plugin** — `DRIVER` env (`playwright` / `appium` / `api`) decides whether `fillDelivery` runs in the browser or skips to API state injection.
3. **Action IDs are typed** — `INTENT.CLICK`, not raw strings. See [`src/kernel/intents.ts`](src/kernel/intents.ts).
4. **Each plugin owns its actions** — `src/plugins/<plugin>/actions/`. Adding an action = registering it; never touch the orchestrator.
5. **Locators are logical** — `streetInput`, not `[data-testid='street']`. Platform-specific selectors live in `*.locators.json` and are resolved by the proxy.

## Plugins

Plugin identity = **the tool under the hood**. Two plugins can serve the same test type (`appium` and `mobilewright` both run mobile intents), so a project migrates between tools by toggling `PLUGIN_*` — features, routes, and action handlers don't change.

| Plugin         | Wraps            | Port   | What it does                                       |
|----------------|------------------|--------|----------------------------------------------------|
| `playwright`   | Playwright       | 50052  | Web UI: desktop + responsive                       |
| `appium`       | Appium + WdIO    | 50053  | Mobile UI on iOS / Android (legacy path)           |
| `mobilewright` | Playwright       | 50057  | Mobile UI via Playwright (migration target)        |
| `gatling`      | Gatling          | 50054  | Load tests; subprocess runner + stats parser       |
| `api`          | fetch            | 50055  | Contract tests, $S_0$ state injection              |
| `pixelmatch`   | pixelmatch+pngjs | 50056  | Visual oracle / snapshot regression                |

Toggle plugins with `PLUGIN_<TOOL>=true|false` in `.env` and they hot-reload.

## Layers (Atomic-Helix)

| Layer            | Folder                                                | Responsibility                                                                                        |
|------------------|-------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| Atoms            | `kernel/client.ts`                                    | `sendIntent()` — the single, indivisible gRPC primitive                                               |
| Molecules        | `[domain]/molecules/*.molecule`                       | Grouped atomic intents — one cross-platform UI action wrapped over `sendIntent`                       |
| Organisms        | `[domain]/organisms/*.route`                          | Orchestrate molecules + DAOs into business flows; choose the plugin per intent                        |
| Eco-Systems      | `[domain]/features/` + `step_definitions/` (+ `dao/`) | BDD scenarios composing use cases + DAOs — steps are thin one-line bindings; DAOs do `Given` $S_0$ state injection |
| Resonance        | `[domain]/resonance/`                                 | Gatling simulations co-located with the feature, driven by the same Examples table                    |
| Execution Helix  | `.github/workflows/`                                  | CI/CD uniting every layer into parallel, isolated orbits (`ahm-execution-helix.yml`)                  |

This table is the five *execution* layers, one per domain. Cross-cutting quality attributes (visual, accessibility, and — proposed — parts of security) are a separate axis: **contracts**, not layers — see "Adapting other test categories" in the Appendix.

Steps look like this:

```ts
Given('the OmniPizza user is logged in as {string}', async function (alias) {
    await route(this).loginAs(alias);
});
```

…all orchestration lives in [`CheckoutRoute`](src/core/tests/checkout/organisms/checkout.route.ts).

## How to extend

| Goal                              | Where                                                              |
|-----------------------------------|--------------------------------------------------------------------|
| New action for an existing plugin | `src/plugins/<plugin>/actions/MyAction.ts` + register in `register<Plugin>Actions.ts` |
| New step                           | Add Gherkin in `*.feature`, bind in `step_definitions/`, delegate to a route method |
| New plugin                         | `src/plugins/<name>/{server.ts, <name>.ts, actions/}` + entry in `plugins.config.ts` |
| New intent ID                      | Add to `src/kernel/intents.ts` `INTENT` map; consumers use `INTENT.YOUR_ID` |

## Layout

```
src/
  proto/                           # gRPC service definition (ptom.proto)
  kernel/
    chaos-proxy.ts                 # microkernel — :50051
    client.ts                      # sendIntent() — typed by IntentAction
    intents.ts                     # INTENT catalog (single source of truth)
    locator-resolver.ts            # logical key → platform selector
    plugin-server.factory.ts       # gRPC boilerplate for plugins
  plugins/
    shared/                        # cross-plugin: ActionRegistry, ActionHandler, …
    playwright/                    # Playwright (web UI)
    appium/                        # Appium + WebdriverIO (mobile UI, legacy)
    mobilewright/                  # Playwright on mobile (migration target)
    gatling/                       # Gatling subprocess runner + actions/ + support/
    api/                           # fetch HttpClient + actions/
    pixelmatch/                    # Visual oracle (pixelmatch + pngjs)
  core/
    test-data/                     # users.json, fixtures
    tests/
      <domain>/                    # one slice per domain: login, checkout, catalog, pizzaBuilder, navbar, order_success, …
        molecules/                 # *.molecule.ts        (Molecules)
        organisms/                 # *.route.ts           (Organisms)
        step_definitions/          # *.steps.ts + visual.hooks.ts — thin Gherkin bindings (Eco-Systems)
        features/                  # *.feature            (Eco-Systems)
        dao/                       # *.dao.ts + *.types.ts — Given $S_0$ state injection
        contracts/                 # *.locators.json, api/visual/a11y contracts (security: TBD, see Appendix)
        resonance/                 # *.gatling.ts (JVM bundle, isolated) (Resonance)
  telemetry/                       # JSONL → MinIO
  utils/                           # pino logger
```

## Performance testing

Two modes that share the same simulation:

| Mode            | Trigger                                                    | When                                          |
|-----------------|------------------------------------------------------------|-----------------------------------------------|
| **Standalone**  | `pnpm perf:smoke|load|stress`                              | CI gates, HTML reports, manual investigation  |
| **TOM-driven**  | `sendIntent(INTENT.RUN_CHECKOUT_LOAD, 'smoke')`            | Triggering load from a Cucumber scenario      |

The feeder is **feature-driven** — `featureToCheckoutRows()` parses `place-delivery-order.feature` Examples at bundle time, so adding a row to the feature file automatically appears in the load run.

```bash
PERF_USERS=30 PERF_DURATION=60 pnpm perf:load
```

> First run downloads the Gatling JRE bundle (~200 MB). HTML reports land in `target/gatling/`.

The plugin returns a `SimulationMetrics` JSON in the gRPC payload — TOM-driven mode also fails the Cucumber step when the KO rate exceeds 1%.

## Test results dashboard

`apps/dashboard/` is a React + Vite + Express app that visualizes runs from `./reports/`. It reads `reports/manifest.json` plus the per-run `reports/<runId>/<tool>.json` files — **not** the scratch `reports/<tool>.json` a bare test run leaves behind.

```bash
pnpm dashboard:fixtures   # seed demo data, then
pnpm dashboard            # → http://localhost:5173
```

**A run only appears in the dashboard after it is ingested.** A direct `cucumber-js` invocation just writes scratch JSON (`reports/playwright.json`, `reports/api.json`, `reports/android.json`, …). Those files are the *source*, not what the dashboard renders. Convert them into a dashboard run with:

```bash
# after a manual run — bundles whatever scratch reports/*.json exist into ONE run
pnpm dashboard:ingest --run-id android-2026-05-29
#   → writes reports/<runId>/{playwright,api,appium,gatling,pixelmatch}.json + a manifest entry
```

So if you ran `cucumber-js --tags @android` by hand and the dashboard still shows an old (red) run, you simply haven't ingested the new one yet. `scripts/orchestrate-full-run.sh` runs the ingest automatically after each phase, so an orchestrated run shows up with no extra step. The newest run sorts to the top of the run dropdown. Full adapter/ingest details: `apps/dashboard/README.md`.

## Environment

```bash
cp .env.example .env
```

### Core

| Variable        | Options                                       | Description                                       |
|-----------------|-----------------------------------------------|---------------------------------------------------|
| `PLATFORM`      | `web` `android` `ios` `api`                   | Target platform (drives locator resolution)       |
| `DRIVER`        | `playwright` `appium` `api`                    | Picks which plugin runs UI intents                |
| `VIEWPORT`      | `desktop` `responsive`                        | Web only                                          |
| `BASE_URL`      | URL                                           | Web app under test                                |
| `API_BASE_URL`  | URL                                           | Backend for $S_0$ injection                       |
| `HEADLESS`      | `true` `false`                                |                                                   |
| `LOG_LEVEL`     | `fatal` `error` `warn` `info` `debug` `trace` | Pino level                                        |

### Plugin enable / addresses / ports

| Plugin enable          | Default | Address                                     | Listen port               |
|------------------------|---------|---------------------------------------------|---------------------------|
| `PLUGIN_PLAYWRIGHT`        | false   | `PLAYWRIGHT_ADDRESS=localhost:50052`            | `PLAYWRIGHT_PLUGIN_PORT=50052`       |
| `PLUGIN_APPIUM`     | false   | `APPIUM_ADDRESS=localhost:50053`         | `APPIUM_PLUGIN_PORT=50053`    |
| `PLUGIN_GATLING`   | false   | `GATLING_ADDRESS=localhost:50054`       | `GATLING_PLUGIN_PORT=50054`  |
| `PLUGIN_API`           | false   | `API_ADAPTER_ADDRESS=localhost:50055`       | `API_PLUGIN_PORT=50055`   |
| `PLUGIN_PIXELMATCH`        | false   | `PIXELMATCH_ADDRESS=localhost:50056`            | `PIXELMATCH_PLUGIN_PORT=50056`       |

`PROXY_ADDRESS=localhost:50051` is what `kernel/client.ts` uses to reach the proxy.

### gRPC security and execution mode

| Variable | Default | Description |
|----------|---------|-------------|
| `TOM_BIND_ADDRESS` | `127.0.0.1` | Listen interface for the proxy and plugin servers |
| `TOM_TLS_ENABLED` | `false` | Enables TLS credentials; server cert/key are then required on servers |
| `TOM_TLS_CA_PATH` | — | PEM CA used by clients and by servers that verify client certificates |
| `TOM_TLS_SERVER_CERT_PATH` / `TOM_TLS_SERVER_KEY_PATH` | — | PEM identity for a gRPC server |
| `TOM_TLS_CLIENT_CERT_PATH` / `TOM_TLS_CLIENT_KEY_PATH` | — | Optional PEM client identity for mTLS |
| `TOM_TLS_REQUIRE_CLIENT_CERT` | `false` | Requires a trusted client certificate on servers |
| `TOM_IN_PROCESS_PLUGINS` | empty | Comma-separated local plugins that bypass the second gRPC hop |

Any non-loopback bind fails unless TLS is enabled. Arbitrary `EVALUATE` actions are rejected at both proxy and plugin boundaries; browser-side operations use the closed `BROWSER_COMMAND` registry with JSON arguments.

`pnpm proxy:in-process` selects `playwright,api` for a local fast path. It lowers local latency at the cost of process isolation; regular `pnpm proxy` keeps the microkernel gRPC path.

### Parallel cross-browser runs

Install all three Playwright engines once:

```bash
pnpm exec playwright install chromium firefox webkit
```

Run the complete cross-browser suite with the local orchestrator:

```bash
pnpm test:all-browsers
```

The orchestrator keeps one proxy and one API plugin alive, runs Chromium, Firefox, and WebKit concurrently for desktop, restarts only the Playwright plugin with `VIEWPORT=responsive`, and then runs all three responsive legs. This preserves one FIFO write lock for the entire local run.

For a desktop-only run, start the shared services in separate terminals:

```bash
pnpm proxy
pnpm plugin:playwright
pnpm plugin:api
```

Then run Chromium, Firefox, and WebKit concurrently, with four Cucumber workers per engine:

```bash
pnpm test:parallel-browsers
```

All three invocations must use the same proxy. Read-only scenarios run concurrently; scenarios tagged `@writes-shared-state` acquire the proxy's FIFO write lock before touching the shared account.

### Mobile (Appium HTTP server)

| Variable         | Default     | Description                                                                  |
|------------------|-------------|------------------------------------------------------------------------------|
| `APPIUM_HOST`    | `localhost` | Appium server host (the SDK, not the plugin)                                 |
| `APPIUM_PORT`    | `4723`      | Appium server port                                                           |
| `CAP_PROFILE`    | —           | JSON filename under `src/plugins/appium/capabilities/{android|ios}/`      |
| `ANDROID_APP_PATH` / `IOS_APP_PATH` | — | Path to APK / app bundle                                          |
| `IOS_UDID_<n>`   | `auto`      | Per-worker UDID for parallel iOS sims (`IOS_UDID_0`, `IOS_UDID_1`, …)        |

### Performance overrides

| Variable        | Default | Description                                            |
|-----------------|---------|--------------------------------------------------------|
| `PERF_PROFILE`  | smoke   | `smoke` / `load` / `stress`                            |
| `PERF_USERS`    | 20      | Ramp target (load) or burst size (stress)              |
| `PERF_DURATION` | 120     | Ramp duration in seconds (load only)                   |

## Cross-platform locators

```json
{
  "streetInput": {
    "web":    { "responsive": "[data-testid='address-responsive']", "desktop": "[data-testid='address-desktop']" },
    "mobile": { "android":    "android=new UiSelector().description(\"input-address\")", "ios": "~input-address" }
  }
}
```

Steps and molecules use logical keys (`streetInput`); the proxy resolves them based on `PLATFORM` + `VIEWPORT`. The same suite runs across all surfaces unchanged.

Locator files are cached and watched recursively. Editing a `*.locators.json` file invalidates the cache; set `TOM_LOCATOR_WATCH=false` to disable hot reload.

## Docker

```bash
pnpm grpc:certs:dev                          # local CA + per-service certificates
docker compose up                              # web + api
docker compose --profile mobile up             # android emulator + appium daemon + appium plugin
docker compose --profile performance up        # standalone Gatling
```

The `mobile` profile chains: `android-emulator (docker-android)` → `appium-server` → `appium` plugin.

## CI / CD

| Workflow                    | Purpose                                                                  |
|-----------------------------|--------------------------------------------------------------------------|
| `ahm-execution-helix.yml`   | Unified test execution: api, web (desktop + responsive), android, ios, perf. Manual dispatch via `platform: all\|api\|web\|mobile\|android\|ios\|perf`. |
| `deploy-pages.yml`          | Static site deploy when `web/**` changes (GitHub Pages).                 |

The Helix workflow gates jobs by the `platform` input on manual dispatch. **On `push`/`pull_request` to `main`, every job runs** — including `e2e-android` (KVM + docker-android) and `e2e-ios` (`macos-latest`) — because each gate's `if` is `github.event_name != 'workflow_dispatch' || inputs.platform == …`, and the first operand is already `true` for push/PR. A published OmniPizza release is therefore a prerequisite for *all* event-triggered runs, not only mobile dispatches. (If you want mobile to be manual-only, the gate `if:` blocks must be tightened to `github.event_name == 'workflow_dispatch' && …`.)

Each job is named after the **tool** that executes it (`Playwright`, `Appium`, `Gatling`, `Pixelmatch`) rather than the platform — consistent with the *plugin identity = the tool* principle, so a status check names exactly which engine ran. The job **keys** (`e2e-web`, `e2e-android`, …) are unchanged, so `needs:` wiring and the `update-visual-baselines.yml` references stay intact; only the display names shift. If branch protection requires checks by their old display name, update those required checks in repo settings.

### Before you run `ahm-execution-helix.yml`

The workflow assumes a few things already exist in the repo. Set these up **once**, then trigger runs freely.

**1. Repository secrets** — _Settings → Secrets and variables → Actions → Secrets_:

| Secret          | Needed by                                                        | Notes                                                            |
|-----------------|------------------------------------------------------------------|------------------------------------------------------------------|
| `API_BASE_URL`  | **every** job (api, web, responsive, visual, android, ios, perf) | Backend used for `$S_0$` state injection.                        |
| `BASE_URL`      | web + visual jobs only (`e2e-web*`, `visual-web*`)               | Frontend under test. Not read by api/mobile/perf jobs.           |
| `GITHUB_TOKEN`  | `resolve-omnipizza-release`                                      | **Automatic** — GitHub injects it. No setup needed.              |

**2. Repository variables** — _Settings → Secrets and variables → Actions → Variables_:

| Variable          | Needed by                          | Notes                                                                        |
|-------------------|------------------------------------|------------------------------------------------------------------------------|
| `IOS_APP_PATH`    | `e2e-ios` (optional)               | Overrides the auto-discovered `.app` bundle path. Omit to auto-discover.     |
| `VISUAL_BASE_URL` | `update-visual-baselines.yml` only | The baseline-refresh workflow reads this as its `BASE_URL`. Required to seed baselines (step 4). |

**3. OmniPizza release must be published** (`gsanchezm/OmniPizza`) — required because mobile runs on every push/PR (see note above):

- The repo's `releases/latest` must exist with assets named **exactly** `omnipizza-release.apk` (Android) and `OmniPizza-Simulator.zip` (iOS). The resolver job reads `tag_name` from `/releases/latest`; the mobile jobs download `<base_url>/<asset>`.
- `gsanchezm/OmniPizza` must be **public** — the API query sends a `GITHUB_TOKEN` Bearer (scoped to *this* repo only), but the asset download uses an unauthenticated `curl -fL`. For a private OmniPizza you'd need to supply a PAT secret and add `-H "Authorization"` to the download.

**4. Seed visual baselines (recommended, not mandatory):**

- The `Visual gate` step does **not** fail on missing baselines — a snapshot with no baseline is *bootstrapped* (created on the fly, counted as `bootstrapped`, status ≠ `FAIL`). So a first run won't go red just because `visual-baselines/` is empty.
- But bootstrapped baselines are ephemeral (per-run). For meaningful drift detection, seed canonical baselines first by dispatching **`update-visual-baselines.yml`** (requires `VISUAL_BASE_URL` from step 2):

  ```bash
  gh workflow run update-visual-baselines.yml -f reason="seed initial baselines"
  # optional: -f target_branch=main
  ```

  It wipes `visual-baselines/*.png`, regenerates them in the pinned `playwright:v1.61.1-jammy` Linux container, `git add -f`'s them, and opens a PR. **Merge that PR** so the canonical PNGs land in git. Thereafter the helix `Visual gate` compares against them.

**5. Dispatch the workflow** — _Actions → "AHM — Execution Helix" → Run workflow_, or via CLI:

```bash
gh workflow run ahm-execution-helix.yml -f platform=web
gh workflow run ahm-execution-helix.yml -f platform=perf -f perf_profile=load -f perf_users=30 -f perf_duration=60
gh workflow run ahm-execution-helix.yml -f platform=mobile -f android_api_level=33
```

**What each `platform` choice needs** (push/PR ⇒ `all`):

| `platform` | Requires                                                                 | Dispatch inputs honored                                  |
|------------|--------------------------------------------------------------------------|----------------------------------------------------------|
| `api`      | `API_BASE_URL`                                                           | —                                                        |
| `web`      | `API_BASE_URL` + `BASE_URL` (+ baselines recommended for the visual sub-jobs) | —                                                   |
| `android`  | `API_BASE_URL` + OmniPizza release (`omnipizza-release.apk`)             | `android_api_level`                                      |
| `ios`      | `API_BASE_URL` + OmniPizza release (`OmniPizza-Simulator.zip`) + `IOS_APP_PATH` (optional) | —                                      |
| `mobile`   | both android + ios prerequisites                                         | `android_api_level`                                      |
| `perf`     | `API_BASE_URL`                                                           | `perf_profile`, `perf_users`, `perf_duration`            |
| `all`      | all of the above                                                         | all of the above                                         |

## Stack

| Concern             | Library                                            |
|---------------------|----------------------------------------------------|
| BDD framework        | @cucumber/cucumber                                |
| Language             | TypeScript (no build step — `ts-node` everywhere) |
| Aliases              | `tsconfig-paths` (`@kernel/*`, `@plugins/*`, …)   |
| Web automation       | playwright                                         |
| Mobile automation    | webdriverio + appium (UiAutomator2 / XCUITest)     |
| Performance          | @gatling.io/{core,http,cli}                        |
| Visual oracle        | pixelmatch + pngjs                                 |
| RPC                  | @grpc/grpc-js + @grpc/proto-loader                 |
| Logging              | pino + pino-pretty                                 |
| Telemetry storage    | minio                                              |
| Container            | docker + docker compose                            |

---

## Appendix: theoretical foundations

The architecture is grounded in three formal constraints that distinguish it from heuristic test-strategy metaphors (Test Pyramid, Trophy, Honeycomb). You don't need any of this to use the suite — but it explains *why* the suite is shaped the way it is.

### Atomic Helix Model (AHM)

AHM defines *how tests execute* through formal constraints rather than prescribing *how much* to test at each layer:

- **Set Theory isolation** — $S_{A1} \cap S_{A2} = \emptyset$. Each scenario operates on a disjoint state set; cross-test contamination is a definitional impossibility, not a discipline problem.
- **π-Calculus message passing** — every cross-process communication is a typed gRPC intent. No shared memory, no global state mutation between layers.
- **Chaos Suppression** — Lyapunov exponent $\lambda < 0$. The proxy detects transient failures (stale elements, network jitter, detached nodes) and absorbs them via exponential backoff. Deterministic failures fail immediately without retry.

### Layer mapping

| AHM layer          | Implementation                                                                                                                |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------|
| ⚛️ Atoms           | `kernel/client.ts` — `sendIntent()` indivisible primitives                                                                    |
| 🧬 Molecules       | `[domain]/molecules/` — grouped intents, cross-platform                                                                         |
| 🦠 Organisms       | `[domain]/organisms/` — orchestrate molecules, decide which plugin to call                                                       |
| 🌍 Eco-Systems     | `[domain]/features/` + `step_definitions/` — BDD scenarios, thin bindings                                                     |
| 🌊 Resonance       | `[domain]/resonance/` — Gatling load simulations driven by the same Examples table                                          |
| 🌀 Execution Helix | `.github/workflows/` — CI/CD pipelines uniting all layers into parallel, isolated orbits governed by mathematical constraints |

### Adapting other test categories

- **Visual, accessibility, API — all cross-cutting quality attributes are contracts, never a new domain.** There is no `visual/` or `accessibility/` folder under `src/core/tests/`. Each domain's `contracts/` holds one declarative JSON artifact per concern (`*.locators.json`, `*.api.contract.json`, `*.visual.json`, `*.a11y.json`), consumed by *existing* scenarios via a tag — no duplicate feature files, no pseudo-domain.
  - **Visual** — `COMPARE_SNAPSHOT` intent, owned by the `pixelmatch` plugin, driven by `*.visual.json`. Wired as an `After({tags: '@visual'})` hook: fires post-scenario, diff failures are logged (not thrown) since the real gate is CI's baseline workflow.
  - **Accessibility** — `RUN_ACCESSIBILITY_AUDIT` / `VALIDATE_ACCESSIBILITY_THRESHOLDS` intents, owned by the `axe` action set co-located in the Playwright plugin (`PLUGIN_AXE=true`), driven by `*.a11y.json`. Wired as an explicit `Then` step (not an After hook, unlike visual) — see `catalog/step_definitions/catalog.steps.ts` + `CatalogRoute.verifyAccessibilityGate()`. The reason it differs from visual: `catalog` is the one domain that loads alphabetically before `checkout` in cucumber's `require` glob, so an After hook there would race `checkout.steps.ts`'s global session-reset hook and could audit an already-navigated-away page. An explicit step runs in-sequence, before any After hook, so it's immune to that race. Real violations throw (unlike visual) — axe *is* the gate, not just a report signal.
  - **Security — placement proposed, not yet implemented.** ZAP and MobSF don't split as cleanly: some checks are per-domain/contract-shaped (`RUN_ZAP_API_SCAN`, `RUN_SCHEMA_FUZZ` — tie to an existing `*.api.contract.json`), others are whole-app/infra-shaped (`RUN_ZAP_BASELINE_SCAN`, `RUN_TLS_CHECK`, `RUN_MOBSF_APK_SCAN` — no single owning domain, closer to `support/`). See `CLAUDE.md`'s "Security placement — proposed split" for the current analysis.
- **DAST (load-shaped)** — a security check that specifically probes behavior under *concurrent adversarial traffic* (not a one-shot crawl) is the one genuinely Resonance-shaped security citizen — same feeder mechanics as load tests, payload becomes the attack surface.
- **SAST** — outside the AHM kernel. Static analysis doesn't carry stochastic noise, so $\lambda < 0$ doesn't apply. Runs as a regular CI job.
- **Unit tests** — outside the kernel. They evaluate code locally, no network jitter; should live alongside source code.

### Visual oracle: baselines + bucketing + threshold

Three design decisions worth knowing before authoring or extending visual snapshots:

- **Baselines live in `visual-baselines/` (tracked) but PNGs are gitignored locally** (`.gitignore: visual-baselines/*` + `!visual-baselines/.gitkeep`). Canonical baselines come exclusively from the `update-visual-baselines.yml` workflow which runs in the Playwright-jammy container and `git add -f`'s the PNGs into a PR. Locally, `pnpm visual:refresh` regenerates baselines for iteration, but those stay invisible to git so dev fonts (Windows ClearType, macOS subpixel) never pollute the committed Linux-rendered set.
- **Snapshot keys bucket by `<feature>/<snapshotId>/<platform>/<viewport>/[<market>/][<language>/]`.** The market and language segments are optional and propagate from `world.orderContext`/`world.locale`/`world.languageOverride` through the visual hook's options JSON. Two scenarios with the same market but different language land on different baselines — the right granularity for i18n testing.
- **Threshold policy is OR-logic.** A snapshot passes if either `pixelRatio` OR `pixelCount` is satisfied. Defaults are zero for both (strict equality if the contract says nothing). The previous AND behavior silently vetoed a satisfied dimension if the other defaulted to zero — a `pixelRatio: 0.01` declaration is now respected on its own.

To accept a legitimate UI change: trigger `update-visual-baselines.yml` workflow_dispatch with a `reason`, review the resulting PR, merge. The next PR's `e2e-web` Visual gate goes green automatically.

### Performance: TOM-driven vs standalone

Both modes run the same `checkout-load.gatling.ts` simulation. The difference is provenance:

- **Standalone** — Gatling CLI invokes the simulation directly. Used for CI gates, HTML reports, and manual capacity planning.
- **TOM-driven** — a Cucumber step issues `INTENT.RUN_CHECKOUT_LOAD`; the `gatling` plugin spawns Gatling as a subprocess, parses `target/gatling/<report>/js/stats.json`, and returns `SimulationMetrics` in the gRPC `payload`. PASS when KO rate < 1%, FAIL otherwise (which propagates to the Cucumber step).

### JVM boundary

`@gatling.io/core` and `@gatling.io/http` call `Java.type()` at module load and only work inside the Gatling JVM bundle. They must **never** be imported from `src/plugins/gatling/gatling.ts` or any handler running in the Node plugin server. Simulations are spawned as subprocesses; the plugin server only orchestrates and parses results.

Files under `src/core/tests/checkout/resonance/**` keep relative imports — `@gatling.io/cli` bundles them with esbuild, which doesn't honor `tsconfig.paths`.
