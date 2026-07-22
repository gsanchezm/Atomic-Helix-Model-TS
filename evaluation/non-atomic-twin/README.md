# Non-atomic twin — evaluation artifact

**This is not production test code.** It exists to support the empirical comparison in
[`docs/paper/atomic-testing-formal-definition.md`](../../docs/paper/atomic-testing-formal-definition.md)
§8 ("Evaluation Methodology"). Read that section before touching anything in here.

## Layout

One continuous scenario — a cucumber `Scenario Outline` is one World/session, so it cannot be split
across files — but organized into **three slices that pair 1:1 with their atomic counterparts**,
mirroring `src/core/tests/<domain>/` exactly:

```
evaluation/non-atomic-twin/
  catalog/       pairs with src/core/tests/catalog/       — reused CatalogRoute as-is, no new logic
  pizzaBuilder/  pairs with src/core/tests/pizzaBuilder/   — molecules composed directly (own organism)
  checkout/      pairs with src/core/tests/checkout/       — reused CheckoutRoute + the login steps +
                 the .feature file itself (the journey's terminus)
```

There is **no `login/` slice**. This mirrors the atomic suites' own existing precedent: in
`src/core/tests/`, `checkout.steps.ts` already registers the shared "logged in as" Background step,
and `catalog.steps.ts` / `pizzaBuilder.steps.ts` reuse it via cucumber's global step registry rather
than each declaring their own. The `checkout/` slice here does the same — login is precondition
plumbing for the journey's terminus, not a domain being independently mimicked.

## What this is

A single horizontal, cross-domain "user journey" scenario (login → catalog → pizzaBuilder →
checkout) built by **mechanically composing the existing atomic reference suites' own routes and
molecules** — not by hand-authoring a new narrative. Two deliberate, disclosed rule violations are
introduced relative to the atomic suites; everything else (the underlying TOM stack: proxy, plugins,
locator contracts, chaos-suppression policy) is held identical:

- **R3 (no UI-driven setup) violated on purpose.** Login and cart-building go through real UI
  actions (`LoginRoute.loginAs`'s UI branch, `CatalogRoute.openPizza`, the pizzaBuilder molecules)
  instead of the atomic suites' API `$S_0$` injection (`LoginDao.login`, `CheckoutDao.addToCart`).
- **R2 (disjoint state) violated on purpose.** Every concurrent journey instance targets the SAME
  `standard_user` account — never a fresh per-instance fixture — and the feature does **not** carry
  the `@writes-shared-state` tag, so concurrent instances are **not** serialized by
  `src/core/tests/support/write-lock.hooks.ts`, unlike the atomic checkout suite.
- **R1 (single behavior) is violated structurally** by the feature file itself: one scenario carries
  oracles from all three paired slices instead of living as separate atomic scenarios.
- **R4 (deterministic outcome)** is not directly transformed — it is the *predicted consequence* of
  the R2 violation (see §8.4's determinism instrument).

See `docs/paper/...` §8.3's ruleset table for the full, disclosed operation-by-operation mapping.

## What this is NOT

- Not a suggestion that this is how tests *should* be written. It is a controlled counterexample.
- Not free-hand-authored. Every route/molecule call here already exists in the atomic reference
  suites (`src/core/tests/login`, `src/core/tests/catalog`, `src/core/tests/pizzaBuilder`,
  `src/core/tests/checkout`) and is reused as-is or composed directly. The only new code is thin
  connective glue in each slice's `organisms/` file, documented inline with exactly what it does and
  why, including one disclosed plumbing exception (a token fetch that is **not** the login
  precondition itself — see the comment at `checkout/organisms/checkout-nonatomic.route.ts`'s
  `loginViaUi()`).
- Not something to "fix" if a run here surfaces a failure. A wider blast radius, a race under
  parallelism, or an occasional stale-state assertion failure here is the **expected, measured
  signal** (§8.4), not a bug in this harness. If you suspect a genuine bug in the reused
  routes/molecules themselves (as opposed to the deliberate violations), it will also reproduce in
  the atomic suites — verify there first.

## Why it lives here and not in `src/core/tests/`

`cucumber.js`'s default profile globs `src/core/tests/**/*.feature` — anything placed there runs on
a bare `pnpm test`. This directory is deliberately outside that tree so the default suite, CI gates,
and the dashboard ingest pipeline can never accidentally pick it up. It runs only via the dedicated
`nonAtomicTwin` cucumber profile (see `cucumber.js`), invoked with `pnpm test:eval:non-atomic-twin`.

## Running it

Requires the same live stack as the atomic suites (proxy + `playwright`/`api` plugins at minimum;
`mobilewright` for the §8.4 portability instrument) — see the root `README.md`'s Quickstart.

```bash
pnpm test:eval:non-atomic-twin                              # sequential (CUCUMBER_PARALLEL=1)
CUCUMBER_PARALLEL=4 pnpm test:eval:non-atomic-twin           # parallel-safety sweep point
```

Telemetry is stamped like any other run (`TOOL_NAME=non-atomic-twin` is set by the script) so the
existing `metrics/` pipeline ingests it without any pipeline change — no bespoke reporting was built
for this artifact.
