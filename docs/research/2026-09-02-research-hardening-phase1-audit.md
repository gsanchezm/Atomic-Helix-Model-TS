# Atomic Testing Research Hardening — Phase 1 Repository Audit

**Date:** 2026-09-02
**Status:** Phase 1 complete (repository impact audit). No implementation performed; no campaigns launched.
**Responds to:** *"Atomic Testing Paper — Research Hardening and Experimental Execution Plan"* (the hardening brief), Sections 9 (Deliverable A), 10 (agent questions), and 12 (Phase 1).
**Method:** 8 parallel full-file audits over the paper source, both CI workflows, the campaign orchestrator, the non-atomic twin artifact, Cucumber configuration and tag inventory, the fault-injection instrument, raw experimental data, and application-artifact provenance. Load-bearing claims were independently re-verified against the working tree.

---

## 0. Overall verdict

The hardening brief is accurate against the repository. Nearly every §1 (paper) finding corresponds to text the paper actually contains, and most of the §3 (workflow) infrastructure it asks for already exists in partial form: batch/run-index identity inputs, a three-layer fault-injection instrument, a strictly sequential campaign orchestrator, and a release resolver. Nothing requested conflicts irreconcilably with the architecture; everything is implementable.

The audit surfaced **one confound the brief does not name** (finding **b**: the completed determinism campaign ran with asymmetric retry between arms), **one urgent data-preservation issue** (finding **a**: no raw campaign data is committed anywhere, and GitHub artifact retention expires ~late November 2026), and **four decisions** that need the author before Phase 2 begins (findings **c–f**).

---

## 1. Brief §1 vs. the actual paper text

All line numbers refer to `docs/paper/atomic-testing-formal-definition.md` (1,579 lines, read in full).

| Brief item | Status in the paper |
|---|---|
| **1.1** AHM/TOM as reference impl. only | **Partial.** Narrative framing is already correct — intro lines 33–42 ("one architecture-level instantiation of the approach … other, non-AHM instantiations remain possible in principle"), conclusion 1392–95. But the formal core contradicts the framing: see 1.4 and 1.5. |
| **1.2** R/W sets | **Applies as written.** `S_t` is one undifferentiated union — "the union of the data it reads, writes, and depends on" (line 338) — and Rule 2 requires the whole union disjoint, reads included (line 365). `R_t`/`W_t` appear nowhere. The paper's own evaluation already reasons informally in mutable terms (§3.2.4 lines 788–91 "shared mutable state"; §4.1 lines 889–91 "no account-keyed backend state") — the formalism lags its own evaluation. Note: the `@writes-shared-state` escape hatch (Corollary 2, lines 439–41) survives under the new R2 — it marks shared *writes*, which the new rule still forbids. |
| **1.3** API-Hydrated Preconditions | Applies; today Rule 3 is "No UI-driven setup" via `S_0(t)` (line 366). The `P_t = H_t(I_t)` reformulation is compatible; no conflict. |
| **1.4** Chaos suppression out of R4 | **Applies as written — clearest defect.** "chaos suppression" sits *inside* Definition 1 three times (preliminaries lines 344–47; Rule 4 line 367; predicate expansion lines 374–75), while line 82 claims a "formal, tool-agnostic definition" and §2.5.3 (lines 507–09) concedes Rules 3–4 "presuppose an execution architecture … which TOM supplies." Internal contradiction. |
| **1.5** Platform invariance reframing | Applies. Corollary 1's own derivation (lines 422–29) leans on "any plugin server the kernel can route an intent to" — i.e., it already depends on the architecture more than the "follows mechanically" claim (lines 85–87) admits. The brief's split (atomicity property vs. architecture-enabled property) describes what the text already does without saying so. |
| **1.6** Parallel safety → mutable-state non-interference | Applies. Corollary 2 claims "safe to execute under arbitrary concurrent scheduling" (lines 434–42). The rename is consistent with the reframing §3.2.4/§4.1 already performed after the null result. All 10 occurrences catalogued (abstract ×3, §1.2, §2.2, Corollary 2, §3.2.4, §5 ×1, §6 ×2). |
| **1.7** "causal" → "controlled comparative" | **Applies as written:** "causal" appears 12 times, including "comparative, causal design" (line 609) and "the paper's central causal claim" (line 1317). |
| **1.8/1.9** New runs only for gaps; reuse existing data | Feasible — see §3 (data availability) and finding (a). Cluster-aware re-analysis is possible today on this machine. |
| **1.10** Weaken 29× claim | **Essentially already compliant.** The paper never says "29× more deterministic"; it says "pass-to-fail transition rate … a 29-fold divergence dominated by a shared locator-resolution failure mode" (abstract lines 15–17) with an explicit non-generalization caveat (§4.3 lines 1104–06) — nearly the brief's requested wording. A companion "~98×" population-instability framing exists at lines 1094–96. |
| **1.11** One oracle = one semantic behavior | Applies. The paper mixes phrasings — Rule 1 is *named* "Single behavior" but glossed "asserts exactly one thing" (line 364); the §2.3.3 counterexample is behavior-level (lines 383–86) — and never resolves whether several physical asserts may compose one oracle. |
| **1.12** Novelty hedging | Applies at one point: exactly **one** absolute — "No existing definition states test well-formedness as a checkable, per-scenario predicate…" (abstract, line 8; verified). The two §2.1/§2.2 "None of them/None of the six" claims (lines 121–23, 308–09) are scoped to the surveyed bodies and are defensible. Related work already covers isolation/flaky (§2.1.2) and xUnit fixture patterns (§2.1.6, hedged "to the best of our reading", line 287); FIRST and informal prior "atomic test" usage must be checked during the rewrite. |
| **1.13** Keep the name | No conflict. |
| **1.14** Master manuscript first | Process guidance; note the DOCX (doctoral template) was generated from the current `.md` on 2026-09-01/02 and will need regeneration after the rewrite. The `.md` is the master. |
| **1.15** Rename diagnosability → failure containment | **Applies as written.** Section title is "4.2 Diagnosability" (line 908); metric is named "blast radius" (11 occurrences); "failure containment" = 0 occurrences. The underlying data **already separates** the two measurements the brief demands: `reports/diagnosability-table.json` records classifier localization (`reportedBuckets` histogram) separately from the skipped-step data (`failedScenarioSteps`). Bonus cleanup: line 949 references an internal "design doc §6" from published prose. |
| **1.16** Failure-exposure amplification | Mostly aligned already (abstract attributes the divergence to the shared locator-resolution mode); the amplification interpretation should become the explicit frame of §4.3. |
| **1.17** Fairness claims | **Applies with a nuance.** The internal-guard divergence **is disclosed** — §4.2 lines 1032–43 (zero-price guard at `checkout.route.ts:501-502` vs. the twin's `unit_price ?? 0` with no guard) and §5 lines 1203–10 — but §3.2.2 still asserts "the assertions' intent … identical between arms" (line 656) without reconciliation. Exactly the requested fix: reflect the divergence in Methodology and Threats, not only in Results/Discussion. |

---

## 2. Answers to the brief's Section 10 questions

**Q1 — Can the atomic functional suite be selected cleanly without visual/a11y/security/performance scenarios?**
Yes, with a counterintuitive twist: **`@visual`, `@a11y`, and `@performance` must NOT be excluded.** Per project convention they are piggyback contracts on functional scenarios — excluding `@visual` would drop 21 of ~24 functional UI outlines — and they no-op when `PLUGIN_PIXELMATCH`/`PLUGIN_AXE` are false (`visual.hooks.ts:35-36`; `catalog.route.ts:123-127`). Only `@security` needs excluding (its ZAP scenario also carries `@api`). Proposed expressions: web `@desktop and not @security and not @security-infra`; mobile `@android and not @security` / `@ios and not @security`; API `@api and not @security`. **One tag-hygiene gap:** `checkout/features/place-delivery-order.feature:52` (`@desktop @a11y`) is the repo's only a11y-*only* scenario — under the web expression it rides along and passes vacuously with the plugin off. Fix: give it its own tag (e.g. `@a11y-only`) or document it as one hollow pass.

**Q2 — Is there a retry:0 research profile for the atomic suite?**
**No.** Only the twin has `retry: 0` (`nonAtomicTwin` profile, `cucumber.js:55`); the atomic `default` profile hardcodes `retry: 1` (`cucumber.js:29`) and retry is not env-parameterizable. A dedicated research profile must be created (Deliverable C).

**Q3 — Can the horizontal E2E artifact run on iOS without modifying scenario semantics?**
**Mechanically yes** (independently verified): every logical key on the journey has an `appium.ios` entry in the contracts (including `orderSuccessScreen`, which lives in the `order_success` domain contract → `~btn-order-details`); dynamic selectors go through the iOS-aware `mobileTestId()` (`support/mobile-selector.ts:23-28`); the reused molecules already embed the atomic iOS suite's workarounds; and the twin's own branches switch on `DRIVER`, never `PLATFORM` — so `PLATFORM=ios DRIVER=appium` takes the seed-cart/fresh-API-token path Android already proved green. **But it has never been executed.** The comment in `execution-efficiency-delta.ts:30-36` ("the twin has no iOS implementation at all … building the twin's entire iOS port first") **overstates the gap** — there is no twin-specific iOS code to write; what is untested is behavior (deep-link checkout hydration, API-token login fallback on the iOS build). **Deliverable F classification: verification/infrastructure gap — not a plugin gap, not a test-implementation gap.**

**Q4 — How is the iOS artifact obtained; can it be pinned?**
`OmniPizza-Simulator.zip` from `releases/latest` of `gsanchezm/OmniPizza` (helix resolver `ahm-execution-helix.yml:256-294`, download `:1368-1382`). **Pinnable with a small parameterization**: an `omnipizza_release_tag` dispatch input short-circuiting the `/releases/latest` query. The resolver exists in **two copies** today (helix + campaign workflow `ahm-evaluation-campaign.yml:148-177`); the new experiment workflow would carry a third. Asset filenames are tag-invariant, so the tag alone identifies the build. Same mechanism pins the Android APK.

**Q5 — Can the backend version be pinned or recorded?**
**Not pinnable from this repo** (Render service `omnipizza-backend.onrender.com`, deployed by the sibling project) **and today not even recorded**: no code anywhere queries a `/health`/`/version`/build-info endpoint (warm-up only probes liveness, `warm-up.ts:21-24`). Same for the web frontend at `secrets.BASE_URL`. This limitation is hereby reported before execution, as brief §3.14 requires. Options: (i) add a version endpoint to the OmniPizza backend (author controls that repo) and stamp it into run manifests; (ii) record release tag + manual deploy-freeze during campaigns. See finding (f).

**Q6 — Which scripts depend on the literal twin names?**
Complete rename impact list: `scripts/experiments/lib/campaign-matrix.ts` (the `Arm` type, `GH_PLATFORM_INPUT`, `WORKFLOW_FILE`, `JOB_NAME_PREFIXES` — which exact-match the rendered job names "Eval — Non-atomic Twin (…)" — `EXPECTED_JOB_COUNT`, `PRIMARY_STEP_NAME`, `artifactNamesFor`), `diagnosability-table.ts:32-33`, `parallel-safety-table.ts:31`, `execution-efficiency-delta.ts` (filename regexes `/non-atomic-twin-web\.jsonl$/`), `portability-delta.ts:79-128`, `measure-reliability.ts`, the `nonAtomicTwin` cucumber profile, `package.json:20-21`, both workflows, and `src/kernel/fault-injection.ts:56` (comment). Additionally **192 raw metric files** (`metrics/raw/cucumber-jsonl/`, `metrics/raw/run-manifest/`) and 7 processed/summary artifacts embed the old name in filenames *and* content, and campaign-manifest item ids embed the arm literal (`determinism__twin__web__001`).

**Q7 — Rename now, or compatibility layer?**
**Compatibility layer.** Use `horizontal-e2e` naming only in the **new** workflow/orchestrator layer; leave `evaluation/non-atomic-twin/` paths, the cucumber profile, and all historical matchers untouched. A full rename would orphan every past campaign manifest (resumability + idempotent aggregation keyed on item ids) and break matchers against 192 historical data files. The brief itself permits this ("existing paths/scripts may retain legacy names temporarily").

**Q8 — Can fault injection target early/middle/late symmetrically in both strategies?**
**Not today.** The hook receives only the `actionId` (`injectedFaultFor(actionId)`, `chaos-proxy.ts:292`; match at `fault-injection.ts:85`); it fires on the first `maxFires` matching calls per proxy process; `maxFires` is a retry-survival budget, not a positional selector; and the logical-key `targetSelector` is never passed into the hook. **The change is small and localized**: pass `targetSelector` into the hook + a `TOM_INJECT_FAULT_TARGET` env (optionally a skip-N counter), threaded through the workflow inputs. Proposed symmetric definition of *position* — **by logical key**: EARLY = first `CLICK` on `loginButton`; MIDDLE = `CLICK` on a topping button; LATE = `CLICK` on `placeOrderButton`. The same spec hits both arms at the semantically equivalent action; in the atomic arm each position lands in a *different scenario*, in the twin at a different point of the same journey — which is precisely the contrast Campaign A measures. Constraint from Q15: use only fault classes both arms observe identically (LOCATOR/UI-interaction class, not ASSERTION_FAILURE).

**Q9 — Does telemetry identify run/scenario for run-level aggregation?**
**Yes.** `workflow_run_id`, `workflow_attempt`, `run_index`, `job_name`, `run_id` are *required* by `metrics/schemas/experiment-record.schema.json:12-19` and populated in all 6,570 `det-2026-campaign` rows (120 distinct `workflow_run_id`s, exactly one per (tool, run_index) cell, single commit `f68d45d8…`). Cluster-aware/bootstrap statistics can group by dispatch directly. Caveat: `reports/execution-efficiency-samples.json` stores flat ms arrays without per-sample run ids — dispatch-level clustering for the twin's ~16 samples/dispatch must be re-derived from the raw jsonl (all present locally).

**Q10 — Same framework/plugin versions across arms?**
Yes: same commit per batch, same lockfile, Playwright pinned (`PLAYWRIGHT_VERSION: '1.61.1'` / pinned container image in both workflows), same shared chaos-proxy on :50051, Node 22.

**Q11 — Hidden differences in retry/parallelism/timeouts/env/startup between strategies?**
**Yes — four, one of them material:**
1. **Retry: atomic 1 vs. twin 0** in the *completed* determinism campaign — see finding (b). Known and deliberately compensated only in fault injection (`max_fires` 2 vs. 1, `campaign-matrix.ts:346`), not in determinism measurement.
2. Parallelism: web defaults to `CUCUMBER_PARALLEL=4` in both arms' workflows; Android always 1. (Determinism dispatches did not override web parallelism.)
3. Job shape: atomic web runs **two jobs** (reads+writes matrix, each with its own proxy process — which also doubles the per-process fault-injection latch, see `diagnosability-table.ts:54-63`) vs. the twin's single job.
4. Two workflow files (deliberate 2026-08-29 split for concurrency-group isolation; env blocks are verbatim copies, so drift risk rather than present drift).
Stagger is present in both arms equally (not an asymmetry, but noise — Q14). Timeouts identical (no `timeout-minutes` anywhere; cucumber step timeout 300000 in both profiles).

**Q12 — Can the orchestrator pair by run_index, strictly sequential?**
Already strictly sequential: dispatch → `waitForNewRun` → `waitForRunCompletion` → 30 s cooldown, with `assertNothingInFlight` guarding both workflow files (`run-campaign.ts:436-491, 642-694`). Pairing by shared `run_index` exists structurally, but dispatch *order* is leg-by-leg (all 30 atomic-web before any twin-web). For Campaign B, interleave pairs (atomic-001, twin-001, atomic-002 …) — a small matrix-builder change that brings paired runs closer in backend time.

**Q13 — Does the latest-release resolver need replacing/parameterizing?**
Parameterize (see Q4). Two existing copies + the new workflow's own.

**Q14 — Is random stagger still necessary once serialized?**
**No, for research runs.** `sleep $(( RANDOM % 76 ))` exists in 8 places (6 in helix, 2 in the campaign workflow); its purpose is spreading login load when a `platform=all` dispatch launches many jobs concurrently. Under the orchestrator's one-run-at-a-time regime it only adds 0–75 s of noise to duration measurements. Caveat: if the new workflow's atomic arm kept the reads+writes two-job matrix, a residue of the original justification would remain — resolved by finding (d)'s single-job recommendation.

**Q15 — Implementation-level coverage differences that could invalidate a comparison?**
Yes, one known and disclosed: the zero-price guard divergence (atomic `checkout.route.ts:501-502` vs. twin `prepareCheckoutContext` with no equivalent guard). Practical consequence for Campaign A: **do not use ASSERTION_FAILURE-class faults** — the twin cannot observe them; use the locator/UI-interaction class both arms observe identically. Twin also runs no visual/a11y/security contracts (already honestly excluded from diagnosability via `DIAGNOSABILITY_EXCLUDED_BUCKETS`).

---

## 3. Raw-data availability (brief §1.9, §2.3, §5)

Everything needed for the statistical re-analysis **exists on this machine, and none of it is committed**:

- `metrics/processed/scenario_outcome_history.csv` — 9,606 rows (3.2 MB), 6,570 in `det-2026-campaign`: complete 30×(98+89+16+16) grid, one `workflow_run_id` per cell, single commit SHA. **Gitignored** (`.gitignore:91`).
- `metrics/raw/cucumber-jsonl/` — 180 determinism files covering all 120/120 dispatches, one JSON line per scenario with per-step status/duration/errorMessage. **Gitignored** (`.gitignore:87`).
- `reports/campaigns/campaign-*.json` — the dispatch ledger with all GH run IDs (the only key to re-downloading artifacts). **Gitignored** (`.gitignore:101`).
- Efficiency: 21 ingested pairs today (web 11, Android 10). Top-up to 20/20 needs +9 web pairs (18 dispatches) and +10 Android pairs (≥20 dispatches; ~26 realistic at the observed 10/13 usable rate).
- Diagnosability: 20 dispatches, all completed, full per-dispatch records in `reports/diagnosability-table.json` (58 KB) including `reportedBuckets` and `failedScenarioSteps`.
- `measure-reliability.ts` is batch-safe (the 2026-08-31 cross-batch pooling fix keys transitions by `experiment_batch_id`, lines 100–117); batch-scoped slices are the correct determinism source.
- **Version provenance gap:** no backend/app version field exists in any schema or record; the mobile release tag resolved in CI lands only in step logs, never in TOM records.

**GitHub Actions artifacts expire ~90 days after the 2026-08-29→31 campaign — around late November 2026.** After that, the local working tree is the only per-step record in existence. See finding (a).

---

## 4. Findings requiring the author's decision before Phase 2

**(a) URGENT — archive the raw data now, independent of everything else.**
Commit (or archive to a data branch / Zenodo) `metrics/processed/scenario_outcome_history.csv`, the `metrics/raw/cucumber-jsonl/` + `run-manifest/` trees, `reports/campaigns/*.json` (the run-ID ledger), and `reports/{diagnosability-table,execution-efficiency-samples,parallel-safety-table,portability-delta}.json`. This simultaneously satisfies the replication-package promise in the paper's Appendix A. **Decision: where (repo / data branch / Zenodo DOI).**

**(b) Confound the brief does not name: the completed N=30 determinism campaign ran with asymmetric retry (atomic 1, twin 0).**
`scenario_outcome_history.csv` records *final* scenario status, so an atomic flake healed by cucumber's retry does **not** count as a P→F transition, while the identical flake in the retry-0 twin does. Part of the 29× could therefore be retry policy, not authoring discipline. The impact appears small — the paper itself reports "Android atomic: 1 flaky (1.0%)" — and it is **quantifiable from existing data**: cucumber marks retried-then-passed scenarios as flaky, so the Campaign C re-analysis can run a sensitivity re-count treating each flaky as an attempt-1 failure and report the ratio's range. Must enter Threats to Validity regardless. **Decision: accept sensitivity-analysis + disclosure treatment (recommended) vs. rerun.**

**(c) Campaign A containment metric must be defined before execution (brief §2.1 requires it).**
The current metric is the *within-failed-scenario* skipped-step fraction — its denominator does not trivially reward shorter scenarios (a shorter failed scenario has a *smaller* denominator, raising the fraction), but it has a real residual confound the code audit surfaced: the fault's *position within the failing unit* is part of the measured effect, not held constant — which is exactly what Campaign A's early/middle/late stratification addresses. **Proposal: report two metrics per dispatch:** (i) the current within-failed-scenario fraction, and (ii) **suite-level oracle loss** = (failed + skipped oracles) / total oracles in the dispatch — scenario-length-invariant and directly comparable across arms, stratified by fault position. **Decision: approve the dual definition.**

**(d) Atomic-arm job shape in the new workflow.**
Today the atomic web arm runs as two jobs (reads+writes) vs. the twin's one. For maximal §3.4 symmetry, the recommendation is that `atomic-testing-experiment.yml` run the atomic arm as **one job** with the full functional tag expression, `CUCUMBER_PARALLEL=1`, retry 0, no stagger — accepting that this changes execution shape vs. prior campaigns (backward comparability limited; forward comparability exact). The helix workflow stays unchanged for ordinary CI. **Decision: approve single-job atomic arm.**

**(e) The freeze cannot be a SHA via the orchestrator.**
`gh run list --branch` accepts only branch names (documented limitation, `run-campaign.ts:166-170`). The §4 experimental freeze should be a **dedicated frozen branch** (`atomic-testing-experiment-v2`) plus an annotated tag, with the SHA recorded in each run's manifest (job-level schema already requires `commitSha`; the orchestrator's own manifest records only the ref — small change to add SHA + app versions).

**(f) Web frontend/backend pinning is impossible from this repo — record-only unless OmniPizza changes.**
Real pinning requires levers in the sibling repo (a `/version` endpoint + a deploy freeze during campaigns). **Decision: add the OmniPizza-side endpoint to the plan, or accept "record release tag + manually freeze the Render deploy during campaigns."**

### Minor findings (no decision needed)
- Stale cross-references: the twin README/feature, `cucumber.js:33-38`, both workflow headers, and root README still point at paper "§8.x" — the paper was renumbered (evaluation → §3.2, results → §4). Fix during implementation.
- The paper's line 949 cites an internal design doc from published prose (§1.15 above).
- `.env.example:73` (`assets/apps/ios/app-ios.zip`) is stale vs. the `.app`-directory convention CI uses.
- iOS was excluded from *repeated* campaigns for macOS-runner concurrency reasons (campaign design doc, 2026-07-23, lines 118–122); Campaign E's one-shot smoke is compatible with that constraint.
- The efficiency samples file lacks per-sample run ids (re-derivable; note for Deliverable G).

---

## 5. Proposed Phase 2 scope (pending decisions a–f)

1. `.github/workflows/atomic-testing-experiment.yml` — inputs `test_strategy` (atomic | horizontal-e2e), `platform` (web | android | ios), `experiment_batch_id`, `run_index`, `omnipizza_release_tag` (required), `cucumber_parallel` (default '1'), `android_api_level` (default '33'), fault knobs incl. new `fault_target`/`fault_position`; retry 0 both arms (new research profile + existing `nonAtomicTwin`); no stagger; no visual/perf/security/a11y jobs; own concurrency group; per-run manifest artifact (identity env + resolved release tag + versions).
2. Cucumber research profile for the atomic arm (`retry: 0`, functional tag expression from Q1; decide the `@a11y-only` tag fix).
3. Fault-injection extension: pass `targetSelector` into `injectedFaultFor` + `TOM_INJECT_FAULT_TARGET`; position mapping per Q8.
4. Orchestrator: point at the new workflow via the compatibility naming layer; interleaved pair dispatching; record SHA + release tag in the manifest.
5. Smoke validation of all 6 strategy×platform combinations (Phase 3) — **no scientific campaign** until the freeze (Phase 4).

## 6. Evidence index

Full per-area audit reports (8 files, with exhaustive file:line citations) were produced during this audit; the load-bearing claims above were re-verified directly against the working tree on 2026-09-02: stagger lines (`ahm-evaluation-campaign.yml:242,411`; helix ×6), retry values (`cucumber.js:29,55`), campaign inputs (`ahm-evaluation-campaign.yml:44-94`), `max_fires` rationale (`ahm-execution-helix.yml:92`), iOS job presence (helix `e2e-ios`) and absence (campaign workflow), the abstract's absolute novelty claim (paper line 8), the twin's iOS locator coverage (checkout + order_success contracts), and the determinism raw data (6,570 `det-2026-campaign` rows; gitignore status of the CSV and campaign ledger).
