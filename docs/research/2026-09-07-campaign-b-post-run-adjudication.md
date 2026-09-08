# Campaign B — Post-Run Adjudication

**This is an adjudication record, not an edit to the original campaign definition.** It reclassifies what Campaign
B *is*, given what actually shipped and executed, and reports the one analysis (determinism/reliability) whose
pre-existing measurement definitions this audit found were frozen before Campaign B's first dispatch and are
compatible with its data unchanged. It does **not** modify `docs/research/2026-09-06-campaign-b-integrity-report.md`,
Campaign A, or Campaign B's raw data. It does not touch the manuscript.

## 3. Reclassification

The campaign that actually executed is structurally a:

**Campaign B — Symmetric-Retry Determinism Replication**

with: Atomic vs Horizontal E2E; Web + Android; N=20 independent dispatches per strategy/platform, paired by
run_index; retry=0 in both arms; no fault injection; `evaluation_slice=full`; frozen code SHA `274e398`.

It is **not** a preregistered confirmatory Execution Efficiency experiment. No run-level aggregation rule, primary
estimator, ratio/delta definition, or CI method for a duration/efficiency comparison was frozen before its first
dispatch (`docs/research/2026-09-06-campaign-b-integrity-report.md` §A/§E, unchanged by this document). This
adjudication does not introduce those definitions now and does not present any Atomic-vs-Horizontal efficiency
number as confirmatory. The original `campaign-b` label stays in paths/artifacts/manifests for provenance
compatibility — nothing in the pipeline is renamed.

---

## C. Determinism compatibility audit

**Verdict: YES — the pre-existing determinism/reliability instrument applies to Campaign B's real data unchanged,
with zero code modification, verified by actually running it, not by inspection alone.**

### The pre-existing definitions, and proof they predate Campaign B

- **Metric implementation:** `scripts/metrics/measure-reliability.ts`, present since the initial repository import
  (`f90ee8a`) — predates Campaign B (`274e398`, 2026-09-03) by the entire project history. Computes `pass_rate`,
  `fail_rate`, `flaky_scenario_count`, `pass_to_fail_probability`, `fail_to_pass_probability`,
  `infrastructure_failure_rate`, `tool_failure_rate` per `(tool_name, experiment_batch_id)` slice.
- **Scenario identity/grouping rule:** groups outcome rows by `${scenario}::${tool_name}::${platform}::${experiment_batch_id}`
  (`measure-reliability.ts:117`). This exact 4-key grouping was added in commit `2eeefe9` (2026-08-31 18:56 -0600,
  "§9.3 determinism reaches real N=30 results; fix cross-batch reliability-metrics bug" — found via
  `git log -S'experiment_batch_id' -- scripts/metrics/measure-reliability.ts`), specifically to prevent one
  campaign batch's repeated-run rows from being fabricated into transitions with another batch's rows sharing the
  same `run_index` scheme (the file's own dated inline comments document the empirical repro that motivated it) —
  predates Campaign B by 3 days and was written for exactly this kind of multi-campaign coexistence.
- **Run_index ordering:** lexicographic string sort on zero-padded `run_index` (`measure-reliability.ts:129-130`).
  Campaign B's `run_index` is zero-padded `'001'`–`'020'` (`campaign-matrix.ts:539`, `pad3()`), the same convention
  the original N=30 campaign used (`'001'`–`'030'`) — ordering is unaffected by the different N.
  **`unstable-scenario ("flaky") definition:** a scenario identity is flaky if its ordered outcome sequence within
  one batch contains both `PASS` and `FAIL` at least once (`measure-reliability.ts:133`) — unchanged.
- **Platform grouping:** `platform` is part of the same key — web and android are always separate slices, unchanged.
- **Existing exclusion rules:** none beyond requiring non-blank `tool_name`/`scenario`; the reserved sentinel `'ALL'`
  is excluded from per-batch slicing. No per-scenario or per-run exclusion logic exists in this script at all — it
  reports whatever `scenario_outcome_history.csv` gives it.
- **Upstream dependency:** the metric reads `metrics/processed/scenario_outcome_history.csv` and
  `failure_buckets.csv`, not raw jsonl directly. Those are produced by `scripts/metrics/normalize-telemetry.ts`
  (identity/platform/tool_name/batch/run_index columns sourced from `commonColumns()` reading the per-dispatch
  **run-manifest**, not from filename parsing — verified by reading the source) and
  `scripts/metrics/compute-failure-buckets.ts`. Both predate Campaign B.

### Empirical compatibility proof (not just inspection)

Ran the real pipeline against the real merged Campaign B artifacts (`pnpm metrics:normalize`, `pnpm metrics:failures`,
`pnpm metrics:quality:reliability` — all local, gitignored outputs under `metrics/`, nothing committed or shared):

- `experimentBatchId: "campaign-b-2026"` and `runIndex: "001"`-`"020"` are present verbatim in every Campaign B
  run-manifest (checked directly) — distinct from the original campaign's `det-2026-campaign` batch id, so **no
  batch-collision risk**, by construction.
- `normalize-telemetry.ts` correctly resolved `tool_name=playwright` (atomic/web), `horizontal-e2e-web` (twin/web),
  `appium-android` (atomic/android), `horizontal-e2e-android` (twin/android) for every Campaign B row — none
  `UNKNOWN`. **Note the twin's tool_name differs by label from the original campaign's twin
  (`non-atomic-twin-{web,android}`)** — this is the newer experiment-workflow's naming convention, already
  established (not invented here) and previously validated to represent the identical journey
  (`validate-experiment-ingestion.ts`, pre-Campaign-B). It requires knowing which label pairs with which when
  reading results across campaigns (done below) — it required zero code changes.
- **Row-count reconciliation, exact:** raw per-scenario counts are 96/16/106/16 (web-atomic/web-twin/android-atomic/android-twin)
  per the integrity report, but `scenario_outcome_history.csv` shows 1760/320/1960/320 total rows for
  `campaign-b-2026` (i.e. 88/16/98/16 per dispatch) — reconciled exactly: 8 scenario names per atomic dispatch
  collapse into one outcome row apiece because two Examples rows (a market/language pair, e.g. CH/de and CH/fr)
  render an **identical scenario title** when the title template interpolates only the market, not the language.
  This is a **pre-existing property of the atomic suite's own Outline titles**, already disclosed in
  `execution-efficiency-delta.ts`'s own comments (`findScenario()`, "e.g. catalog/pizzaBuilder Outlines interpolate
  only market into the title... so CH has two rows both named '... in CH'") — not introduced by Campaign B, not a
  normalize-telemetry.ts defect, and identical in kind for both campaigns (confirmed: it is uniform across every
  single dispatch in both `campaign-b-2026` and `det-2026-campaign`, never varying). It slightly reduces the
  *number of distinct tracked scenario identities* per dispatch (88/98 instead of 96/106) but does not change the
  grouping/transition algorithm or bias one campaign relative to the other.

**No code was written, and no measurement semantics were changed, to make this work.** The only "adapter" needed
was reading the right `tool_name` label for the twin arm — a fact-lookup, not a code change.

---

## D. Eight-failure ledger — no exclusions

All eight are Android, all `likelyInfra=false`, all backed by a complete/untruncated cucumber-jsonl (verified in
the integrity report §F.3) and provenance-status `verified` at the surrounding dispatches (all 8 read
`omnipizzaBackendProvenanceStatus=verified` directly on their own dispatch — checked). Backend commit
`9ca37674d374e9303912e259641ee86baf3aabe1`, frontend commit (web) same, Android APK sha256
`1059e9468145761710c9884b37e9fbc76da8e75eb9666dc0867d82a546cda6a4` — identical for all 8, no drift (integrity
report §B/§C).

| # | strategy | run_index | GH run id | timestamp (UTC) | scenario | failing step | failure_bucket | same scenario failed before? | other scenarios in same dispatch? | nearest other failure |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | atomic | 003 | 33831580545 | 2026-09-04T03:00 | Filtering by category narrows the catalog in JP | `Then only pizzas in category "meat" are visible` | MOBILE_SESSION_FAILURE | No — first known occurrence in either campaign | No (1/98 in this dispatch) | 2h15m to #2 |
| 2 | twin | 004 | 33839788837 | 2026-09-04T05:15 | Concurrent journey instance 14 | `Then the order is accepted` (checkout timeout, `btn-order-details` never rendered 90s) | LOCATOR_RESOLUTION_FAILURE | No — first occurrence of this signature | No (1/16) | 38m to #3 |
| 3 | atomic | 005 | 33842143395 | 2026-09-04T05:53 | Selecting toppings updates the estimated total for Margherita in MX | `text-estimated-total-value` not displayed after 5000ms | LOCATOR_RESOLUTION_FAILURE | **Yes** — same scenario, same locator, same error text as `det-2026-campaign`'s one known-flaky atomic-android scenario | No (1/98) | 5h32m to #4 |
| 4 | atomic | 008 | 33869073486 | 2026-09-04T11:25 | Selecting toppings updates the estimated total for Margherita in MX | identical to #3 | LOCATOR_RESOLUTION_FAILURE | **Yes** — same as #3, recurrence within Campaign B itself | No (1/98) | 12h31m to #5 |
| 5 | twin | 014 | 33932322029 | 2026-09-04T23:56 | Concurrent journey instance 1 | `When they log in as "standard_user"` → `TypeError: fetch failed` (network-level, not a UI assertion) | UI_ACTION_FAILURE | No | No (1/16) | 54m to #6 |
| 6 | atomic | 015 | 33934233440 | 2026-09-05T00:49 | Place a delivery order in US paying with credit card | checkout timeout, identical signature to #2 | LOCATOR_RESOLUTION_FAILURE | No (as its own named scenario) — but shares an identical error signature with #2 and #7 | No (1/98) | 1h0m to #7 |
| 7 | twin | 015 | 33938093504 | 2026-09-05T01:50 | Concurrent journey instance 13 | checkout timeout, identical signature to #2/#6 | LOCATOR_RESOLUTION_FAILURE | No (as its own named scenario) | No (1/16) | 5h36m to #8 |
| 8 | atomic | 018 | 33953251932 | 2026-09-05T07:25 (dispatched; completed 08:46) | **8 scenarios failed together** — see below | mixed | LOCATOR_RESOLUTION_FAILURE ×5, ASSERTION_FAILURE ×2, WEB_SESSION_FAILURE ×1 | 7 of 8 are first-time occurrences; 1 (delivery-order checkout timeout) shares #2/#6/#7's signature | **Yes — 7 co-failures** (8/98 in this dispatch) | 5h36m from #7 |

**Dispatch #8's 8 co-failures, individually** (all `appium-android`, run_index 018, GH run `33953251932`):
Catalog renders in SA/ar (`screen-catalog` timeout, 90s); Catalog shows the localized section title in MX/es (same
screen-catalog timeout); Opening a pizza card launches the builder in SA (same); Searching narrows the catalog by
name in CH (stale/wrong search results — "Marinara" search still shows Margherita/Pepperoni/Hawaïenne); Searching
narrows the catalog by name in JP (same pattern, different market); Searching narrows the catalog by name in SA
(`WebDriverError: KeyCharacterMap.getEvents` — UiAutomator2 cannot synthesize the Arabic keystroke); Place a
delivery order in MX (checkout timeout, distinct inline error "El código postal..."); Place a delivery order in US
(a *different* failure — `btn-option-12` payment-option element not displayed after 10s, not the checkout-timeout
signature).

**Groupings, as requested, purely descriptive — none is an exclusion:**
1. **Reproduced known flaky scenario:** #3, #4 (Margherita-MX toppings) — matches `det-2026-campaign`'s one
   documented flaky atomic-android scenario exactly.
2. **Repeated checkout-timeout cluster:** #2, #6, #7, plus one of #8's eight — four occurrences of the identical
   `order-success ('btn-order-details') never rendered ... within 90s` signature, spanning both arms and ~29 hours.
3. **Two-hour multi-symptom cluster:** #5, #6, #7 (2026-09-04T23:56–2026-09-05T01:50) — three different error
   signatures (network fetch failure, two checkout timeouts) within a tight window and adjacent run_indices.
4. **Eight-simultaneous-failure outlier:** #8 alone.

`likelyInfra=false` for all eight means these remain experimental outcomes; no existing validity rule in
`docs/research/2026-09-02-campaign-a-frozen-definitions.md` §13 or the integrity report's operational-validity
check (§B) reclassifies any of them, and none is treated as invalid here.

**A scope note on the "same scenario failed before?" column:** `det-2026-campaign` is a valid comparison for this
column specifically because it ran the same `evaluation_slice=full` atomic suite as Campaign B (§C confirms
identical per-dispatch distinct-scenario counts, 98/16 for both campaigns) — so a "No" above means "did not fail in
30 real repeats of the same full suite," not "was out of scope." **Campaign A is not a valid comparison for this
column** — it ran only the matched 7-scenario subset (`docs/research/2026-09-02-campaign-a-frozen-definitions.md`),
so most of these scenario names were never in Campaign A's scope at all; absence there proves nothing.

---

## E. Temporal/order audit

**Total campaign timeline:** 2026-09-03T20:03:13Z → 2026-09-05T13:35:07Z, 41.5h.

**Atomic→Horizontal gap, every one of the 40 pairs:** overwhelmingly a rock-solid ~30.0s (the scripted cooldown) —
37 of 40 pairs land within 29,985–30,315ms of each other, median 30,007ms. **3 pairs are anomalous**: android #8
(955.1s), android #10 (497.3s), android #19 (953.9s) — these are the same unexplained ~954s dispatch-gap pattern
already disclosed in the integrity report §B (ruled out as caused by the orchestrator's own retry/backoff or
in-flight guard; likely GitHub Actions' own dispatch-to-visible-run latency). None of the 3 anomalous-gap pairs
coincide with a failed dispatch in this data — they are a timing curiosity, not a data-quality one.

**Backend provenance over time:** commit `9ca3767...` verified unchanged from the first to the last provenance read
across the full 41.5h span (integrity report §C) — no drift to correlate against failure timing.

**Failure incidence vs. clock time:** the 8 failures split 4/4 across the first and second half of the campaign by
wall-clock (integrity report §F.3) — no gross first-half/second-half drift, though the 3-in-2-hour cluster (§D
above) and the run_index-018 8-failure outlier are both real, localized concentrations, not spread evenly.

**The atomic-first order confound — recorded as a limitation, not adjusted for.** `interleaveByRunIndex()` sorts
atomic before twin unconditionally; verified 0/40 pairs have twin dispatched first (integrity report §B). Because
every twin dispatch in this campaign ran against a backend that had just absorbed the paired atomic dispatch's
load, **treatment arm (atomic vs. twin) and within-pair execution order (first vs. second) are perfectly
confounded** — there is no way, from this data alone, to attribute any within-pair difference to the method itself
versus a systematic first-vs-second-dispatch effect (backend warm state, cache, connection pooling, or any other
order-dependent factor). No statistical adjustment removes this: adjustment requires observing both orders, and
this design never produced the twin-first order. This is a structural limitation of Campaign B's design, to be
disclosed alongside any result drawn from it, not something this document claims to resolve.

---

## F. Symmetric-retry determinism results — descriptive only, no overclaim

Computed via `measure-reliability.ts`'s own grouping logic (§C), verified by independently reproducing the
already-published retry-sensitivity figures exactly (`5/2836=0.1763%`, `23/441=5.2154%` — bit-for-bit match against
`docs/research/2026-09-02-retry-sensitivity-analysis.md` before trusting the Campaign B numbers below).

### Per-platform, per-strategy summary

| platform | strategy | N dispatches | distinct scenarios/dispatch | total obs. | FAIL obs. | flaky-scenario count | pass→fail rate |
|---|---|---:|---:|---:|---:|---:|---:|
| web | atomic (`playwright`) | 20 | 88 | 1,760 | 0 | 0 | 0/1,672 = 0.0000% |
| web | twin (`horizontal-e2e-web`) | 20 | 16 | 320 | 0 | 0 | 0/304 = 0.0000% |
| android | atomic (`appium-android`) | 20 | 98 | 1,960 | 12 | 10 | 12/1,850 = 0.6486% |
| android | twin (`horizontal-e2e-android`) | 20 | 16 | 320 | 3 | 3 | 3/301 = 0.9967% |

Web: both arms perfectly clean, 0 failures, 0 flaky scenarios, identical to the original N=30 campaign's web result
(also 0/0 both arms) — unchanged, no new information here.

**Android P→F ratio (twin/atomic), raw: 0.9967% / 0.6486% = 1.54×.**

### Comparison against the previous N=30 campaign — with the confound this ratio hides

| slice | P→F (exact) | vs. Campaign B |
|---|---|---|
| `det-2026-campaign` atomic-android, as officially recorded (retry:1, retry-healed final status) | 5/2,836 = 0.176% | — |
| `det-2026-campaign` atomic-android, retry-adjusted (attempt-1 reconstructed from job logs, `2026-09-02` doc) | 7/2,828 = 0.248% | — |
| `det-2026-campaign` twin-android (always retry:0, unaffected by the confound) | 23/441 = 5.215% | — |
| **`det-2026-campaign` ratio (twin/atomic)** | | **29.6× (original) / 21.1× (retry-adjusted)** |
| **`campaign-b-2026` atomic-android (real retry:0)** | 12/1,850 = 0.649% | 2.6–3.7× the old campaign's atomic rate |
| **`campaign-b-2026` twin-android (real retry:0)** | 3/301 = 0.997% | **0.19× the old campaign's twin rate** — a 5.2× drop |
| **`campaign-b-2026` ratio (twin/atomic)** | | **1.54×** |

**The direction the previous campaign reported does not survive intact under genuinely symmetric retry.** Per the
standing instruction not to assume it would and to report a reversal/weakening/null result honestly: it weakened
substantially, from an order of magnitude (21–30×) to a small ratio (1.54×) that is not obviously distinguishable
from noise at this sample size.

**But the ratio collapse cannot be attributed to the retry fix alone, and doing so would overclaim.** The twin arm
was **always** retry:0 in both campaigns — its own rate falling by 5.2× (5.215%→0.997%) cannot be a retry-symmetry
effect, because there was no asymmetry on that side to fix. Something else changed between the two campaign
windows (`det-2026-campaign`: 2026-08-29–31; `campaign-b-2026`: 2026-09-03–05) that affected the twin, and it may
or may not be the same something that raised the atomic rate. **One candidate is ruled out**: OmniPizza's Render
plan upgrade (resolving free-tier capacity issues) happened 2026-08-22/23 — before *both* campaigns — so it cannot
explain a difference between them. No other candidate has been identified or verified here; this document does not
guess further.

**Disclosed sensitivity check — most of both campaigns' apparent instability concentrates in one dispatch each,
not spread across the population, and this is NOT used to exclude anything:**
- `det-2026-campaign` twin-android: **16 of its 23 FAIL observations occur at a single run_index (`003`)** — one
  dispatch where nearly the whole 16-row twin suite failed together (the same *shape* of incident as Campaign B's
  run_index-018 outlier, §D). Excluding run_index 003 (disclosed sensitivity, not an exclusion of the primary
  number): 7/441 = **1.587%**.
- `campaign-b-2026` atomic-android: **8 of its 12 FAIL observations occur at run_index `018`** (the 8-scenario
  outlier, §D). Excluding it: 4/1,760 = **0.227%**.
- **Sensitivity-adjusted ratio:** Campaign B twin (0.997%, unaffected by either exclusion) / Campaign B atomic-ex-018
  (0.227%) = **4.39×**. `det-2026-campaign` twin-ex-003 (1.587%) / atomic retry-adjusted (0.248%) = **6.40×**.

Once each campaign's single dominant incident is set aside as a sensitivity check, the two campaigns' ratios
(4.39× vs. 6.40×) are much closer to each other than the raw ratios (1.54× vs. 21.1×) — consistent with the
twin-more-unstable-than-atomic direction holding up in rough order of magnitude, but **neither campaign has the
resolution to produce a stable point estimate**: a single dispatch-level incident dominates the numerator on each
side, in each campaign. **No number in this section is presented as a final or primary result.** All of raw,
retry-adjusted, and sensitivity-excluded figures are reported side by side because none of them is
individually authoritative, and choosing one to lead with would be exactly the kind of post-hoc estimator choice
this adjudication is required to avoid.

**Failure-bucket distribution, both arms, `campaign-b-2026`:** `LOCATOR_RESOLUTION_FAILURE` dominates (10 of 15
individual scenario-failure rows, spanning both arms and multiple features), plus 2 `ASSERTION_FAILURE`,
1 `MOBILE_SESSION_FAILURE`, 1 `UI_ACTION_FAILURE`, 1 `WEB_SESSION_FAILURE` (§D's ledger). `infrastructure_failure_rate=0`
for every slice — no failure was bucketed as pure CI/infrastructure.

---

## G. Efficiency-instrument provenance audit

Classification of every measurement/analysis decision the execution-efficiency instrument depends on
(`docs/superpowers/specs/2026-08-25-execution-efficiency-instrument-design.md` +
`scripts/experiments/execution-efficiency-delta.ts`), as it stood before Campaign B's first dispatch:

| decision | classification | detail |
|---|---|---|
| Comparandum definitions ("logged in", "cart populated") | **pre-existing** | Frozen in the 2026-08-25 design doc, unchanged since. |
| UI-vs-UI negative-control definition (catalog-click → builder-rendered) | **pre-existing** | Same doc; explicitly a mechanistic control, not a comparandum. |
| Step selectors (exact step-text predicates) | **pre-existing** | `execution-efficiency-delta.ts`'s `stepDuration()`/`findScenario()` predicates. |
| PASS-row requirement (throw on non-PASS or SKIP match) | **pre-existing** | Same file — "re-dispatch instead of averaging in a partial/failed run." |
| Duration extraction rule (sum of matched steps' `durationMs`, not whole-job wall-clock) | **pre-existing** | Explicit design choice, whole-job wall-clock and "assembled-scenario sum" both explicitly rejected in the design doc. |
| Artifact/file-discovery pattern | **incompatible with Campaign B** | Hardcoded to legacy names (`*-reads-*chromium.jsonl`, `non-atomic-twin-*.jsonl`); Campaign B's `exp-<arm>-<platform>` files match none of them — confirmed by running it and getting `found reads=0 writes=0` (integrity report §E). |
| Run-level aggregation rule across N repeats | **newly required** | Never built for *any* campaign — the tool accumulates a running per-pair samples file; no script computes a population-level mean/median across independent dispatches. |
| Primary estimator (mean vs. median) | **newly required** | Never chosen, for any dataset. |
| Paired ratio/delta definition at N>1 | **newly required** | Never built. |
| CI method | **newly required** | Never built. |
| Exclusion policy for repeated runs | **newly required** | The PASS-row check is a per-run validity gate, not a population-level policy. |
| Whether "logged in"/"cart populated" step text still matches verbatim in Campaign B's telemetry | **unknown** | Verified directly for the negative control's catalog-click/builder-rendered steps (present, matching); the other two comparandum pairs' exact step text was not independently re-verified against Campaign B's jsonl in this audit — likely fine (same feature files, no platform-conditional code, per multiple prior structural checks) but not confirmed here. |

**An additional finding, worth stating plainly: the pre-existing efficiency instrument's own historical
documentation already conflates repeated measures with independent N, the exact error this whole audit exists to
prevent.** `docs/superpowers/specs/2026-08-25-execution-efficiency-instrument-design.md` labels its 2026-08-26
Android illustrative pass "N=15 (twin)" — but that "15" is 15 Outline rows *within a single twin dispatch* (one of
16 rows failed and was dropped), not 15 independent dispatches; the same document later reports "N=11 atomic /
N=176 twin" (web) and "N=10 atomic / N=159 twin" (android) as if they were comparable sample sizes, where the
twin figures are row-counts across a handful of dispatches (11 dispatches × 16 rows ≈ 176), not independent
repeats. These are exactly the values the standing instructions for this whole audit warn against reporting as a
Campaign B sample size (`N=176`, `N=159`) — confirming they originate from this pre-existing document's own
pseudo-replicated counting convention, not from anything Campaign B introduced. This means "how much of the old
efficiency measurement semantics can be reused without post-hoc invention" has a caveat beyond the missing
aggregation rule: the source document's own prior practice of counting Outline rows as N would itself need
correcting, not just extending, before any of its historical N-labeled figures could be cited as precedent for a
run-level (dispatch-level) Campaign B analysis.

**A pure compatibility adapter (file-discovery only, no new math) is feasible but not built here.** Locating
Campaign B's `exp-<arm>-<platform>` files and mapping them into the same in-memory `ScenarioRecord[]` shape the
parser already expects would not require choosing an estimator, ratio, or exclusion rule — it is representation
only. Per the standing instruction, it is not implemented in this pass; if the author wants it, it should be
validated by running the unmodified old parser and the adapter's compatibility path against the *same* archived
`det-2026-campaign`/efficiency-instrument dataset and confirming byte-identical output, before ever pointing it at
Campaign B. **No Campaign B efficiency headline is computed in this document or any other, pending that decision.**
