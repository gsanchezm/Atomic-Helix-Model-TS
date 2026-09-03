# Campaign A — Scientific Results (Frozen)

**Date:** 2026-09-03
**Status:** FROZEN. This report is the binding scientific record of Campaign A's results. It does not edit `docs/research/2026-09-02-campaign-a-frozen-definitions.md` (design/metrics/mapping, unchanged) or `docs/research/2026-09-03-campaign-a-provenance-adjudication.md` (provenance ruling, unchanged) — it reports on top of both.
**Scope:** the completed 60-dispatch Campaign A (`atomic-testing-experiment-v2` @ `de2a8f956bd3a38c2818d975932a1008f1ce97b6`), analyzed per the frozen §3 (Metric 1) and §4 (MOL) definitions, with attribution per §10. After this report is committed, Campaign A's results are frozen — no further recomputation, reinterpretation, or data changes.

## 1. Endpoint hierarchy

**MOL (Matched Oracle Loss) is the primary endpoint.** Metric 1 (within-failed-scenario skipped-step containment) is secondary and mechanistic — it explains *how* a fault propagates through a scenario's own step sequence, not *whether* a matched semantic behavior was lost. §6 below shows why this hierarchy is load-bearing, not a formality: the two metrics dissociate at atomic EARLY, and only MOL answers the scientific question Campaign A was designed to ask.

## 2. The six frozen cells, as observed (N=10 each, zero backfill)

| Strategy | Position | M1 | MOL |
|---|---|---|---|
| atomic | EARLY | 0.2500 | 0.00 |
| atomic | MIDDLE | 0.2857 | 0.25 |
| atomic | LATE | 0.0000 | 0.25 |
| horizontal-e2e | EARLY | 0.8667 | 1.00 |
| horizontal-e2e | MIDDLE | 0.4000 | 0.50 |
| horizontal-e2e | LATE | 0.0000 | 0.25 |

Every value above is the cell's actual observed value — not a median standing in for a spread, since §7 establishes there was no spread to summarize.

## 3. Horizontal-minus-Atomic contrasts

**ΔMOL (horizontal-e2e − atomic):**

| Position | ΔMOL |
|---|---|
| EARLY | +1.00 |
| MIDDLE | +0.25 |
| LATE | 0.00 |

**ΔM1 (horizontal-e2e − atomic):**

| Position | ΔM1 |
|---|---|
| EARLY | +0.6167 |
| MIDDLE | +0.1143 |
| LATE | 0.0000 |

Both contrasts shrink monotonically from EARLY to LATE and reach exactly zero at LATE on both endpoints.

## 4. Hypothesis adjudication

Per the pre-registered hypotheses (`docs/research/2026-09-02-campaign-a-frozen-definitions.md` §12), stated as direction, not magnitude:

- **H1 (EARLY, MIDDLE — horizontal-e2e exhibits greater MOL and M1 than atomic): SUPPORTED.** ΔMOL and ΔM1 are both strictly positive at EARLY (+1.00 / +0.6167) and MIDDLE (+0.25 / +0.1143).
- **H2 (convergence toward LATE — the between-strategy gap narrows): SUPPORTED, and reaches the strongest form of convergence observable under this design: ΔMOL = ΔM1 = 0.00 at LATE.** Both strategies lose exactly one matched oracle (MOL = 0.25) and exhibit identical within-scenario containment (M1 = 0.0000) at LATE. This null difference at LATE was pre-anticipated by the frozen design (§12: "a null difference at LATE is a scientifically meaningful, pre-anticipated result, not a failure of the design") — it is reported as confirmation of H2, not treated as a null result requiring explanation away, and per §12/§13 it does not trigger any metric, position, or sample-size change.

## 5. Mechanism — stated conservatively

The observed pattern is explained by **position-dependent failure propagation and containment**, a structural consequence of two concretely different execution architectures under one fault class at three fault positions:

- The **atomic** matched slice runs seven independently DAO-seeded scenarios in one process; a fault positioned in one scenario cannot propagate into another scenario's execution, because no scenario depends on another's runtime state (verified directly, `docs/.../frozen-definitions.md` §2's single-clicker + independent-scenario-isolation guarantee).
- The **horizontal-e2e** journey runs all four matched oracles, plus everything else, inside **one continuous scenario instance**; a fault at position *p* can only fail to propagate to an oracle if that oracle's step executes *before* position *p* in that one shared sequence. EARLY precedes all four oracles (propagation reaches all four); MIDDLE precedes two (o₃, o₄); LATE precedes none of the *other* three, and is itself fused with the fourth (o₄) — see §6.

**This is not evidence of "atomic tests are more diagnosable" or "atomic testing prevents flakiness" in any general sense**, and this report makes no such claim. The result is scoped to exactly what was manipulated: one fault class (`LOCATOR_RESOLUTION_FAILURE` on `CLICK`), three fault positions chosen to span the journey's oracle sequence, N=10 replicates, web platform. It demonstrates that positioning a single UI-interaction fault produces *less semantic-oracle loss* under an architecture whose scenarios are mutually independent than under one where they share a single continuous execution — a specific, structural containment property, not a general diagnosability or reliability claim. Any broader claim would require independent evidence (different fault classes, different platforms, different applications) that this campaign does not provide and was not designed to provide.

## 6. Why atomic EARLY has M1 = 0.25 but MOL = 0 — explicit, not hand-waved

These two numbers describe **different scenarios entirely**, and the discrepancy is a direct, deterministic consequence of the frozen mapping — not an approximation, rounding artifact, or coincidence.

**The attribution-confirmed carrier for atomic EARLY** (§10: `classifyAttribution` returned `valid` against the pre-registered target in all 10 repeats) is the login scenario, `Logout label is translated to English after market US` (`src/core/tests/login/features/market-language-localization.feature`). Its four semantic steps:

1. `Given the OmniPizza login screen is open` — PASS
2. `When the user selects the "US" market with language "English"` — PASS
3. `And they log in as "standard_user"` — **FAIL** (the injected fault; this is the `loginButton` click)
4. `Then the logout button label is "Logout"` — SKIP (never reached)

`M1 = skipped(1) / total(4) = 0.25` — this measures containment **within that one scenario only** (`docs/.../frozen-definitions.md` §3's `F(d)` restriction to the attribution-confirmed carrier). It is a real, correctly-measured local cost: one step of the login scenario's own four steps was wasted.

**MOL's universe is `O = {o₁, o₂, o₃, o₄}`** (§5 of the frozen doc), and none of the four live in this scenario:

| Oracle | Carrier scenario | Feature |
|---|---|---|
| o₁ | `Catalog renders in US/en` | Browse the OmniPizza catalog across markets |
| o₂ | `Opening a pizza card launches the builder in US` | Browse the OmniPizza catalog across markets |
| o₃ | `Confirming add to cart closes the builder and increments the navbar cart count in US` | Customize a pizza in the builder across markets |
| o₄ | `Place a delivery order in US paying with credit card` | Place a delivery order across markets |

The login scenario is not among them — EARLY's frozen mapping table (§5) states this explicitly: *"EARLY owner (no oracle in O)."* Because the atomic matched slice's seven scenarios are mutually independent (each seeded via its own API DAO precondition, no shared execution state — §2's guarantee), the login scenario's failure has zero causal path to o₁-o₄'s four *separate* scenarios. All four execute and pass normally, `MOL = 0/4 = 0`.

**The general shape:** M1 answers "how much of the one scenario the fault happened to hit was wasted downstream of the fault." MOL answers "how many of the four specific behaviors this campaign cares about were prevented from producing a verdict." At EARLY, the fault hits a scenario that is real (and pays a real, measured M1 cost) but happens to be outside MOL's four-oracle universe entirely — which is exactly the scenario this campaign's design predicted (§4 of the frozen doc states the EARLY atomic MOL prediction as "0/4 exactly," not an upper bound, for precisely this reason) and precisely why MOL, not M1, is the endpoint that answers Campaign A's actual research question (§1 above).

## 7. Repeat-level determinism and the (non-)need for significance testing

All 10 repeats within every one of the 6 cells produced **byte-identical** M1 and MOL values — verified directly against the analyzed dataset, not inferred. No cell shows any within-cell variance.

**A conventional significance test is neither required nor particularly informative here**, for reasons specific to this experiment's design, not a general dismissal of statistical testing:

- The fault fires deterministically: `max_fires=1` combined with the verified single-clicker guarantee (§2 of the frozen doc — each of the three fault-target logical keys has exactly one call site in the entire suite) means the fault lands on the same semantic target every time, by construction, not by chance.
- Attribution was independently confirmed `valid` for all 60 dispatches (§10) — the mechanism was not merely assumed to behave deterministically, it was checked to have done so every time.
- The suite's own baseline flake rate on web is 0% (`docs/research/2026-09-02-retry-sensitivity-analysis.md` §2) — there is no stochastic noise source in this configuration for a significance test to be adjudicating against.

Under these conditions, the six cells are not samples drawn from six distributions with unknown variance; they are six deterministic outcomes of a controlled architectural manipulation, each replicated 10 times specifically to verify (not estimate) the absence of unexpected variance. That verification succeeded — replication confirmed determinism rather than characterizing spread. Reporting a p-value or confidence interval over ten identical numbers would not add information; the finding here is the *architectural* result (a mechanistic consequence of scenario independence vs. shared execution state under a positioned fault), not a statistical inference about a noisy population.

## 8. Robustness — provenance-complete N=47 sensitivity (unchanged from the adjudication)

Restricting to the 47/60 dispatches with a directly-verified OmniPizza backend commit (`docs/research/2026-09-03-campaign-a-provenance-adjudication.md` §4) reproduces every one of the six cells' M1 and MOL values **exactly**, with no cell falling below 7/10 verified repeats:

| Strategy | Position | M1 (N=60) | M1 (N=47) | MOL (N=60) | MOL (N=47) | Verified N |
|---|---|---|---|---|---|---|
| atomic | EARLY | 0.2500 | 0.2500 | 0 | 0 | 7 |
| atomic | MIDDLE | 0.2857 | 0.2857 | 0.25 | 0.25 | 9 |
| atomic | LATE | 0.0000 | 0.0000 | 0.25 | 0.25 | 8 |
| horizontal-e2e | EARLY | 0.8667 | 0.8667 | 1 | 1 | 7 |
| horizontal-e2e | MIDDLE | 0.4000 | 0.4000 | 0.5 | 0.5 | 8 |
| horizontal-e2e | LATE | 0.0000 | 0.0000 | 0.25 | 0.25 | 8 |

This is reproducible via `pnpm experiments:campaign-a-provenance-check` and is reported here as a robustness check, not a re-analysis — §2's numbers are the primary reported result; this table shows they do not depend on the 13 dispatches whose backend provenance could not be directly read.

## 9. What is NOT in scope of this report

Per the frozen doc's own scope (§1/§7) and this report's mandate: no new metric, position, fault class, or platform was introduced; no dispatch was excluded or added after data collection began; the frozen definitions and raw Campaign A data are unmodified by this report. This report is empirical adjudication of pre-registered hypotheses against pre-registered, frozen definitions — it is not the manuscript rewrite (not yet started, per the author's explicit instruction) and does not speculate beyond §5's conservative mechanism statement.
