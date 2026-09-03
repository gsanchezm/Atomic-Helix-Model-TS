# Campaign A — Frozen Exact Definitions

**Date:** 2026-09-02
**Status:** FROZEN. Supersedes `docs/research/2026-09-02-campaign-a-metrics-proposal.md` (that document remains as the historical proposal record; this document is the binding one — see §7 for what changed between proposal and freeze). Metric definitions, the oracle mapping, and the execution order below MUST NOT change after Campaign A results are observed.
**Responds to:** the author's Campaign A approval (2026-09-02), conditions 1-6. Conditions 7 (ingestion/analysis-naming validation) and 8 (branch/tag freeze, deploy freeze, launch) are handled separately — §8 records condition 7's result; condition 8 is explicitly NOT started by this document (dispatch requires the author's own deploy-freeze action first).
**Frozen at:** the exact commit SHA is not restated here — it lives in the `atomic-testing-experiment-v2` annotated tag's own message and in every Campaign A dispatch's campaign manifest (`resolvedSha`, schema 1.2.0, `run-campaign.ts`), so this document never needs editing to record it. §3-§6 (the definitions, mapping, and execution order) must not change after that tag is created; a correction found post-freeze goes in a dated addendum below this section, never an edit to §3-§6 themselves.

## 1. Design (unchanged from the approved proposal)

One Campaign A **cell** = (strategy `a` ∈ {atomic, horizontal-e2e}) × (position `p` ∈ {EARLY, MIDDLE, LATE}), N = **10** independent dispatches per cell, 2 × 3 × 10 = **60 dispatches total**. Platform: **web** only. Each dispatch runs `atomic-testing-experiment.yml` (`research` cucumber profile, retry 0 both arms, `CUCUMBER_PARALLEL=1`, no stagger, pinned OmniPizza release) with:

- `tom_inject_fault=LOCATOR_RESOLUTION_FAILURE` (symmetric, UI-interaction class — both arms resolve every logical key through the same chaos-proxy path)
- `tom_inject_fault_action=CLICK`, `tom_inject_fault_max_fires=1`
- `tom_inject_fault_target` = the position's logical key
- atomic arm: `evaluation_slice=matched` (the 7 `@matched-horizontal-e2e` US-row scenarios); horizontal-e2e arm always runs its full 16-instance journey (unaffected by `evaluation_slice`)

| Position | Logical key |
|---|---|
| EARLY | `loginButton` |
| MIDDLE | `confirmAddToCartButton` |
| LATE | `placeOrderButton` |

**Scope, explicit:** the proposal's optional +30 atomic-full leg was NOT part of the approval and is NOT built — `buildCampaignAItems()` (`scripts/experiments/lib/campaign-matrix.ts`) produces exactly 60 items. N is frozen at 10; per the approval, N is not increased based on observed results.

## 2. Single-clicker guarantee (verified 2026-09-02 against the real matched-slice + journey code, not assumed)

Each of the three logical keys is CLICKed from **exactly one call site** in the entire suite (both the atomic matched slice and the horizontal-e2e journey reuse the identical molecule — the journey feature's own header states this is by construction, not coincidence):

| Key | Sole call site | Reused by the journey? |
|---|---|---|
| `loginButton` | `src/core/tests/login/molecules/login-session.molecule.ts`'s `submitCredentials()`, invoked only from `login.route.ts`'s `attemptLogin()` — the UI-login path taken *only* by the login domain's own scenario. Every other matched-slice scenario logs in via the `Given ... logged in as "..."` step, which injects a token through `LoginDao` (API), never through the UI. | `evaluation/non-atomic-twin/checkout/organisms/checkout-nonatomic.route.ts` reuses `login.route.ts`'s own attempt path for the journey's step 2. |
| `confirmAddToCartButton` | `src/core/tests/pizzaBuilder/molecules/pizzaBuilder-confirm.molecule.ts`'s `clickConfirmAddToCart()`, called from exactly one route method (`pizzaBuilder.route.ts`'s `confirmAddToCart()`), called from exactly one step binding (`pizzaBuilder.steps.ts`). | `evaluation/non-atomic-twin/pizzaBuilder/organisms/pizzaBuilder-nonatomic.route.ts` imports and calls the **same** `clickConfirmAddToCart()` directly (verified: `import { clickConfirmAddToCart } ...`). |
| `placeOrderButton` | `src/core/tests/checkout/molecules/checkout-order.molecule.ts`'s `placeOrder()`, called from exactly one route method (`checkout.route.ts`'s `verifyOrderAccepted()`), called from exactly one step binding (`checkout.steps.ts`, step text `Then('the order is accepted', ...)`). | `evaluation/non-atomic-twin/checkout/organisms/checkout-nonatomic.route.ts`'s own `verifyOrderAccepted()` delegates straight to `this.checkoutRoute.verifyOrderAccepted()` — the same atomic route method, same click. |

Consequence: with `max_fires=1`, the fault **cannot** land anywhere but the intended owning scenario/step — this holds regardless of the 7 matched scenarios' execution order within the atomic dispatch, and regardless of which of the 16 journey instances is "first" (instance 1 is first by definition of the Outline's Examples order, which cucumber preserves).

**Fusion asymmetry (this is why the MOL LOST-set had to include FAIL, not just SKIP/absent — see §4):**

- `confirmAddToCartButton`'s click ("When they confirm add to cart") and its oracle o₃ ("Then the pizza builder is closed") are **separate** Gherkin steps. A MIDDLE-position fault fails the When; o₃ is never reached — it records **SKIP**.
- `placeOrderButton`'s click and its oracle o₄ ("Then the order is accepted") are **the same Gherkin step** — `verifyOrderAccepted()`'s body issues the click, then asserts, and both the atomic and the horizontal-e2e step bindings resolve to that one function. A LATE-position fault throws inside that step's own execution; o₄ records **FAIL**, not SKIP.
- `loginButton`'s click ("When they log in as ...") is also fused with its own readiness wait inside `submitCredentials()`, but EARLY's owning scenario (S1, login) hosts none of o₁-o₄, so this doesn't affect MOL — only Metric 1's per-scenario containment stat at EARLY.

Without the approval's clarification that FAIL counts as lost, LATE and MIDDLE would have scored *inconsistently* for a difference in Gherkin step layout, not in what actually happened to the oracle. The frozen MOL definition in §4 is deliberately layout-agnostic.

## 3. Metric 1 — within-failed-scenario skipped-step containment (exact)

**Semantic step definition.** A recorded step in a dispatch's `cucumber-jsonl` enters Metric 1's accounting iff its `name` field (the concatenation `keyword + name` normalize-telemetry.ts already produces) begins with one of the Gherkin keywords: `Given `, `When `, `Then `, `And `, `But `, `* ` (all with a trailing space, per real cucumber output). This is a **positive allowlist**, not a denylist against `Before`/`After` — a denylist would silently start counting a hook again the day a hook is ever given a name. Technical hooks/setup/teardown/telemetry (cucumber `Before`/`After` records, which collapse to the literal step name `"Before"` / `"After"` with no trailing content since their own `name` field is always `null`) never enter the denominator, by construction of the allowlist, not by exclusion.

Verified empirically 2026-09-02 against 174,897 real step records merged from the campaign archive + the 6 smoke dispatches: the allowlist and a hand-written `name === 'Before' || name === 'After'` denylist agree on every single record (0 mismatches) — the allowlist is adopted as the frozen rule because it is the one that stays correct if that agreement ever breaks, not because the two differ today.

**Not a change to the published §4.2 instrument.** `scripts/experiments/diagnosability-table.ts` (already-published diagnosability results) counts `scenario.steps.length` including hooks — that script is not retroactively changed. Campaign A's Metric 1 is a separate, hook-excluded definition; a reader comparing the two numbers directly would be comparing different denominators.

**Formula.** For dispatch `d`, let `F(d)` be the scenario executions with final status FAIL. For `s ∈ F(d)`, restricting to semantic steps only:

- `total(s)` = count of semantic step records for `s`
- `skipped(s)` = count of `s`'s semantic step records with status SKIP

Per-scenario: `m1(s) = skipped(s) / total(s)`.
Per-dispatch (reported, step-weighted): `M1(d) = Σ_{s∈F(d)} skipped(s) / Σ_{s∈F(d)} total(s)`.

**Aggregation.** Distribution (median + IQR) of `M1(d)` per (strategy, position) cell across the 10 repeats; repeats are the unit of analysis, never pooled steps across dispatches.

## 4. Metric 2 — Matched Oracle Loss (MOL), exact

**Universe.** `O = {o₁, o₂, o₃, o₄}`, the four semantic oracles with a byte-identical step-text 1:1 mapping between the atomic matched slice and the horizontal-e2e journey — see §5 for the frozen identifiers.

**Per-oracle verdict**, for dispatch `d` of strategy `a`, oracle `o`, in a dispatch where the injected fault is confirmed to have fired (§6 validity rule):

- **LOST** — the oracle's step record has status **FAILED**, status **SKIPPED**, or is **absent from the dispatch's cucumber-jsonl** (not reached — the carrier scenario/instance never got there).
- **DELIVERED** — the oracle's step record has status **PASS** (normally executed).

This is the approval's own wording verbatim (FAILED/SKIPPED/NOT REACHED are lost; a normally executed PASS is not), not the earlier proposal's "FAIL is still a delivered verdict" — see §2 for why that distinction is load-bearing under this fault class (LATE's fusion makes FAIL a real, not merely hypothetical, case).

**Formula.** `MOL(d) = |{o ∈ O : LOST}| / 4`. Equivalently, retention `= 1 − MOL(d)`.

**Carrier per arm:** the owning atomic scenario's step record (atomic arm) or journey **instance 1**'s step record (horizontal-e2e arm — the instance the single-fire fault can hit, confirmed by the single-clicker guarantee in §2).

**Exact per-cell predictions** (stated before launch so a wrong attribution shows up as a prediction miss, not as an unexamined "interesting result"):

| Position | Atomic MOL | Horizontal-e2e MOL | Why |
|---|---|---|---|
| EARLY (`loginButton`) | **0/4 exactly** | **4/4** | S1 (the atomic owner) hosts none of o₁-o₄ — the fault is fully contained in an atomic scenario the metric doesn't even measure. In the journey, every oracle is downstream of the login step (step 2) in instance 1, all four SKIPPED. |
| MIDDLE (`confirmAddToCartButton`) | **≤1/4** (o₃, via SKIP if the fault fires) | **2/4** (o₃, o₄) | o₃ is in S6, the fault's own owning scenario — SKIP (separate steps, §2). o₁/o₂ live in unrelated, independently-DAO-seeded atomic scenarios (S2/S3) and are unaffected. In the journey, o₃ and o₄ (both downstream of step 9 in instance 1) SKIP; o₁/o₂ (steps 4/6, upstream) PASS. |
| LATE (`placeOrderButton`) | **≤1/4** (o₄, via FAIL, not SKIP — §2's fusion) | **1/4** (o₄) | o₄ is in S7, the fault's own owning scenario — FAIL (fused step). o₁/o₂/o₃ live in unrelated atomic scenarios, unaffected. In the journey, only o₄ (step 15, the last oracle) is downstream of step 15's own click — it FAILs; o₁/o₂/o₃ (steps 4/6/10, all upstream) PASS. |

(EARLY and LATE atomic values are exact, not upper bounds, given the single-clicker + independent-scenario-isolation guarantees in §2; MIDDLE/LATE are written "≤1/4" only insofar as an atomic scenario could in principle also fail for an unrelated reason unconnected to the injected fault, which §6's validity check is designed to catch, not because the fault's own effect is ambiguous.)

**Robustness notes (disclosed, carried from the proposal unchanged):**
1. Journey instances 2-16 still run after instance 1's fault; MOL scores only the faulted instance 1. A sensitivity column ("any-instance delivery": oracle delivered in ≥1 of 16 instances) is reported alongside.
2. The faulted scenario/instance is identified from the injected-error string (`Injected fault: unable to find element…`), verified present in the failing step's `errorMessage`.
3. A dispatch where the injected-error string does not appear anywhere is an **invalid cell** (§6) — recorded and backfilled per the campaign's disclosed rules, never silently counted as a clean 0.

## 5. Frozen oracle + scenario + position mapping (condition 5)

Resolves independently of the shorthand `S1`/`S6`/`S7` used elsewhere — every row below is a feature file path, exact scenario name, and the exact `@matched-horizontal-e2e` Examples row. The journey step numbers correct an off-by-one in the original proposal (LATE was described there as "step 14 of 15"; the actual click+oracle fusion places it at **step 15**, the journey's last step — verified directly against `checkout-nonatomic.steps.ts`'s binding, not re-asserted from the proposal).

**Horizontal-e2e journey** (single source of truth for step numbering): `evaluation/non-atomic-twin/checkout/features/full-order-journey.nonatomic.feature`, `Scenario Outline: Concurrent journey instance <instance> completes login through order confirmation via UI only` (16 Examples rows, `instance` 1-16; instance 1 is the fault-scoring instance per §4).

| Journey step # | Journey step text | Role |
|---|---|---|
| 1 | `Given the OmniPizza login screen is open` | — |
| 2 | `When they log in as "standard_user"` | **EARLY fault target** (`loginButton`) |
| 3 | `And they are browsing the catalog in market "US" using language "en"` | — |
| 4 | `Then the catalog screen is fully displayed` | **o₁** |
| 5 | `When they open the pizza "Pepperoni"` | — |
| 6 | `Then the pizza builder is displayed for "Pepperoni"` | **o₂** |
| 7 | `When they select size "Large"` | — |
| 8 | `And they add toppings "mushrooms"` | — |
| 9 | `When they confirm add to cart` | **MIDDLE fault target** (`confirmAddToCartButton`) |
| 10 | `Then the pizza builder is closed` | **o₃** |
| 11 | `When they proceed to checkout in market "US" with the built cart` | disclosed twin-only glue step, no atomic owner |
| 12 | `And they provide delivery details "123 Luxury Avenue" "90210", "" for "Julian Casablancas" "+1 415 555 0101"` | — |
| 13 | `And they choose payment method "Credit Card"` | — |
| 14 | `And they enter card details "4242 4242 4242 4242" expiration "12/28" cvv "123"` | — |
| 15 | `Then the order is accepted` | **o₄** and **LATE fault target** (`placeOrderButton`) — fused, see §2 |

**Atomic owners** (feature path, exact scenario name, `@matched-horizontal-e2e` Examples row):

| Oracle / position | Feature | Scenario | Matched Examples row |
|---|---|---|---|
| EARLY owner (no oracle in O) | `src/core/tests/login/features/market-language-localization.feature` | `Scenario Outline: Logout label is translated to <language> after market <market>` | `market=US, language=English, logoutLabel=Logout` |
| **o₁** | `src/core/tests/catalog/features/browse-catalog.feature` | `Scenario Outline: Catalog renders in <market>/<language>` | `market=US, language=en, addToCartLabel=Add to Cart` |
| **o₂** | `src/core/tests/catalog/features/browse-catalog.feature` | `Scenario Outline: Opening a pizza card launches the builder in <market>` | `market=US, language=en, item=Pepperoni` |
| **o₃** / MIDDLE owner | `src/core/tests/pizzaBuilder/features/customize-pizza.feature` | `Scenario Outline: Confirming add to cart closes the builder and increments the navbar cart count in <market>` | `market=US, item=Pepperoni, language=en, size=Large, initialCount=0, expectedCount=1` |
| **o₄** / LATE owner | `src/core/tests/checkout/features/place-delivery-order.feature` | `Scenario Outline: Place a delivery order in <market> paying with credit card` | `market=US, item=Pepperoni, size=Large, qty=1, street=123 Luxury Avenue, zip=90210, suburb=(empty), name=Julian Casablancas, phone=+1 415 555 0101, card=4242 4242 4242 4242, exp=12/28, cvv=123` |

The other two matched-slice scenarios (`Selecting a size updates the estimated total...` / journey step 7, `Selecting toppings updates the estimated total...` / journey step 8) complete the 7-scenario matched slice but host neither a fault position nor an oracle in `O`; they are unaffected by any Campaign A dispatch and not part of MOL's universe.

## 6. Validity rule (dispatch-level, applies to both metrics)

A dispatch is valid iff the injected-error string is present in the run's cucumber-jsonl (the CLICK actually failed as designed). An invalid dispatch is recorded and backfilled, never silently folded into the N=10 as a clean result — consistent with the campaign's no-fabrication policy (paper §3.2.5) and with the approval's "do not increase N based on observed results" (backfilling an invalid cell restores the pre-declared N; it is not an increase).

**Disclosed gap, for the (not yet written) analysis script:** this rule checks only that the injected-error string is present *somewhere* in the dispatch — it does not verify the string appears in the *expected owning scenario/step* specifically, nor does it exclude a dispatch where an unrelated scenario also failed for an independent reason. §4's atomic MIDDLE/LATE predictions are therefore written `≤1/4`, not `=1/4`, precisely because this gap is real, not a hedge. The metrics-computation script must attribute the injected-error string to the specific carrier scenario/step (per §2's identification method), not merely confirm the dispatch as a whole is valid — otherwise an atomic dispatch with an unrelated second failure would silently inflate M1/MOL for a reason unconnected to fault positioning.

## 7. What changed between the proposal and this freeze

1. Metric 1's denominator now explicitly excludes hooks via an allowlist (proposal's wording, "Given/When/Then plus hooks as recorded", would have included them — corrected per approval condition 2).
2. Metric 2's LOST set now includes FAILED (proposal's DELIVERED = PASS-or-FAIL is superseded — approval condition 2/the MOL formula in the author's own message).
3. LATE's journey step number corrected from the proposal's "14 of 15" to the verified **15** (the click+oracle fusion — §2, §5).
4. EARLY's atomic MOL stated as exactly 0/4, not the proposal's generic "≤1/4" (§4).
5. The +30 atomic-full leg is dropped — not part of the approval (§1).
6. Execution order is now specified exactly (§9 below), not left to `run-campaign.ts`'s existing (unbalanced, fixed atomic-first) interleave.

## 8. Balanced paired execution order (condition 6)

Implemented as `buildCampaignAItems()` in `scripts/experiments/lib/campaign-matrix.ts`, producing the 60 items **already in final dispatch order** (not run through the generic `interleaveByRunIndex`, whose fixed atomic-then-twin sort would destroy the alternation below). For pair-slot `g = 1..30`:

- **Position** rotates `EARLY, MIDDLE, LATE, EARLY, ...` — `POSITIONS[(g-1) % 3]` (pre-declared, not random — positions are interleaved in time, not run as three separate 20-dispatch blocks, to avoid a time-varying backend confound between position blocks).
- **Repeat-within-cell** = `ceil(g / 3)` (1..10).
- **Arm-first** alternates by `g`'s parity: odd `g` dispatches atomic first, even `g` dispatches horizontal-e2e first.

Verified property (2026-09-02, `buildCampaignAItems('')` run directly): 60 items, 60 unique ids, exactly 10 repeats per (arm × position) cell, and **exactly 5 atomic-first / 5 horizontal-first pairs at every one of the 3 positions** — the balance condition 6 requires, confirmed empirically rather than asserted from the arithmetic alone.

## 9. Condition 7 — ingestion/analysis-naming validation (DONE)

Two distinct gaps existed, both closed and validated against the 6 real completed smoke dispatches (`docs/research/2026-09-02-phase2-implementation.md`'s Phase 3 table):

1. **Artifact-name wiring** — `aggregate-campaign-artifacts.ts` never called `experimentArtifactNamesFor`; every experiment-mode campaign's artifacts would have failed to download. Fixed (`--workflow experiment` now resolves via `experimentArtifactNamesFor`, shared download/merge logic factored into `scripts/experiments/lib/artifact-merge.ts`). Validated: `scripts/experiments/validate-experiment-ingestion.ts` downloaded and merged all 6 real smoke artifacts under their real GH Actions names.
2. **Analysis-layer naming** — the experiment workflow stamps `tool_name` values the legacy analysis layer had never seen (`horizontal-e2e-web`/`horizontal-e2e-android`/`horizontal-e2e-ios`, alongside `playwright`/`appium-android`/`appium-ios`). Validated: after merging, `scripts/metrics/normalize-telemetry.ts` was run for real and all 6 smoke runs' `scenario_outcome_history.csv` rows resolved to their expected `tool_name` — none came back `UNKNOWN` (the exact failure mode recorded in this repo's own history for a prior, unrelated cause). Row counts also matched the Phase 2 report exactly (7/16/6/16/6/16).

Both checks are real, re-runnable (`ts-node -r tsconfig-paths/register scripts/experiments/validate-experiment-ingestion.ts`), not simulated.
