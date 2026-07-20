# Scenario Outline grouping in the dashboard

**Date:** 2026-07-20
**Status:** Approved (brainstorming → spec)
**Author:** gsanchezm with Claude (Sonnet 5)
**Supersedes:** the "Scenario Outline grouping | Flat" decision in
[`2026-05-27-feature-steps-iteration-failure-design.md`](2026-05-27-feature-steps-iteration-failure-design.md)
(line 74). That spec deliberately kept Scenario Outline rows flat, reasoning
that "the expanded Example values already live in the scenario name
post-substitution." This spec revisits that call: living in the name isn't
the same as being structured data, and flat rows overstate how many distinct
things were tested.

---

## Problem

A `Scenario Outline:` with an `Examples:` table is one behavioral scenario
exercised with multiple data sets — not multiple scenarios. Today the
dashboard reports it as the latter. For example,
`src/core/tests/login/features/market-language-localization.feature:9-23`:

```gherkin
Scenario Outline: Logout label is translated to <language> after market <market>
  ...
  Examples:
    | market | language | logoutLabel |
    | US     | English  | Logout      |
    | MX     | Spanish  | Salir       |
    | CH     | German   | Abmelden    |
    | CH     | French   | Déconnexion |
    | JP     | Japanese | ログアウト    |
    | SA     | Arabic   | تسجيل الخروج |
```

cucumber-js's JSON formatter expands this into 6 independent `scenario`
elements with `<placeholder>` substitution already baked into the name and
step text (`"Logout label is translated to Spanish after market MX"`, etc.).
`ingestCucumber()` in `apps/dashboard/scripts/ingest-run.ts` (loop at lines
172-241) treats every one of those as a standalone `TestCase` — the dashboard
shows "6 tests" where a reader would reasonably expect "1 scenario, 6 data
sets." This inflates every KPI that counts `TestCase[]` length (`Tests
Run`/`Tests Executed`/per-tab "N tests" badges) and buries the actual
input/output data for each iteration inside a pre-substituted name string
instead of showing it as structured fields.

This is not a corner case: **22 Scenario Outlines / 125 Examples rows across
8 `.feature` files**, spanning desktop, responsive, android, ios, and api
suites (not just Playwright; not used by security suites at all).

## Goals

1. A Scenario Outline counts as **one** scenario everywhere the dashboard
   counts scenarios (KPIs, tab badges, `TestList` rows) — regardless of how
   many Examples rows it has.
2. Each Examples row's input data (and any output columns, e.g.
   `logoutLabel`) is shown as **structured data** per iteration, not
   recovered by reading a pre-substituted sentence.
3. If any iteration fails, the scenario is reported as failed, and the
   dashboard makes it obvious *which* iteration(s) failed and with what
   data.
4. The existing per-step accordion/failure machinery
   (`docs/superpowers/specs/2026-05-27-...md`) keeps working per iteration —
   this spec changes what an iteration belongs to, not how a single
   iteration's steps are shown.

## Non-goals

- **No new `Status` value.** A group's rolled-up status stays
  `passed | failed | skipped` — failed if any iteration failed. A mixed
  4-passed/2-failed group reports as `failed`, full stop. (Decided
  explicitly: showing a fractional "4/6 passed" badge instead of a binary
  status was considered and rejected.)
- **No migration of historical runs.** Runs already ingested under the old
  flat shape keep rendering exactly as they do today — no `kind` field, no
  backfill script. Grouping only applies going forward, the next time each
  suite is ingested. (Decided explicitly — the alternative of retroactively
  reprocessing `reports/<runId>/*.json` was rejected as more work and fragile
  against `.feature` files that have since changed.)
- **No change to the cucumber-js report format.** `--format json:...` stays
  exactly as-is in every `test:json:*` script. The dashboard's ingest script
  reads an additional source (the `.feature` file itself) rather than asking
  cucumber-js to emit a different report shape.
- **No `Rule:` block support.** Gherkin's `Rule:` keyword can nest scenarios
  one level deeper (`feature.children[].rule.children[].scenario`). Zero of
  this repo's 56 `.feature` files use `Rule:` today (verified by grep). If
  one is introduced later, outlines inside it won't be detected by this
  design's parser walk — flagged as a known gap, not solved here.
- **Does not touch the orphaned `security-web.json`/`security-infra.json`
  ingestion gap.** Research surfaced that these two report files are
  currently never read by `ingest-run.ts` at all. Zero of the 22 Scenario
  Outlines are security-tagged, so it's orthogonal to this change — noted
  for awareness, not fixed here.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Scope | Rework reporting for the Scenario Outline + Examples mechanism that already runs today — not a new data-driven-testing mechanism. |
| Mixed-result status | **Binary** — group is `failed` if any iteration failed. No new `partial`/fractional status. |
| KPI counting | Groups count as **1** everywhere `TestCase[]` length is used for totals (Tests Run/Tests Executed/tab badges). |
| Historical runs | **Forward-only.** No migration script; old runs keep their current flat shape. |
| Row↔source correlation mechanism | **`line`-based**, not position-based. Position-based was proposed first and rejected after verification showed CI already runs `playwright-desktop`/`playwright-responsive` with `CUCUMBER_PARALLEL=4`, which reorders JSON element emission relative to `.feature` declaration order. cucumber-js already stamps each element with the Examples row's exact source `line`, which is immune to parallel-worker reordering. |
| `.feature` source parser | **Add `@cucumber/gherkin` as an explicit dependency** of `apps/dashboard` (today it's transitive-only via `@cucumber/cucumber` and doesn't resolve from `apps/dashboard/scripts`). Rejected extending the repo's existing hand-rolled parser (`scripts/metrics/lib/feature-parse.ts`) despite the zero-new-dependency appeal: that parser was built to *count* rows (low stakes), and this feature's entire correctness rests on *line numbers* matching what cucumber-js's real parser computed — a hand-rolled reimplementation risks silent divergence on harder Gherkin (the `Scenarios:` alias, tags between an outline and its Examples, docstrings containing pipes) that wouldn't fail loudly, it would just attribute the wrong data to the wrong result. |
| Data model shape | Discriminated union `TestCase = TestCaseSingle \| TestCaseGroup` (see below) rather than an optional field on one `TestCase` shape — so the compiler forces every consumer to explicitly handle the grouped case instead of silently rendering it wrong. |

---

## Data model changes

File: `apps/dashboard/src/shared/types.ts` (current `TestCase` at lines
25-36).

```ts
export type TestCase = TestCaseSingle | TestCaseGroup;

interface TestCaseBase {
  suite: string;
  file: string;
  dur: string;          // group: sum of its iterations' durations
  status: Status;        // group: worst-of its iterations (failed > skipped > passed)
}

export interface TestCaseSingle extends TestCaseBase {
  kind?: 'single';       // optional — see back-compat note below
  name: string;
  error?: string;
  steps?: TestStep[];
  failedStepIndex?: number;
  screenshot?: string;
}

export interface TestCaseGroup extends TestCaseBase {
  kind: 'group';          // required — only ever set by the new ingest path
  name: string;            // the outline's template name, placeholders intact:
                            // "Logout label is translated to <language> after market <market>"
  iterations: TestCaseIteration[];   // ordered by source line, not execution order
}

export interface TestCaseIteration {
  name: string;                     // interpolated name, kept for deep-link identity/display
  example: Record<string, string>;  // { market: 'MX', language: 'Spanish', logoutLabel: 'Salir' }
  status: Status;
  error?: string;
  steps?: TestStep[];
  failedStepIndex?: number;
  screenshot?: string;
}
```

`TestStep` is unchanged.

**Back-compat, no migration needed:** `TestCaseSingle.kind` is optional on
purpose. Runs ingested before this change are already-committed JSON on disk
with no `kind` property at all. At runtime (types are compile-time only —
the frontend gets parsed JSON over HTTP, not a type-checked object), any
record where `kind !== 'group'` is treated as a single case, which is
exactly what old records already are. No special-casing, no backfill.

**Status/duration rollup:** reuse the existing "worst status" reducer already
used in `ingest-run.ts` for step→scenario rollup, applied one level up for
iteration→group. No new precedence rule to invent or maintain in two places.

---

## Ingest changes

### `apps/dashboard/scripts/ingest-run.ts`

1. **Read two more fields cucumber-js already emits but the ingest script
   currently discards.** `CucumberElement` (lines 87-91) gains:

   ```ts
   interface CucumberElement {
     name?: string;
     type?: string;
     steps?: CucumberStep[];
     keyword?: string;   // NEW — literal "Scenario Outline" for outline-derived rows
     line?: number;       // NEW — the source line of *this Examples row*, not the outline's own line
   }
   ```

2. **Parse the `.feature` source once per feature file**, using
   `@cucumber/gherkin`'s `generateMessages()`:

   ```ts
   import { generateMessages } from '@cucumber/gherkin';

   interface OutlineRow {
     outlineKey: string;               // `${feature.uri}#${outlineDeclarationLine}` — stable per outline
     templateName: string;
     example: Record<string, string>;
   }

   function parseOutlineRows(featurePath: string): Map<number, OutlineRow> {
     // returns: source line of the Examples row -> its OutlineRow
   }
   ```

   Walk `doc.feature.children[].scenario`, skip anything where
   `examples.length === 0` (that's the signal cucumber-js's own compiler
   uses to distinguish an Outline from a plain Scenario — not the `keyword`
   text, which can also read `"Scenario"` with a trailing `Examples:` block
   and still compile as an outline). For each `examples[]` block, zip
   `tableHeader.cells` against each `tableBody` row's `cells` into
   `example: Record<string,string>`, keyed by that row's own
   `location.line`. `outlineKey` uses the **outline's own** declaration
   line (not the outline's name) so two differently-worded outlines never
   collide and two outlines that happen to share a name don't merge.

   A `.feature` file that fails to parse (or a `parseError` envelope)
   degrades to: log a warning, treat every element from that `uri` as
   `TestCaseSingle` as today. Ingest never crashes on a malformed feature
   file.

3. **In the per-element loop** (currently lines 172-241, `for (const el of
   feature.elements ?? [])`):

   - If `el.line` is a key in that feature's `OutlineRow` map → this row
     belongs to an outline. Append a `TestCaseIteration` (built from the
     existing per-scenario logic — `error`, `steps`, `failedStepIndex`,
     screenshot — unchanged, just attached to the iteration instead of a
     flat `TestCase`) to the accumulator keyed by `outlineKey`, tagging it
     with `example` from the row.
   - If `el.line` is **not** found (`.feature` changed since the report was
     generated, or any other divergence) → **fallback, not a crash**: ingest
     as `TestCaseSingle` exactly as today, plus a `console.warn` naming the
     feature/line so the mismatch is visible in CI logs rather than silently
     wrong.
   - Otherwise (no `examples` at that line at all — a plain `Scenario`) →
     `TestCaseSingle`, unchanged from today's behavior.

4. **Finalize each group** after its feature's elements are processed:
   sort `iterations` by the source line of their Examples row (not by
   arrival order — arrival order can be parallel-worker-shuffled; source
   order is always deterministic), compute the group's rolled-up `status`
   and summed `dur`, push one `TestCaseGroup` into `tests[]`.

5. **Counting is automatically correct with zero logic change.** The
   existing `passed/failed/skipped` computation (`tests.filter((t) => t.status
   === X).length`, current lines 244-246) already just counts array entries
   by status — the fix is entirely in what the array *contains* (1 entry per
   group instead of N per iteration), not in how it's counted.

6. **Screenshots move one level down.** `materializeScreenshots` (lines
   263-295) and the `screenshotData` WeakMap (line 105) currently key/walk a
   flat `TestCase[]`. They need to also descend into `group.iterations[]`
   (screenshots are captured per Examples-row today, i.e. per-iteration
   after this change) at all three call sites (lines 764, 787, 799).

### `apps/dashboard/package.json`

Add `"@cucumber/gherkin": "38.0.0"` (matching the version already resolved
transitively via `@cucumber/cucumber@12.9.0`) as an explicit dependency, then
`pnpm install`. Confirmed this version has zero peer-dependency surprises —
`@cucumber/gherkin` only re-exports types from `@cucumber/messages`, which
does not need to be added separately for this use case (pass
`newId: () => ''` and skip real ID generation; only `name`/`examples`/
`location` are used).

---

## UI changes

### `apps/dashboard/src/client/components/TestList.tsx`

- **Render branch**: `t.kind === 'group'` renders a group row — name shown
  as the outline template (placeholders visible, e.g. `Logout label is
  translated to <language> after market <market>`), an "N iterations" badge,
  the rolled-up status dot, and the summed duration. Expanding it renders one
  sub-row per iteration, each showing its `example` data as a compact
  `market: MX · language: Spanish · logoutLabel: Salir` chip line plus its
  own status/duration — each of *those* expands into the existing
  `StepList`/error/screenshot accordion, unchanged from the 2026-05-27
  design.
- **`keyOf` (line 16)** extends to a third level for iteration sub-rows:
  group row keeps `${t.file}:${t.name}:${i}`; iteration rows add the
  iteration index, `${t.file}:${t.name}:${i}:${iterIdx}`.
- **Deep-link matching (`expandScenarioName`, line 32)** searches both
  levels: a top-level `TestCaseSingle.name` match (unchanged), or — for a
  `TestCaseGroup` — any `iterations[].name` match. A match inside a group
  auto-expands *both* the group row and that specific iteration, not just
  the group.
- **Status filter** ("Passed"/"Failed"/"Skipped" in `FilterBar`) filters on
  the group's rolled-up `status`, consistent with the binary-status decision
  above. A group with 1 failing iteration out of 6 won't appear under
  "Passed" even though 5 iterations did — an accepted consequence of
  "failed if any iteration failed," not a new inconsistency introduced by
  this change.

### `apps/dashboard/src/client/components/TabbedTestDetail.tsx`

- FilterBar counts (lines 87-95) and the "Total" KPI tile (158-161): no
  logic change — they already just count array entries by status, and the
  array now correctly contains 1 entry per group.
- `GroupedTabbedDetail`'s deep-link resolver (~line 285,
  `g.tabs.find((t) => t.block.tests.some((tc) => tc.name ===
  expandScenarioName))`) needs the same nested-search update as `TestList`.

### `apps/dashboard/src/client/views/detail/GenericDetail.tsx`

Same as `TabbedTestDetail`: counts (lines 34-42) need no logic change; no
deep-link resolver exists here beyond passing `expandScenarioName` straight
to `TestList`, which already handles the nested search per above.

### `apps/dashboard/src/client/views/detail/VisualDetail.tsx` and `apps/dashboard/scripts/ingest-pixelmatch.ts`

No change needed at either the deep-link URL construction
(`VisualDetail.tsx:218`, `?expand=${triggeredBy.scenario}`) or the
`triggeredBy.scenario` sourcing (`ingest-pixelmatch.ts:233-234`) — both
already key off the *interpolated* per-iteration name, which remains unique
and unchanged after grouping. Only the matcher that consumes
`expandScenarioName` needs to look one level deeper, per above.

### `apps/dashboard/README.md`

Update the `web_ui`/`api` shape documentation (line 138), the
`steps`/`failedStepIndex` semantics note (line 143) to mention grouped
iterations, the `?expand=` deep-link contract (line 147) to mention it can
target an iteration inside a group, and the cucumber-JSON-ingest description
(line 210) to mention outline grouping.

---

## Tests

### `apps/dashboard/test/ingest/cucumber.test.ts`

- A hand-authored cucumber JSON (elements with `line` values matching a
  fixture `.feature` file's Examples rows) → asserts one `TestCaseGroup`
  with the right number of iterations, each with the right `example` data
  and its own `status`/`steps`/`failedStepIndex`.
- An element whose `line` matches no parsed row (simulated drift) →
  falls back to `TestCaseSingle`, warning logged, no crash.
- An unparseable `.feature` fixture → all its elements land as
  `TestCaseSingle`, no crash.
- A plain `Scenario` (no Examples) → unchanged `TestCaseSingle`, exact same
  output as before this change (regression coverage).

### `apps/dashboard/test/ingest/playwright.test.ts`, `test/ingest/appium.test.ts`

New cases feeding an Examples-row cucumber JSON fixture through the full
`buildPlaywrightTool`/`buildAppiumTool` path, asserting `tool.tests.length`
reflects grouped counts and `tool.passed/failed/skipped` totals count groups,
not iterations.

### `apps/dashboard/test/components/TestList.test.tsx`

New grouped-fixture case: group row renders collapsed by default (unless an
iteration failed, matching the existing auto-expand-on-failure rule one
level down), expands into N iteration rows, and `expandScenarioName`
matching an iteration's name auto-expands both the group and that specific
iteration.

### `apps/dashboard/test/components/WebUiDetail.test.tsx`

Extend the existing `?expand=` end-to-end test (lines 95-105) with a
grouped-outline case, since this is the test most likely to break first if
iteration identity resolution is wrong.

### Regression

Existing flat-fixture cases across `test/ingest/*.test.ts`,
`test/adapters/*.test.ts`, and `test/components/TestList.test.tsx` must keep
passing unchanged — plain Scenarios still produce `TestCaseSingle` exactly
as before.

### `apps/dashboard/scripts/generate-fixtures.ts`

Convert the existing hand-authored outline pair (lines 73-89, `"Checkout
completes for US/en — Example row 1"` / `"...MX/es — Example row 2"`) into
one `TestCaseGroup` fixture with 2 iterations. Update the
`pixelmatch1.diffs[1].triggeredBy.scenario` backlink (line 299) to keep
pointing at the correct iteration's interpolated name, so the demo
deep-link continues to work end-to-end. This becomes the canonical
in-dashboard demo of grouping — no other structural changes needed
elsewhere in the fixture script (aggregate counts already decouple from
array length in this file today, e.g. `api1.passed: 312` against an 8-entry
array, so authoring the grouped fixture is pure shape-work).

---

## Open questions / risks

1. **CI-parallel divergence is real, not hypothetical.** `CUCUMBER_PARALLEL=4`
   is already set for `playwright-desktop`/`playwright-responsive` in GitHub
   Actions, Azure Pipelines, GitLab CI, and both AWS buildspecs. The
   line-based correlation is specifically chosen to be immune to this, but
   it should be validated against a real CI-generated parallel JSON report
   (not just a local serial one) before this ships, since that's the exact
   condition the earlier position-based approach failed under.
2. **`@cucumber/gherkin` as a new explicit dependency** is a small but real
   addition to `apps/dashboard/package.json`'s dependency surface, diverging
   from this repo's existing precedent of avoiding it
   (`scripts/metrics/lib/feature-parse.ts`) for pnpm-resolution reasons. Confirm
   during implementation that adding it as a direct dependency (not relying
   on the transitive copy) resolves cleanly under this repo's pnpm workspace
   setup exactly as expected.
3. **`Rule:` blocks** aren't handled (see Non-goals). If a future `.feature`
   file introduces one, outlines nested inside it will silently fall back to
   `TestCaseSingle` per-row (safe, but loses grouping) rather than error —
   worth a follow-up if `Rule:` usage is ever adopted.
4. **Deep-link matcher performance** — searching `iterations[]` in addition
   to top-level names is a small additional linear scan per `TestList`
   render; negligible at today's scale (125 total Examples rows across the
   whole repo) but worth keeping in mind if outline usage grows substantially.

## Definition of done

- All ingest/adapter/component tests pass: `pnpm --filter dashboard test`.
- Typecheck clean: `pnpm --filter dashboard typecheck`.
- `pnpm dashboard:fixtures && pnpm dashboard` renders the converted Checkout
  outline fixture as **one** row with a "2 iterations" badge, expanding to
  show both iterations with their `example` data, one pass/one fail visible
  at the iteration level, and the row's own rolled-up status is `failed`.
- The pixelmatch demo diff's backlink still deep-links to the correct
  iteration inside its group and auto-expands it.
- A real ingest run against `market-language-localization.feature` (6 rows)
  and `place-delivery-order.feature` (2 outlines × 5 rows, the CI-parallel
  case) produces correctly grouped output — validated against both a serial
  local run and a `CUCUMBER_PARALLEL=4` run, confirming the line-based
  correlation holds under both.
- `apps/dashboard` KPI totals ("Tests Executed"/tab badges) drop
  proportionally to rows-collapsed-into-groups on every tool card that
  ingests an outline-bearing report. For example, the `playwright` tool
  ingesting `market-language-localization.feature` alone goes from counting
  6 toward its total to counting 1 (repo-wide, 125 Examples rows across 22
  outlines exist in total, but no single report file ingests all of them at
  once — each is scoped to its suite's tag filter).
