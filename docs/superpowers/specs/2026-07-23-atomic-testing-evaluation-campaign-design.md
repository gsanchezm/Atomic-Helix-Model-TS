# Atomic Testing Paper — §8.4 Evaluation Campaign: Execution Environment & Parameters — Design

**Date:** 2026-07-23
**Status:** Approved (design); implementation pending
**UPDATE 2026-07-25:** every "Mobilewright" / `DRIVER=mobilewright` reference below is superseded —
the mobile instrument changed to **Appium** (`DRIVER=appium`) after Mobilewright proved unreliable
mid-evaluation (reproducible defect: whichever of two sequential expiry-date pickers on the checkout
card-entry screen opens *second* fails to open; confirmed positional, not timing, not a Mobilewright
dispatch bug, and not an app defect via a clean Appium cross-check on the same device/app build). See
`docs/paper/atomic-testing-formal-definition.md` §7.1 for the full disclosure. Left as originally
written below for the historical record of what was decided on 2026-07-23; read "Mobilewright-Android"
as "Appium-Android" throughout.

**UPDATE 2026-08-23:** §4 build-order step 1 ("verify and tune the existing twin") is now **fully
complete on both platforms** — Playwright green at K=16 (240/240 steps, `fdf7cf1`), Android green under
Appium (15/15 steps, `6561098`, after an interim Mobilewright attempt reached 13/15 and surfaced the
picker defect above, `342d2e0`). §2's "current-state finding" that `CUCUMBER_PARALLEL` is hardcoded is
also stale — `ahm-execution-helix.yml` now exposes it as a `cucumber_parallel` `workflow_dispatch`
input, closing build-order step 2 (likely an incidental side effect of unrelated 2026-08-21
stagger/jitter work, not a deliberate delivery of this step). Steps 3–5 (fault-injection harness,
portability LOC/files-touched tooling, campaign orchestrator) remain unbuilt. **New finding, not
accounted for in §3's approved parameters:** the determinism instrument's two arms are asymmetrically
exposed to backend load (twin does real UI login+cart-build per row; atomic arm does one API call) —
this project has since documented, independently, that concurrent CI load against the backend produces
mid-run 502/503/429 and that job-start jitter alone doesn't prevent mid-run collisions. Whoever designs
the build-order-step-5 orchestrator needs to fold in a concurrency cap and a disclosed
`INFRASTRUCTURE_FAILURE`-bucket exclusion/flagging rule for the determinism instrument specifically —
see `docs/paper/atomic-testing-formal-definition.md` §10.1's new entry (added 2026-08-23) for the full
argument. This is a design gap in §3/§5 below, not yet closed. Also note: the backend hosting plan was
upgraded off Render's free tier since §3's 156-dispatch cost estimate was written, verified via a
subsequent all-33-jobs-green `platform=all` run (`32614000923`) — this raises the load threshold before
the asymmetry above triggers but does not remove it structurally, since the determinism campaign's
actual concurrency (multiple simultaneous `workflow_dispatch` calls) is heavier than any single
`platform=all` run. Separately: **no CI job dispatches the twin at all today** (`grep -c
non-atomic-twin .github/workflows/ahm-execution-helix.yml` returns 0) — build-order step 5's
orchestrator needs to add that wiring, not just parameterize `cucumber_parallel` on jobs that already
exist. Last: the plugin-gap-vs-spec-forced classification §6 defers to "its own brainstorm" for the
portability tooling has a first pass already captured, from the build-order-step-1 fixes themselves,
in the paper's working notes (`docs/paper/atomic-testing-formal-definition.md`, the "Implement the
remaining delta instruments" bullet) — reuse it rather than re-deriving from `342d2e0`/`6561098`.
**UPDATE 2026-08-23 (later same day):** the "no CI job dispatches the twin at all today" gap noted
above is now closed. `ahm-execution-helix.yml` gained two new `platform` values (`twin-web`,
`twin-android`, plus a coarse `twin` that runs both) with their own gate jobs
(`gate-twin-web`/`gate-twin-android`) and the actual dispatchable jobs (`eval-twin-web`/
`eval-twin-android`), which run the `nonAtomicTwin` cucumber profile under Playwright/Chromium and
Appium/Android respectively — deliberately excluded from `platform: all` so an ordinary CI run can
never accidentally fire a §8.4 campaign dispatch. `eval-twin-web` exposes the existing
`cucumber_parallel` input for the parallel-safety sweep (1/2/4/8); `eval-twin-android` always runs at
parallel=1 (single emulator) since §3 decision 4's own dispatch-count math (8 = 4 worker levels × 2
arms, no platform multiplier) confirms the parallel-safety sweep was scoped to web only — Android's
role is the determinism (§3 decision 3, N=30) and portability (§3 decision 6) instruments, neither of
which needs worker concurrency. **This closes build-order step "CI wiring" as its own deliverable,
ahead of and independent from step 5.** The campaign orchestrator (§5, `scripts/experiments/run-
campaign.ts`) still does not exist — nothing yet drives these two jobs across the full ~156-dispatch
matrix, resumes after a partial failure, or enforces the concurrency cap / `INFRASTRUCTURE_FAILURE`
exclusion rule the 2026-08-23 (morning) update above flagged as a design gap. A single manual dispatch
of `platform: twin-web` or `twin-android` is possible today; the campaign at scale is not.

**Scope:** Decides *where* and *how many times* the four §8.4 evaluation instruments run, and the
order remaining build work happens in. Does not design the internals of the fault-injection harness
or the portability delta tooling — those get their own brainstorm when their turn comes (see §6).

## 1. Purpose

`docs/paper/atomic-testing-formal-definition.md` §8.4 defines four causal instruments (parallel
safety, diagnosability, determinism, portability) but leaves two things undecided, blocking any real
run: the execution environment, and the repeated-run counts needed for the determinism instrument
(working-notes TODO: "Decide the repeated-run plan (`experiment_batch_id` count)"). This design closes
both, plus a related undecided parameter (`K`, the twin's Outline row count for the parallel-safety
sweep), and sequences the remaining build work now that the scope is settled.

## 2. Current-state findings

- **CI already carries the identity plumbing.** `ahm-execution-helix.yml` (`workflow_dispatch` only)
  already exposes `experiment_batch_id` (default `batch-adhoc`) and `run_index` (default `'001'`) as
  inputs, threading them into `TOM_RUN_ID` and the run manifest. `docs/research/tom-quantitative-protocol.md`
  §8 already documents the intended mechanism: fix one `experiment_batch_id`, dispatch the workflow N
  times cycling `run_index` 001…N, aggregate afterward. Nothing new needs inventing here — it needs
  driving at scale.
- **`CUCUMBER_PARALLEL` is hardcoded, not swept.** `cucumber.js` reads it from env
  (`process.env.CUCUMBER_PARALLEL || '1'`), but the workflow hardcodes `'4'` for the two Playwright
  jobs only. No existing input parameterizes it — required for the 1/2/4/8 sweep.
- **CORRECTION (discovered 2026-07-23, post-approval):** the non-atomic twin already exists and is
  **not** a stub. `evaluation/non-atomic-twin/` is fully scaffolded: `checkout/features/full-order-journey.nonatomic.feature`
  (one cross-domain journey, currently **K=8** instance rows, login → catalog → pizzaBuilder →
  checkout), plus `catalog/step_definitions/`, `pizzaBuilder/{organisms,step_definitions}/`,
  `checkout/{organisms,step_definitions}/`, and a README documenting the disclosed R1/R2/R3
  violations. The `nonAtomicTwin` cucumber profile (`retry: 0`, parity otherwise with `default`)
  is live in `cucumber.js`, and `test:eval:non-atomic-twin`/`test:eval:non-atomic-twin:json` scripts
  exist in `package.json`. **What's actually missing is not construction — it's verification.** The
  twin has never been run live, on any driver (confirmed against project memory and the README's own
  framing). Its organisms reuse the atomic suites' domain routes (`CatalogRoute`, `PizzaBuilderRoute`
  via molecules, `CheckoutRoute`), which already branch on `DRIVER` internally (including a
  `mobilewright` branch) — so the Mobilewright leg is very likely **zero new construction**, just
  `DRIVER=mobilewright` against the same feature file. This is unverified until it actually runs; two
  spots flagged as worth checking first if the Playwright smoke run fails: a possible double-login
  (the journey's UI login vs. the shared Background step's API-only `loginAs`) and a possible
  cart-overwrite (checkout's API `addToOrder` step, if still reachable, would clobber a UI-built
  cart — needs confirming it isn't in this journey's path). See the corrected build order, §4.
- **Repo is public.** No GitHub Actions minutes budget ceiling applies (the 2,000–3,000 min/month
  figures are a private-repo concept); standard Linux/Windows/macOS runners are free under fair-use
  limits. This is why "everything in GitHub Actions" is affordable even at ~156 dispatches.
- **The diagnosability harness and portability delta tooling don't exist.** Working-notes TODO
  (line 41) already flags "Implement the four delta instruments" as not started. Only the mechanism
  (fault taxonomy, `failure-buckets.ts`) exists; the injection harness and the LOC/files-touched
  measurement do not.
- **`measure-reliability.ts`** (the determinism instrument's downstream consumer) needs ≥2 `run_index`
  values per `(scenario, tool_name, platform)` group to produce non-null transition probabilities; it
  has no built-in floor beyond that — the N chosen here is a paper-rigor decision, not a tooling
  requirement.

## 3. Approved decisions

1. **Environment: all four instruments run via GitHub Actions `workflow_dispatch`**, not locally or
   self-hosted. Reasoning: free on this public repo, reuses the existing `experiment_batch_id`/
   `run_index`/`architecture_type` plumbing as-is, and leaves a public, timestamped audit trail a
   reviewer can independently check — directly reinforcing §8.5's no-fabrication evidence policy.
2. **Determinism instrument scope widened to include Mobilewright.** Not just Playwright/web —
   Mobilewright-Android is a second platform arm. iOS is excluded from the *repeated* determinism runs
   (macOS runner concurrency is more constrained than Linux) but stays covered by the one-shot
   portability instrument, so Corollary 1's three surfaces (§7.1) are still exercised overall, just not
   all three at N=30 repetition.
3. **N = 30 run_index values per arm** for the determinism instrument. 2 arms (atomic, twin) × 2
   platforms (web, Mobilewright-Android) × 30 = **120 dispatches**. Chosen as a defensible round number
   giving the pass↔fail transition rate real robustness without the runner-time cost of N=50+ on a
   platform (Android) where a single dispatch already carries real emulator-boot overhead.
4. **K = 16 identical Outline rows** in the twin's parallel-safety journey, **1 dispatch per worker
   level** (1/2/4/8), both arms → **8 dispatches**. K=16 gives each sweep point a real concurrency
   sample within one run; repetition was judged unnecessary at this stage because the failure-rate
   curve's shape (where contention starts) is the object of interest, not a point estimate needing
   error bars.
5. **Diagnosability: 1 dispatch per fault × 14-bucket taxonomy × 2 arms = 28 dispatches**, unchanged
   from §8.4's existing text ("one representative fault per entry"). Not a determinism-style repeated
   metric — it's a single deliberate injection whose target is localization/blast-radius, not a
   transition rate.
6. **Portability: a static measurement, not a repeated run.** LOC/files touched porting each arm to
   Mobilewright. Because decision 2 already requires building the twin's Mobilewright-Android leg for
   the determinism instrument, that same construction effort is the one this instrument measures —
   no separate build.
7. **Orchestration: an idempotent campaign script**, not a rewritten workflow matrix. See §5.

Total campaign size: **120 + 8 + 28 = 156 `workflow_dispatch` calls**, plus the one-time portability
measurement captured during twin construction.

## 4. Build order (dependency chain) — REVISED post-discovery

Nothing below step 1 can run until the twin is confirmed working, so this is a strict sequence, not a
menu. Step 1 is no longer "build" — it's verify-and-tune, since the artifact already exists:

1. **Verify and tune the existing twin**, not build it from scratch:
   - Bring up the live stack (proxy + `playwright` plugin at minimum) and smoke-run
     `pnpm test:eval:non-atomic-twin` for the first time ever. Fix any genuine harness bugs surfaced
     (not the deliberate R1/R2/R3 violations the README documents as the measured signal — only real
     defects, e.g. a double-login or a cart-overwrite race, per the correction above).
   - Bump the Examples table from K=8 to **K=16** (this session's decision, §3) in
     `checkout/features/full-order-journey.nonatomic.feature`.
   - Once Playwright is green, set `DRIVER=mobilewright` (+ `PLUGIN_MOBILEWRIGHT=true` in `.env`,
     restart the plugin, a compatible `DEVICE_PROFILE`) and smoke-run the **same** feature file against
     Android. Only write new code here if the run actually reveals something missing — expect this to
     be a verification pass, not a construction task.
2. **Parameterize `CUCUMBER_PARALLEL`** in `ahm-execution-helix.yml` as a `workflow_dispatch` input for
   the two Playwright jobs (currently hardcoded `'4'`), enabling the 1/2/4/8 sweep.
3. **Build the diagnosability fault-injection harness** — targets the shared backend/network layer per
   §8.4's existing design note (fault must be genuinely shared between arms, not UI-vs-API setup).
4. **Build the portability delta measurement** — LOC/files-touched tooling. Since step 1 confirmed
   (rather than newly built) the Mobilewright-Android leg, this instrument's artifact is whatever diff
   step 1 actually produced (likely near-zero, which is itself the finding for Corollary 1).
5. **Build the campaign orchestrator** (§5) and run it. **CI wiring (the capability for
   `ahm-execution-helix.yml` to dispatch the twin at all) was pulled out of this step and delivered
   ahead of it, 2026-08-23 — see the "UPDATE 2026-08-23 (later same day)" note above.** What remains
   in this step is strictly the orchestrator script itself: driving `eval-twin-web`/`eval-twin-android`
   across the full campaign matrix, resumability, the concurrency cap, and the
   `INFRASTRUCTURE_FAILURE` exclusion rule.

## 5. Orchestration mechanism

**Decision: an idempotent orchestrator script** (`scripts/experiments/run-campaign.ts`) that wraps `gh
workflow run` per (arm × platform × run_index) combination, rather than:

- *(rejected)* a fire-and-forget script with no resume capability — a ~156-dispatch campaign spanning
  hours will hit transient failures (runner queue timeouts, a flaky infra bucket), and losing all
  progress on any single failure is not viable;
- *(rejected)* moving the repetition into the workflow file itself as a `run_index` matrix — would mean
  editing the 93 KB `ahm-execution-helix.yml`'s job surface for a concern (repetition count) that's
  orthogonal to what that file already parameterizes well via `workflow_dispatch` inputs, and departs
  from the "dispatch the workflow N times" mechanism `tom-quantitative-protocol.md` §8 already
  documents.

The orchestrator: for each combination, checks whether a run manifest for that `(experiment_batch_id,
run_index, tool_name, platform)` already exists before dispatching (resumable after interruption);
respects a concurrency cap to stay inside GitHub Actions fair-use limits; and logs a campaign manifest
so partial progress is auditable. Aggregation after dispatch reuses the existing `pnpm
metrics:experiment` pipeline unchanged — no new aggregation logic, since the manifest/CSV join already
supports multiple `run_index` values per batch.

## 6. Explicitly deferred (own brainstorm when reached)

- **Fault-injection harness internals** (build-order step 3): what fault to inject per bucket, how
  injection is triggered without touching the app under test, how "blast radius" is captured
  mechanically.
- **Portability delta tooling internals** (build-order step 4): what counts as a forced-by-spec change
  vs. a plugin-gap change (§8.4 already flags this distinction as requiring active bookkeeping).
- **Campaign orchestrator internals** (build-order step 5): exact resume/idempotency mechanism, GH API
  vs. `gh` CLI, concurrency cap value.

These are named here only so the build order is legible; none are designed by this document.

## 7. Paper document updates required (follow-up, not part of this spec)

Once this design is approved, `docs/paper/atomic-testing-formal-definition.md` should be updated to
reflect what's now decided (currently open TODOs/undecided values):

- Working notes: check off "Decide the repeated-run plan" (line 42), noting N=30, web + Mobilewright-
  Android, iOS excluded from repetition.
- §8.3 "Concurrency shape": fill in K=16 (currently an unbound variable).
- §8.3/§8.4: note the determinism instrument's platform scope explicitly (web + Mobilewright-Android,
  not just web) — this is a scope change from the document's current implicit web-only framing.
- §7.1 / §8.4: note that Mobilewright-Android twin construction is now shared infrastructure for both
  the determinism and portability instruments.
