# Execution-efficiency instrument — design

**Status: designed, both legs reach the N≥10 evidence bar and are now §9 results (web 2026-08-27,
Android 2026-08-28).** Requested 2026-08-25 after the user noticed atomic-web CI dispatches taking
much longer wall-clock than twin-web dispatches and correctly pushed back on the naive reading
("atomic should be faster since it hydrates via API, not UI — these aren't the results I'd expect").
Investigation confirmed the naive comparison was invalid, not the intuition — see "Rejected designs"
below. This document is the corrected, controlled design. See §9.5 of the paper for the final tables;
the sections below (illustrative pass, Android leg, the twin-android bug investigation, and the final
N-increase campaign's exclusions) are kept as the historical record of how those numbers were reached.

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

**Android illustrative pass (2026-08-26).** First-ever real dispatch of the twin's Android journey
end-to-end: `pnpm experiments:run-campaign -- --instrument efficiency --platform-leg android --repeats
1` (atomic GH run `33043202001`, success; twin GH run `33044995629`, `conclusion=failure` but
`likelyInfra=false` — 15/16 Outline rows passed cleanly, 1 failed at `And they add toppings "mushrooms"`
with `Error: Can't call click on element with selector
"android=new UiSelector().resourceId("btn-topping-mushrooms")" because element wasn't found` — a real,
newly-surfaced Android locator issue in the twin's implementation, not infra noise; logged as a follow-up,
out of this instrument's scope to fix. The extractor correctly dropped that 1 failed row and used the
remaining 15, per its designed non-PASS-row guard):

| Comparandum | Atomic step-time (N=1) | Twin step-time (N=15 mean) | Ratio |
|---|---|---|---|
| Reach "logged in" | 128ms | 12,626ms | twin ≈98.6× atomic |
| Reach "cart populated" | 296ms | 23,206ms | twin ≈78.4× atomic |
| *(negative control)* catalog-click → builder rendered | 3,282ms | 3,218ms | ≈parity, as expected |

Sanity-checked against the raw per-step `cucumber-jsonl` data for one twin row directly (not just the
aggregated mean) — individually plausible real durations (e.g. 38.6s for the card-details form fill,
18.7s to open the login screen), not an extraction artifact. The negative control landing at parity
again (~3.2s for a single tap in *both* arms) is the key control: it shows Android/Appium UI automation
is uniformly far slower than Playwright/web *regardless of arm* (own baseline ≈3.2s per interaction), so
the ~80-99× deltas on the two real comparanda aren't "Android is slow" noise — they're what happens when
a multi-step UI journey, each step already paying that same ~3s+ Appium overhead, is compared against a
single API call whose cost barely changes across platforms (128ms/296ms Android vs. 109ms/188ms web —
consistent with hitting the same backend either way). The atomic method's efficiency advantage is
*larger*, not smaller, on the platform where UI automation itself is more expensive — directionally
exactly what the corollary predicts, and a much starker illustration than web's ~3.4-3.5×. Still N=1 on
the atomic side (N=15 on twin) — same §8.5 caveat as web: not yet a §9 number.

`scripts/experiments/execution-efficiency-delta.ts` (`pnpm experiments:execution-efficiency-delta`) —
extracts both comparandum pairs plus the negative control from a given atomic/twin `cucumber-jsonl` run
pair (by GH run ID or local manifest lookup), and appends to a running samples file so repeats
accumulate toward a defensible N. Reused directly against the N=1 pair above to produce the table.

## Android leg (added 2026-08-26)

Extended to a second platform on request. Same comparandum pairs, same step *text* (confirmed — the
atomic scenarios queried carry the `@android` tag with zero platform-conditional Gherkin, and the twin's
single feature file has zero `PLATFORM`/`DRIVER`-conditional code per §8.3's own structural finding) —
only the cucumber-jsonl file-name pattern and `tool_name` differ (`appium-android-{reads,writes}` /
`non-atomic-twin-android`, confirmed against `ahm-execution-helix.yml`'s `TOM_RUN_ID` construction
directly, not assumed from the web pattern). `execution-efficiency-delta.ts`,
`scripts/experiments/lib/campaign-matrix.ts`, and `run-campaign.ts`/`aggregate-campaign-artifacts.ts`'s
CLIs now take a `--platform-leg web|android` — **required, no default**, on all three tools (an earlier
draft had mismatched defaults between scripts, caught and fixed by adversarial review before any real
dispatch). A new `efficiency` campaign-matrix instrument (`buildExecutionEfficiencyItems`) reuses the
orchestrator's dispatch/poll/classify machinery unchanged, deliberately kept out of the formal
128-dispatch `'all'` campaign.

**iOS was deliberately NOT extended to.** The non-atomic twin has zero iOS implementation anywhere — no
`eval-twin-ios` CI job, no iOS-specific code under `evaluation/non-atomic-twin/` — consistent with §8.3's
already-documented, deliberate exclusion of iOS from every other repeated-run instrument (macOS runner
concurrency). Extending this instrument to iOS would mean building the twin's entire iOS port first — a
scope decision on par with the original Android port, not a script change — so it stays out of scope
here, matching the rest of the paper rather than introducing a one-off exception for this instrument.

**Known, disclosed confound specific to the Android login comparandum:** the twin's mobile
(`appium`/`mobilewright`) login path makes a real extra backend API call (`loginDao.login()`) inside the
timed `loginMs` step, on top of the UI action itself — the twin's web path does a local-storage
read-back instead, no network round trip. This is pre-existing code (`checkout-nonatomic.route.ts`,
predates this instrument by a month, already flagged in its own comments as "unverified" as of
2026-07-23), not something introduced here — but it means `login::android`'s twin-side duration is not a
pure UI-vs-API comparison the way `login::web`'s is, and should be read with that caveat.

Adversarially reviewed (2 independent reviewers) before any Android dispatch was fired, specifically to
catch bugs before paying real CI/emulator-boot cost rather than after. Caught one real BLOCKING bug
(both reviewers independently): the CLI type-widening to add `'efficiency'` broke
`aggregate-campaign-artifacts.ts`'s compile for **every** instrument, not just efficiency —
`buildCampaignItems()`'s parameter type didn't accept `'efficiency'`, and since `ts-node` type-checks a
whole file before running any of it, `--instrument determinism`/`parallel-safety`/`all` were equally
broken. Never caught by this session's own `tsc -p tsconfig.json` checks because `tsconfig.json`'s
`include: ["src/**/*"]` excludes `scripts/**` entirely — a project-wide check that silently checks
nothing under `scripts/`. Fixed by wiring `buildExecutionEfficiencyItems` into the aggregator and
verifying with real `ts-node` execution (`--help`/`--dry-run`) going forward, not the project-wide `tsc`,
for anything under `scripts/experiments/`.

## Twin-android "add toppings" failure — investigated (2026-08-27)

The 1/16 dropped Outline row (see above) was investigated rather than left as an unexplained flag.
Findings, in order of how they narrow the hypothesis:

1. **Not a code bug specific to the twin.** `pizzaBuilder-nonatomic.route.ts` doesn't reimplement "add
   toppings" — it imports and calls the *same* `addToppings()` from
   `src/core/tests/pizzaBuilder/molecules/pizzaBuilder-toppings.molecule.ts` that the atomic suite uses.
   And the atomic suite's own identical operation — `Selecting toppings updates the estimated total for
   Pepperoni in US` (`@android`-tagged, mushrooms, same market/item) — ran as part of the *same*
   `atomic-android` dispatch (GH run `33043202001`) and passed. Same code, same topping, same CI window,
   different outcome — rules out a deterministic per-scenario defect in either arm's own code.
2. **A real asymmetry in the shared molecule, though not proven causal.**
   `addToppings()` issues `sendIntent(INTENT.CLICK, ...)` directly, with no preceding
   `WAIT_FOR_ELEMENT` — its sibling `assertTotalReflectsToppings()` in the same file *does* wait
   (`WAIT_FOR_ELEMENT` with a 5000ms budget) before reading. A click with no readiness guard is exactly
   the shape of bug that only manifests as a race under load, which fits a 1-in-16 (and 0-in-1 on the
   atomic side) failure rate far better than a deterministic defect would.
3. **The failure is plausibly a known-shape Android/Appium timing flake, not a new phenomenon.**
   `src/plugins/appium/actions/Click.ts`'s own comments document a *prior*, already-diagnosed incident
   with the identical error wording ("...because element wasn't found") — a different root cause (an
   iOS-only keyboard-dismiss tap closing a modal), but the same symptom class: an element resolved lazily
   by `driver.$(target)` no longer present by the time `.click()` actually queries for it. This
   codebase's own history already flags Appium action handlers as "may be insufficient for Android
   flakiness" as a standing, general risk — this is not a new category of problem.
4. **A concrete, checkable suppression-layer gap — confirmed, not just suspected.** Traced the full
   error-propagation chain (`Click.ts`'s bare `await element.click()`, no try/catch → `suppressChaos`'s
   catch block → `client.ts`'s `reject(new Error(response.errorMessage))`, no reformatting anywhere) and
   confirmed the observed message IS what `isTransientJitter()` tested. Grepped
   `node_modules/webdriverio/build/node.js` directly and confirmed "Can't call ${cmd} on element with
   selector "X" because element wasn't found" is WebdriverIO's own fixed internal message for this exact
   scenario. Ran it through both Python's `re` and Node's real `RegExp` engine against the pre-fix regex:
   **did not match** — `suppressChaos` gave this click zero retries.

**Conclusion: a real, environment/timing-driven Android UI race, exposed by a genuine readiness-check gap
in a shared molecule, and confirmed missed by chaos-proxy's transient-jitter regex.** Two complementary
fixes were attempted 2026-08-27 (commit `6a49706`), not chained: (1) `addToppings()` adding
`WAIT_FOR_ELEMENT` before `CLICK`, matching its sibling `assertTotalReflectsToppings()`; (2)
`TRANSIENT_SIGNATURE_REGEX` widened as reactive defense-in-depth, anchored to
`because (element|sibling|it) wasn't found`, NOT the bare substring `wasn't found`, after adversarial
review caught that a bare-substring match is tested against *every* action `suppressChaos` sees
(including `ASSERT_TEXT`, which embeds real app UI copy, and the MobSF/schema-fuzz/TLS-check/ZAP actions,
which embed raw external tool output) — a coincidental "wasn't found" in either could have silently
reclassified a genuinely deterministic failure as transient.

**(1) was itself a regression, caught by a follow-up smoke dispatch and reverted (commit `df0c637`).**
The user explicitly asked for one more real Android dispatch specifically to check the fix before trusting
it for a larger N-increase campaign — exactly the reasoning in "Why N matters" above, now validated by a
concrete near-miss. Result: `WAIT_FOR_ELEMENT` before `CLICK` turned the original ~1-in-16 probabilistic
race into a **100%-reproducible failure** — 6/6 atomic topping-scenarios (every market) and effectively
all twin Outline rows, every failure now "element still not displayed after 5000ms" instead of the
original error. Root cause: `WaitForElementAction`
(`src/plugins/appium/actions/WaitForElement.ts`) only does a passive `driver.$(selector)
.waitForDisplayed({timeout})` poll — no scrolling. `Click.ts`'s own flow calls
`helpers.scrollIntoViewSafe()` before clicking. The topping buttons are below the fold on the Android
builder screen; only `CLICK`'s internal scroll brings them into view — waiting for "displayed" before
anything scrolls just times out, every time. (1) was reverted back to a bare `CLICK`. **(2) was kept** —
an independent, passive retry classifier with no scroll-ordering dependency, not implicated in the
regression. Current state: mitigated (the rare race can now self-heal via retry if it recurs, untested
against an actual recurrence) but not proactively fixed — a real fix needs platform-aware scroll-then-wait
logic inside `CLICK`/`scrollIntoViewSafe` itself, left as an explicit follow-up. Full write-up: commits
`6a49706` (root cause + first attempt) and `df0c637` (regression + revert).

## Android N-increase campaign — final exclusions (2026-08-28)

Two Android repeats beyond the already-documented repeat 2 (regression, see the section above) were
excluded from the final N=10 during the push from N=2 to N≥10. Both were investigated via real GH job
logs before being excluded, per this paper's standing "verify empirically, don't assume benign" practice
— neither is silently dropped:

- **Repeat 7 (2026-08-28, atomic GH run `33186973238`).** 2/89 scenarios failed: "Opening a pizza card
  launches the builder in US" (a catalog-open click, unrelated to the `addToppings()` mechanism behind
  repeat 2's regression) and a toppings-total assertion whose own preceding click had already succeeded.
  Explicitly compared against repeat 2's known regression signature (near-100% failure rate, every
  failure specifically on an "add toppings" click, error text "still not displayed after 5000ms") —
  matches neither the count nor the specific step/error text. Confirmed as isolated, general Android/
  Appium flakiness (a documented standing risk in this codebase, unrelated to this instrument), not a
  reintroduction of the reverted `WAIT_FOR_ELEMENT` regression. The atomic side's queried "logged in"/
  "cart populated" comparandum scenarios were unaffected, but the extractor's PASS-only guard is
  scenario-specific, and this run's overall `conclusion=failure` made it simplest to exclude the whole
  pair rather than special-case a partially-failed run.
- **Repeat 10 (2026-08-28, twin GH run `33213511299`).** Failed before any scenario ran: `curl: (35) Recv
  failure: Connection reset by peer` while downloading the Android APK from the GitHub Releases asset, in
  the workflow's "Download Android app artifact" step — confirmed via `gh run view 33213511299
  --log-failed`. Pure CI network infrastructure, nothing to do with app or test logic; `run-campaign.ts`'s
  own `likelyInfra` heuristic correctly flagged it, and `aggregate-campaign-artifacts.ts` correctly
  excluded it (recorded `skipped-infra`) without needing manual override.

Three more repeats (011, 012, 013) were dispatched to make up for these two exclusions plus repeat 2's,
closing N=7 → N=10. All six new runs (three atomic, three twin) completed cleanly with no failures of any
kind — no further exclusions needed.

## Final N achieved (2026-08-28)

Both legs reached the design doc's own N≥10 bar:

- **Web**: N=11 atomic / N=176 twin, reached 2026-08-27 (`pnpm experiments:run-campaign -- --instrument
  efficiency --platform-leg web --repeats 10`, on top of the pre-existing `w1` pair).
- **Android**: N=10 atomic / N=159 twin, reached 2026-08-28, from 13 attempted repeats
  (`pnpm experiments:run-campaign -- --instrument efficiency --platform-leg android --repeats 13`) minus
  the three exclusions above (repeats 2, 7, 10).

Final per-comparandum tables (mean ± sd, range) are in §9.5 of the paper, not duplicated here to avoid a
second source of truth that could drift out of sync.

**Why N mattered here specifically, not just as a policy citation.** The Android dispatches supplied
concrete evidence, not just an abstract "N=1 isn't enough": the twin-android runs hit plausible timing
flakes on a small fraction of their own within-run repeats, and individual step durations varied
substantially across dispatches (e.g. the "logged in" comparandum's twin-side range spans
10,122-50,396ms across the 10 usable repeats). A single atomic-side data point has no internal check at
all — nothing to compare it against, no way to tell whether one draw was typical or unusually fast/slow.
The accumulated N turned the original point estimate into a defensible mean ± spread, diluted the flaky
rows already observed into a distribution instead of letting them silently perturb a single number,
and applied the same evidentiary standard this paper already imposes on its other three instruments
(determinism's N=30, parallel-safety's K=16) rather than a lighter one for this ancillary fifth
measurement.
