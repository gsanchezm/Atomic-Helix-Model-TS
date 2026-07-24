# Atomic Testing Paper — §8.4 Evaluation Campaign: Execution Environment & Parameters — Design

**Date:** 2026-07-23
**Status:** Approved (design); implementation pending
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
5. **Build the campaign orchestrator** (§5) and run it.

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
