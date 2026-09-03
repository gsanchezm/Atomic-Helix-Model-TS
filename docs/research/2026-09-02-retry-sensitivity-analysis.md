# Retry-Sensitivity Re-analysis of the N=30 Determinism Campaign

**Date:** 2026-09-02
**Responds to:** research hardening Phase 1 decision **(b)** — "perform a retry-sensitivity analysis using the existing raw data … report both the original final-status effect and the retry-adjusted effect."
**Script:** `scripts/experiments/retry-sensitivity-analysis.ts` (`reports/retry-sensitivity.json`)
**Evidence:** `archives/atomic-testing-dataset-v1/retry-evidence/determinism-flaky-scan.json`, derived from the archived GH Actions job logs of all 120 `det-2026-campaign` dispatches.

## 1. Why reconstruction was possible — exactly, not approximately

The confound: the completed campaign ran the atomic arm at `retry: 1` and the Horizontal E2E baseline at `retry: 0`, and **every per-scenario artifact the pipeline stores records only the final attempt**. This is a property of cucumber-js itself: the JSON formatter drops any attempt that will be retried (`@cucumber/cucumber` 12.9.0, `lib/formatter/json_formatter.js:90`, `if (!testCaseAttempt.willBeRetried)`), so `reports/*.json` → `metrics/raw/cucumber-jsonl/` → `scenario_outcome_history.csv` never see a retry-healed attempt-1 failure. The proxy telemetry (`metrics/raw/proxy-jsonl/`) carries no scenario labels, so it cannot help either.

The GH Actions **job logs** are the one surviving record: the `progress` formatter prints every retried attempt under `Warnings:` as

```
1) Scenario: <name> (attempt 1, retried) # <feature>:<line>
   ...
   ✖ <failing step>
       Error: <the attempt-1 error>
```

A scenario that failed **both** attempts appears under `Failures:` instead (and as FAIL in the CSV — already symmetric). So the Warnings entries identify exactly the retry-healed cells, with scenario identity and the attempt-1 error text. All 120 dispatch logs were downloaded into the v1 dataset archive before their ~late-November expiry and scanned.

## 2. What the logs show

| Leg | Dispatches with an "(attempt 1, retried)" warning | Detail |
|---|---|---|
| atomic web (playwright, chromium reads+writes) | **0 / 30** | — |
| atomic android (appium) | **14 / 30** | all 14 are the **same scenario**: *"Selecting toppings updates the estimated total for Margherita in MX"* (Appium Android reads) |
| horizontal-e2e web / android | 0 (retry:0 — cannot retry by construction) | — |

Of those 14 attempt-1 failures, **6 also failed the retry** (final status FAIL — already counted in the published numbers) and **8 were healed by the retry** (final status PASS — invisible to the published numbers).

The attempt-1 error is the same in every sampled case:

```
Error: element ("android=new UiSelector().resourceId("text-estimated-total-value")")
still not displayed after 5000ms
```

i.e. an element-wait/locator-visibility failure — the **same locator-resolution failure family** the paper already identifies as dominating the baseline's divergence. The retry asymmetry hid occurrences of that mode in the atomic arm; it did not hide a different mode.

## 3. Original vs. retry-adjusted effect

Recomputed with the exact grouping `measure-reliability.ts` uses (scenario × tool × platform × batch, ordered by run_index), exact fractions. "Retry-adjusted" = every retry-healed cell flipped to its attempt-1 outcome (FAIL), the counterfactual a symmetric retry:0 campaign would have recorded, under the standard assumption that the presence of a retry does not alter attempt-1 behavior.

| Slice | Original P→F | Retry-adjusted P→F |
|---|---|---|
| atomic android (`appium-android`) | 5/2,836 = **0.176 %** | 7/2,828 = **0.248 %** |
| horizontal-e2e android | 23/441 = **5.215 %** | 23/441 = 5.215 % (unchanged) |
| atomic web (`playwright`) | 0/2,581 = 0 % | unchanged |
| horizontal-e2e web | 0/464 = 0 % | unchanged |
| **Android twin/atomic ratio** | **29.6×** | **21.1×** |

(The published "29×"/"0.18 %"/"5.2 %" figures reproduce exactly from the original slice, validating the replication.)

Note the adjusted P→F rises less than the 8 flips might suggest: 12 of the 14 attempt-1 failures cluster in one scenario, and consecutive FAILs contribute F→F, not P→F, transitions. The scenario-level instability count is unchanged (that scenario was already the atomic arm's one unstable scenario); what changes is its per-transition rate.

## 4. Conclusion under the approved decision rule

- **Direction: unchanged.** The Horizontal E2E baseline's pass→fail transition rate remains ~21× the atomic arm's on Android; web remains 0-vs-0 at final status (population-instability framing unaffected).
- **Substantive conclusion: stable.** The order-of-magnitude divergence and the shared-failure-mode attribution both survive; the atomic arm's absolute rate moves from 0.176 % to 0.248 %.
- **Per decision (b): retain the existing campaign, no rerun.** The Threats to Validity rewrite must disclose: (i) the retry asymmetry itself; (ii) both numbers (29.6× final-status, 21.1× retry-adjusted); (iii) that 14/30 atomic Android dispatches had an attempt-1 element-wait failure in one scenario — the atomic arm's Android stability as published is partly a retry-policy artifact at the per-transition level, though not at the unstable-scenario-population level; and (iv) that the reconstruction is exact (log-derived), not modeled.
- Forward-looking fix already implemented: the `research` cucumber profile and `atomic-testing-experiment.yml` run **retry: 0 in both arms**, so no future campaign can reproduce this confound.

## 5. Determinism decision — CLOSED (2026-09-02, author ruling)

The author's ruling on this analysis: **retain the existing N=30 campaign, no rerun** (confirming §4's recommendation). Additionally, for the paper rewrite: the **retry-adjusted estimate (21.1×) is the primary method-comparison result**; the **original operational result (29.6×) is retained**, not dropped; and the retry asymmetry itself is disclosed in Threats to Validity. This refines §4's framing (which treated both numbers as co-equal disclosure items) — "primary" here means the number the paper's headline comparison should lead with, since it is the one insulated from the retry-policy confound §2 documents; "retained" means 29.6× stays in the paper as the as-published operational figure, with the asymmetry between the two made explicit rather than only the adjusted number surviving into the rewrite.

## 6. Reproduction

```bash
# evidence regeneration (from archived logs):
#   archives/atomic-testing-dataset-v1/retry-evidence/ — see the archive README
# analysis:
pnpm experiments:retry-sensitivity
# or: ts-node -r tsconfig-paths/register scripts/experiments/retry-sensitivity-analysis.ts
```
