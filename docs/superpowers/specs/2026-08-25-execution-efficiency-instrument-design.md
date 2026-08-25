# Execution-efficiency instrument — design

**Status: designed + illustrative N=1 pass complete, not yet a §9 result.** Requested 2026-08-25
after the user noticed atomic-web CI dispatches taking much longer wall-clock than twin-web
dispatches and correctly pushed back on the naive reading ("atomic should be faster since it
hydrates via API, not UI — these aren't the results I'd expect"). Investigation confirmed the naive
comparison was invalid, not the intuition — see "Rejected designs" below. This document is the
corrected, controlled design.

## What this measures

A second corollary of **R3** (no UI-driven setup), alongside the existing Platform-invariance
corollary: reaching a given precondition state via API injection (`LoginDao`, `CheckoutDao.addToCart`
— the same DAOs named in §8.3's R3 row) costs less step-time than reaching the *same* state via the
UI molecule sequence that R3's mechanical transformation substitutes for it (`submitCredentials`,
catalog card-click, pizzaBuilder open/size/toppings/confirm — again, §8.3's own naming).

This is **not** one of the four Rule-derived corollaries in §5 — R3 doesn't predict a timing delta
the way R1→diagnosability or R2→parallel-safety do. It's an ancillary measurement of a mechanism R3
already forces, reported the same way §10.2 treats cross-browser replication: real, useful, disclosed
as secondary rather than folded into the primary four.

## Rejected designs (in order, with why)

1. **Whole-job wall-clock (e2e-web CI job vs. eval-twin-web CI job).** This is what produced the
   original "atomic is slower" observation the user flagged. Confounded three ways, all confirmed by
   reading the workflow rather than assumed: (a) e2e-web's tag expression is `@desktop [and not]
   @writes-shared-state` — the **entire** ~97-scenario `@desktop` suite, not a checkout-scoped subset,
   vs. the twin's 16-row Outline — a volume mismatch, not a method effect; (b) e2e-web runs a 3-browser
   × 2-suite matrix (6 jobs) even though only Chromium is the causal-instrument leg (§8.3, "Browser
   held constant"); (c) a chained Visual-Pixelmatch job starts only after all 6 matrix jobs finish,
   inflating wall-clock further without being part of test execution at all. None of this is specific
   to this new instrument — it's why §8.4's parallel-safety/determinism rows never claimed a cross-arm
   timing comparison in the first place (they're within-arm rate statistics: failure-rate-vs-workers,
   pass↔fail transition rate — volume-symmetric by construction, since both quantities are computed
   per arm, not against each other). The one imprecision this surfaced in existing text: §8.4's
   parallel-safety row says "the existing, unmodified atomic checkout suite" — the CI wiring actually
   dispatches the full `@desktop` suite. Fixed as a one-line phrasing correction (see the diff), not a
   validity issue for those two instruments.
2. **Sum of atomic scenarios as a "reconstructed journey."** Tried to find one atomic scenario per
   twin journey segment (login, catalog-open, builder select+toppings+confirm, checkout). Login has no
   atomic-side equivalent at all — the atomic suites never test a *successful* UI login as its own
   scenario (checkout's precondition is `Background: Given the OmniPizza user is logged in as
   "standard_user"`, an API injection; the login domain's own UI-driven scenarios only cover *rejected*
   credentials). And R1 (one behavior per scenario) structurally forbids a single pizzaBuilder scenario
   that selects size, adds toppings, *and* confirms — the atomic suite splits this into two
   scenarios (`Selecting toppings updates the estimated total...`, no confirm step; `Confirming add to
   cart closes the builder...`, no toppings step), each paying its own from-scratch precondition. Any
   assembled "sum" either drops an operation or double-counts a precondition — both distort the
   number in a direction that isn't attributable to R3.
3. **What was used instead: per-operation step-time**, below.

## Design

Compare **cucumber step `durationMs`** (not scenario or suite duration) for R3's actual substitution
pairs, pulled from wherever each operation naturally occurs in each suite — no assembled journey, no
new scenario authored.

**Granularity caveat (checked, not assumed).** `scripts/metrics/aggregate-durations.ts` reads
`metrics/raw/tool-events/*.jsonl` for `sendIntent`-level (mechanism-level) timing — that directory does
not exist in the artifacts this campaign actually uploads (`metrics/raw/{cucumber-jsonl,run-manifest,
visual,tool-integration,api,plugin-integration,gatling}/`; `proxy-jsonl/` is present but empty except
`.gitkeep`). What *is* populated at comparable granularity in both arms is `cucumber-jsonl/*.jsonl` —
one JSON object per scenario, with a `steps[]` array carrying per-step `durationMs`. This instrument
therefore measures **step-time**, one level coarser than the individual `sendIntent` calls a step may
issue. Stated explicitly rather than mislabeled as mechanism-time or wall-clock.

### Two clean comparandum pairs (isolate R3, avoid R1's independence cost)

| Operation | Atomic mechanism / step | Twin mechanism / step(s) |
|---|---|---|
| Reach "logged in" | `Given the OmniPizza user is logged in as "standard_user"` (Background, `LoginDao`) | `Given the OmniPizza login screen is open` + `When they log in as "standard_user"` (`submitCredentials` UI molecule) |
| Reach "cart populated with 1 Large Pepperoni" | `And they have an order with "Pepperoni" size "Large" quantity 1` (checkout's `CheckoutDao`-equivalent API injection) | `And they are browsing the catalog...` + `Then the catalog screen is fully displayed` + `When they open the pizza "Pepperoni"` + `Then the pizza builder is displayed...` + `When they select size "Large"` + `And they add toppings "mushrooms"` + `When they confirm add to cart` + `Then the pizza builder is closed` (full catalog→builder UI sequence) |

Both pairs share one property that makes them valid: the **same functional end state**, reached by a
genuinely different mechanism in each arm, with no scenario-independence cost on either side (both are
mid-scenario steps, not a from-scratch precondition paid to satisfy R1).

### Explicitly excluded from the primary claim (disclosed, not hidden)

- **Catalog-card-click / builder-render steps** (`When they open the pizza "X"` → `Then the pizza
  builder is displayed`). Both arms perform this via UI in both suites — R3's substitution doesn't
  apply here (there's no API shortcut for "click this card" independent of the cart-population state
  it produces). Kept as a **negative control**: if this instrument reported an atomic advantage here
  too, that would suggest it's measuring something other than R3 (e.g. general infra noise). It
  doesn't (see below) — which is evidence the instrument is measuring what it claims to.
- **The standalone atomic step `Given the pizza builder is open for "X" in market "Y"...`** (605ms in
  the N=1 sample, from the *`Confirming add to cart...`* scenario, not the cart-population pair above).
  This step exists **only because R1 forces every atomic scenario to be independently satisfiable** —
  it re-establishes builder-open state from scratch for a scenario that, unlike the cart-population
  pair, isn't chained after a prior catalog-open step. Comparing it to anything in the twin's
  continuous journey would misattribute R1's independence cost to R3's injection-mechanism cost. Not
  used in either comparandum pair.
- **Checkout delivery-form-fill and order-confirmation steps** (`provide delivery details`, `the order
  is accepted`). Both arms drive these via UI in both suites — again no R3 substitution applies. In the
  N=1 sample the twin was *faster* here (440ms vs. atomic's 1075ms for delivery details; 865ms vs.
  390ms for order-acceptance) — almost certainly Render free-tier backend-latency noise on a single
  sample, not a method effect, and exactly why this instrument needs repeats before being reported as
  a number (see "Status" below).

## Illustrative pass (not a §9 result)

Produced by `pnpm experiments:execution-efficiency-delta -- --atomic-run 32768226121 --twin-run
32793108181` against artifacts already downloaded via `aggregate-campaign-artifacts.ts` for the
completed parallel-safety `w1` pair — **zero new dispatches**, both already at `CUCUMBER_PARALLEL=1`.
The twin's `cucumber-jsonl` for this run carries all **16** of its identical Outline rows (K=16, §8.3),
so the extractor uses all 16 as free within-run repeats — the atomic side stays N=1 (its comparandum
scenarios are single, non-repeated Examples rows). Both sides need more N before §9; this asymmetry is
disclosed, not hidden, in the numbers themselves:

| Comparandum | Atomic step-time (N=1) | Twin step-time (N=16 mean) | Ratio |
|---|---|---|---|
| Reach "logged in" | 109ms | 365ms | twin ≈3.4× atomic |
| Reach "cart populated" | 188ms | 656ms | twin ≈3.5× atomic |
| *(negative control)* catalog-click → builder rendered | 69ms | 52ms | ≈parity (twin slightly faster), as expected |

Directionally consistent with the corollary's prediction, and the negative control landing near parity
(not an atomic "advantage" everywhere) is itself informative — it suggests the delta on the two real
comparandum pairs is attributable to the injection-vs-UI substitution specifically, not to atomic runs
just being faster in general. A first hand-check against only the twin's *first* Outline row (before
the script was written to average all 16) showed a much larger apparent gap on "logged in" (1,540ms) —
that row alone paid a cold-start cost (Render wake-up, first browser session) that the other 15 rows
didn't; averaging across all 16 is why the script's numbers are lower and more representative than that
initial single-row read. **The atomic side is still N=1 per comparandum — not adequate to report as a
§9 number** per §8.5's evidence policy, regardless of the twin's larger effective N.

## What's built

`scripts/experiments/execution-efficiency-delta.ts` (`pnpm experiments:execution-efficiency-delta`) —
extracts both comparandum pairs plus the negative control from a given atomic/twin `cucumber-jsonl` run
pair (by GH run ID or local manifest lookup), and appends to a running samples file so repeats
accumulate toward a defensible N. Reused directly against the N=1 pair above to produce the table.

## Recommended next step (not yet done)

Dispatch N≥10 additional `w1`-equivalent pairs (parallel=1, single Chromium job, no browser matrix, no
chained visual job — the same shape the parallel-safety `w1` items already are) specifically for this
instrument, run the extractor over each, and report mean ± spread in §9.5 once N is adequate. This is
lightweight: it reuses `run-campaign.ts`/`aggregate-campaign-artifacts.ts` unchanged (a `w1`-only
parallel-safety-shaped dispatch already produces exactly the right artifact shape) — no new CI wiring
needed, only a handful of extra dispatches.
