# Campaign B Raw-Data Integrity Report

**Status: integrity/provenance/pseudo-replication audit only. NO statistical interpretation. NO manuscript claims.**
Campaign A remains untouched and is not referenced substantively below except where its own record is relevant
context (a previously-documented flaky scenario, §F).

Raw data: 80/80 dispatches completed 2026-09-03T20:03:13Z → 2026-09-05T13:35:07Z (~41.5h; corrected 2026-09-07 —
this originally cited the last dispatch's *dispatchedAt*, not its *completedAt*; no other content changed).
Immutable local snapshot
+ checksums: `archives/campaign-b-raw-2026-09-05/` (164 files: 80 cucumber-jsonl, 80 run-manifest, campaign manifest,
aggregated-artifacts manifest, run-level table, provenance detail, `SHA256SUMS.txt`). Not yet pushed as a GitHub
Release/Zenodo archive (Campaign A's dataset-v1 pattern) — recommended as a follow-up if external durability parity
with Campaign A is wanted; the local snapshot + checksums already satisfy "immutable before interpretation" for
adjudication purposes.

An automated independent-verification pass (two parallel agents: one re-deriving all counts from the raw files with
no access to this document, one doing an adversarial completeness sweep) was attempted and **failed on
infrastructure grounds only** (the host machine slept for an extended stretch mid-run; the second agent hit a
transient `gh`/login error) — both returned `null`, so nothing from that attempt is used below. It was not
re-launched a second time given the ~17h already elapsed; in its place, every number below was independently
cross-checked by a second method: reproducible scripts run directly against the raw files (not summarized or
eyeballed), plus a live `gh run view` query against GitHub's own API for all 8 failed runs, which matched the local
manifest exactly on every field checked (conclusion, status, createdAt, updatedAt).

---

## A. Pre-run freeze verification

Commit `274e398` (2026-09-03T20:02:25Z, "wire Campaign B") is the last commit before the first dispatch
(20:03:13Z, 48s later) — confirmed via `git log`. It touched only code (`campaign-matrix.ts`, `run-campaign.ts`,
`aggregate-campaign-artifacts.ts`), no doc.

**Frozen in code before the first dispatch:**
- Independent unit = paired run_index (`interleaveByRunIndex()` groups atomic+twin by `instrument::platformLeg::runIndex`, orders atomic-before-twin)
- N=20 pairs/platform (`CAMPAIGN_B_REPEATS_PER_PLATFORM = 20`, `campaign-matrix.ts:524`)
- Web and Android as structurally separate legs (`CAMPAIGN_B_PLATFORMS = ['web','android']`)

**NOT frozen anywhere, before or after** (repo-wide grep confirms no `campaign-b-analysis.ts` and no dedicated
`docs/research/*campaign-b*` file exists at all, before this one):
- within-dispatch aggregation rule, primary estimator, paired ratio definition, paired absolute delta definition, bootstrap/CI method
- a Campaign-B-specific validity/exclusion policy (Campaign A's §13 policy exists but no commit extends it to Campaign B)
- how — or whether — the previously-defined negative control applies to Campaign B's data (see §F.1 — it turns out it does not, as a matter of raw-data compatibility, not just missing paperwork)
- the decision rule for treating provenance-status categories in a final analysis (Campaign A's rule was a post-hoc adjudication, not a Campaign-B preregistration)

**Conclusion:** several definitions required for §5–§8 of the standing instructions were not frozen before
execution. Per the fallback instruction, this stops short of statistical interpretation (§E) rather than choosing
among alternatives now.

---

## B. Execution integrity

**Planned vs. realized:** exactly 80/80 `completed`, 0 `pending`/`in_progress` remaining. Expected id set
(`campaign-b__{atomic,twin}__{web,android}__{001..020}`, 80 ids) matches the actual set exactly — **0 missing, 0
duplicate, 0 extra**. **0 duplicate GH run ids** across all 80. `resolvedSha=274e398...` and `omnipizzaReleaseTag=v1.1.8`
constant for the whole manifest (single continuous dispatcher process, PID unchanged from launch to completion —
confirmed via `ps` across multiple checks spanning the full run).

**ghRunConclusion tally:** 72 `success`, 8 `failure`. **`likelyInfra` tally: 80× `false`** — the dispatcher's own
coarse per-job heuristic never classified any dispatch as infrastructure-suspect.

**Arm execution order — NOT balanced, and this is a real, disclosed asymmetry, not a checkbox pass.**
`interleaveByRunIndex()` sorts atomic-before-twin unconditionally; verified empirically across all 40 pairs: **0/40
pairs have twin dispatched first.** Unlike Campaign A (which explicitly counterbalanced arm-first by pair-slot
parity), every twin dispatch in Campaign B runs strictly after its paired atomic dispatch, against a backend that has
just finished absorbing the atomic dispatch's load and warm state. This was not a frozen decision (§A) and is not
correctable retroactively.

**Dispatch timing / possible temporal drift:** 6 of 79 dispatch-to-dispatch gaps show a suspiciously uniform ~954s
(953.7–955.1s, <1.4s spread) delay, versus the scripted 30s cooldown. Source review of `run-campaign.ts` ruled out
the script's own causes: `ghWithRetry`'s backoff caps at 30s, and `assertNothingInFlight` throws immediately (would
have crashed the process, which never restarted — same PID throughout). The cause is external to this repo's code,
most likely GitHub Actions' own dispatch-to-visible-run latency; it produced no error, no retry log line, and no
`likelyInfra=true`. Flagged for disclosure, not treated as an exclusion reason. One further self-healed transient
(`net/http: TLS handshake timeout` polling GH run 33820599176, `twin/android/001`) retried automatically via the
script's own `ghWithRetry` and resolved to `success` — also not an exclusion reason.

**Configuration equality (per dispatch, verified from `run-manifest/*.json` for all 80):**
- AHM repo `commitSha`: constant `274e398d29b5b8fae8fa305299d06ec89b208d71` — 80/80, 0 variation
- `omnipizzaReleaseTag`: constant `v1.1.8` — 80/80
- `schemaVersion`: constant `1.1.0` — 80/80
- Android APK `omnipizzaAppSha256`: constant `1059e9468145761710c9884b37e9fbc76da8e75eb9666dc0867d82a546cda6a4` — 40/40 android dispatches, 0 variation
- `driver`: `playwright` for all 40 web, `appium` for all 40 android (expected structural difference, not an asymmetry)
- `cucumberParallel`: constant `'1'` for all 80 (frozen in `buildCampaignBItems`, no per-arm/per-platform override)
- No fault-injection fields (`tomInjectFault`, `diagnosabilityChaosUser`, `tomInfraBreakPort`) are set anywhere in `buildCampaignBItems` — confirmed **zero fault injection**, both arms, matching design intent
- `tags: []` for all 80 — no scenario-tag filtering beyond the `evaluationSlice=full` selection itself
- **Retry, symmetric across both arms — confirmed at the source, not merely asserted.** `git show 274e398:cucumber.js`
  shows the atomic arm's `research` profile sets `retry: 0` (explicitly to close the exact asymmetry the
  2026-09-02 retry-sensitivity analysis found: the original determinism campaign ran atomic at `retry:1` against
  the twin's `retry:0`), and the twin's `nonAtomicTwin` profile also sets `retry: 0`. `atomic-testing-experiment.yml`
  at the same frozen SHA dispatches `--profile research` for the atomic arm and `--profile nonAtomicTwin` for the
  twin arm in both the web and android jobs — no cucumber-level retry field exists in the per-run manifests to
  double-check post-hoc, so this is verified from the frozen workflow/profile source, not from run-time telemetry.
  This is the single most load-bearing config-equality item for this campaign (it is the confound Campaign B exists
  to close), and it holds.

**The one structural inequality that is NOT a config asymmetry but does confound naive duration comparison:**
`evaluationSlice: 'full'` means the atomic arm runs its **entire** atomic suite per dispatch, while the twin arm runs
its fixed 16-row Outline. Verified directly from raw scenario counts (`cucumber-jsonl` line counts, uniform within
every group, 0 exceptions across 80 dispatches): **atomic/web = 96 scenarios/dispatch, twin/web = 16;
atomic/android = 106 scenarios/dispatch, twin/android = 16.** This is not a validity defect (both arms ran their
intended, correctly-scoped suite) — but it means a dispatch-total wall-clock ratio compares ~6-7× the raw workload on
one side against the other, and is not by itself informative about mechanism (§F.2).

---

## C. Provenance

Tallied from `omnipizzaBackendProvenanceStatus` across all 80 `run-manifest/*.json` files:

| status | count | ids |
|---|---:|---|
| `verified` | 78 | (all except the 2 below) |
| `timeout_error` | 1 | `campaign-b__atomic__android__016` |
| `fallback_without_commit` | 1 | `campaign-b__atomic__android__020` |
| `mismatch` | 0 | — |

78/80 direct-verified is a large improvement over Campaign A's 47/60 — consistent with the retry+backoff
instrumentation improvement made after Campaign A (`85bfad0`). **No mismatch found; per the frozen distinction, an
unavailable read is reported as unavailable, not equated with a confirmed mismatch.** Both non-verified dispatches
completed with `ghRunConclusion=success` and are temporally isolated from the 8 test failures (Sep-05 02:52Z and
11:30Z respectively; nearest failure is >4h away in each direction) — no correlation between provenance gaps and
scenario failures.

**Backend commit** (`git_commit` field, where read): constant
`9ca37674d374e9303912e259641ee86baf3aabe1` across all 78 verified reads, spanning the full 2026-09-03T18:19Z →
2026-09-05T13:02Z window — **zero drift observed**, consistent with the release freeze holding for the entire
campaign. **Frontend commit** (web only — the field is structurally absent for android, which instead carries the
APK SHA256 checked in §B): constant `9ca37674d374e9303912e259641ee86baf3aabe1` (built `2026-09-02T22:32:19Z`) across
all 40 web reads.

---

## D. Run-level dataset (pseudo-replication proof)

Full pair-level table: `archives/campaign-b-raw-2026-09-05/campaign-b-pair-level-table.csv` (40 rows — 20 web + 20
android, one row per paired run_index) and the underlying 80-row dispatch table
(`campaign-b-run-level-table.json`). Columns present: `platform, run_index, atomic_run_id, horizontal_run_id,
atomic_ghwallclock_ms, horizontal_ghwallclock_ms, atomic_raw_scenario_rows, horizontal_raw_scenario_rows,
atomic_conclusion, horizontal_conclusion, atomic_provenance_status, horizontal_provenance_status, valid`.

**This is exactly 20 + 20 = 40 independent paired observations, not hundreds of row-level ones** — the
`atomic_raw_scenario_rows` / `horizontal_raw_scenario_rows` columns exist precisely so the underlying Scenario
Outline repetitions (96, 106, or 16 per dispatch) are visible as raw-observation counts feeding each pair, never
mistaken for independent N. Raw per-scenario rows are preserved separately and unaggregated in
`archives/campaign-b-raw-2026-09-05/cucumber-jsonl/` (80 files) for reproducibility.

**`valid` is `true` for all 40 pairs.** The only operational invalidity signal defined for this campaign is
`likelyInfra`, which was `false` for all 80 dispatches (§B) — so the 8 `conclusion=failure` dispatches are retained
as valid scientific data, per the standing instruction not to exclude for an unfavorable or null-looking result.

**`atomic_ghwallclock_ms` / `horizontal_ghwallclock_ms` are included as raw descriptive observations only — they
are explicitly NOT presented as "the" primary duration metric**, both because no aggregation rule/estimator was
frozen (§A) and because GH wall-clock time bundles CI overhead (checkout, setup, artifact upload, the ~954s
unexplained gaps in a few cases) with actual SUT execution time, and compares suites of very different raw size
(§B). Raw per-scenario `durationMs` values (available in every `cucumber-jsonl` row) are a second, more granular
candidate observation the author may prefer once an estimator is adjudicated — both are preserved unaggregated so
either choice remains reproducible from the same raw data.

---

## E. Statistical output — BLOCKED, not attempted

Per §A, the aggregation rule, primary estimator, paired ratio/delta definitions, and CI method were never frozen
before execution. Per the standing instruction, none of these are chosen here, and no median/IQR/mean/SD/ratio/delta
/bootstrap-CI table is produced. This is a deliberate omission, not an oversight — the raw data needed to compute
any of these (§D) is fully preserved and immutable, so the computation can be done as soon as the author adjudicates
the gap.

**Negative control — the existing extraction TOOL cannot read Campaign B's raw data, but the underlying step
timings it would need are present.** These are two different claims and only the first is established. The
UI-vs-UI negative control (catalog-click → builder-rendered) is defined for a *different* instrument (`efficiency`,
`execution-efficiency-delta.ts` + `docs/superpowers/specs/2026-08-25-execution-efficiency-instrument-design.md`),
whose extraction logic expects artifact files named `*-reads-*`/`*-writes-*` (legacy naming). Empirically running
that exact script against a completed Campaign B pair (`--atomic-run 33800018553 --twin-run 33800404646
--platform-leg web`, after a full `aggregate-campaign-artifacts.ts` merge) fails outright: `Expected exactly one
reads and one writes cucumber-jsonl file (platform=web) for run 33800018553; found reads=0 writes=0` — Campaign B's
experiment-mode artifacts use a categorically different naming scheme (`tom-<runId>-1-<idx>-exp-<arm>-<platform>.jsonl`,
one file per run) that the tool's file-discovery logic cannot locate. **Checked separately: the raw step-level data
itself is present in both arms.** The atomic-web scenario "Opening a pizza card launches the builder in CH" contains
`When they open the pizza "Marinara"` (50ms) → `Then the pizza builder is displayed for "Marinara"` (11ms); the
twin's "Concurrent journey instance 1" contains the equivalent `When they open the pizza "Pepperoni"` (75ms) →
`Then the pizza builder is displayed for "Pepperoni"` (31ms), both with per-step `durationMs`. So the correct
characterization is **tool incompatibility, not data absence** — new extraction logic keyed on step *text* rather
than file-naming convention could plausibly compute this control from Campaign B's real telemetry. **That logic is
not built here**: writing and running new extraction code now, after already having seen 78/80 dispatches' worth of
results, would itself be choosing an estimator after the fact. This is returned as part of the same adjudication gap
as §A/§E, but as a decision the author can make ("build the new extractor, openly dated after data collection") —
not one the report should resolve.

---

## F. Adversarial findings

**F.1 — Instrument mismatch is the root cause of most open items above.** Campaign B was designed and committed
(`274e398`'s own message) as a *paired determinism* re-run — closing the retry asymmetry the 2026-09-02
retry-sensitivity analysis found — not as a duration/efficiency campaign. `evaluationSlice: 'full'` and the absence
of any comparandum-pair extraction logic both follow from that. The standing instructions for §5–§8 are written
entirely in efficiency vocabulary (`atomic_aggregate_ms`, ratios, medians, the negative control). Both readings of
"what Campaign B measures" are legitimate; they are not the same question, and the raw data most directly supports
the determinism reading (pass/fail per dispatch, §F.3) while only weakly and confoundedly supporting the efficiency
reading (§B's unequal-suite-size problem, §E's missing extraction). This is worth surfacing before any further work
is invested in one direction.

**F.2 — The wall-clock asymmetry runs opposite to intuition and is a scale artifact, not (necessarily) a mechanism
signal.** Descriptive-only GH wall-clock, by arm × platform:

| group | n | median (s) | mean (s) | IQR (s) | min–max (s) |
|---|---:|---:|---:|---:|---:|
| web / atomic | 20 | 221.4 | 256.3 | [207, 261] | 185–792 |
| web / twin | 20 | 157.1 | 171.5 | [143, 167] | 131–347 |
| android / atomic | 20 | 3538.2 | 3675.3 | [3098, 4502] | 2854–4893 |
| android / twin | 20 | 2723.7 | 2896.3 | [2263, 3522] | 1968–4971 |

Atomic dispatches take *longer* wall-clock on both platforms — the opposite direction from the historical
per-comparandum efficiency finding (atomic faster on the specific login/cart-population steps). This is consistent
with atomic running 6–7× more raw scenarios per dispatch (§B), not with a reversal of the underlying mechanism —
but this document does not adjudicate that; it only establishes that the naive ratio would be misleading without
disclosing the denominator difference.

**A second, distinct confound compounds the first: failure-driven duration inflation is asymmetric across arms.**
Each `order-success ... within 90s` checkout timeout burns ~90s of pure waiting before failing, and
`atomic__android__018`'s 8 scenario failures (several with their own 5-90s waits, §F.3) make it the single longest
dispatch in the entire android/atomic group at 4,892,962ms (vs. that group's 3,538,153ms median). Since the 8
failures split 5 atomic / 3 twin (§F.3), this timeout-driven inflation lands disproportionately on the arm that
already runs more raw scenarios — any duration estimator the author adjudicates in §E will inherit both confounds
together, not just the suite-size one.

**A separate, unexplained duration outlier exists on the clean-success side of the data**: `atomic__web__019`
(792,279ms, 2026-09-03T22:34:53Z–22:48:05Z) is the longest web/atomic dispatch — 3.6× the 221,372ms group median —
despite `ghRunConclusion=success` with no scenario failures. This is not failure-driven and its cause is not
established here; it is disclosed as an unreviewed outlier, not attributed to either confound above.

**F.3 — The 8 failures, examined individually (all `likelyInfra=false`, all Android, all full-suite jsonl files
complete/untruncated — 106 or 16 rows exactly as expected, so none is a truncated-suite or corrupted-telemetry
case):**

| dispatch | run id | failing scenario | error signature |
|---|---|---|---|
| `atomic__android__003` | 33831580545 | Filtering by category (JP) | `[ui] Category filter "meat" left no cards visible` |
| `twin__android__004` | 33839788837 | Concurrent journey #14 | checkout timeout: `order-success ('btn-order-details') never rendered... within 90s` |
| `atomic__android__005` | 33842143395 | Toppings total, Margherita MX | `text-estimated-total-value` not displayed after 5000ms |
| `atomic__android__008` | 33869073486 | Toppings total, Margherita MX | *same signature as above* |
| `twin__android__014` | 33932322029 | Concurrent journey #1 | `TypeError: fetch failed` during login step |
| `atomic__android__015` | 33934233440 | Delivery order, US | checkout timeout, same signature as `twin__004` |
| `twin__android__015` | 33938093504 | Concurrent journey #13 | checkout timeout, same signature |
| `atomic__android__018` | 33953251932 | **8 scenarios failed in this one dispatch** (see below) | mixed |

Cross-checked against GitHub's live API (`gh run view`) for all 8 — conclusion/status/timestamps match the local
manifest exactly, no discrepancy.

- **`atomic__android__005` and `atomic__android__008` reproduce a previously-documented flaky scenario**: the exact
  same scenario+locator+timeout that Campaign A's 2026-09-02 retry-sensitivity analysis found failing in 14/30
  atomic-Android dispatches under a single (unretried) attempt. This is not a new defect — it is the same known
  issue recurring at a lower rate here (2/20 = 10% vs. the historical ~47%), consistent with known variance, not
  contradictory.
- **Three failures (`twin__004`, `atomic__015`, `twin__015`) share an identical checkout-timeout signature**,
  appearing on *both* arms despite being ~20 hours apart (`twin__004` at 2026-09-04T05:14Z vs. the `015` pair at
  2026-09-05T00:49–01:49Z) — consistent with a recurring, arm-independent backend/checkout behavior rather than a
  one-off tied to either method.
- **Separately, three failures cluster tightly in time despite two different error signatures**: `twin__014`
  (23:55Z, `TypeError: fetch failed`), `atomic__015` (00:49Z, checkout timeout), and `twin__015` (01:49Z, checkout
  timeout) all fall within a ~2-hour overnight window (2026-09-04T23:55Z–2026-09-05T01:49Z) at adjacent run
  indices. Different surface symptoms but tight temporal/index proximity is consistent with one shared environmental
  or backend degradation manifesting differently across scenarios, rather than three independent low-probability
  events — flagged for adjudication, not concluded here.
- **`twin__android__014`'s failure is a raw `TypeError: fetch failed`** during a login step — a network-level
  exception, not a UI assertion timeout. The campaign script's own infra-suspect heuristic operates at job-level
  (does the failing *job's* step name match the arm's known primary-execution step?) and cannot see this
  step-level distinction, so it was not flagged `likelyInfra=true` even though it looks more like transient
  infrastructure noise than a scenario-level product defect.
- **`atomic__android__018` is a qualitatively different, much larger outlier**: 8 of 106 scenarios failed in one
  dispatch, spanning unrelated features (catalog rendering timeout in two markets, search-filter returning stale
  results in three markets, a `WebDriverError` from UiAutomator2's key-event synthesis on Arabic input, and two
  checkout failures). This breadth — multiple unrelated locators/features/markets failing together in one run — is
  much more consistent with a single-dispatch environmental incident (emulator, Appium session, or backend
  degradation during that ~80-minute window) than with 8 independent product defects. Flagged as the strongest
  outlier in the dataset; not reclassified as invalid, since `likelyInfra=false` per the frozen heuristic and no
  pre-registered rule authorizes excluding it.
- **Temporal spread:** 4 of 8 failures fall in the first half of the campaign, 4 in the second — no gross
  first-half/second-half drift beyond the ~2h cluster noted above.

**F.4 — Twin scenario ordering is identical across all 40 twin dispatches.** All 20 web-twin and all 20
android-twin dispatches produce the exact same 16 "Concurrent journey instance N" scenario labels in the exact same
order — zero structural variation in the twin suite's execution across repeats.

**F.5 — Nothing found that would suggest excluding any of the 80 dispatches.** No missing run, no duplicate, no
extra run, no config asymmetry beyond the platform-appropriate driver choice, no artifact-ingestion failure (all 80
merged 3/3 files from 1/1 artifact on the first aggregation pass), no truncated telemetry, no provenance mismatch.
The items above are disclosed for adjudication and interpretation, not proposed as new post-hoc exclusion criteria.

---

## What this report does not do

It does not compute a ratio, a delta, a median, an IQR, a bootstrap CI, or a negative-control comparison for
Campaign B. It does not conclude whether Atomic Testing was faster, whether Web and Android differ, or whether H1/H2
-style hypotheses are supported. Those all require the adjudication in §A/§E first. The raw data, provenance, and
integrity findings above are the evidence; the interpretation is intentionally not attempted here.
