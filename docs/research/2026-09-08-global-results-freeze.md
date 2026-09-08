# Global Statistical / Results Freeze

**This document does not rewrite the manuscript.** Its purpose is to state exactly what evidence may and may not
enter the future manuscript rewrite, and in what wording. It supersedes no prior frozen document's raw data or
methodology — `docs/research/2026-09-03-campaign-a-results-freeze.md` and
`docs/research/2026-09-07-campaign-b-post-run-adjudication.md` remain the binding records of their own campaigns;
this document only classifies, cross-references, and states which claims each one licenses. Campaign A and Campaign
B raw data are unmodified. No manuscript file is touched by this document.

---

## A. Formal-definition status

Definition 1 (`docs/paper/atomic-testing-formal-definition.md` §2.3.2) is unchanged: Atomic(t) ⟺ R1∧R2∧R3∧R4.

| Rule | Formal statement | Status |
|---|---|---|
| **R1 — Single behavior** | Exactly one oracle $O_t$ | Definition unchanged; empirically exercised by Campaign A (MOL/M1) and the diagnosability instrument. |
| **R2 — Disjoint state** | $\forall t_i \neq t_j,\ S_{t_i} \cap S_{t_j} = \emptyset$ | Definition unchanged. **Corollary 2 (Parallel safety) terminology correction, author-issued 2026-09-08 (this document is its first written record — no earlier doc uses this phrase):** going forward, refer to the empirical property under test as **Inter-test Mutable-State Non-Interference**, not "Parallel Safety" — the latter implies a broader, unverified concurrency-correctness claim this SUT's data cannot support (§D below). This is a **terminology correction for future manuscript wording, not a change to R2's formal statement or to Corollary 2's derivation**, both of which stand as written. |
| **R3 — No UI-driven setup** | $S_0(t)$ external to the interface under test | Definition unchanged. |
| **R4 — Deterministic outcome** | $O_t$ invariant across repeated executions once chaos suppression absorbs transient noise | Definition unchanged; empirically exercised by Campaign A (attribution-confirmed fault injection) and the determinism instrument (§C below). |

**Corollary 1 (Platform invariance) correction, author-issued 2026-09-08:** preserve the distinction already present
in the manuscript's own §3.2.4 discussion (Corollary 1 row: "isolates the specification-level cost from the
architecture, which is held constant and already supports both platforms") but state it explicitly as a two-part
claim for the rewrite: **(1) Atomicity (via R3) removes platform-specific setup paths at the specification layer —
this is what Definition 1 licenses directly. (2) Full specification-level platform invariance additionally
requires an execution abstraction that resolves a logical intent to a concrete platform at dispatch time — AHM
(the kernel + plugin-server architecture, §2.5) supplies one such implementation.** Do not present platform
invariance as a pure corollary of Atomic Testing alone in the rewrite; it is Atomicity **plus** a supporting
execution architecture. No manuscript text is edited now.

No other formal-definition changes. R1–R4 and Corollaries 1–3 (`§2.4`) are otherwise frozen as written.

**Unresolved tension between R4/Corollary 3 and the Campaign B empirical record (author-issued 2026-09-08, stated
not resolved):** Corollary 3 (deterministic diagnosis) derives from R1∧R4, and R4 asserts oracle invariance across
repeated executions "once chaos suppression absorbs transient noise." Campaign B ran with chaos suppression active
and retry:0, and the atomic arm still produced 12 P→F transitions across 10 distinct Android scenarios (§C below).
Definition 1 gives no independent test to distinguish two readings of this: **(a)** the atomic suite does not fully
satisfy R4 on Android in practice, on this SUT, under real network/device conditions — chaos suppression is a
retry/backoff mechanism for known transient-error classes, not a guarantee against all outcome variance — or **(b)**
these 12 transitions are exactly the transient noise R4's own qualifying clause anticipates, simply not fully
absorbed by the current suppression policy. The formal definition does not adjudicate between these on its own; only
further instrumentation of *why* each transition occurred (which this campaign was not designed to capture) could.
This is reported as a genuine open contradiction between the frozen empirical record and the formal claim, not
resolved in either direction here.

---

## B. Failure containment

**Evidence source:** Campaign A (`docs/research/2026-09-03-campaign-a-results-freeze.md`, 60/60 dispatches,
attribution-confirmed `valid` on all 60, zero within-cell variance).

**Classification: strongly supported within scope.**

Exact frozen results:

| Strategy | Position | M1 | MOL |
|---|---|---:|---:|
| atomic | EARLY | 0.2500 | 0.00 |
| atomic | MIDDLE | 0.2857 | 0.25 |
| atomic | LATE | 0.0000 | 0.25 |
| horizontal-e2e | EARLY | 0.8667 | 1.00 |
| horizontal-e2e | MIDDLE | 0.4000 | 0.50 |
| horizontal-e2e | LATE | 0.0000 | 0.25 |

ΔMOL: +1.00 (EARLY) → +0.25 (MIDDLE) → 0.00 (LATE). ΔM1: +0.6167 → +0.1143 → 0.0000. Both dissociate at atomic
EARLY (M1=0.25, MOL=0 — a real local cost outside MOL's 4-oracle universe, explained not hand-waved, §6 of the
results-freeze doc) — this is why MOL, not M1, is primary.

- **H1 (EARLY, MIDDLE: horizontal-e2e > atomic on MOL and M1): SUPPORTED.**
- **H2 (convergence at LATE): SUPPORTED**, reaching the strongest observable form — ΔMOL = ΔM1 = 0.00 exactly,
  pre-anticipated by the frozen design, not a post-hoc explanation of a null result.
- Zero within-cell variance across all 60 dispatches (byte-identical M1/MOL within every cell) — this is a
  deterministic architectural comparison, not noisy-population inference; no significance test is applicable or
  needed.
- N=47 provenance-verified-only sensitivity reproduces the full N=60 exactly, in all 6 cells.

**Allowed claim:** Atomic Testing's scenario-independence (R1/R2) contains fault propagation to the injected fault's
own scenario, preventing collateral loss of unrelated matched oracles — demonstrated at EARLY/MIDDLE, with
convergence at LATE exactly where the design predicted it (the injected fault's own step is fused with the last
matched oracle, leaving no downstream oracle for atomicity to protect).

**Forbidden claim:** "Atomic Testing is more diagnosable" (untested — no diagnosability delta was measured here,
only propagation/containment). "Atomic Testing prevents flakiness" (Campaign A ran under deterministic fault
injection, not naturally occurring instability — that is Campaign B's question, §C). Any claim generalized beyond
the injected fault class (`LOCATOR_RESOLUTION_FAILURE`), the web platform, or the frozen matched-oracle design.

---

## C. Determinism / naturally occurring instability

**Evidence sources:** the original N=30 campaign (`det-2026-campaign`), its retry reconstruction
(`docs/research/2026-09-02-retry-sensitivity-analysis.md`), and Campaign B's symmetric-retry replication
(`docs/research/2026-09-07-campaign-b-post-run-adjudication.md` §C/§F).

### Exact Web result

Both campaigns, both arms, zero failures: `det-2026-campaign` playwright 0/2,581 transitions, non-atomic-twin-web
0/464; `campaign-b-2026` playwright 0/1,672, horizontal-e2e-web 0/304. **No web determinism signal in either
campaign** — this instrument has never observed a web-platform failure to measure a rate from.

### Exact Android result — side by side

| slice | P→F (exact) |
|---|---|
| `det-2026-campaign` atomic-android, as officially recorded (retry:1, retry-healed final status) | 5/2,836 = 0.176% |
| `det-2026-campaign` atomic-android, retry-adjusted (attempt-1 reconstructed from job logs) | 7/2,828 = 0.248% |
| `det-2026-campaign` twin-android (always retry:0) | 23/441 = 5.215% |
| **`det-2026-campaign` ratio (twin/atomic)** | **29.6× (original) / 21.1× (retry-adjusted)** |
| `campaign-b-2026` atomic-android (real retry:0) | 12/1,850 = 0.649% |
| `campaign-b-2026` twin-android (real retry:0) | 3/301 = 0.997% |
| **`campaign-b-2026` ratio (twin/atomic)** | **1.54×** |

**Influential-dispatch sensitivity (disclosed only — not a substitute for the primary numbers above, no dispatch
excluded from the primary dataset):**

| slice, dispatch set aside for sensitivity only | P→F (exact) |
|---|---|
| `det-2026-campaign` twin-android excluding run_index 003 (16/23 of its FAILs) | 7/441 = 1.587% |
| `campaign-b-2026` atomic-android excluding run_index 018 (8/12 of its FAILs) | 4/1,760 = 0.227% |
| Sensitivity ratio, `det-2026-campaign` (twin-ex-003 / atomic retry-adjusted) | 6.40× |
| Sensitivity ratio, `campaign-b-2026` (twin unaffected / atomic-ex-018) | 4.39× |

### Three separate questions, not one claim

- **Retry-policy question — was the previous result partly a measurement artifact of asymmetric retry?**
  **Yes.** The old atomic-android final-status rate (0.176%) is demonstrably lower than its own reconstructed
  attempt-1 rate (0.248%) — an exact reconstruction from CI job logs, not a model. This is settled.
- **Direction question — does Horizontal E2E still show greater observed Android instability under symmetric
  retry?** **Yes, descriptively, in both campaign windows.** Every android-twin P→F rate reported above (5.215%,
  0.997%, and both sensitivity variants) exceeds its paired atomic rate. The direction has not reversed or gone
  null in either campaign.
- **Magnitude question — is there evidence of a stable 21×–30× effect?** **No.** Campaign B does not replicate
  that magnitude. The raw ratio collapsed to 1.54×; even the sensitivity-adjusted view (4.4×–6.4×) sits well below
  21×.

### Why the collapse cannot be attributed to the retry fix alone

The Horizontal/twin arm was **retry:0 in both campaigns** — no retry asymmetry ever existed on that side. Its own
rate fell 5.215% → 0.997% (≈5.2× drop) between campaign windows regardless. Symmetric retry removes the known
atomic-side retry-policy confound (settled above), but **it cannot explain a change on the arm the confound never
touched.** The atomic-android rate also moved (0.176–0.248% → 0.649%, a 2.6–3.7× rise), in the opposite direction.
Since both arms moved, and only one arm's movement is mechanically explained, **the between-campaign change in the
ratio must reflect unresolved campaign-window variability, not the retry fix in isolation.** One candidate cause
was checked and ruled out: OmniPizza's Render free-tier-to-paid upgrade (2026-08-22/23) predates *both* campaign
windows (`det-2026-campaign`: 2026-08-29–31; `campaign-b-2026`: 2026-09-03–05) and so cannot explain a difference
between them. **No other cause has been identified. This is reported as unresolved, not modeled or guessed at.**

### Influential-dispatch structure

Each campaign's apparent android rate is dominated by a single dispatch: `det-2026-campaign` twin's run_index 003
(16/23 FAILs — nearly its entire 16-row twin suite failing together in one dispatch) and `campaign-b-2026`
atomic's run_index 018 (8/12 FAILs — 8 scenarios across unrelated features failing together, the strongest outlier
in Campaign B's own dataset, `2026-09-06-campaign-b-integrity-report.md` §F.3). **Temporally clustered failures —
within a single dispatch, and separately, `campaign-b-2026`'s 3 failures within a ~2-hour window at adjacent
run_indices (§D of the adjudication doc) — are consistent with a shared environmental influence but do not identify
or prove one.** Neither is excluded from its campaign's primary dataset; both are reported as the reason the
multiplicative point estimate in either campaign is unstable.

### Global determinism claim classification

- **Supported descriptively:** Horizontal E2E showed greater observed Android P→F instability than Atomic in both
  campaign windows.
- **Not supported:** a stable 21×–30× determinism advantage.
- **Not supported:** retry asymmetry alone explains the previous magnitude.
- **Supported:** the original retry asymmetry was a real measurement confound for the Atomic final-status rate
  (exact log-based reconstruction, §above).
- **Supported:** the magnitude is sensitive to campaign window and to a small number of influential dispatches.
- **Unresolved:** the exact mechanism responsible for the campaign-window change in the twin's own rate.

**Composite statement for the eventual manuscript (checked against the exact Web and Android results above before
being written here — do not strengthen without additional evidence):**

> Across both Android campaigns, the Horizontal E2E strategy exhibited a higher observed pass-to-fail transition
> rate than the atomic strategy, but the magnitude of the difference varied substantially between campaign windows
> and was sensitive to a small number of failure-heavy dispatches — the atomic arm's own rate rose (≈2.6–3.7×)
> while the twin arm's rate fell (≈5.2×) between campaign windows, so the change in ratio reflects movement in both
> arms, not a one-sided correction. The symmetric-retry replication therefore supports the observed direction more
> strongly than any stable multiplicative effect size. No determinism signal was observed on Web in either campaign.

This is a Web+Android-scoped statement, not a platform-general one — Web contributes "no signal observed," not "no
effect." No population-level magnitude is inferred from 1.54×, 4.4×, 6.4×, 21.1×, or 29.6× — all five are reported
as what they are (point estimates from small, campaign-window-specific samples, several dominated by one dispatch
each), not as convergent estimates of one true effect size.

---

## D. Mutable-state non-interference

**Classification: empirically unresolved on OmniPizza / derivation-supported only within the formal model.**

Corollary 2 follows deductively from R2 ($S_{t_i} \cap S_{t_j} = \emptyset$ implies no ordering constraint is
required for correctness). OmniPizza's backend has no account-keyed mutable-state collision surface
(`backend/database.py:89-91`, `backend/routers/auth.py:60` — UUID/session_id-keyed, never username-keyed), so this
SUT offers no empirical surface on which the stronger, data-collision-shaped prediction could be tested. What was
measured instead (`§4.1` of the manuscript, `w1`–`w8` sweep): zero failures in either arm at any of 4 worker
levels, each cell N=1 — reported in the manuscript itself as "inconclusive toward collision correctness," not as
proof.

- **Do not claim parallel safety was empirically demonstrated.**
- **Do not treat zero observed failures as proof** — each worker-level cell is a single dispatch, not a repeat
  series.
- **Frame the empirical question as unresolved on this SUT** — the formal derivation from R2 stands; the empirical
  test of it does not exist yet, for lack of a collision surface, not for lack of a favorable result.
- **Terminology for the rewrite:** *Inter-test Mutable-State Non-Interference* (§A above), not "Parallel Safety."

---

## E. Platform behavior

Three separate claims, not one:

1. **Removal of platform-specific setup paths** — a direct consequence of R3 (state injection external to the
   interface under test): the specification never encodes a concrete interface. **Supported by Definition 1
   directly** — this is definitional, not an empirical finding requiring its own evidence.
2. **Specification-level platform abstraction** — the same `.feature`/step-definition spec is unmodified across web
   (Playwright), mobile (Appium, Android+iOS), and API. **Supported empirically** — structural check, 0
   platform-conditional code found, symmetric across arms (manuscript §3.2.4/Corollary 1 row).
3. **Architecture-enabled platform invariance** (full corollary as stated) — requires the execution abstraction
   (kernel + plugin-server routing) that resolves a logical intent to a concrete platform at dispatch time. **AHM
   supplies this implementation; the corollary is Atomicity + this architecture, not Atomicity alone** (§A above).
   Do not present platform invariance as following from Atomic Testing in isolation.

---

## F. Execution Efficiency

**Classification: ancillary/exploratory, not confirmatory under the current datasets.**

The pre-existing efficiency instrument's own design doc (`docs/superpowers/specs/2026-08-25-execution-efficiency-instrument-design.md`)
already mislabels within-dispatch Scenario Outline rows as independent N in multiple places — "N=15" for one
twin-android dispatch's 15 surviving Outline rows, and "N=176"/"N=159" (web/android) for row-counts across a
handful of dispatches, not independent repeats (`2026-09-07-campaign-b-post-run-adjudication.md` §G). **These are
not valid independent experimental sample sizes; the independent unit should have been dispatch/run, not Outline
row.**

Campaign B additionally did not preregister: run-level aggregation rule, primary estimator, paired ratio/delta
definition, CI method, or a negative-control analysis compatible with its own artifact-naming scheme (the existing
extractor hard-errors against Campaign B's files; the underlying per-step timing data is present, but no
extraction/aggregation logic for it exists — `2026-09-06-campaign-b-integrity-report.md` §E,
`2026-09-07-campaign-b-post-run-adjudication.md` §G).

- **No confirmatory Campaign B Execution Efficiency headline is produced anywhere in this research program.**
- **N=176 and N=159 are not to be reused as independent N in the manuscript**, in their historical form or any
  rewording of it.
- **No post-hoc estimator is presented as preregistered.**
- Historical illustrative results (web ≈3.4-3.5×, android ≈78-99×, both N=1 on the atomic side per the design
  doc's own §8.5 evidence policy) remain what they always were: informal, N=1-atomic illustrative passes, not §9
  numbers, already labeled as such in the manuscript's existing §4.5.

---

## G. Provenance and reproducibility

**Campaign A:** archived as GitHub Release `atomic-testing-dataset-v1` (tag on `f9938ef`), 1,119 files, tarball
sha256 `098f644be92b1066a35e7fc4a1499224b68946c197fbdde563825775d7ba455d`, MANIFEST.json + SHA256SUMS.txt.
60/60 dispatches, `resolvedSha=de2a8f956bd3a38c2818d975932a1008f1ce97b6`. Provenance: 47/60 directly verified
backend commit, 0/60 mismatch, 13/60 unavailable (timeout/fallback) — the provenance-adjudication ruling
(`docs/research/2026-09-03-campaign-a-provenance-adjudication.md`) held that introducing "provenance unavailable"
as a new invalid-run reason post-hoc would itself violate the frozen §13 invalid-run policy
(`docs/research/2026-09-02-campaign-a-frozen-definitions.md`), so all 60 remain valid, not backfilled.

**Campaign B:** archived as GitHub Release `campaign-b-raw-2026-09-05`, 166 files, tarball sha256
`15b89cce66915a65de50ffb95af56d97d7fded2a19275d28c97279fa56489390`, `SHA256SUMS.txt` self-hash
`6af02f8578ee09eda4bbe2017f6d0912f4201e7d814288cdcc44a1e919161b5c`. Committed fingerprint pointer:
`docs/research/2026-09-06-campaign-b-archive-manifest.md`. 80/80 dispatches, `resolvedSha=274e398d29b5b8fae8fa305299d06ec89b208d71`.
Provenance: 78/80 verified, 1 timeout_error, 1 fallback_without_commit, 0 mismatch.

**Reproduction path for §C's determinism numbers** (none of this is committed to git — `metrics/raw/**`,
`metrics/processed/**` are gitignored by design): download/merge the release tarball or re-run
`aggregate-campaign-artifacts.ts --instrument campaign-b --workflow experiment` against the live GH Actions runs,
then `pnpm metrics:normalize` → `pnpm metrics:failures` → `pnpm metrics:quality:reliability`, and read the
`campaign-b-2026` batch slice of the resulting `reliability_metrics.csv` (or `scenario_outcome_history.csv`
directly, filtered to `experiment_batch_id=campaign-b-2026`, for the exact per-transition reconstruction this
document reports). The same recipe against the archived `det-2026-campaign` batch reproduces the original-campaign
figures.

**Known provenance limitations:** neither campaign achieved 100% direct backend-commit verification (Campaign A:
78%; Campaign B: 97.5%) — both gaps are attributed to a CI-side `/api/version` probe occasionally failing under
sustained load, not to any detected SUT drift (zero mismatches in either campaign, and in Campaign B the resolved
commit was identical across all 78 verified reads spanning the full 41.5h window).

---

## H. Threat hierarchy

1. **Single SUT** — every result in this program is specific to OmniPizza; no second application has been tested.
2. **Limited platforms** — web (Playwright) and Android (Appium) carry the campaign-scale evidence; iOS has only
   smoke-level coverage, never a repeated-run or fault-injection campaign.
3. **Fault-class scope of Campaign A** — one fault class (`LOCATOR_RESOLUTION_FAILURE`), three positions, web only.
   Not generalized to other fault classes or platforms.
4. **Campaign B atomic-first order** — `interleaveByRunIndex()` sorts atomic before twin unconditionally in all 40
   pairs (0/40 counterbalanced); typical atomic→twin separation ≈30s. Treatment arm and within-pair execution
   order are perfectly confounded; no statistical adjustment removes this, and none is applied.
5. **Campaign-window variability** — the Horizontal/twin android rate moved 5.2× between two campaign windows for
   reasons not identified (§C above); this variability is real and unexplained, not modeled away.
6. **Influential-dispatch clustering** — both campaigns' android determinism point estimates are dominated by a
   single dispatch each (§C); the underlying rate cannot be pinned to a stable value from N=20/N=30 samples at this
   granularity.
7. **Old retry asymmetry** — the original N=30 campaign's atomic-android arm ran at `retry:1` against the twin's
   `retry:0`; exactly reconstructed (not modeled) via CI job-log parsing, disclosed as Threats to Validity material
   already in the 2026-09-02 retry-sensitivity doc.
8. **Efficiency pseudo-replication** — the pre-existing efficiency instrument's own historical N-labeling
   (N=176, N=159) conflates Scenario Outline rows with independent dispatches; not usable as precedent without
   correction (§F).
9. **Architecture/reference-implementation dependence** — the platform-invariance and parallel-safety-adjacent
   corollaries are evaluated through AHM's specific kernel/plugin-server architecture; the corollaries' empirical
   support is scoped to this implementation, not to Atomic Testing as an abstract methodology independent of any
   supporting architecture (§A/§E).

---

## I. Claim matrix

| Candidate claim | Evidence | Status | Allowed wording | Forbidden wording |
|---|---|---|---|---|
| Atomic Testing contains fault propagation to the owning scenario, preventing collateral matched-oracle loss | Campaign A, N=60, 0 within-cell variance | **Strongly supported within scope** | "contains propagation," "prevents collateral oracle loss," scoped to the injected fault class/web/matched design | "more diagnosable," "prevents flakiness," any cross-fault-class or cross-platform generalization |
| H1: Horizontal E2E shows greater MOL/M1 than Atomic at EARLY/MIDDLE | Campaign A | **Strongly supported within scope** | as stated, with exact ΔMOL/ΔM1 figures, scoped to the injected fault class/web/matched design | unqualified "always greater"; any cross-fault-class or cross-platform generalization |
| H2: the gap converges toward LATE | Campaign A | **Strongly supported within scope** | "converges," "reaches exact parity at LATE," scoped to the injected fault class/web/matched design | "the methods are equivalent" (only true at LATE, by design); any cross-fault-class or cross-platform generalization |
| Horizontal E2E shows greater observed Android instability than Atomic | `det-2026-campaign` + `campaign-b-2026` | **Supported descriptively** | "greater observed pass→fail rate in both campaign windows," with exact figures | any single ratio stated as *the* effect size |
| A stable 21×–30× Android determinism effect exists | Same | **Superseded** | — | any restatement of 21.1×/29.6× as current/primary |
| Retry asymmetry explains the previous magnitude | Same | **Not supported** | "retry asymmetry was A confound, not THE explanation for the between-campaign change" | "the retry fix explains the collapse" |
| The original retry asymmetry was a real measurement confound for the old atomic rate | Retry-sensitivity doc, exact log reconstruction | **Supported** | as stated, with 0.176%→0.248% figures | none needed — already precise |
| The determinism magnitude is sensitive to campaign window / influential dispatches | Both campaigns' sensitivity analyses | **Supported** | as stated, with both sensitivity tables | "corrected for" or "controlled for" (no correction is applied, only disclosure) |
| No web determinism signal in either campaign | Both campaigns | **Null/open** | "no failures observed in either arm, either campaign" | "web is deterministic" (absence of observed failure ≠ proven absence) |
| Cause of the campaign-window variability in twin android rate | — | **Unresolved** | "not identified; one candidate (Render upgrade timing) ruled out" | any named or implied cause |
| Inter-test Mutable-State Non-Interference (parallel safety) | R2 derivation + inconclusive OmniPizza sweep | **Mechanistically consistent / empirically unresolved** | "follows from R2 by derivation; not empirically demonstrated on this SUT" | "parallel safety is demonstrated," "zero failures proves safety" |
| Platform invariance | Structural check (0 conditional code) + AHM architecture | **Supported descriptively, architecture-scoped** | "specification-level invariance, enabled by AHM's execution abstraction" | "platform invariance follows from Atomic Testing alone" |
| Execution Efficiency (Atomic faster at reaching a given precondition) | Historical N=1-atomic illustrative passes only | **Exploratory only** | "illustrative, N=1 on the atomic side, not a confirmatory §9 result" | any ratio (3.4-3.5×, 78-99×) presented as a confirmed effect; N=176/N=159 as sample sizes |
| Campaign B is a confirmatory Execution Efficiency experiment | — | **Unsupported** | — | any framing of Campaign B as answering the efficiency question |

This table is the controlling source for the manuscript rewrite. No status above is to be strengthened without
additional evidence collected and adjudicated under the same standard applied throughout this program.
