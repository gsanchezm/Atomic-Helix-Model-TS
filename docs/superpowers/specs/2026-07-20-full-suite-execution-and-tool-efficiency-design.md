# Full-Suite Clean Execution + Tool Efficiency Dashboard

**Date:** 2026-07-20
**Scope:** three coupled phases — (0) close the two known coverage gaps and verify/fix the execution-blockers surfaced in prior bug docs, (1) a local orchestrator that runs all 7 tool categories in a specified order with correctness-preserving parallelism and captures per-tool wall-clock execution time, (2) a new "Tool Efficiency" dashboard section that charts that timing data, grouping only genuinely comparable tools (e.g. Playwright vs WebdriverIO, never vs Appium). Builds on the existing dashboard (`apps/dashboard/`, see `2026-05-24-test-dashboard-design.md`, `2026-07-17-category-sidebar-design.md`, `2026-07-19-performance-test-type-tabs-design.md`) and the existing local orchestrator (`scripts/orchestrate-full-run.sh`).

## 1. Goals

- Reach a genuinely clean, all-green run across all 7 requested categories, in this order: Web desktop+responsive (Playwright, then WebdriverIO) → Mobile (Mobilewright, then Appium) → Performance (Gatling smoke/load/stress) → API → Visual (Pixel Match) → Accessibility (Axe) → Security (ZAP, then MobSF).
- Close the 2 known coverage gaps: an automated `@a11y` scenario for Checkout, and a `ScrollTo` action for mobilewright.
- Verify and fix (not just document) the execution-blockers found in `docs/bugs/omnipizza-bug-report-2026-07-18.md` that would otherwise prevent a clean run: Appium's real-device login locator, WebdriverIO's apparent single-scenario execution, and mobilewright's deep-link/login 403.
- Capture true tool-execution wall-clock time (suite start → suite end, excluding stack bring-up/teardown) per tool run, and surface it in the dashboard as a new, separate "Tool Efficiency" section.
- Parallelize wherever it's actually safe given real constraints discovered in this repo (see §3), not naive full concurrency.

## 2. Non-goals

- **New Gatling injection profiles or simulation files.** Reuses the existing `checkout-load`/`invalid-login-load` simulations; only the profile (`smoke`/`load`/`stress`) changes via `PERF_PROFILE`.
- **iOS.** Not part of the requested 7-category order; left untouched.
- **A charting library.** Continues the repo's existing hand-rolled inline-SVG convention (`Speedometer.tsx`, `PassFailDonut.tsx`); no recharts/d3/chart.js.
- **CI workflow changes.** `.github/workflows/ahm-execution-helix.yml` and its `standard-user-writes` concurrency groups are unchanged — this is a local-execution feature. CI's coarser job-level locking exists because GitHub Actions runners don't share the in-process write-lock (see §3); that reasoning doesn't apply locally and isn't being "fixed" here.
- **Restructuring the write-lock itself** (`src/kernel/write-lock.ts`, `chaos-proxy.ts`). It already does the right thing (§3); this work reuses it, doesn't change it.
- **Historical run backfill.** `reports/` doesn't exist in this repo yet. The efficiency charts render correctly with one data point after the first run and fill in as future runs accumulate — no synthetic history is generated.
- **Making `SERVER_PORT_NUMBER` configurable.** Out of scope; the orchestrator works within the existing fixed-port, one-stack-at-a-time reality (§3) rather than changing kernel code to support multiple simultaneous stacks.

## 3. Key constraint discovered: one shared write-lock, one fixed port

Two facts change what "parallelize where possible" safely means here:

1. **The write-lock is real infrastructure, not just a CI convention.** `@writes-shared-state`-tagged scenarios acquire/release a lock (`src/core/tests/support/write-lock.hooks.ts` → `INTENT.ACQUIRE_WRITE_LOCK`/`RELEASE_WRITE_LOCK`) handled by a single module-level `WriteLock` instance inside `src/kernel/chaos-proxy.ts` (`const writeLock = new WriteLock()`). Any driver process talking to the *same* chaos-proxy instance is correctly serialized on writes by this lock already — CI's `standard-user-writes` concurrency group exists because separate GitHub Actions runners don't share that in-process lock, not because the lock itself is inadequate.
2. **`chaos-proxy.ts` binds a hardcoded port** (`SERVER_PORT_NUMBER = 50051`, no env override). Only one chaos-proxy can run locally at a time — two concurrent `start-stack.sh` invocations (e.g. one for Playwright, one for WebdriverIO) would collide on that port. So true concurrency between two proxy-routed tools requires them to share *one* running stack, not each start their own.

This means the correct local model is: **one stack per proxy-dependent category, multiple driver invocations run concurrently against that single stack, and the existing write-lock — not manual sequencing — is what keeps `@writes-shared-state` scenarios correct.** Categories that never touch the proxy (Gatling — confirmed standalone in `orchestrate-full-run.sh`'s Phase F comment; ZAP/MobSF — Docker-based scans) aren't subject to the port constraint and can run alongside a proxy-bound category.

| Category | Uses chaos-proxy (port 50051)? | Can run concurrently with... |
|---|---|---|
| Web (Playwright + WebdriverIO) | Yes, one shared stack | Security (ZAP/MobSF); Gatling smoke only |
| Mobile (Mobilewright + Appium) | Yes, one shared stack | Security; Gatling smoke only |
| Visual (Pixelmatch), Accessibility (Axe) | Yes — ride inside the Playwright process (`PLUGIN_PIXELMATCH`/`PLUGIN_AXE`) | Solo-tool phases positioned later in the required order (after Mobile/Performance/API) — each gets its own `start-stack.sh web` → run → teardown cycle when its turn comes, same lifecycle the existing script already uses for Visual today; no stack-sharing with the earlier Web phase is possible once that stack has torn down |
| API | Yes (proxy-routed, per `PLUGIN_API` in existing Android phase) — confirm exact routing during implementation | Security; Gatling smoke |
| Performance (Gatling) | No — standalone | Everything, **except**: load/stress must run exclusive of any other category (below) |
| Security (ZAP, MobSF) | No — Docker-based | Everything except Gatling load/stress |

**Gatling load/stress exclusivity**: even though Gatling doesn't touch the proxy, it hits the same backend under test. Running load/stress concurrently with anything else generating traffic against that backend (functional suites, ZAP's active scan) would both skew Gatling's throughput numbers and risk flaking the concurrent suite. Smoke is light enough to overlap freely; load and stress get the target alone. This directly answers the brainstorming question about parallel policy: serialize what shares mutable state or a contended target; parallelize everything else.

## 4. Decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| "All green" scope | Stabilize existing coverage *and* close the 2 known gaps (axe-Checkout, mobilewright ScrollTo) *and* verify/fix the 3 execution-blockers from the 2026-07-18 bug doc. | User-selected. Exploration found the Appium locator bug is real and root-caused (wrong locator strategy for this APK); the WebdriverIO and mobilewright-403 claims could not be confirmed statically — both get verified empirically in Phase 1's recon pass (§6), not pre-assumed. |
| Run mode | Local, this session. | User-selected. No single local command covers all 7 categories today; `scripts/orchestrate-full-run.sh` only covers phases B–G (web, visual, Gatling smoke, conditional Android) and needs extending, not a from-scratch replacement. |
| Timing granularity | Pure tool execution time (suite start → suite end), via orchestrator-level wrapping. | User-selected. ~1/10th the surface area of instrumenting all 10 plugin servers individually; uniform since every tool is a child process from one script; matches exactly what's being asked ("efficiency of each tool"), unlike the existing cucumber step-duration sums which already undercount (see `Counts.duration` in `apps/dashboard/src/shared/types.ts`). |
| Parallel policy | Share one stack per proxy-bound category, rely on the existing write-lock; standalone categories overlap freely except Gatling load/stress. | Grounded in §3's verified constraints, not assumption. Matches the user's requested category order for the proxy-bound phases (Web before Mobile is required by the one-stack-at-a-time reality anyway) while genuinely parallelizing what doesn't conflict. |
| Chart grouping | Paired categories (Web: Playwright vs WebdriverIO; Mobile: Mobilewright vs Appium) get 2-series charts; solo categories (Gatling, API, Pixel Match, Axe, ZAP, MobSF) get 1-series run-over-run trend charts. | User-selected. ZAP and MobSF scan different targets (web vs mobile) and aren't a fair comparison despite both being "Security" — each gets its own trend line, not paired against the other. |
| Dashboard placement | New dedicated nav section (not folded into per-tool detail pages), reusing the hand-rolled SVG chart convention. | User-selected ("apartado aparte"); a 2-series comparison chart doesn't fit a single-tool detail page, and no charting library exists in the repo today. |
| Live execution vs. code-writing orchestration | Live test/scan execution runs via direct shell orchestration, never through parallel isolated agents. Code changes (Phase 0 fixes, orchestrator script, dashboard feature) may use parallel isolated agents with worktree isolation. | Isolated agents can't honor the shared write-lock, the fixed proxy port, the single MobSF container, or real device contention — those require one coordinating process with real shared state. Code changes have no such requirement. |

## 5. Phase 0 — Stabilization

Concrete, pre-specified fixes:

- **Mobilewright `ScrollTo` action** (`src/plugins/mobilewright/actions/ScrollTo.ts`, new): follows the existing mobilewright action shape (see `ClearText.ts`/`WaitForElement.ts` for the `ActionHandler<MobilewrightActionContext>` pattern) and mirrors Playwright's simplest case (`locate(...).scrollIntoViewIfNeeded()`) or Appium's platform-branching version if mobilewright's element handle needs iOS/Android-specific scroll gestures — confirmed during implementation by reading both reference files in full. Registered in `registerMobilewrightActions.ts` alongside the existing 9 actions.
- **Checkout `@a11y` automated scenario**: new scenario in `src/core/tests/checkout/features/place-delivery-order.feature` (or a new feature file if checkout's existing scenarios are all `@writes-shared-state` and an a11y-only pass shouldn't inherit that tag), reusing the existing `RunAccessibilityAudit`/`ValidateAccessibilityThresholds` actions and `verifyAccessibilityGate`-style step unchanged — only a new accessibility contract (mirroring the catalog one) and the Gherkin/step wiring are new. This was previously closed via manual verification only; this phase adds the automated harness coverage that was never built.
- **Appium login locator fix**: `src/core/tests/login/contracts/login.webdriver.locators.json` — the appium strategy for `welcomeTitleText`/`usernameInput` (and any sibling login locators using the same `~content-desc` convention) is wrong for the currently-built APK, which exposes these via Android resource-id, not content-desc (root-caused in `.superpowers/sdd/progress.md` Task 6 via `adb shell uiautomator dump` against device `R5CX71NFF9H`). Fix updates the appium strategy value to the correct resource-id-based selector; exact values confirmed against a live `uiautomator dump` during implementation (the prior root-cause note didn't record the corrected value, only the diagnosis).

Verified-empirically-first (no fix pre-specified — root cause unconfirmed):

- **WebdriverIO "only first scenario" claim**: static config review found no evidence — `cucumber.js`'s feature glob resolves all 9 feature files regardless of `DRIVER`, and no hardcoded index or narrowing filter exists. The one WebdriverIO-specific mechanism that *could* produce this symptom is session reuse (`ensureSession()` in `src/plugins/webdriverio/webdriverio.ts` caches one `Browser` per run with no per-scenario teardown hook) — consistent with the "session reuse" bug noted in prior-session history. Phase 1's recon pass (§6) runs the WebdriverIO web suite first; if it reproduces, root-cause and fix at that point via the standard debugging flow, scoped to whatever actually breaks (likely session/state cleanup between scenarios, not scenario discovery).
- **Mobilewright 403 on deep-link login**: no version number is pinned anywhere in this repo's mobile config (`ANDROID_APP_PATH=assets/apps/android/omnipizza-release.apk`, no version in the filename or device passports), so whether the currently-built APK already includes the app-side auth-token-wait fix can't be determined statically. Recon pass runs mobilewright's Android suite; if the 403 reproduces, this is an app-version/build problem to flag back to the OmniPizza team (per the prior finding that this was an app-side fix, not an AHM harness fix), not new AHM code.

## 6. Phase 1 — Orchestrator + timing capture

### 6.1 Recon pass (runs first, before any fix work beyond the pre-specified Phase 0 items)

Before deep-diving stabilization further, run each category once cheap (existing smoke/read-only scenarios only) to ground-truth actual current state rather than trusting doc claims (the explore work already found one doc claim — a "ZAP crash"/"MobSF 404" — that doesn't match anything in code). This also produces the first real timing sidecar file, validating the timing → ingest → chart pipeline against live data early rather than discovering a capture bug after a multi-hour full run.

### 6.2 Script structure

Extends `scripts/orchestrate-full-run.sh` (rather than a parallel replacement) with new phases and a timing wrapper. Each tool invocation — currently a raw `bash ci/steps/run-suite.sh ...` or `pnpm perf:*`/`pnpm plugin:*` call — gets wrapped:

```bash
run_timed() {
  local tool="$1" category="$2" subtype="$3"; shift 3
  local started ended
  started="$(node -e 'console.log(new Date().toISOString())')"
  "$@"
  local status=$?
  ended="$(node -e 'console.log(new Date().toISOString())')"
  node scripts/write-timing.js --tool "$tool" --category "$category" --subtype "$subtype" \
    --started "$started" --ended "$ended" --run-id "$RUN_ID"
  return $status
}
```

(`node -e` for timestamps, not `date`, for consistent ISO-8601 formatting across the Windows/Git-Bash and Linux CI environments this script already branches on elsewhere.) `scripts/write-timing.js` (new, small) writes `reports/<runId>/timing/<tool>-<subtype>.json`:

```json
{ "tool": "playwright", "category": "web_ui", "subtype": "desktop", "startedAt": "...", "endedAt": "...", "durationMs": 143200 }
```

New/changed phases, in the requested order, applying §3's concurrency table:

1. **Web** — one `start-stack.sh web` call; `run_timed playwright web_ui desktop` and `run_timed playwright web_ui responsive` (existing `@desktop`/`@responsive` tag filters), plus new `run_timed webdriverio web_ui web` launched concurrently against the same stack (background job + `wait`), each writing its own timing sidecar.
2. **Mobile** — one `start-stack.sh android` call (existing conditional pre-flight kept); `run_timed mobilewright mobile_ui android` and `run_timed appium mobile_ui android` concurrently against that stack.
3. **Performance** — `run_timed gatling performance smoke`, then `run_timed gatling performance load`, then `run_timed gatling performance stress`, strictly sequential per §3 (each may itself run concurrently with Security, started as background jobs from the orchestrator around this block — implementation detail, not a phase reordering).
4. **API** — `run_timed api api standalone`.
5. **Visual** — `run_timed pixelmatch visual desktop` / `responsive` (existing `visual-regen.js` calls, wrapped — already a separate script/process from the Web phase today, so no double-run concern).
6. **Accessibility** — `run_timed axe accessibility a11y`: a dedicated Playwright invocation, `PLUGIN_AXE=true`, tag-filtered to `@a11y` only (catalog's existing scenario + the new Checkout scenario from Phase 0). This is a genuinely new phase, not a flag flip on the Web phase — today's script never sets `PLUGIN_AXE=true` at all, so Accessibility currently never executes locally. Filtering to `@a11y` keeps it a small, cheap, clearly-separate pass rather than re-running the full desktop/responsive suite a second time.
7. **Security** — `run_timed zap security web` and `run_timed mobsf security android`, launched concurrently with each other (already independent per existing CI concurrency-group precedent) and, where the schedule allows, overlapped with earlier non-Gatling-load/stress phases.

### 6.3 Ingest wiring

`apps/dashboard/scripts/ingest-run.ts` gains one more read step: after writing each tool's canonical JSON as today, it also reads `reports/<runId>/timing/*.json` (glob, tolerant of a missing directory — older runs or a failed capture shouldn't break ingest) and writes a consolidated `reports/<runId>/timing.json`:

```ts
interface ToolTiming { tool: string; category: ToolKind; subtype: string; startedAt: string; endedAt: string; durationMs: number; }
// reports/<runId>/timing.json: ToolTiming[]
```

No changes to any existing per-tool JSON shape (`Counts.duration` etc. stay exactly as-is) — this is purely additive, sibling data.

## 7. Phase 2 — Dashboard "Tool Efficiency" section

### 7.1 Data model (`apps/dashboard/src/shared/types.ts`, additive)

```ts
export interface ToolTiming {
  tool: string;
  category: ToolKind;
  subtype: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

// One entry per run that has a timing.json, newest first — the cross-run series the charts read.
export interface EfficiencyRunPoint {
  runId: string;
  startedAt: string;      // from that run's ManifestEntry
  timings: ToolTiming[];
}
```

### 7.2 Server (`apps/dashboard/src/server/`)

- `runs-repo.ts` gains `getTiming(runId): Promise<ToolTiming[]>` (reads `reports/<runId>/timing.json`, `[]` on ENOENT — mirrors `getRawToolReport`'s tolerant-read style).
- New route `GET /api/efficiency`: calls `listRuns()` (existing), then for each `runId` calls `getTiming(runId)`, filters out runs with no timing data, returns `EfficiencyRunPoint[]` sorted newest-first (reuses `listRuns()`'s existing sort). Capped to the most recent 20 runs to keep the payload bounded — flagged, not silently unbounded.

### 7.3 Client

- New route `/efficiency`, added as a sibling to the existing `runs/:runId` routes in `router.tsx` (top-level, not run-scoped — it spans all runs).
- New nav entry: `Topbar.tsx` gets a link alongside `RunPicker`, since `SideNav`'s category model is per-run/per-`ToolKind` and this view is neither.
- New page `EfficiencyView.tsx`, fetches `/api/efficiency` once, renders one chart per grouping:
  - **Paired**: `<EfficiencyChart series={[{tool: 'playwright', points}, {tool: 'webdriverio', points}]} title="Web: Playwright vs WebdriverIO" />`, and the same shape for Mobile.
  - **Solo**: `<EfficiencyChart series={[{tool: 'gatling', points}]} title="Performance: Gatling" />`, repeated for API, Pixel Match, Axe, ZAP, MobSF.
- New component `EfficiencyChart.tsx` — hand-rolled inline SVG line chart, following the existing components' construction style (fixed `viewBox`, computed path via simple linear scaling of `durationMs` over the point index, `currentColor`/palette strokes per series, small circle markers per point, a simple axis label for oldest/newest run). With a single data point (first run), renders one marker with no line — same "renders correctly with sparse data" requirement `PassFailDonut`'s `empty` prop already models, followed here rather than inventing a new empty-state convention.
- Grouping table (`apps/dashboard/src/client/efficiency-meta.ts`, pure data, no React — mirrors the existing `perf-type-meta.ts` pattern):

```ts
export const EFFICIENCY_GROUPS = [
  { title: 'Web', category: 'web_ui', tools: ['playwright', 'webdriverio'] },
  { title: 'Mobile', category: 'mobile_ui', tools: ['mobilewright', 'appium'] },
  { title: 'Performance', category: 'performance', tools: ['gatling'] },
  { title: 'API', category: 'api', tools: ['api'] },
  { title: 'Visual', category: 'visual', tools: ['pixelmatch'] },
  { title: 'Accessibility', category: 'accessibility', tools: ['axe'] },
  { title: 'Security — Web', category: 'security', tools: ['zap'] },
  { title: 'Security — Mobile', category: 'security', tools: ['mobsf'] },
] as const;
```

Security is deliberately split into two solo groups (not one paired group) — ZAP and MobSF scan different targets, matching the brainstorming decision that they aren't a fair comparison.

## 8. Edge cases

- **A run with no `timing.json`** (older run, or a run where the orchestrator wrapper wasn't used): excluded from `/api/efficiency`'s response entirely, not shown as a zero/gap — avoids implying a tool ran in 0ms.
- **A tool present in some runs' timing data but not others** (e.g. Security skipped on a partial run): that series simply has fewer points than others on the same chart; the x-axis is per-series run order, not a shared grid requiring every series to have every run.
- **First-ever run**: single point per series, no line segment — see §7.3's `EfficiencyChart` sparse-data handling.
- **`durationMs` of 0 or negative** (clock skew, a tool that failed instantly): rendered as-is rather than filtered, since a suspiciously fast failure is itself useful signal; not in scope to build anomaly detection here.

## 9. Tests

- `apps/dashboard/test/` — new tests for `getTiming()` (reads real file / `[]` on missing), the `/api/efficiency` route (shape, 20-run cap, runs-without-timing excluded), and `EfficiencyChart.tsx` (single point renders without a line; multi-point renders correct path point count; empty series renders the shared empty state).
- Phase 0's mobilewright `ScrollTo` gets exercised by at least one real scenario that needs it (not just a unit test of the action in isolation) — confirms it works against a real device/emulator, not just that the code compiles.
- Phase 0's Checkout `@a11y` scenario is itself the test — passing it automated is the acceptance bar that closes this gap.
- Phase 1's orchestrator run **is** the end-to-end validation: a genuinely clean, all-green run across all 7 categories in the specified order is the acceptance bar, not a separate test suite.
- `scripts/write-timing.js` gets a small unit test (writes the expected shape given start/end args).

## 10. Implementation order

1. Phase 0's 2 pre-specified fixes (mobilewright `ScrollTo`, Checkout `@a11y`) — independent of each other, can build in parallel (worktree-isolated if parallelized).
2. Phase 0's Appium locator fix — independent of step 1, can build in parallel.
3. Phase 2's data model + server (`ToolTiming`, `getTiming()`, `/api/efficiency` route) — depends on Phase 1's timing.json shape being fixed (§6.3), not on Phase 1's script actually existing yet; can be built and tested against a hand-written fixture `timing.json` in parallel with steps 1–2.
4. Phase 2's client (`efficiency-meta.ts`, `EfficiencyChart.tsx`, `EfficiencyView.tsx`, routing/nav) — depends on step 3's types; `EfficiencyChart.tsx` itself has no data dependency and can start in parallel with step 3.
5. Phase 1's orchestrator script changes (`run_timed` wrapper, `write-timing.js`, new phases, `ingest-run.ts`'s timing.json read) — depends on steps 1–2 existing (so the recon/full run has something to verify) and step 3's `ToolTiming` shape (so ingest writes what the server expects.)
6. Recon pass (§6.1) — first live run, using the finished Phase 1 script, before the WebdriverIO/mobilewright-403 investigations.
7. WebdriverIO and mobilewright-403 root-cause + fix, only if recon reproduces them.
8. Full clean run across all 7 categories, in order — the actual deliverable. Re-run any category that goes red, fixing root causes as they surface, until genuinely all-green.
9. Ingest the clean run; verify the Efficiency section renders real data correctly.

Steps 1–4 have no dependencies on each other and can proceed in parallel (worktree-isolated per §4's isolation decision); step 5 is the first to depend on multiple earlier steps landing.

## 11. Risks / things to flag during implementation

- **Concurrent driver invocations against one stack is new** — today's orchestrator always pairs one `start-stack.sh` call with exactly one tool invocation. Running WebdriverIO and Playwright (or Mobilewright and Appium) as background jobs against a single already-running stack is unproven in this repo; confirm the write-lock and any per-driver session/port allocation inside the plugin servers themselves (not just chaos-proxy) actually tolerate two driver clients connected at once before trusting the concurrency table in §3 at face value.
- **API's proxy routing is assumed, not confirmed** — §3's table lists API as proxy-routed based on it appearing alongside `PLUGIN_APPIUM` in the existing Android phase; confirm this during implementation before deciding whether API can run standalone/concurrently or needs to share a stack like Web/Mobile.
- **`node -e` timestamp calls add small fixed overhead** (~tens of ms) to every timed invocation — negligible next to suite durations (seconds to minutes), not worth optimizing away.
- **The 20-run cap on `/api/efficiency`** is an arbitrary round number chosen to bound payload size with no real usage data yet to calibrate against; revisit once real run history accumulates if it turns out too small/large.
