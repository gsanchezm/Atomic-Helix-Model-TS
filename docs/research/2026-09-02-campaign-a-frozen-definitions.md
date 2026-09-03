# Campaign A — Frozen Exact Definitions

**Date:** 2026-09-02
**Status:** FROZEN. Supersedes `docs/research/2026-09-02-campaign-a-metrics-proposal.md` (that document remains as the historical proposal record; this document is the binding one — see §7 for what changed between proposal and freeze). Metric definitions, the oracle mapping, and the execution order below MUST NOT change after Campaign A results are observed.
**Responds to:** the author's Campaign A approval (2026-09-02), conditions 1-6, PLUS a second-round methodological requirement issued after this document's first version — deterministic fault attribution (§10), MOL as the primary endpoint (§11), pre-registered directional hypotheses (§12), and a frozen invalid-run policy (§13) — all required closed **before** Condition 8, per the author's own wording ("this cannot be deferred to post-hoc analysis"). Condition 7 (ingestion/analysis-naming validation) is recorded in §9. Condition 8 (branch/tag/SHA/manifests) may proceed once §10-§13 are verified; **launching the 60 dispatches still requires the author's own confirmation that the OmniPizza Render deploy freeze is in effect** — that confirmation is not something this document or its author can supply on the author's behalf.
**Frozen at:** the exact commit SHA is not restated here — it lives in the `atomic-testing-experiment-v2` annotated tag's own message and in every Campaign A dispatch's campaign manifest (`resolvedSha`, schema 1.2.0, `run-campaign.ts`), so this document never needs editing to record it. §1-§5 and §8-§13 (the design, definitions, mapping, execution order, attribution mechanism, endpoint hierarchy, hypotheses, and invalid-run policy) must not change after that tag is created; §6 is deliberately left as superseded historical text, not deleted. A correction found post-freeze goes in a dated addendum below this section, never an edit to the frozen sections themselves.

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

**`F(d)` is the attribution-confirmed carrier scenario only, not "any FAILed scenario in the dispatch."** This tightens the generic convention `scripts/experiments/diagnosability-table.ts` uses (where pooling every failed scenario is fine because that instrument isn't measuring one positioned fault) — for Campaign A, an unrelated scenario failing for an independent reason in the same dispatch must not dilute or inflate M1's step-weighted average for a cause unconnected to fault positioning. `scripts/experiments/campaign-a-analysis.ts`'s `computeM1(scenarios, restrictToScenario)` takes the §10-attributed carrier scenario name explicitly; `analyzeDispatch()` always passes it. Verified by a synthetic-fixture test (`campaign-a-analysis.test.ts`) constructing a dispatch with both the attributed scenario AND an unrelated failed scenario, asserting the unrelated one is excluded.

**Aggregation.** Distribution (median + IQR) of `M1(d)` per (strategy, position) cell across the 10 repeats; repeats are the unit of analysis, never pooled steps across dispatches.

## 4. Metric 2 — Matched Oracle Loss (MOL), exact

**Universe.** `O = {o₁, o₂, o₃, o₄}`, the four semantic oracles with a byte-identical step-text 1:1 mapping between the atomic matched slice and the horizontal-e2e journey — see §5 for the frozen identifiers.

**Per-oracle verdict**, for dispatch `d` of strategy `a`, oracle `o`, in a dispatch classified `valid` by §10's deterministic attribution rule:

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

(EARLY and LATE atomic values are exact, not upper bounds, given the single-clicker + independent-scenario-isolation guarantees in §2; MIDDLE/LATE are written "≤1/4" only insofar as an oracle-carrying scenario could in principle also fail for a reason unconnected to the injected fault — MOL's per-oracle lookup is targeted, not pooled across "any failure," so this is a genuine, rare confound (an independent flake landing specifically in an oracle-carrying scenario), not a measurement gap; the empirically observed web flake rate is 0% — retry-sensitivity analysis, `docs/research/2026-09-02-retry-sensitivity-analysis.md` §2 — so `=1/4` is expected in practice, and a departure would itself be a visible, distinguishable finding via the per-oracle breakdown, not a silent miscount.)

**Confirmed against real data, not just the synthetic-fixture tests below:** 4 real fault-injected dispatches (`campaign-a-instrument-validation` batch, run before this freeze — see §10) matched these exact predictions: MIDDLE atomic MOL=0.25 (o₃ only), MIDDLE twin MOL=0.5 (o₃,o₄), LATE atomic MOL=0.25 (o₄ via FAIL), LATE twin MOL=0.25 (o₄ via FAIL). M1 at LATE was 0 in both arms in all cases — the fused step means nothing downstream exists to skip, which is exactly the mechanistic reason MOL, not M1, must be the primary endpoint (§11).

**Robustness notes (disclosed, carried from the proposal unchanged):**
1. Journey instances 2-16 still run after instance 1's fault; MOL scores only the faulted instance 1. A sensitivity column ("any-instance delivery": oracle delivered in ≥1 of 16 instances) is reported alongside.
2. The faulted scenario/instance is identified from the injected-error string (`Injected fault: unable to find element…`), verified present in the failing step's `errorMessage`.
3. A dispatch where the injected-error string does not appear anywhere is classified `fault_not_injected` (§10) — an **invalid cell**, recorded and backfilled per §13's frozen policy, never silently counted as a clean 0.

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

## 6. Validity rule (dispatch-level, applies to both metrics) — superseded by §10

**This section's original text (checking only that the injected-error string is present *somewhere* in the dispatch) has been superseded.** It disclosed exactly the gap the author's second-round requirement closes: presence alone doesn't verify the fault landed on the *expected* semantic case, so an atomic dispatch with an unrelated second failure could have silently inflated M1/MOL. §10 replaces this with deterministic, per-dispatch attribution — implemented and tested (synthetic fixtures + 4 real dispatches) before this freeze, not deferred to post-hoc analysis. See §10 for the binding rule; this section is kept only so the historical gap-disclosure isn't lost.

## 7. What changed between the proposal and this freeze

1. Metric 1's denominator now explicitly excludes hooks via an allowlist (proposal's wording, "Given/When/Then plus hooks as recorded", would have included them — corrected per approval condition 2).
2. Metric 2's LOST set now includes FAILED (proposal's DELIVERED = PASS-or-FAIL is superseded — approval condition 2/the MOL formula in the author's own message).
3. LATE's journey step number corrected from the proposal's "14 of 15" to the verified **15** (the click+oracle fusion — §2, §5).
4. EARLY's atomic MOL stated as exactly 0/4, not the proposal's generic "≤1/4" (§4).
5. The +30 atomic-full leg is dropped — not part of the approval (§1).
6. Execution order is now specified exactly (§8), not left to `run-campaign.ts`'s existing (unbalanced, fixed atomic-first) interleave.
7. (Second round) §6's disclosed presence-only validity check is superseded by §10's deterministic, per-dispatch attribution — a `tooling_error`/`wrong_semantic_target`/`multiple_fires`/`fault_not_injected` classification, computed and unit-tested before any real data existed, then confirmed against 4 real dispatches.
8. (Second round) M1's `F(d)` is restricted to the attribution-confirmed carrier scenario (§3) — an unrelated failure elsewhere in the same dispatch no longer dilutes/inflates M1.
9. (Second round) MOL is now explicitly the primary endpoint, M1 secondary/mechanistic (§11) — not stated as a hierarchy in the original proposal or the first freeze pass.
10. (Second round) Directional hypotheses (§12) and a frozen invalid-run policy with enumerated reasons (§13) are new — neither existed before the author's second-round requirement.

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

## 10. Deterministic fault attribution (closes the §6 gap; author's second-round requirement 1+2)

**Design choice, verified before committing to it.** The obvious mechanism — thread a scenario/step identifier through the gRPC request (`ptom.proto`'s `IntentRequest`) so `chaos-proxy.ts` can record it at the moment the fault fires — was considered and **rejected** after checking real data first: it would touch the wire protocol and hot dispatch path for every intent in the suite (proto, `client.ts`, `chaos-proxy.ts`, plus a new cucumber hook) to solve a problem that was already solved. Grepping a real completed `LOCATOR_RESOLUTION_FAILURE`-on-`CLICK` diagnosability dispatch's merged `metrics/raw/cucumber-jsonl` (2026-09-03) showed the injected-fault error string already lands, verbatim, in the exact `(feature, scenario, step)` that carried it — because the fault becomes that step's `errorMessage` via the completely ordinary path (`fault-injection.ts` → `chaos-proxy.ts`'s response → `client.ts` rejects → the step throws → cucumber records it). The "actual intervention identity" was already being recorded; it only needed to be *read* deliberately, not added.

**Mechanism.** `scripts/experiments/lib/campaign-a-identity.ts` defines two frozen tables, both keyed by `(feature, scenario, step)` — the exact fields `NormalizedScenario` already carries, verified against real dry-run output (`cucumber-js --dry-run --format json`) and a real fault-injected run, not invented:
- `CAMPAIGN_A_EXPECTED_ATTRIBUTION[arm][position]` — the pre-registered "requested intervention identity."
- `CAMPAIGN_A_ORACLE_CARRIERS[arm][o1..o4]` — the 4 oracles' carrier locations (§5).

`scripts/experiments/campaign-a-analysis.ts`'s `classifyAttribution()` reads the "actual intervention identity" by scanning the dispatch's own recorded steps for `src/kernel/fault-injection.ts`'s exported `FAULT_MESSAGES.LOCATOR_RESOLUTION_FAILURE` marker (imported, not re-typed, so the two can never drift), and classifies every dispatch into exactly one of:

| Status | Meaning | Counts toward N? |
|---|---|---|
| `valid` | Marker found exactly once, on the pre-registered carrier. | Yes — M1/MOL computed. |
| `wrong_semantic_target` | Marker found exactly once, but on a different `(feature,scenario,step)` than pre-registered. | No — scientific invalid, backfill (§13). |
| `fault_not_injected` | Marker not found anywhere in the dispatch. | No — invalid, backfill (§13). |
| `multiple_fires` | Marker found more than once. Should be structurally impossible under `max_fires=1`; a real occurrence means investigate before trusting anything else from that dispatch. | No — invalid, do not auto-backfill. |
| `tooling_error` | The pre-registered expected `(feature,scenario,step)` doesn't exist among the dispatch's OWN recorded scenarios at all. | **Neither.** Not an experimental outcome — a bug in this repo's own tables/wiring (stale table entry, wrong `evaluation_slice`, a require-glob miss). Must be fixed, never silently treated as a data point. |

This five-way (four-plus-a-bug-flag) split exists specifically so a tooling bug can never masquerade as a scientific result (adversarial review, 2026-09-02) — collapsing `tooling_error` into `wrong_semantic_target` would make a stale attribution-table entry indistinguishable from a genuine wrong-fault-target finding.

M1's `F(d)` is also restricted to the attribution-confirmed carrier scenario (§3) — the same principle applied to the other metric, closing the corresponding gap there too.

**Verification, in order, before this freeze:**
1. 18 synthetic-fixture unit tests (`scripts/experiments/campaign-a-analysis.test.ts`, run via `pnpm test:unit`) covering all five classification outcomes, the M1 hook-exclusion + unrelated-scenario exclusion, and MOL's SKIP vs FAIL distinction at every position, for both arms — written and green **before** any real Campaign A data existed, per the author's requirement.
2. 4 real fault-injected CI dispatches (`atomic-testing-experiment.yml`, batch `campaign-a-instrument-validation`, NOT part of the frozen N=10 — distinct run-index values `v-mid-atomic`/`v-mid-twin`/`v-late-atomic`/`v-late-twin` that never collide with `buildCampaignAItems()`'s `NNN` convention): one MIDDLE and one LATE dispatch per arm, chosen because they exercise the two structurally different fault/oracle step relationships (separate steps vs. fused step — §2). All 4 classified `valid` and reproduced §4's exact predictions (see §4's confirmation note). Run ids: `33713508254` (MIDDLE atomic), `33713736191` (MIDDLE twin), `33713932131` (LATE atomic), `33714096654` (LATE twin).

No wire protocol, hot dispatch path, or cucumber hook was modified to achieve this — `ptom.proto`, `client.ts`, `chaos-proxy.ts`, and `src/core/tests/support/hooks.ts` are unchanged.

## 11. MOL is the primary Campaign A endpoint; M1 is secondary/mechanistic (author's second-round requirement 4)

Matched Oracle Loss is the primary endpoint the campaign's conclusions are drawn from. Metric 1 (skipped-step containment) remains a secondary, mechanistic instrument — it explains *how* a fault propagates (via skipped steps), not *whether* a semantic behavior was lost. The two can and do diverge, and this is expected, not a defect: LATE fuses the fault's click into the same step as its own oracle (§2), so a LATE dispatch can correctly show M1 = 0 (nothing downstream to skip — confirmed empirically, §10.2: both real LATE dispatches measured M1 = 0) while MOL is still 0.25 (one oracle genuinely lost, via FAIL). Reporting M1 as primary would have made LATE look like a null result on the wrong instrument.

## 12. Pre-registered directional hypotheses (author's second-round requirement 5)

Frozen before data collection, direction only — no numerical target is pre-committed, and none should be inferred from the exact-prediction tables in §4 (those are mechanistic derivations from the frozen mapping, offered so a wrong *attribution* is visible as a miss; they are not the hypotheses being tested):

- **H1 (EARLY, MIDDLE):** the horizontal-e2e baseline exhibits **greater** MOL (and M1) than the atomic strategy. Mechanistically forced by the architecture (§4's table: 4/4 and 2/4 for the journey vs. 0/4 and ≤1/4 for atomic) — the hypothesis under test is that this holds up as a *measured*, not merely designed-in, property once real dispatches run.
- **H2 (convergence toward LATE):** the atomic/horizontal-e2e gap **narrows** at LATE relative to EARLY/MIDDLE, because the fused click+oracle step caps how much even the atomic strategy can contain (§2, §11) — both strategies lose the same one oracle in the LATE cell (§4: 1/4 vs. 1/4).
- **A null difference at LATE is a scientifically meaningful, pre-anticipated result, not a failure of the design.** It must not, by itself, trigger a metric change, a repositioning of LATE, or an N increase — any of those would be exactly the "do not increase N / do not change metrics based on observed results" rule (§1, §13) applied retroactively to a result the design already anticipated.

## 13. Frozen invalid-run policy (author's second-round requirement 6)

An invalid dispatch is one classified anything other than `valid` by §10, OR flagged by the existing infrastructure-failure heuristic (`run-campaign.ts`'s `likelyInfra`, unrelated to fault attribution — a job failing on a non-primary step). Enumerated invalid reasons (not exhaustive of every conceivable failure mode, but of every one anticipated):

| Reason | Detected by |
|---|---|
| Fault not injected | `classifyAttribution` → `fault_not_injected` |
| Wrong semantic target | `classifyAttribution` → `wrong_semantic_target` |
| Multiple fires | `classifyAttribution` → `multiple_fires` |
| Frozen SHA mismatch | campaign manifest's `resolvedSha` (schema 1.2.0) disagreeing with the `atomic-testing-experiment-v2` tag's recorded SHA |
| SUT build/version mismatch | the experiment-manifest provenance fields (resolved OmniPizza release tag, backend/frontend `git_commit` from `/api/version`) disagreeing with what was frozen at tag time |
| Infrastructure failure before test execution | `run-campaign.ts`'s existing `likelyInfra` heuristic (failing step ≠ `EXPERIMENT_PRIMARY_STEP_NAME`) |

**`tooling_error` (§10) is explicitly NOT in this table** — it is not an invalid experimental dispatch, it is a bug report about this repository's own attribution tables or wiring, and must be fixed and the affected dispatches re-analyzed, not backfilled as if they were data.

**Replacement policy:** an invalid dispatch is archived (never deleted), and MAY be replaced by re-dispatching the **same** experimental cell and the **same** `run_index` (so the campaign's provenance record stays a clean 1:1 map from planned cell to realized data point), with the exclusion reason recorded alongside the archived original.

**Never grounds for exclusion:** an observed unfavorable or null scientific result (e.g., unexpectedly low MOL, a smaller-than-predicted gap, H2's anticipated null at LATE). Only the reasons enumerated above justify treating a dispatch as invalid — a result the design didn't expect is data, not noise.

N, positions, and fault class remain exactly as frozen in §1 for the duration of data collection: no additional metric, position, fault class, or platform may be introduced into Campaign A once dispatching begins.
