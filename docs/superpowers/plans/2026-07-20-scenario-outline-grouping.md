# Scenario Outline grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard report a Scenario Outline + Examples table as one scenario with N structured iterations, instead of N independent flat `TestCase` rows.

**Architecture:** Add a discriminated union `TestCase = TestCaseSingle | TestCaseGroup` to `apps/dashboard/src/shared/types.ts`. Add a new pure module that parses a `.feature` source file with `@cucumber/gherkin` and returns each Examples row's source line mapped to its outline template + structured data. Wire that into `ingestCucumber()` in `apps/dashboard/scripts/ingest-run.ts`, correlating cucumber-js JSON elements to Examples rows by the `line` field cucumber-js already emits (immune to CI parallel-worker reordering), with a safe fallback to a flat `TestCaseSingle` on any mismatch. Update the three UI call sites that read `TestCase.name`/`.steps`/`.error` to handle the group case.

**Tech Stack:** TypeScript, Node.js (`node:fs`, `node:path`), `@cucumber/gherkin` (new dependency), React, Vitest, `@testing-library/react`.

## Global Constraints

- No migration of historical runs — grouping only applies to runs ingested after this change ships. Do not write a backfill script.
- No new `Status` value — a group's rolled-up status is `passed | failed | skipped`, failed if any iteration failed.
- No change to any `test:json:*` npm script or to cucumber-js's `--format json:...` output — only `ingest-run.ts` reads an additional source (`.feature` file).
- No `Rule:` block support — the parser walks `doc.feature.children[].scenario` only. This repo has zero `Rule:` blocks today (verified).
- `@cucumber/gherkin` is added as an explicit dependency of `apps/dashboard` only (not `@cucumber/messages`) — rely on TypeScript's inference of `generateMessages()`'s return type rather than importing types from `@cucumber/messages` directly, since that package is not directly resolvable under this repo's pnpm workspace.
- Every existing test that currently passes must still pass once its task lands. Where Task 1 (types) causes a typechecking break in an existing file (documented per-task below), the SAME task that would naturally touch that file fixes it — never leave a break for an unspecified "later."
- Spec: `docs/superpowers/specs/2026-07-20-scenario-outline-grouping-design.md` (approved, committed at `8e9d584`). Read it if any task instruction here seems ambiguous — this plan implements it exactly, does not reinterpret it.

---

### Task 1: Data model — `TestCase` discriminated union

**Files:**
- Modify: `apps/dashboard/src/shared/types.ts:25-36`
- Test: `apps/dashboard/test/shared/types.test.ts` (new file, new `test/shared/` directory)

**Interfaces:**
- Produces: `TestCase` (now `TestCaseSingle | TestCaseGroup`), `TestCaseSingle`, `TestCaseGroup`, `TestCaseIteration`, `isTestCaseGroup(t: TestCase): t is TestCaseGroup` — all exported from `apps/dashboard/src/shared/types.ts`. Every later task imports these.

**Known consequence, not a bug:** after this task, `pnpm --filter dashboard typecheck` will show NEW errors at the following exact locations, because they read `.error`/`.steps`/`.failedStepIndex`/`.screenshot` off a `TestCase`-typed value without narrowing (these fields exist on `TestCaseSingle` but not `TestCaseGroup`):
- `apps/dashboard/scripts/ingest-run.ts:290` (`tc.screenshot = ...` inside `materializeScreenshots`) — fixed in Task 3.
- `apps/dashboard/src/client/components/TestList.tsx:81-86` — fixed in Task 5.
- `apps/dashboard/test/ingest/cucumber.test.ts` (multiple lines reading `t.steps`/`t.failedStepIndex`) — fixed in Task 3.
- `apps/dashboard/test/adapters/playwright.test.ts:35-38` (and likely `api.test.ts`/`appium.test.ts` — confirm by grep) — fixed in Task 4.
Do not "fix" these in this task — each is fixed in the task that owns that file, listed above. Confirming this exact error list (no more, no fewer) IS this task's passing evidence for the type change being correctly scoped.

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/test/shared/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isTestCaseGroup } from '../../src/shared/types';
import type { TestCase, TestCaseSingle } from '../../src/shared/types';

describe('TestCase discriminated union', () => {
  it('isTestCaseGroup narrows a group case and exposes structured iteration data', () => {
    const group: TestCase = {
      kind: 'group',
      name: 'Logout label is translated to <language> after market <market>',
      suite: 'Login',
      file: 'login/features/market-language-localization.feature',
      dur: '1.2s',
      status: 'failed',
      iterations: [
        {
          name: 'Logout label is translated to English after market US',
          example: { market: 'US', language: 'English', logoutLabel: 'Logout' },
          status: 'passed',
        },
        {
          name: 'Logout label is translated to Spanish after market MX',
          example: { market: 'MX', language: 'Spanish', logoutLabel: 'Salir' },
          status: 'failed',
          error: 'boom',
        },
      ],
    };
    expect(isTestCaseGroup(group)).toBe(true);
    if (!isTestCaseGroup(group)) throw new Error('unreachable');
    expect(group.iterations).toHaveLength(2);
    expect(group.iterations[1].example.market).toBe('MX');
  });

  it('isTestCaseGroup returns false for a legacy record with no kind field', () => {
    const single: TestCase = {
      name: 'Login with valid credentials',
      suite: 'Auth',
      file: 'auth/login.feature',
      dur: '2.4s',
      status: 'passed',
    };
    expect(isTestCaseGroup(single)).toBe(false);
  });

  it('isTestCaseGroup returns false for an explicit kind: single', () => {
    const single: TestCaseSingle = {
      kind: 'single',
      name: 'Login with valid credentials',
      suite: 'Auth',
      file: 'auth/login.feature',
      dur: '2.4s',
      status: 'passed',
    };
    expect(isTestCaseGroup(single)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- shared/types`
Expected: FAIL — `isTestCaseGroup` is not exported from `../../src/shared/types` (module has no such export yet).

- [ ] **Step 3: Implement the type change**

In `apps/dashboard/src/shared/types.ts`, replace lines 25-36 (the current `TestCase` interface):

```ts
export interface TestCase {
  name: string;
  suite: string;
  file: string;
  dur: string;
  status: Status;
  error?: string;
  steps?: TestStep[];
  failedStepIndex?: number;
  /** URL of a failure screenshot PNG, served from /reports/<runId>/screenshots/. Present only when the scenario failed and an image/png attachment was captured in the After hook. */
  screenshot?: string;
}
```

with:

```ts
export type TestCase = TestCaseSingle | TestCaseGroup;

interface TestCaseBase {
  suite: string;
  file: string;
  dur: string;
  status: Status;
}

export interface TestCaseSingle extends TestCaseBase {
  /** Optional so pre-existing report JSON (ingested before Scenario Outline grouping shipped) keeps parsing unchanged. */
  kind?: 'single';
  name: string;
  error?: string;
  steps?: TestStep[];
  failedStepIndex?: number;
  /** URL of a failure screenshot PNG, served from /reports/<runId>/screenshots/. Present only when the scenario failed and an image/png attachment was captured in the After hook. */
  screenshot?: string;
}

export interface TestCaseGroup extends TestCaseBase {
  kind: 'group';
  /** Scenario Outline template name, placeholders intact, e.g. "Logout label is translated to <language> after market <market>". */
  name: string;
  /** One per Examples row, ordered by source line (not execution/arrival order). */
  iterations: TestCaseIteration[];
}

export interface TestCaseIteration {
  /** Interpolated name, e.g. "Logout label is translated to Spanish after market MX". */
  name: string;
  /** Examples row data keyed by column header, e.g. { market: 'MX', language: 'Spanish', logoutLabel: 'Salir' }. */
  example: Record<string, string>;
  status: Status;
  error?: string;
  steps?: TestStep[];
  failedStepIndex?: number;
  screenshot?: string;
}

export function isTestCaseGroup(t: TestCase): t is TestCaseGroup {
  return t.kind === 'group';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- shared/types`
Expected: PASS (3 tests).

- [ ] **Step 5: Confirm the exact, expected typecheck breakage**

Run: `pnpm --filter dashboard typecheck`
Expected: FAIL, with errors ONLY at the 4 locations listed above in "Known consequence, not a bug" (`ingest-run.ts:290`, `TestList.tsx:81-86`, `test/ingest/cucumber.test.ts` multiple lines, `test/adapters/playwright.test.ts:35-38` and possibly sibling adapter test files). If you see errors anywhere else, stop and investigate before continuing — it means something other than the documented `.error`/`.steps`/`.failedStepIndex`/`.screenshot` read pattern broke, which this plan did not anticipate.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/shared/types.ts apps/dashboard/test/shared/types.test.ts
git commit -m "feat(dashboard): add TestCaseGroup/TestCaseIteration discriminated union

Lays the data-model groundwork for grouping Scenario Outline Examples
rows into one scenario with N iterations. Existing consumers reading
single-only fields (steps/error/failedStepIndex/screenshot) without
narrowing now fail typecheck by design — fixed in the tasks that touch
each of those files."
```

---

### Task 2: `.feature` source parser (`outline-parser.ts`)

**Files:**
- Modify: `apps/dashboard/package.json:19-24` (add `@cucumber/gherkin` dependency)
- Create: `apps/dashboard/scripts/lib/outline-parser.ts`
- Test: `apps/dashboard/test/scripts/outline-parser.test.ts` (new file, new `test/scripts/` directory)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export interface OutlineRow { outlineKey: string; templateName: string; example: Record<string, string>; }` and `export async function parseOutlineRows(featurePath: string): Promise<Map<number, OutlineRow>>` from `apps/dashboard/scripts/lib/outline-parser.ts`. Task 3 imports both.

- [ ] **Step 1: Add the dependency**

Edit `apps/dashboard/package.json`. Current `dependencies` block (lines 19-24):

```json
  "dependencies": {
    "express": "^4.21.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
```

Replace with:

```json
  "dependencies": {
    "@cucumber/gherkin": "38.0.0",
    "express": "^4.21.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
```

Run: `pnpm install`
Expected: resolves cleanly (this version is already present in the workspace's lockfile as a transitive dependency of the root `@cucumber/cucumber@^12.9.0`, so no new version resolution conflicts are expected). Confirm with: `node -e "console.log(require.resolve('@cucumber/gherkin', { paths: ['apps/dashboard'] }))"` run from the repo root — expect a path inside `apps/dashboard/node_modules/.pnpm/...` or the workspace's pnpm store, not an error.

- [ ] **Step 2: Write the failing test**

Create `apps/dashboard/test/scripts/outline-parser.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseOutlineRows } from '../../scripts/lib/outline-parser';

const FEATURE = [
  'Feature: Login',
  '',
  '  Scenario Outline: Logout label is translated to <language> after market <market>',
  '    Given the login screen is open',
  '    When the user selects market "<market>" with language "<language>"',
  '    Then the logout button label is "<logoutLabel>"',
  '',
  '    Examples:',
  '      | market | language | logoutLabel |',
  '      | US     | English  | Logout      |',
  '      | MX     | Spanish  | Salir       |',
  '',
  '  Scenario: Plain scenario, not an outline',
  '    Given something',
  '    Then something else',
  '',
].join('\n');

function lineOf(needle: string): number {
  return FEATURE.split('\n').findIndex((l) => l.includes(needle)) + 1;
}

describe('parseOutlineRows', () => {
  let dir: string;
  let featurePath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'outline-parser-'));
    featurePath = path.join(dir, 'login.feature');
    writeFileSync(featurePath, FEATURE, 'utf8');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('maps each Examples row source line to its outline template and structured data', async () => {
    const rows = await parseOutlineRows(featurePath);
    const usLine = lineOf('| US ');
    const mxLine = lineOf('| MX ');

    expect(rows.size).toBe(2);
    const us = rows.get(usLine);
    expect(us).toBeDefined();
    expect(us!.templateName).toBe('Logout label is translated to <language> after market <market>');
    expect(us!.example).toEqual({ market: 'US', language: 'English', logoutLabel: 'Logout' });

    const mx = rows.get(mxLine);
    expect(mx).toBeDefined();
    expect(mx!.example).toEqual({ market: 'MX', language: 'Spanish', logoutLabel: 'Salir' });
    expect(mx!.outlineKey).toBe(us!.outlineKey);
  });

  it('does not produce a row for a plain Scenario', async () => {
    const rows = await parseOutlineRows(featurePath);
    for (const row of rows.values()) {
      expect(row.templateName).not.toContain('Plain scenario');
    }
  });

  it('returns an empty map for a missing file', async () => {
    const rows = await parseOutlineRows(path.join(dir, 'does-not-exist.feature'));
    expect(rows.size).toBe(0);
  });

  it('returns an empty map for unparseable Gherkin, without throwing', async () => {
    const badPath = path.join(dir, 'broken.feature');
    writeFileSync(badPath, 'this is not valid gherkin {{{', 'utf8');
    await expect(parseOutlineRows(badPath)).resolves.toBeInstanceOf(Map);
    const rows = await parseOutlineRows(badPath);
    expect(rows.size).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- scripts/outline-parser`
Expected: FAIL — cannot find module `../../scripts/lib/outline-parser`.

- [ ] **Step 4: Implement `outline-parser.ts`**

Create `apps/dashboard/scripts/lib/outline-parser.ts`:

```ts
import { promises as fs } from 'node:fs';
import { generateMessages } from '@cucumber/gherkin';

export interface OutlineRow {
  /** Stable per-outline id: the .feature path + the outline's own declaration line. */
  outlineKey: string;
  /** Scenario Outline template name, placeholders intact. */
  templateName: string;
  /** Examples row data keyed by column header. */
  example: Record<string, string>;
}

/**
 * Parse a .feature file and map each Examples row's source line to the
 * outline it belongs to and that row's structured data. Never throws —
 * a missing file, unreadable file, or Gherkin parse error all resolve to
 * an empty map, so callers can fall back to flat ingestion.
 */
export async function parseOutlineRows(featurePath: string): Promise<Map<number, OutlineRow>> {
  const rows = new Map<number, OutlineRow>();

  let text: string;
  try {
    text = await fs.readFile(featurePath, 'utf8');
  } catch {
    return rows;
  }

  let envelopes: ReturnType<typeof generateMessages>;
  try {
    envelopes = generateMessages(
      text,
      featurePath,
      'text/x.cucumber.gherkin+plain' as Parameters<typeof generateMessages>[2],
      { includeGherkinDocument: true, includeSource: false, includePickles: false, newId: () => '' },
    );
  } catch {
    return rows;
  }
  if (envelopes.some((e) => e.parseError)) return rows;

  const doc = envelopes.find((e) => e.gherkinDocument)?.gherkinDocument;
  if (!doc) return rows;

  for (const child of doc.feature?.children ?? []) {
    const scenario = child.scenario;
    // examples.length === 0 is the signal cucumber-js's own compiler uses to
    // distinguish an Outline from a plain Scenario -- not the keyword text.
    if (!scenario || scenario.examples.length === 0) continue;

    const outlineKey = `${featurePath}#${scenario.location.line}`;
    for (const ex of scenario.examples) {
      const header = ex.tableHeader?.cells.map((c) => c.value) ?? [];
      for (const row of ex.tableBody) {
        const example: Record<string, string> = {};
        row.cells.forEach((cell, i) => {
          if (header[i]) example[header[i]] = cell.value;
        });
        rows.set(row.location.line, { outlineKey, templateName: scenario.name, example });
      }
    }
  }

  return rows;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- scripts/outline-parser`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: the same 4 pre-existing locations from Task 1 still fail (unchanged); no NEW errors from this task's new file.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/package.json apps/dashboard/pnpm-lock.yaml apps/dashboard/scripts/lib/outline-parser.ts apps/dashboard/test/scripts/outline-parser.test.ts
git commit -m "feat(dashboard): add parseOutlineRows to extract structured Examples data

Parses a .feature source file with @cucumber/gherkin and returns each
Examples row's source line mapped to its outline template name and
structured column data. Never throws -- missing/unparseable files
degrade to an empty map so ingest can fall back to flat scenarios."
```

Note: if `pnpm install` in Step 1 modifies a root-level lockfile path instead of (or in addition to) one under `apps/dashboard/`, adjust the `git add` in this step to match whichever lockfile path actually changed — check with `git status` before committing.

---

### Task 3: Wire the parser into `ingestCucumber()`

**Files:**
- Modify: `apps/dashboard/scripts/ingest-run.ts:33-55` (imports), `:87-97` (`CucumberElement`/`CucumberFeature`), `:106` (`screenshotData` WeakMap), `:168-252` (`ingestCucumber`), `:264-296` (`materializeScreenshots`), `:432,484,509,550,553,801` (call sites — add `await`)
- Modify: `apps/dashboard/test/ingest/cucumber.test.ts` (convert existing tests to async + narrow; add new grouping/fallback tests)

**Interfaces:**
- Consumes: `parseOutlineRows`, `OutlineRow` from `apps/dashboard/scripts/lib/outline-parser.ts` (Task 2); `TestCaseGroup`, `TestCaseSingle`, `TestCaseIteration`, `isTestCaseGroup` from `apps/dashboard/src/shared/types.ts` (Task 1).
- Produces: `ingestCucumber` becomes `export async function ingestCucumber(features: CucumberFeature[]): Promise<IngestedSuite>` (was synchronous). Every caller must now `await` it — Task 4/5/6/7 do not call it directly, so this is fully contained to this task's own call-site fixes.

- [ ] **Step 1: Write the failing tests**

Replace `apps/dashboard/test/ingest/cucumber.test.ts` in full:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ingestCucumber } from '../../scripts/ingest-run';
import { isTestCaseGroup } from '../../src/shared/types';

describe('ingestCucumber — step extraction', () => {
  const passingScenario = {
    name: 'login feature',
    uri: 'src/core/tests/login/features/login.feature',
    elements: [
      {
        name: 'user logs in',
        type: 'scenario',
        steps: [
          {
            keyword: 'Given ', name: 'a fresh browser',
            match: { location: 'src/login/steps.ts:5' },
            result: { status: 'passed', duration: 100_000_000 },
          },
          {
            keyword: 'When ', name: 'they submit credentials',
            match: { location: 'src/login/steps.ts:15' },
            result: { status: 'passed', duration: 200_000_000 },
          },
          {
            keyword: 'Then ', name: 'they land on the dashboard',
            match: { location: 'src/login/steps.ts:25' },
            result: { status: 'passed', duration: 50_000_000 },
          },
        ],
      },
    ],
  };

  it('emits one TestStep per cucumber step with keyword, name, status, dur, location', async () => {
    const out = await ingestCucumber([passingScenario]);
    expect(out.tests).toHaveLength(1);
    const t = out.tests[0];
    if (isTestCaseGroup(t)) throw new Error('expected a single test case');
    expect(t.steps).toBeDefined();
    expect(t.steps).toHaveLength(3);
    expect(t.steps?.[0]).toMatchObject({
      keyword: 'Given ',
      name: 'a fresh browser',
      status: 'passed',
      location: 'src/login/steps.ts:5',
    });
    expect(t.failedStepIndex).toBeUndefined();
  });

  it('sets failedStepIndex to the index of the first failing step and copies its error message', async () => {
    const failing = {
      ...passingScenario,
      elements: [
        {
          ...passingScenario.elements[0],
          steps: [
            { keyword: 'Given ', name: 'setup', result: { status: 'passed', duration: 10_000_000 } },
            {
              keyword: 'When ', name: 'broken action',
              result: { status: 'failed', duration: 20_000_000, error_message: 'AssertionError: expected truthy' },
            },
            { keyword: 'Then ', name: 'never runs', result: { status: 'skipped', duration: 0 } },
          ],
        },
      ],
    };
    const out = await ingestCucumber([failing]);
    const t = out.tests[0];
    if (isTestCaseGroup(t)) throw new Error('expected a single test case');
    expect(t.failedStepIndex).toBe(1);
    expect(t.steps?.[1].error).toBe('AssertionError: expected truthy');
    expect(t.steps?.[1].status).toBe('failed');
    expect(t.steps?.[2].status).toBe('skipped');
  });

  it('filters hidden hooks when passing but keeps them when failing', async () => {
    const withHiddenHooks = {
      ...passingScenario,
      elements: [
        {
          ...passingScenario.elements[0],
          steps: [
            { keyword: 'Before', hidden: true, result: { status: 'passed', duration: 1_000_000 } },
            { keyword: 'Given ', name: 'setup', result: { status: 'passed', duration: 10_000_000 } },
            {
              keyword: 'After', hidden: true,
              result: { status: 'failed', duration: 5_000_000, error_message: 'teardown failed' },
            },
          ],
        },
      ],
    };
    const out = await ingestCucumber([withHiddenHooks]);
    const t = out.tests[0];
    if (isTestCaseGroup(t)) throw new Error('expected a single test case');
    expect(t.steps).toHaveLength(2);
    expect(t.steps?.[0].name).toBe('setup');
    expect(t.steps?.[1].hidden).toBe(true);
    expect(t.steps?.[1].error).toBe('teardown failed');
    expect(t.failedStepIndex).toBe(1);
  });
});

describe('ingestCucumber — Scenario Outline grouping', () => {
  let dir: string;
  let featurePath: string;
  let featureUri: string;

  const FEATURE = [
    'Feature: Login',
    '',
    '  Scenario Outline: Logout label is translated to <language> after market <market>',
    '    Given the login screen is open',
    '    Then the logout button label is "<logoutLabel>"',
    '',
    '    Examples:',
    '      | market | language | logoutLabel |',
    '      | US     | English  | Logout      |',
    '      | MX     | Spanish  | Salir       |',
    '',
  ].join('\n');

  function lineOf(needle: string): number {
    return FEATURE.split('\n').findIndex((l) => l.includes(needle)) + 1;
  }

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'ingest-outline-'));
    featurePath = path.join(dir, 'login.feature');
    writeFileSync(featurePath, FEATURE, 'utf8');
    featureUri = featurePath.replace(/\\/g, '/');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('groups Examples rows into one TestCaseGroup, correlated by source line', async () => {
    const feature = {
      name: 'login feature',
      uri: featureUri,
      elements: [
        {
          name: 'Logout label is translated to English after market US',
          type: 'scenario',
          keyword: 'Scenario Outline',
          line: lineOf('| US '),
          steps: [{ keyword: 'Given ', name: 'the login screen is open', result: { status: 'passed', duration: 10_000_000 } }],
        },
        {
          name: 'Logout label is translated to Spanish after market MX',
          type: 'scenario',
          keyword: 'Scenario Outline',
          line: lineOf('| MX '),
          steps: [{ keyword: 'Given ', name: 'the login screen is open', result: { status: 'failed', duration: 10_000_000, error_message: 'nope' } }],
        },
      ],
    };

    const out = await ingestCucumber([feature]);
    expect(out.tests).toHaveLength(1);
    const t = out.tests[0];
    if (!isTestCaseGroup(t)) throw new Error('expected a group');
    expect(t.name).toBe('Logout label is translated to <language> after market <market>');
    expect(t.status).toBe('failed');
    expect(t.iterations).toHaveLength(2);
    expect(t.iterations[0].example).toEqual({ market: 'US', language: 'English', logoutLabel: 'Logout' });
    expect(t.iterations[1].example).toEqual({ market: 'MX', language: 'Spanish', logoutLabel: 'Salir' });
    expect(t.iterations[1].status).toBe('failed');
    // Grouping counts as ONE toward the suite total, not two.
    expect(out.passed).toBe(0);
    expect(out.failed).toBe(1);
  });

  it('sorts iterations by source line, not JSON arrival order', async () => {
    const feature = {
      name: 'login feature',
      uri: featureUri,
      elements: [
        {
          name: 'Logout label is translated to Spanish after market MX',
          type: 'scenario',
          keyword: 'Scenario Outline',
          line: lineOf('| MX '),
          steps: [],
        },
        {
          name: 'Logout label is translated to English after market US',
          type: 'scenario',
          keyword: 'Scenario Outline',
          line: lineOf('| US '),
          steps: [],
        },
      ],
    };
    const out = await ingestCucumber([feature]);
    const t = out.tests[0];
    if (!isTestCaseGroup(t)) throw new Error('expected a group');
    expect(t.iterations.map((i) => i.example.market)).toEqual(['US', 'MX']);
  });

  it('falls back to a standalone TestCaseSingle when the line matches no parsed Examples row, and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const feature = {
      name: 'login feature',
      uri: featureUri,
      elements: [
        {
          name: 'Logout label is translated to English after market US',
          type: 'scenario',
          keyword: 'Scenario Outline',
          line: 999,
          steps: [{ keyword: 'Given ', name: 'the login screen is open', result: { status: 'passed', duration: 10_000_000 } }],
        },
      ],
    };
    const out = await ingestCucumber([feature]);
    expect(out.tests).toHaveLength(1);
    expect(isTestCaseGroup(out.tests[0])).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('does not attempt outline correlation for plain Scenarios (no keyword/line)', async () => {
    const feature = {
      name: 'login feature',
      uri: featureUri,
      elements: [{ name: 'a plain scenario', type: 'scenario', steps: [] }],
    };
    const out = await ingestCucumber([feature]);
    expect(out.tests).toHaveLength(1);
    expect(isTestCaseGroup(out.tests[0])).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter dashboard test -- ingest/cucumber`
Expected: FAIL — `ingestCucumber` still returns synchronously (existing tests now `await` a non-Promise, which still resolves as-is in JS but the new grouping tests fail because no grouping logic exists yet); `isTestCaseGroup` import resolves fine (from Task 1) but always returns `false` since no group is ever produced.

- [ ] **Step 3: Implement the ingest changes**

In `apps/dashboard/scripts/ingest-run.ts`, update the import block (lines 33-55) to add the new types and the parser:

```ts
import type {
  A11yAudit,
  A11yViolation,
  AccessibilityTool,
  ApiTool,
  BrowserBlock,
  ManifestEntry,
  MobileSecurityTool,
  MobileUiTool,
  MobsfFinding,
  MobsfPlatformBlock,
  PlatformBlock,
  RunInfo,
  SecurityGate,
  Status,
  TestCase,
  TestCaseGroup,
  TestCaseIteration,
  TestCaseSingle,
  TestStep,
  ToolTiming,
  ViewportBlock,
  WebSecurityTool,
  WebUiTool,
  ZapScanBlock,
} from '../src/shared/types.js';
import { isTestCaseGroup } from '../src/shared/types.js';
import { ingestGatling } from './ingest-gatling.js';
import { ingestPixelmatch } from './ingest-pixelmatch.js';
import { parseOutlineRows, type OutlineRow } from './lib/outline-parser.js';
```

Update `CucumberElement` (lines 87-91):

```ts
interface CucumberElement {
  name?: string;
  type?: string;
  steps?: CucumberStep[];
  /** Literal keyword text, e.g. "Scenario Outline" for Examples-row-derived elements. */
  keyword?: string;
  /** Source line of THIS Examples row (not the outline's own declaration line). */
  line?: number;
}
```

Update the `screenshotData` WeakMap (line 106) to also accept iterations:

```ts
const screenshotData = new WeakMap<TestCase | TestCaseIteration, { b64: string }>();
```

Replace the full `ingestCucumber` function (lines 168-252) with:

```ts
export async function ingestCucumber(features: CucumberFeature[]): Promise<IngestedSuite> {
  const tests: TestCase[] = [];
  const suiteSet = new Set<string>();
  let totalNs = 0;

  for (const feature of features) {
    const suite = feature.name ?? '(unnamed feature)';
    suiteSet.add(suite);
    const uri = (feature.uri ?? '').replace(/\\/g, '/');

    const hasOutlineElement = (feature.elements ?? []).some((el) => el.keyword === 'Scenario Outline');
    const outlineRows = hasOutlineElement && uri
      ? await parseOutlineRows(path.resolve(repoRoot, uri))
      : new Map<number, OutlineRow>();

    // outlineKey -> accumulated iterations (with their source ns/line, for
    // later sorting/summing), finalized into a TestCaseGroup after the loop.
    const groupBuckets = new Map<
      string,
      { templateName: string; entries: { line: number; ns: number; iteration: TestCaseIteration }[] }
    >();

    for (const el of feature.elements ?? []) {
      if (el.type !== 'scenario') continue;

      let scenarioNs = 0;
      let worst: Status = 'passed';
      let errorMsg: string | undefined;
      const stepsOut: TestStep[] = [];

      for (const step of el.steps ?? []) {
        const r = step.result ?? {};
        const dur = typeof r.duration === 'number' ? r.duration : 0;
        scenarioNs += dur;
        if (!r.status || !TERMINAL_STATUSES.has(r.status)) continue;
        const stepStatus = normalizeStatus(r.status);

        const isHidden = step.hidden === true;
        if (isHidden && stepStatus !== 'failed') {
          continue;
        }

        if (stepStatus === 'failed') {
          worst = 'failed';
          if (!errorMsg && r.error_message) errorMsg = r.error_message;
        } else if (stepStatus === 'skipped' && worst !== 'failed') {
          worst = 'skipped';
        }

        const out: TestStep = {
          keyword: step.keyword ?? '',
          name: step.name ?? '',
          status: stepStatus,
          dur: formatNs(dur),
        };
        const matchLocation = step.match?.location;
        if (matchLocation) out.location = matchLocation;
        if (stepStatus === 'failed' && r.error_message) out.error = r.error_message;
        if (isHidden) out.hidden = true;
        stepsOut.push(out);
      }

      const failedStepIndex = stepsOut.findIndex((s) => s.status === 'failed');
      totalNs += scenarioNs;

      const outlineRow =
        el.keyword === 'Scenario Outline' && typeof el.line === 'number'
          ? outlineRows.get(el.line)
          : undefined;

      if (outlineRow) {
        const iteration: TestCaseIteration = {
          name: el.name ?? '(unnamed scenario)',
          example: outlineRow.example,
          status: worst,
          ...(errorMsg ? { error: errorMsg } : {}),
          steps: stepsOut,
          ...(failedStepIndex >= 0 ? { failedStepIndex } : {}),
        };
        if (worst === 'failed') {
          const b64 = extractImageAttachment(el.steps ?? []);
          if (b64) screenshotData.set(iteration, { b64 });
        }

        let bucket = groupBuckets.get(outlineRow.outlineKey);
        if (!bucket) {
          bucket = { templateName: outlineRow.templateName, entries: [] };
          groupBuckets.set(outlineRow.outlineKey, bucket);
        }
        bucket.entries.push({ line: el.line as number, ns: scenarioNs, iteration });
        continue;
      }

      if (el.keyword === 'Scenario Outline' && typeof el.line === 'number') {
        console.warn(
          `[ingest] warning: ${uri}:${el.line} looks like a Scenario Outline row but no matching ` +
          `Examples row was found in the .feature source -- ingesting "${el.name}" as a standalone scenario.`,
        );
      }

      const tc: TestCaseSingle = {
        name: el.name ?? '(unnamed scenario)',
        suite,
        file: uri,
        dur: formatNs(scenarioNs),
        status: worst,
        ...(errorMsg ? { error: errorMsg } : {}),
        steps: stepsOut,
        ...(failedStepIndex >= 0 ? { failedStepIndex } : {}),
      };
      if (worst === 'failed') {
        const b64 = extractImageAttachment(el.steps ?? []);
        if (b64) screenshotData.set(tc, { b64 });
      }
      tests.push(tc);
    }

    for (const bucket of groupBuckets.values()) {
      const entries = [...bucket.entries].sort((a, b) => a.line - b.line);
      const iterations = entries.map((e) => e.iteration);
      const durNs = entries.reduce((sum, e) => sum + e.ns, 0);
      const status: Status = iterations.some((i) => i.status === 'failed')
        ? 'failed'
        : iterations.some((i) => i.status === 'skipped')
          ? 'skipped'
          : 'passed';
      const group: TestCaseGroup = {
        kind: 'group',
        name: bucket.templateName,
        suite,
        file: uri,
        dur: formatNs(durNs),
        status,
        iterations,
      };
      tests.push(group);
    }
  }

  return {
    passed: tests.filter((t) => t.status === 'passed').length,
    failed: tests.filter((t) => t.status === 'failed').length,
    skipped: tests.filter((t) => t.status === 'skipped').length,
    duration: formatTotalDuration(totalNs),
    suites: [...suiteSet],
    tests,
  };
}
```

Replace `materializeScreenshots` (lines 264-296) with:

```ts
async function materializeScreenshots(
  tests: TestCase[],
  runDir: string,
  runId: string,
): Promise<void> {
  const outDir = path.join(runDir, 'screenshots');
  const usedKeys = new Set<string>();

  const writeOne = async (tc: TestCase | TestCaseIteration, keyPrefix: string): Promise<void> => {
    const entry = screenshotData.get(tc);
    if (!entry) return;
    screenshotData.delete(tc);

    let baseKey = `${keyPrefix}__${safeSegment(tc.name)}`;
    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${baseKey}-${suffix++}`;
    }
    usedKeys.add(key);

    const pngPath = path.join(outDir, `${key}.png`);
    try {
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(pngPath, Buffer.from(entry.b64, 'base64'));
      tc.screenshot = `/reports/${encodeURIComponent(runId)}/screenshots/${key}.png`;
    } catch (err) {
      // Non-fatal: the screenshot is a nice-to-have; don't fail the whole ingest.
      console.warn(`[ingest] warning: could not write screenshot ${pngPath}:`, (err as Error).message);
    }
  };

  for (const tc of tests) {
    if (isTestCaseGroup(tc)) {
      for (const iteration of tc.iterations) {
        await writeOne(iteration, safeSegment(tc.suite));
      }
    } else {
      await writeOne(tc, safeSegment(tc.suite));
    }
  }
}
```

Add `await` to every `ingestCucumber(...)` call site:

- Line ~432 (viewport loop in `buildPlaywrightTool`): `browsers.push(browserBlockFromSuite(browser, ingestCucumber(raw)));` → `browsers.push(browserBlockFromSuite(browser, await ingestCucumber(raw)));`
- Line ~484 (per-browser loop in `buildPlaywrightTool`): same change.
- Line ~509 (flat fallback in `buildPlaywrightTool`): `const s = ingestCucumber(flat);` → `const s = await ingestCucumber(flat);`
- Lines ~550/553 (`buildAppiumTool`): `ingestCucumber(androidRaw)` → `await ingestCucumber(androidRaw)`, and same for `iosRaw`.
- Line ~801 (`main()`, API tool): `const s = ingestCucumber(apiRaw);` → `const s = await ingestCucumber(apiRaw);`

Before editing each site, run `grep -n "ingestCucumber(" apps/dashboard/scripts/ingest-run.ts` to confirm current exact line numbers (they may have shifted slightly from the import-block edit above) and edit every match — do not rely on the approximate numbers here without checking.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter dashboard test -- ingest/cucumber`
Expected: PASS (7 tests: 3 original + 4 new).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: the `ingest-run.ts:290`-area error and the `test/ingest/cucumber.test.ts` errors from Task 1 are now gone. Remaining errors: only `TestList.tsx:81-86` (Task 5) and `test/adapters/playwright.test.ts` (+ siblings, Task 4).

- [ ] **Step 6: Run the full ingest test suite for regressions**

Run: `pnpm --filter dashboard test -- ingest`
Expected: PASS — `ingest/cucumber.test.ts`, `ingest/playwright.test.ts`, `ingest/appium.test.ts` all green (the latter two don't call `ingestCucumber` directly, only `buildPlaywrightTool`/`buildAppiumTool`, which are already `async` and now correctly `await` it internally).

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/scripts/ingest-run.ts apps/dashboard/test/ingest/cucumber.test.ts
git commit -m "feat(dashboard): group Scenario Outline Examples rows during ingest

ingestCucumber() now correlates cucumber-js JSON elements to their
source Examples row by the line field cucumber-js already emits
(immune to CI parallel-worker reordering), grouping same-outline rows
into one TestCaseGroup with structured per-iteration example data.
Falls back to a flat TestCaseSingle (with a console.warn) on any
line/row mismatch, and for plain Scenarios as before."
```

---

### Task 4: Fix `TestCase` narrowing in adapter tests

**Files:**
- Modify: `apps/dashboard/test/adapters/playwright.test.ts:1-46`
- Modify (conditionally, after grep confirms the pattern): `apps/dashboard/test/adapters/api.test.ts`, `apps/dashboard/test/adapters/appium.test.ts`

**Interfaces:**
- Consumes: `isTestCaseGroup` from `apps/dashboard/src/shared/types.ts` (Task 1). No changes to any adapter source file (`playwrightAdapter`/`apiAdapter`/`appiumAdapter` remain pure pass-throughs, per the spec's non-goals — only these tests' assertions need narrowing).

- [ ] **Step 1: Confirm the exact scope**

Run: `grep -n "\.tests\[[0-9]\]\.\(error\|steps\|failedStepIndex\|screenshot\)" apps/dashboard/test/adapters/*.test.ts`

This finds every read of a single-only field off an indexed `TestCase` array element across the adapters test directory. `playwright.test.ts:35-38` (per the code below) is confirmed; use this grep's output to find the exact lines in `api.test.ts`/`appium.test.ts` if they follow the same pattern — do not guess line numbers for those two files.

- [ ] **Step 2: Fix `playwright.test.ts`**

Current (lines 1-5, imports):

```ts
import { describe, it, expect } from 'vitest';

import { playwrightAdapter } from '../../src/server/normalize/playwright';
import type { WebUiTool } from '../../src/shared/types';
import { ctx } from './_helpers';
```

Replace with:

```ts
import { describe, it, expect } from 'vitest';

import { playwrightAdapter } from '../../src/server/normalize/playwright';
import type { WebUiTool } from '../../src/shared/types';
import { isTestCaseGroup } from '../../src/shared/types';
import { ctx } from './_helpers';
```

Current (lines 30-40):

```ts
  it('produces a web_ui tool with the same data and the kind set', () => {
    const out = playwrightAdapter(fixture, ctx());
    expect(out.kind).toBe('web_ui');
    expect(out.id).toBe('playwright');
    expect(out.passed).toBe(5);
    expect(out.tests).toHaveLength(2);
    expect(out.tests[1].error).toBe('boom');
    expect(out.tests[1].steps).toHaveLength(2);
    expect(out.tests[1].failedStepIndex).toBe(1);
    expect(out.tests[1].steps?.[1].error).toBe('boom');
  });
```

Replace with:

```ts
  it('produces a web_ui tool with the same data and the kind set', () => {
    const out = playwrightAdapter(fixture, ctx());
    expect(out.kind).toBe('web_ui');
    expect(out.id).toBe('playwright');
    expect(out.passed).toBe(5);
    expect(out.tests).toHaveLength(2);
    const second = out.tests[1];
    if (isTestCaseGroup(second)) throw new Error('expected a single test case');
    expect(second.error).toBe('boom');
    expect(second.steps).toHaveLength(2);
    expect(second.failedStepIndex).toBe(1);
    expect(second.steps?.[1].error).toBe('boom');
  });
```

- [ ] **Step 3: Apply the same fix pattern to any matches in `api.test.ts` / `appium.test.ts`**

For each match found in Step 1 outside `playwright.test.ts`: add `import { isTestCaseGroup } from '../../src/shared/types';` to that file's imports if not already present, introduce a local `const` for the indexed `TestCase` access, guard it with `if (isTestCaseGroup(x)) throw new Error('expected a single test case');`, then replace the direct indexed reads with reads off the narrowed local variable — following exactly the shape of Step 2's fix.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter dashboard test -- adapters`
Expected: PASS — all adapter tests green, no behavior change (pure test-file narrowing).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: remaining errors are ONLY `TestList.tsx:81-86` (Task 5).

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/test/adapters/playwright.test.ts apps/dashboard/test/adapters/api.test.ts apps/dashboard/test/adapters/appium.test.ts
git commit -m "test(dashboard): narrow TestCase reads in adapter tests for the new union

No behavior change -- adapters remain pure pass-throughs. Only the
test assertions reading single-only fields (error/steps/failedStepIndex)
off an indexed TestCase now narrow with isTestCaseGroup first."
```

(If Step 3 found no matches in `api.test.ts`/`appium.test.ts`, the `git add` for those two files is a no-op; drop them from the commit and note in the PR/task notes that only `playwright.test.ts` needed the fix.)

---

### Task 5: `TestList.tsx` — render groups, deep-link into iterations

**Files:**
- Modify: `apps/dashboard/src/client/components/TestList.tsx` (full file, 94 lines)
- Modify: `apps/dashboard/test/components/TestList.test.tsx` (add 2 new tests)

**Interfaces:**
- Consumes: `isTestCaseGroup`, `TestCaseIteration` from `apps/dashboard/src/shared/types.ts` (Task 1).
- Produces: no new exports — `TestList`'s public props (`TestListProps`) are unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `apps/dashboard/test/components/TestList.test.tsx`, inside the existing `describe('TestList accordion', ...)` block, after the last existing `it(...)`:

```tsx
  it('renders a Scenario Outline group as one row with an iteration count badge', () => {
    const grouped: TestCase = {
      kind: 'group',
      name: 'Logout label is translated to <language> after market <market>',
      suite: 'Login',
      file: 'login.feature',
      dur: '2.0s',
      status: 'failed',
      iterations: [
        {
          name: 'Logout label is translated to English after market US',
          example: { market: 'US', language: 'English' },
          status: 'passed',
        },
        {
          name: 'Logout label is translated to Spanish after market MX',
          example: { market: 'MX', language: 'Spanish' },
          status: 'failed',
          error: 'boom',
        },
      ],
    };
    render(<TestList tests={[grouped]} filter="all" query="" />);
    expect(screen.getByText(/2 iterations/)).toBeInTheDocument();
    // The group auto-expands because one iteration failed, revealing the iteration rows.
    expect(screen.getByText(/market: MX/)).toBeInTheDocument();
  });

  it('deep-links into a specific iteration inside a group via expandScenarioName', () => {
    const grouped: TestCase = {
      kind: 'group',
      name: 'Logout label is translated to <language> after market <market>',
      suite: 'Login',
      file: 'login.feature',
      dur: '2.0s',
      status: 'passed',
      iterations: [
        {
          name: 'Logout label is translated to English after market US',
          example: { market: 'US', language: 'English' },
          status: 'passed',
          steps: [{ keyword: 'Given ', name: 'the login screen is open', status: 'passed', dur: '10ms' }],
        },
      ],
    };
    render(
      <TestList
        tests={[grouped]}
        filter="all"
        query=""
        expandScenarioName="Logout label is translated to English after market US"
      />,
    );
    expect(screen.getByText(/market: US/)).toBeInTheDocument();
    expect(screen.getByText(/the login screen is open/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter dashboard test -- components/TestList`
Expected: FAIL — the 2 new tests fail (group renders as a plain single row with an undefined-ish name, no "2 iterations" text, no iteration expansion).

- [ ] **Step 3: Implement the component change**

Replace `apps/dashboard/src/client/components/TestList.tsx` in full:

```tsx
import { useMemo, useState, useEffect } from 'react';

import type { TestCase, TestCaseIteration } from '@shared/types';
import { isTestCaseGroup } from '@shared/types';
import { StepList } from './StepList';
import { FailureScreenshot } from './FailureScreenshot';
import type { TestFilter } from './FilterBar';

interface TestListProps {
  tests: TestCase[];
  filter: TestFilter;
  query: string;
  /** When set, the row whose `name` matches starts expanded in addition to the auto-expanded failed rows. */
  expandScenarioName?: string | null;
}

const keyOf = (t: TestCase, i: number) => `${t.file}:${t.name}:${i}`;
const iterationKeyOf = (groupKey: string, iterIndex: number) => `${groupKey}:${iterIndex}`;

function iterationMatches(iteration: TestCaseIteration, expandScenarioName?: string | null): boolean {
  return !!expandScenarioName && iteration.name === expandScenarioName;
}

export function TestList({ tests, filter, query, expandScenarioName }: TestListProps) {
  const q = query.toLowerCase();
  const filtered = tests
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => {
      if (filter !== 'all' && t.status !== filter) return false;
      if (q && !`${t.name} ${t.suite} ${t.file}`.toLowerCase().includes(q)) return false;
      return true;
    });

  const initial = useMemo(() => {
    const set = new Set<string>();
    tests.forEach((t, i) => {
      const k = keyOf(t, i);
      if (t.status === 'failed') set.add(k);
      if (expandScenarioName && t.name === expandScenarioName) set.add(k);
      if (isTestCaseGroup(t)) {
        t.iterations.forEach((iteration, iterIndex) => {
          if (iteration.status === 'failed' || iterationMatches(iteration, expandScenarioName)) {
            set.add(k); // a failed/deep-linked iteration implies the group row must be open too
            set.add(iterationKeyOf(k, iterIndex));
          }
        });
      }
    });
    return set;
  }, [tests, expandScenarioName]);

  const [expanded, setExpanded] = useState<Set<string>>(initial);

  // Reseed when the test set or the deep-link target changes.
  useEffect(() => { setExpanded(initial); }, [initial]);

  if (!filtered.length) {
    return <div className="empty">No tests match this filter.</div>;
  }

  const toggle = (k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  return (
    <div className="tests">
      {filtered.map(({ t, i }) => {
        const k = keyOf(t, i);
        const isOpen = expanded.has(k);
        return (
          <div className="test-row-group" key={k}>
            <button
              type="button"
              className={`test-row test-row-toggle${isOpen ? ' is-open' : ''}`}
              aria-expanded={isOpen}
              onClick={() => toggle(k)}
            >
              <span className={'icon-dot ' + t.status} />
              <div>
                <div className="name">{t.name}</div>
                <div className="file">{t.file}</div>
              </div>
              <div className="suite">{t.suite}</div>
              <div className="dur">{t.dur}</div>
              <div>
                <span className={'test-status ' + t.status}>{t.status}</span>
                {isTestCaseGroup(t) && (
                  <span className="pill outline-count">{t.iterations.length} iterations</span>
                )}
              </div>
              <span className="chev">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="test-row-body">
                {isTestCaseGroup(t) ? (
                  <div className="outline-iterations">
                    {t.iterations.map((iteration, iterIndex) => {
                      const ik = iterationKeyOf(k, iterIndex);
                      const iterOpen = expanded.has(ik);
                      return (
                        <div className="test-row-group" key={ik}>
                          <button
                            type="button"
                            className={`test-row test-row-toggle iteration-row${iterOpen ? ' is-open' : ''}`}
                            aria-expanded={iterOpen}
                            onClick={() => toggle(ik)}
                          >
                            <span className={'icon-dot ' + iteration.status} />
                            <div>
                              <div className="name">
                                {Object.entries(iteration.example).map(([key, value]) => `${key}: ${value}`).join(' · ')}
                              </div>
                            </div>
                            <div className="dur">{iteration.status}</div>
                            <span className="chev">{iterOpen ? '▾' : '▸'}</span>
                          </button>
                          {iterOpen && (
                            <div className="test-row-body">
                              {iteration.steps && iteration.steps.length > 0
                                ? <StepList steps={iteration.steps} failedStepIndex={iteration.failedStepIndex} />
                                : iteration.error
                                  ? <pre className="failure">{iteration.error}</pre>
                                  : <div className="empty">No step data captured for this run.</div>}
                              {iteration.screenshot && <FailureScreenshot src={iteration.screenshot} />}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    {t.steps && t.steps.length > 0
                      ? <StepList steps={t.steps} failedStepIndex={t.failedStepIndex} />
                      : t.error
                        ? <pre className="failure">{t.error}</pre>
                        : <div className="empty">No step data captured for this run.</div>}
                    {t.screenshot && <FailureScreenshot src={t.screenshot} />}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

Note: this introduces new class names (`outline-count`, `outline-iterations`, `iteration-row`) with no dedicated CSS yet — they inherit reasonable defaults from the existing `.pill`/`.test-row`/`.test-row-toggle` rules. A follow-up visual pass may refine their styling; it is out of scope here since the tests assert on rendered text/structure, not computed styles.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter dashboard test -- components/TestList`
Expected: PASS (7 tests: 5 original + 2 new).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: clean — zero errors (this was the last of the 4 locations documented in Task 1).

- [ ] **Step 6: Run the full dashboard test suite**

Run: `pnpm --filter dashboard test`
Expected: PASS, no regressions anywhere in the suite.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/client/components/TestList.tsx apps/dashboard/test/components/TestList.test.tsx
git commit -m "feat(dashboard): render Scenario Outline groups as one row with N iterations

TestList now renders a TestCaseGroup as a single collapsible row with
an iteration-count badge; expanding it shows one sub-row per iteration
with its example data (market: MX * language: Spanish, ...) and reuses
the existing per-step accordion. expandScenarioName now also matches
against iteration names, auto-expanding both the group and the
matched iteration."
```

---

### Task 6: `TabbedTestDetail.tsx` — deep-link resolver searches iterations

**Files:**
- Modify: `apps/dashboard/src/client/components/TabbedTestDetail.tsx:4` (import), `:282-291` (`GroupedTabbedDetail`'s `deepLink` useMemo)
- Modify: `apps/dashboard/test/components/WebUiDetail.test.tsx` (add 1 new test)

**Interfaces:**
- Consumes: `isTestCaseGroup` from `apps/dashboard/src/shared/types.ts` (Task 1).

This task requires no typecheck-forced fix (the existing `deepLink` code only reads `tc.name`, which exists on both union members) — it is a pure behavior extension so a deep link into a grouped iteration works end-to-end, not a fix for a break.

- [ ] **Step 1: Write the failing test**

Append to `apps/dashboard/test/components/WebUiDetail.test.tsx`, inside `describe('WebUiDetail nested viewport + browser tabs', ...)`, after the existing `it('deep-links via ?expand ...')` test:

```tsx
  it('deep-links into an iteration inside a Scenario Outline group via ?expand', () => {
    const groupedTool: Tool = {
      ...tool,
      viewports: tool.viewports!.map((v) =>
        v.viewport === 'responsive'
          ? {
              ...v,
              browsers: v.browsers.map((b) =>
                b.browser === 'webkit'
                  ? {
                      ...b,
                      tests: [
                        ...b.tests,
                        {
                          kind: 'group',
                          name: 'Logout label is translated to <language> after market <market>',
                          suite: 'Checkout',
                          file: 'checkout.feature',
                          dur: '1.0s',
                          status: 'passed',
                          iterations: [
                            {
                              name: 'Logout label is translated to Spanish after market MX',
                              example: { market: 'MX', language: 'Spanish' },
                              status: 'passed',
                              steps: [{ keyword: 'Given ', name: 'mx preconditions', status: 'passed', dur: '5ms' }],
                            },
                          ],
                        },
                      ],
                    }
                  : b,
              ),
            }
          : v,
      ),
    };
    render(
      <MemoryRouter
        initialEntries={[
          '/runs/r1/playwright?expand=' +
            encodeURIComponent('Logout label is translated to Spanish after market MX'),
        ]}
      >
        <WebUiDetail runId="r1" tool={groupedTool} />
      </MemoryRouter>,
    );
    expect(tabBtn(/WebKit/)).toBeInTheDocument();
    expect(screen.getByText(/market: MX/)).toBeInTheDocument();
    expect(screen.getByText(/mx preconditions/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- components/WebUiDetail`
Expected: FAIL — the responsive/webkit tab is never auto-selected (the deep-link resolver only matches `tc.name`, which is the group's template name, not the iteration's interpolated name).

- [ ] **Step 3: Implement the fix**

In `apps/dashboard/src/client/components/TabbedTestDetail.tsx`, change the import at line 4:

```ts
import type { Counts, TestCase, Tool } from '@shared/types';
```

to:

```ts
import type { Counts, TestCase, Tool } from '@shared/types';
import { isTestCaseGroup } from '@shared/types';
```

Replace the `deepLink` useMemo (lines 282-291):

```ts
  const deepLink = useMemo(() => {
    if (!expandScenarioName) return null;
    for (const g of groups) {
      const tab = g.tabs.find((t) => t.block.tests.some((tc) => tc.name === expandScenarioName));
      if (tab) return { groupId: g.id, tabId: tab.id };
    }
    return null;
    // groups identity is stable per render of the parent; expand only changes on nav.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandScenarioName]);
```

with:

```ts
  const deepLink = useMemo(() => {
    if (!expandScenarioName) return null;
    const matchesTest = (tc: TestCase): boolean =>
      tc.name === expandScenarioName ||
      (isTestCaseGroup(tc) && tc.iterations.some((iteration) => iteration.name === expandScenarioName));
    for (const g of groups) {
      const tab = g.tabs.find((t) => t.block.tests.some(matchesTest));
      if (tab) return { groupId: g.id, tabId: tab.id };
    }
    return null;
    // groups identity is stable per render of the parent; expand only changes on nav.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandScenarioName]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- components/WebUiDetail`
Expected: PASS (7 tests: 6 original + 1 new).

- [ ] **Step 5: Typecheck and full test suite**

Run: `pnpm --filter dashboard typecheck && pnpm --filter dashboard test`
Expected: both clean, zero regressions.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/client/components/TabbedTestDetail.tsx apps/dashboard/test/components/WebUiDetail.test.tsx
git commit -m "feat(dashboard): grouped-tab deep-link resolver matches iteration names

GroupedTabbedDetail's ?expand= resolver now also matches against a
TestCaseGroup's iteration names, so a pixelmatch backlink pointing at
a specific Examples-row iteration still selects the right viewport +
browser tab and auto-expands that iteration."
```

---

### Task 7: `generate-fixtures.ts` — canonical grouped demo fixture

**Files:**
- Modify: `apps/dashboard/scripts/generate-fixtures.ts:73-89` (outline pair → one `TestCaseGroup`)

**Interfaces:**
- Consumes: `TestCaseGroup` type is used implicitly via the existing `TestCase[]`-typed `playwrightTests` array (Task 1) — no new import strictly required beyond what's already imported, since the union covers it.

- [ ] **Step 1: Implement the fixture change**

In `apps/dashboard/scripts/generate-fixtures.ts`, replace lines 73-89 (the two flat outline `TestCase` entries):

```ts
  { name: 'Checkout completes for US/en — Example row 1', suite: 'Checkout', file: 'checkout/outline.spec.ts', dur: '4.2s', status: 'passed',
    steps: [
      { keyword: 'Given ', name: 'a US/en customer',                         status: 'passed', dur: '120ms', location: 'checkout/outline.spec.ts:5' },
      { keyword: 'When ',  name: 'they place a delivery order',              status: 'passed', dur: '3.9s',  location: 'checkout/outline.spec.ts:8' },
      { keyword: 'Then ',  name: 'the order success screen is shown',        status: 'passed', dur: '180ms', location: 'checkout/outline.spec.ts:12' },
    ],
  },
  { name: 'Checkout completes for MX/es — Example row 2', suite: 'Checkout', file: 'checkout/outline.spec.ts', dur: '5.1s', status: 'failed',
    error: 'Expected order ID to match /^OMNI-MX-/',
    steps: [
      { keyword: 'Given ', name: 'a MX/es customer',                         status: 'passed', dur: '150ms', location: 'checkout/outline.spec.ts:5' },
      { keyword: 'When ',  name: 'they place a delivery order',              status: 'failed', dur: '4.9s',  location: 'checkout/outline.spec.ts:8',
        error: 'Expected order ID to match /^OMNI-MX-/' },
      { keyword: 'Then ',  name: 'the order success screen is shown',        status: 'skipped', dur: '0ms' },
    ],
    failedStepIndex: 1,
  },
```

with:

```ts
  { // Canonical demo of Scenario Outline grouping: 2 Examples rows, one fails.
    kind: 'group', name: 'Checkout completes for <market>/<locale> — Example row <row>',
    suite: 'Checkout', file: 'checkout/outline.spec.ts', dur: '9.3s', status: 'failed',
    iterations: [
      {
        name: 'Checkout completes for US/en — Example row 1',
        example: { market: 'US', locale: 'en', row: '1' },
        status: 'passed',
        steps: [
          { keyword: 'Given ', name: 'a US/en customer',                  status: 'passed', dur: '120ms', location: 'checkout/outline.spec.ts:5' },
          { keyword: 'When ',  name: 'they place a delivery order',       status: 'passed', dur: '3.9s',  location: 'checkout/outline.spec.ts:8' },
          { keyword: 'Then ',  name: 'the order success screen is shown', status: 'passed', dur: '180ms', location: 'checkout/outline.spec.ts:12' },
        ],
      },
      { // Name kept byte-for-byte identical to the pixelmatch1.diffs[1].triggeredBy.scenario
        // backlink below -- that coupling is real (independently hand-typed), not derived.
        name: 'Checkout completes for MX/es — Example row 2',
        example: { market: 'MX', locale: 'es', row: '2' },
        status: 'failed',
        error: 'Expected order ID to match /^OMNI-MX-/',
        steps: [
          { keyword: 'Given ', name: 'a MX/es customer',                  status: 'passed', dur: '150ms', location: 'checkout/outline.spec.ts:5' },
          { keyword: 'When ',  name: 'they place a delivery order',       status: 'failed', dur: '4.9s',  location: 'checkout/outline.spec.ts:8',
            error: 'Expected order ID to match /^OMNI-MX-/' },
          { keyword: 'Then ',  name: 'the order success screen is shown', status: 'skipped', dur: '0ms' },
        ],
        failedStepIndex: 1,
      },
    ],
  },
```

Note: `dur: '9.3s'` is the sum of the original two durations (4.2s + 5.1s), matching the ingest-computed convention from Task 3. The `pixelmatch1.diffs[1].triggeredBy.scenario` backlink at (originally) line 299 requires **no text change** — the MX iteration's `name` field is preserved verbatim, so the existing backlink string still resolves correctly once `TestList`'s nested-iteration deep-link matching (Task 5/6) is in place. Confirm this by grep, don't skip verification:

Run: `grep -n "Checkout completes for MX/es" apps/dashboard/scripts/generate-fixtures.ts`
Expected: exactly 2 matches — the iteration `name` field (just edited) and the untouched `triggeredBy.scenario` line — with identical string content.

- [ ] **Step 2: Regenerate fixtures and verify**

Run: `pnpm dashboard:fixtures`
Expected: exits 0, writes 2 demo runs into `reports/`.

Run: `grep -o '"kind":"group"' reports/*/playwright.json`
Expected: at least one match, confirming the grouped fixture round-trips through `JSON.stringify`/file-write correctly.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: clean.

- [ ] **Step 4: Smoke test**

Run: `pnpm --filter dashboard smoke`
Expected: exits 0, no console errors — this exercises the dashboard actually rendering the regenerated fixture data end-to-end (server + client), including the new grouped row.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/scripts/generate-fixtures.ts
git commit -m "feat(dashboard): convert the demo Checkout outline pair into a grouped fixture

Replaces the two flat 'Example row 1/2' TestCase entries with one
TestCaseGroup (2 iterations, one failing) -- the canonical in-dashboard
demo of Scenario Outline grouping. The pixelmatch backlink continues
to resolve unchanged since the failing iteration's name is preserved
verbatim."
```

---

### Task 8: `README.md` documentation updates

**Files:**
- Modify: `apps/dashboard/README.md:136-149`, `:203-215`

- [ ] **Step 1: Update the tool-shape section**

Current (lines 136-143):

```
The canonical `Tool` union is a discriminated type by `kind`. See `src/shared/types.ts` for the full shape. Briefly:

- `web_ui` / `api` → `{ ..., tests: TestCase[] }`
- `mobile_ui` → `{ ..., platforms: { android: PlatformBlock, ios: PlatformBlock } }`
- `performance` → `{ ..., perf: { rps, p95Ms, distribution[], scenarios: PerfScenario[], ... } }`
- `visual` → `{ ..., diffs: [{ baseline, diffPct, status, images: { baseline, actual, diff }, bucketing?, triggeredBy? }] }`

**`TestCase` carries optional `steps?: TestStep[]` and `failedStepIndex?: number`** — when present, the UI expands each scenario into a Given/When/Then accordion and highlights the failed step inline with its `error_message`. Failed scenarios auto-expand on first render. Hooks (`@Before`/`@After`) appear only when they failed. Old report JSON without `steps` keeps rendering as before (the row collapses to the scenario-level error).
```

Replace with:

```
The canonical `Tool` union is a discriminated type by `kind`. See `src/shared/types.ts` for the full shape. Briefly:

- `web_ui` / `api` → `{ ..., tests: TestCase[] }`
- `mobile_ui` → `{ ..., platforms: { android: PlatformBlock, ios: PlatformBlock } }`
- `performance` → `{ ..., perf: { rps, p95Ms, distribution[], scenarios: PerfScenario[], ... } }`
- `visual` → `{ ..., diffs: [{ baseline, diffPct, status, images: { baseline, actual, diff }, bucketing?, triggeredBy? }] }`

**`TestCase` is a discriminated union: `TestCaseSingle | TestCaseGroup`.** A plain cucumber Scenario ingests as `TestCaseSingle` (unchanged shape). A Scenario Outline + Examples table ingests as ONE `TestCaseGroup` (`{ kind: 'group', name: <template with placeholders>, iterations: TestCaseIteration[] }`) — every Examples row becomes one `TestCaseIteration` (`{ name, example: Record<string,string>, status, steps?, ... }`) rather than its own top-level `TestCase`. This means a Scenario Outline counts as 1 toward every KPI/badge that counts `TestCase[]` length, not N. Use `isTestCaseGroup(t)` (exported from `src/shared/types.ts`) to narrow. Old report JSON ingested before this shipped has no `kind` field at all — it's treated as `TestCaseSingle` unchanged, no migration needed.

**`TestCaseSingle`/`TestCaseIteration` carry optional `steps?: TestStep[]` and `failedStepIndex?: number`** — when present, the UI expands each scenario/iteration into a Given/When/Then accordion and highlights the failed step inline with its `error_message`. Failed scenarios/iterations auto-expand on first render. Hooks (`@Before`/`@After`) appear only when they failed. Old report JSON without `steps` keeps rendering as before (the row collapses to the scenario-level error).
```

- [ ] **Step 2: Update the deep-link contract note**

Within the same block, the sentence about `triggeredBy`/`?expand=` (originally around line 147) currently reads:

```
**`VisualDiff.bucketing` and `triggeredBy`** are optional. `bucketing` (`{ feature?, snapshot?, platform?, viewport?, market?, language? }`) drives the chip row under each diff card. `triggeredBy` (`{ feature, scenario, runId? }`) renders a backlink to the originating BDD scenario in the Playwright tab — clicking it opens `/runs/<runId>/playwright?expand=<scenario>` which auto-expands that scenario's accordion via the `?expand=` query param.
```

Replace with:

```
**`VisualDiff.bucketing` and `triggeredBy`** are optional. `bucketing` (`{ feature?, snapshot?, platform?, viewport?, market?, language? }`) drives the chip row under each diff card. `triggeredBy` (`{ feature, scenario, runId? }`) renders a backlink to the originating BDD scenario in the Playwright tab — clicking it opens `/runs/<runId>/playwright?expand=<scenario>` which auto-expands that scenario's accordion via the `?expand=` query param. `<scenario>` matches either a `TestCaseSingle.name` or, inside a `TestCaseGroup`, any of its iterations' `name` — a backlink into one Examples-row iteration auto-expands both the group row and that specific iteration.
```

- [ ] **Step 3: Update the cucumber-JSON-ingest description**

Current (around lines 210-211):

```
   - cucumber JSON → `TestCase[]` + counts (one parser, used by playwright + api + appium).
```

Replace with:

```
   - cucumber JSON → `TestCase[]` + counts (one parser, used by playwright + api + appium). Scenario Outline + Examples rows are grouped into one `TestCaseGroup` per outline, correlated to the `.feature` source by the row's source line (see `scripts/lib/outline-parser.ts`).
```

- [ ] **Step 4: Verify**

Run: `grep -n "TestCaseGroup\|isTestCaseGroup" apps/dashboard/README.md`
Expected: 3+ matches confirming all three edits landed.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/README.md
git commit -m "docs(dashboard): document TestCaseGroup / Scenario Outline grouping"
```

---

### Task 9: Final integration verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: clean, zero errors.

- [ ] **Step 2: Full test suite**

Run: `pnpm --filter dashboard test`
Expected: all tests pass, including every new test added across Tasks 1-6.

- [ ] **Step 3: Regenerate fixtures and smoke test**

Run: `pnpm dashboard:fixtures && pnpm --filter dashboard smoke`
Expected: both exit 0.

- [ ] **Step 4: Manual spot-check against the spec's Definition of Done**

Run: `pnpm --filter dashboard dev` and open the dashboard in a browser. Navigate to the Playwright tool detail for the demo run, find the "Checkout" suite's outline row.

Confirm:
- It renders as ONE row labeled `Checkout completes for <market>/<locale> — Example row <row>` with a "2 iterations" badge, not two separate rows.
- The row's status dot is red (failed), since one iteration failed.
- Expanding it shows 2 iteration sub-rows, each with its `market`/`locale`/`row` data visible.
- The failed iteration's sub-row, when expanded, shows the failed step inline with its error.
- The "Tests Run"/"Tests Executed" KPI total counts this outline as 1, not 2 (cross-check against the tool-level `passed`/`failed`/`skipped` sum shown in the KPI strip vs. the number of rows in the test list).
- Clicking through from a PixelMatch diff card's backlink for the MX/es checkout snapshot lands on this outline's row with the MX iteration auto-expanded.

- [ ] **Step 5: Confirm no unintended file changes**

Run: `git status --short`
Expected: clean (everything from Tasks 1-8 already committed); no stray uncommitted changes.

This task has no commit of its own — it is a verification gate confirming Tasks 1-8 together satisfy the spec's Definition of Done.
