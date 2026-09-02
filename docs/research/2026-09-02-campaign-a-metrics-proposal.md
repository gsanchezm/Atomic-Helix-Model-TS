# Campaign A — Exact Metric Definitions (Proposal, requires approval before execution)

**Date:** 2026-09-02
**Responds to:** research hardening decision **(c)**: "Metric 1 may remain the within-failed-scenario skipped-step fraction. Metric 2 should be a matched semantic-oracle loss calculated only across the equivalent source behaviors represented in the Horizontal E2E journey. Propose the exact formulas before executing Campaign A." Plus the approvals: fault class must be observable equivalently in both strategies (locator/UI-interaction, **not** ASSERTION_FAILURE), positions Early/Middle/Late.
**Status:** PROPOSAL — Campaign A is not launched.

## 1. Experimental design (context for the formulas)

One Campaign A **cell** = (strategy `a` ∈ {atomic, horizontal-e2e}) × (position `p` ∈ {EARLY, MIDDLE, LATE}) × repeat `i` ∈ 1..N. Each cell is one dispatch of `atomic-testing-experiment.yml` (retry 0 both arms, `CUCUMBER_PARALLEL=1`, no stagger, pinned release) with:

- `tom_inject_fault=LOCATOR_RESOLUTION_FAILURE` (locator/UI-interaction class — both arms resolve every logical key through the same chaos-proxy path, so the fault is observed identically; the known-asymmetric ASSERTION_FAILURE case is excluded per the approval)
- `tom_inject_fault_action=CLICK`, `tom_inject_fault_max_fires=1` (retry 0 ⇒ symmetric budget)
- `tom_inject_fault_target` = the position's logical key (new `TOM_INJECT_FAULT_TARGET` support in `src/kernel/fault-injection.ts`):

| Position | Logical key | Atomic owner (US row) | Journey step |
|---|---|---|---|
| EARLY | `loginButton` | S1 *Logout label is translated…* (login, the suite's one UI-login scenario) | step 2 of 15 |
| MIDDLE | `confirmAddToCartButton` | S6 *Confirming add to cart closes the builder…* | step 9 of 15 |
| LATE | `placeOrderButton` | S7 *Place a delivery order… paying with credit card* | step 14 of 15 |

All three are plain logical keys on the web platform and are dispatched by the **same reused molecules** in both arms. Platform: **web** (the mobile builder's confirm CTA is a raw `~btn-add-to-cart` selector, not a logical key — web keeps all three positions clean).

Atomic arm runs `evaluation_slice=matched` for Metric 2 comparability (the 7 `@matched-horizontal-e2e` US-row scenarios) and — proposal — a second leg at `evaluation_slice=full` for Metric 1 external validity; the horizontal arm is always its 16-instance journey. **Note:** with `max_fires=1` and one worker, the fault hits the *first* matching CLICK: in the journey that is instance 1 of 16; in the atomic arm the single owning scenario.

Proposed N: **10 repeats per cell** → 2 strategies × 3 positions × 10 = 60 dispatches (matched-slice leg; +30 atomic-full dispatches if the optional full-suite leg is approved). Subject to author approval.

## 2. Metric 1 — within-failed-scenario skipped-step fraction (unchanged, formalized)

Exactly what `scripts/experiments/diagnosability-table.ts` already computes, stated precisely. For dispatch `d`, let `F(d)` be the set of scenario executions whose final status is FAIL in that dispatch's cucumber-jsonl. For each `s ∈ F(d)`: `skipped(s)` = number of steps with recorded status SKIP (steps never reached because an earlier step of the *same* scenario failed); `total(s)` = number of recorded steps of `s` (Given/When/Then plus hooks as recorded).

**Per failed scenario:** `m1(s) = skipped(s) / total(s)`
**Per dispatch (reported):** `M1(d) = Σ_{s∈F(d)} skipped(s) / Σ_{s∈F(d)} total(s)` (step-weighted), with the per-scenario `m1(s)` list retained.

Aggregation across repeats: report the distribution (median + IQR) of `M1(d)` per (strategy, position) cell — repeats are the unit of analysis, never pooled steps across dispatches. Interpretation caveat (already flagged in the Phase 1 audit): `M1` conditions on the failing unit, so the fault's position *within* that unit is part of the effect — that is what the Early/Middle/Late stratification isolates.

## 3. Metric 2 — matched semantic-oracle loss (new)

**Universe.** The behavior-equivalence mapping (2026-09-02, see the Phase 2 report) gives the journey **4 semantic oracles**, each with a 1:1 atomic owner in the matched slice:

| Oracle | Step text (identical in both arms) | Atomic owner | Journey step |
|---|---|---|---|
| o₁ | *Then the catalog screen is fully displayed* | S2 | 4 |
| o₂ | *Then the pizza builder is displayed for "Pepperoni"* | S3 | 6 |
| o₃ | *Then the pizza builder is closed* | S6 | 10 |
| o₄ | *Then the order is accepted* | S7 | 15 |

`O = {o₁..o₄}` is the **matched oracle set**: every element is evaluated by *both* strategies on the same source behavior with byte-identical step text. (The matched slice's other 6 oracles — add-to-cart label, a11y gate, size total, toppings total, navbar count, logout label — have no journey counterpart; per the decision they are **excluded** from Metric 2. The journey's population-level restriction to US/en is likewise held constant by the matched slice's US-row selection.)

**Per-oracle verdict.** For dispatch `d` of strategy `a` and oracle `o`, locate `o`'s step in `a`'s carrier (the owning atomic scenario's US-row execution, or journey **instance 1** — the instance the single-fire fault can hit; see robustness note below) and classify from the recorded step status:

- `DELIVERED` — status PASS or FAIL (the oracle *executed and rendered a verdict*; a FAIL caused by the injected fault is still a delivered verdict);
- `LOST` — status SKIP, or the carrier scenario/step record is absent from the dispatch's cucumber-jsonl (the oracle never executed).

**Per dispatch:** `M2(d) = |{o ∈ O : LOST}| / |O|` — the matched semantic-oracle **loss**; equivalently report retention `1 − M2(d)`.

**Prediction being tested (Corollary/R1 framing):** in the horizontal journey a fault at position `p` loses every matched oracle downstream of `p` in instance 1 (EARLY ⇒ M2 = 4/4; MIDDLE ⇒ 2/4 (o₃,o₄); LATE ⇒ 1/4 (o₄, if the fault lands before the order-accepted oracle)); in the atomic arm the fault is contained in the owning scenario, so at most that scenario's own matched oracle is lost or failed (M2 ≤ 1/4 at every position, and the failed oracle is usually DELIVERED-FAIL, not LOST). The denominators are identical across arms by construction — no scenario-population imbalance enters the metric, which is what decision (c) required.

**Aggregation:** distribution of `M2(d)` across the N repeats per (strategy, position) cell, alongside the per-oracle verdict table.

**Robustness notes (disclosed):**
1. In the journey, instances 2–16 of the Outline still run after instance 1 fails; Metric 2 deliberately scores only the faulted instance — the other instances are *repetitions of the same behaviors*, not additional matched behaviors. A sensitivity column "any-instance delivery" (oracle delivered in ≥1 of the 16 instances) will also be reported so the choice is auditable rather than silent.
2. In the atomic arm the faulted scenario is identified from the injected error string (`Injected fault: unable to find element…`) — verified present in the failing step's errorMessage — so an unrelated environmental failure in the same dispatch cannot be mistaken for the injection.
3. Dispatches where the fault demonstrably did not fire (no injected-error string anywhere in the dispatch) are recorded as invalid cells and re-dispatched under the campaign's disclosed-backfill rules, never silently counted.

## 4. What needs author approval

1. Metric 1 dispatch-level aggregation as `M1(d)` step-weighted (vs. unweighted mean of `m1(s)`).
2. Metric 2 exactly as in §3 (universe O of 4 matched oracles, LOST = SKIP/absent, faulted-instance scoring + any-instance sensitivity column).
3. Positions/keys/fault class per §1 (LOCATOR_RESOLUTION_FAILURE on CLICK at `loginButton` / `confirmAddToCartButton` / `placeOrderButton`, web).
4. N = 10 repeats per cell (60 dispatches; +30 optional atomic-full leg).

Nothing runs until these are approved.
