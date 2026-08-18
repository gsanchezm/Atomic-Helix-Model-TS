# Performance Test-Type Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 fixed performance test-type tabs (Load/Stress/Endurance/Spike/Scalability/Volume) to the Gatling detail view in the AHM dashboard, each showing real Gatling metrics plus an honest "not yet available" panel for metrics this phase can't produce.

**Architecture:** Extend the shared `PerformanceTool`/`PerfBlock` types with a `byType` breakdown; classify each ingested Gatling simulation by name-suffix in `ingest-gatling.ts`; render a new `PerfTypeTabs` strip in `PerformanceDetail.tsx` that switches which type's `PerfBlock` feeds the existing gauge/distribution/simulation-list UI, driven by a pure `PERF_TYPE_META` config table.

**Tech Stack:** React 18 + TypeScript + Vite (client), Node/tsx scripts (ingest), Vitest + React Testing Library (tests) — all within `apps/dashboard/`.

Spec: `docs/superpowers/specs/2026-07-19-performance-test-type-tabs-design.md`

## Global Constraints

- Dashboard/visualization only — no changes to `src/plugins/gatling/**` or any `*.gatling.ts` execution file.
- No server-side metrics data, real or mocked. Anything without a real source today (CPU/RAM, thread pools, auto-scaling, etc.) renders in `PendingMetricsPanel`, never as a number.
- UI copy is English, matching 100% of existing dashboard copy.
- Known, documented limitation (see spec §1/§3): every existing perf script reuses one `<feature>-load.gatling.ts` file across `smoke`/`load`/`stress` via `PERF_PROFILE`, and Gatling's report is always named after the `--simulation` id, never the profile — so on today's data, stress/smoke runs of e.g. `checkout-load` land in the Load tab alongside real load runs. Do not attempt to work around this by touching execution-side code; it resolves naturally once per-type simulation files exist.
- Client imports use the `@shared/*` alias (`vite.config.ts`/`vitest.config.ts` both map it to `src/shared`); `scripts/*.ts` (ingest/fixtures) use relative `../src/shared/...js` imports (ESM, `.js` extension required) — follow whichever convention the file you're editing already uses.
- Tests: Vitest (`describe`/`it`/`expect`/`vi` from `'vitest'`), React Testing Library (`render`/`screen` from `'@testing-library/react'`) for components. Mirror existing fixture-builder helper patterns in each test file rather than inventing new ones.
- `PerfBlock` gains two new **required** fields (`p75Ms`, `maxMs`) in Task 1. Every literal `PerfBlock`/`PerformanceTool` construction site in the repo must be updated by the end of the task that touches it — Task 1 fixes the "missing tool" placeholder, Task 2 fixes the adapter test fixture, Task 8 fixes the dev fixtures. Do not leave the repo in a non-compiling state between commits.
- Run all commands from the repo root using `pnpm --filter dashboard <script>` unless a step says otherwise.

---

### Task 1: Shared performance types + missing-tool placeholder

**Files:**
- Create: `apps/dashboard/src/shared/perf-types.ts`
- Modify: `apps/dashboard/src/shared/types.ts`
- Modify: `apps/dashboard/src/server/normalize/index.ts`
- Test: `apps/dashboard/test/adapters/missing-tool.test.ts`

**Interfaces:**
- Produces: `PerfTestType` (union of 6 literals), `PERF_TEST_TYPES: readonly PerfTestType[]` (fixed order: load, stress, endurance, spike, scalability, volume) — both from `@shared/perf-types`.
- Produces: `PerfBlock` extended with `p75Ms: number` and `maxMs: number`.
- Produces: `PerfTypeBlock { type: PerfTestType; perf: PerfBlock | null }` — from `@shared/types`.
- Produces: `PerformanceTool` extended with `byType: PerfTypeBlock[]` (always 6 entries) and `unclassified?: PerfBlock`.
- Produces: `makeMissingTool('gatling' or any performance-kind id)` now returns a `PerformanceTool` whose `byType` has 6 entries (one per `PERF_TEST_TYPES` member, `perf: null`) and whose `perf.p75Ms`/`perf.maxMs` are `0`.

- [ ] **Step 1: Write the failing test for `makeMissingTool`**

Create `apps/dashboard/test/adapters/missing-tool.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

import { makeMissingTool } from '../../src/server/normalize/index';
import { PERF_TEST_TYPES } from '../../src/shared/perf-types';

describe('makeMissingTool', () => {
  it('produces a performance placeholder with a null-perf entry for every PerfTestType', () => {
    const tool = makeMissingTool('gatling');
    if (tool.kind !== 'performance') throw new Error('expected performance kind');
    expect(tool.missing).toBe(true);
    expect(tool.byType).toHaveLength(PERF_TEST_TYPES.length);
    expect(tool.byType.map((b) => b.type)).toEqual(PERF_TEST_TYPES);
    expect(tool.byType.every((b) => b.perf === null)).toBe(true);
    expect(tool.perf.p75Ms).toBe(0);
    expect(tool.perf.maxMs).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- test/adapters/missing-tool.test.ts`
Expected: FAIL — `apps/dashboard/src/shared/perf-types` doesn't exist yet (module not found), or once that's created, FAIL because `tool.byType` is `undefined`.

- [ ] **Step 3: Create `perf-types.ts`**

Create `apps/dashboard/src/shared/perf-types.ts`:

```ts
export type PerfTestType =
  | 'load'
  | 'stress'
  | 'endurance'
  | 'spike'
  | 'scalability'
  | 'volume';

export const PERF_TEST_TYPES: readonly PerfTestType[] = [
  'load',
  'stress',
  'endurance',
  'spike',
  'scalability',
  'volume',
] as const;
```

- [ ] **Step 4: Extend `types.ts`**

In `apps/dashboard/src/shared/types.ts`, change the top import (line 1) from:

```ts
import type { ToolKind } from './kinds.js';
```

to:

```ts
import type { ToolKind } from './kinds.js';
import type { PerfTestType } from './perf-types.js';
```

Then replace the existing `PerfBlock`/`PerformanceTool` block (currently):

```ts
export interface PerfBlock {
  rps: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  requests: number;
  maxRps: number;
  distribution: PerfDistributionBucket[];
  scenarios: PerfScenario[];
}

export interface PerformanceTool extends BaseTool {
  kind: 'performance';
  perf: PerfBlock;
}
```

with:

```ts
export interface PerfBlock {
  rps: number;
  avgMs: number;
  p75Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  errorRate: number;
  requests: number;
  maxRps: number;
  distribution: PerfDistributionBucket[];
  scenarios: PerfScenario[];
}

export interface PerfTypeBlock {
  type: PerfTestType;
  perf: PerfBlock | null;
}

export interface PerformanceTool extends BaseTool {
  kind: 'performance';
  perf: PerfBlock;
  byType: PerfTypeBlock[];
  unclassified?: PerfBlock;
}
```

(`PerfDistributionBucket`, `PerfStep`, `PerfScenario` immediately above are unchanged — leave them as-is.)

- [ ] **Step 5: Update the "missing tool" performance factory**

In `apps/dashboard/src/server/normalize/index.ts`, add an import (after the existing `import type { ToolKind } ...` line):

```ts
import { PERF_TEST_TYPES } from '../../shared/perf-types.js';
```

Then replace the `performance` factory inside `makeMissingTool`'s `factories` object (currently):

```ts
    performance: () => ({
      ...base,
      kind: 'performance',
      perf: { rps: 0, avgMs: 0, p95Ms: 0, p99Ms: 0, errorRate: 0, requests: 0, maxRps: 0, distribution: [], scenarios: [] },
    }),
```

with:

```ts
    performance: () => ({
      ...base,
      kind: 'performance',
      perf: {
        rps: 0, avgMs: 0, p75Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0,
        errorRate: 0, requests: 0, maxRps: 0, distribution: [], scenarios: [],
      },
      byType: PERF_TEST_TYPES.map((type) => ({ type, perf: null })),
    }),
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- test/adapters/missing-tool.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/shared/perf-types.ts apps/dashboard/src/shared/types.ts apps/dashboard/src/server/normalize/index.ts apps/dashboard/test/adapters/missing-tool.test.ts
git commit -m "feat(dashboard): add PerfTestType + byType breakdown to PerformanceTool"
```

---

### Task 2: Ingest classification + per-type roll-up

**Files:**
- Modify: `apps/dashboard/scripts/ingest-gatling.ts`
- Modify: `apps/dashboard/test/ingest/gatling.test.ts`
- Modify: `apps/dashboard/test/adapters/gatling.test.ts`

**Interfaces:**
- Consumes: `PerfTestType`, `PERF_TEST_TYPES` (Task 1, `@shared/perf-types` — note this script uses relative imports: `../src/shared/perf-types.js`), `PerfBlock`, `PerfTypeBlock`, `PerformanceTool` (Task 1, `../src/shared/types.js`).
- Produces: `classifyPerfType(simulationName: string): PerfTestType | 'other'` (exported).
- Produces: `rollUpReports(reports: SimulationReport[]): PerfBlock` (exported) — same math `ingestGatling()` used inline before, now reusable per-type.
- Produces: `ingestGatling()` return value now includes `byType: PerfTypeBlock[]` (6 entries, `PERF_TEST_TYPES` order) and `unclassified?: PerfBlock` (only when non-empty).
- `buildPerfScenarios`, `SimulationReport`, `RowValues` (already exported) — unchanged, still used internally by `rollUpReports`.

- [ ] **Step 1: Write the failing tests for `classifyPerfType` and `rollUpReports`**

In `apps/dashboard/test/ingest/gatling.test.ts`, change the import line from:

```ts
import { buildPerfScenarios, type SimulationReport } from '../../scripts/ingest-gatling';
```

to:

```ts
import { buildPerfScenarios, classifyPerfType, rollUpReports, type SimulationReport } from '../../scripts/ingest-gatling';
```

Then append these two `describe` blocks after the existing `describe('buildPerfScenarios', ...)` block:

```ts
describe('classifyPerfType', () => {
  it.each([
    ['checkout-load', 'load'],
    ['checkout-stress', 'stress'],
    ['profile-endurance', 'endurance'],
    ['catalog-spike', 'spike'],
    ['checkout-scalability', 'scalability'],
    ['order-volume', 'volume'],
    ['CHECKOUT-LOAD', 'load'],
  ])('classifies "%s" as %s', (name, expected) => {
    expect(classifyPerfType(name)).toBe(expected);
  });

  it('returns "other" for names with no recognized suffix', () => {
    expect(classifyPerfType('checkout-smoke')).toBe('other');
    expect(classifyPerfType('checkout')).toBe('other');
  });
});

describe('rollUpReports', () => {
  it('computes request-weighted percentiles including the new p75Ms/maxMs fields', () => {
    const reports = [
      sim('checkout-load',
          { 'col-2': 100, 'col-3': 99, 'col-4': 1, 'col-5': 1, 'col-6': 50, 'col-8': 120, 'col-9': 180, 'col-10': 250, 'col-11': 400, 'col-12': 900, 'col-13': 130 },
          {}),
    ];
    const out = rollUpReports(reports);
    expect(out).toMatchObject({
      rps: 50,
      avgMs: 130,
      p75Ms: 180,
      p95Ms: 250,
      p99Ms: 400,
      maxMs: 900,
      errorRate: 1,
      requests: 100,
    });
  });

  it('weights percentiles by request count across multiple simulations', () => {
    const reports = [
      sim('checkout-load', { 'col-2': 100, 'col-3': 100, 'col-4': 0, 'col-6': 40, 'col-8': 100, 'col-9': 150, 'col-10': 200, 'col-11': 300, 'col-12': 500, 'col-13': 110 }, {}),
      sim('catalog-load',  { 'col-2': 300, 'col-3': 300, 'col-4': 0, 'col-6': 60, 'col-8': 100, 'col-9': 150, 'col-10': 400, 'col-11': 600, 'col-12': 900, 'col-13': 150 }, {}),
    ];
    const out = rollUpReports(reports);
    // p95: (200*100 + 400*300) / 400 = 350
    expect(out.p95Ms).toBe(350);
    expect(out.requests).toBe(400);
    expect(out.rps).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter dashboard test -- test/ingest/gatling.test.ts`
Expected: FAIL — `classifyPerfType`/`rollUpReports` are not exported from `ingest-gatling.ts` yet.

- [ ] **Step 3: Refactor `ingest-gatling.ts`**

In `apps/dashboard/scripts/ingest-gatling.ts`, change the top imports from:

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  PerfBlock,
  PerfDistributionBucket,
  PerfScenario,
  PerfStep,
  PerformanceTool,
} from '../src/shared/types.js';
```

to:

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { PERF_TEST_TYPES, type PerfTestType } from '../src/shared/perf-types.js';
import type {
  PerfBlock,
  PerfDistributionBucket,
  PerfScenario,
  PerfStep,
  PerfTypeBlock,
  PerformanceTool,
} from '../src/shared/types.js';
```

Then replace the entire `ingestGatling()` function (currently lines 244–324) with these three pieces — `classifyPerfType`, `rollUpReports`, and the new `ingestGatling`:

```ts
const PERF_TYPE_SUFFIX_RE = /-(load|stress|endurance|spike|scalability|volume)$/i;

/** Classifies a Gatling simulation name by its trailing `-<type>` suffix. */
export function classifyPerfType(simulationName: string): PerfTestType | 'other' {
  const match = PERF_TYPE_SUFFIX_RE.exec(simulationName);
  return match ? (match[1].toLowerCase() as PerfTestType) : 'other';
}

/**
 * Rolls up one or more simulation reports into a single PerfBlock —
 * request-weighted percentile blend (see file header comment), summed
 * counts/throughput. `reports` must be non-empty.
 */
export function rollUpReports(reports: SimulationReport[]): PerfBlock {
  let total = 0;
  let ok = 0;
  let ko = 0;
  let rpsSum = 0;
  let p50w = 0;
  let p75w = 0;
  let p95w = 0;
  let p99w = 0;
  let maxw = 0;
  let meanw = 0;

  for (const report of reports) {
    const rTotal = report.root.values['col-2'] ?? 0;
    total += rTotal;
    ok += report.root.values['col-3'] ?? 0;
    ko += report.root.values['col-4'] ?? 0;
    rpsSum += report.root.values['col-6'] ?? 0;

    const w = rTotal > 0 ? rTotal : 1;
    p50w  += (report.root.values['col-8']  ?? 0) * w;
    p75w  += (report.root.values['col-9']  ?? 0) * w;
    p95w  += (report.root.values['col-10'] ?? 0) * w;
    p99w  += (report.root.values['col-11'] ?? 0) * w;
    maxw  += (report.root.values['col-12'] ?? 0) * w;
    meanw += (report.root.values['col-13'] ?? 0) * w;
  }

  const scenarios = buildPerfScenarios(reports);

  const weight = total > 0 ? total : reports.length;
  const meanMs = +(meanw / weight).toFixed(1);
  const p50Ms  = +(p50w  / weight).toFixed(0);
  const p75Ms  = +(p75w  / weight).toFixed(0);
  const p95Ms  = +(p95w  / weight).toFixed(0);
  const p99Ms  = +(p99w  / weight).toFixed(0);
  const maxMs  = +(maxw  / weight).toFixed(0);
  const errorRate = total > 0 ? +((ko / total) * 100).toFixed(2) : 0;
  const rps = +rpsSum.toFixed(1);

  const distribution = deriveDistribution(total, p50Ms, p95Ms, p99Ms);
  const maxRps = Math.max(rps, Math.round(rps * 1.4) || 1);

  return {
    rps,
    avgMs: meanMs,
    p75Ms,
    p95Ms,
    p99Ms,
    maxMs,
    errorRate,
    requests: total,
    maxRps,
    distribution,
    scenarios,
  };
}

export async function ingestGatling(opts: IngestGatlingOptions): Promise<PerformanceTool | null> {
  const reports = await discoverReports(opts.repoRoot, opts.simulationDir);
  if (reports.length === 0) return null;

  const perf = rollUpReports(reports);

  const byTypeGroups = new Map<PerfTestType | 'other', SimulationReport[]>();
  for (const report of reports) {
    const type = classifyPerfType(report.simulation);
    const list = byTypeGroups.get(type) ?? [];
    list.push(report);
    byTypeGroups.set(type, list);
  }

  const byType: PerfTypeBlock[] = PERF_TEST_TYPES.map((type) => {
    const group = byTypeGroups.get(type);
    return { type, perf: group && group.length > 0 ? rollUpReports(group) : null };
  });

  const otherGroup = byTypeGroups.get('other');
  const unclassified = otherGroup && otherGroup.length > 0 ? rollUpReports(otherGroup) : undefined;

  // "passed/failed": one per step row across all simulations. A step is
  // "failed" when its error rate > 0.
  let passed = 0;
  let failed = 0;
  for (const s of perf.scenarios) {
    for (const step of s.steps ?? []) {
      if (step.errors === 0) passed++; else failed++;
    }
  }

  const total = reports.reduce((sum, r) => sum + (r.root.values['col-2'] ?? 0), 0);
  const ok = reports.reduce((sum, r) => sum + (r.root.values['col-3'] ?? 0), 0);
  const ko = reports.reduce((sum, r) => sum + (r.root.values['col-4'] ?? 0), 0);
  const simNames = reports.map((r) => r.simulation);
  const description =
    `Aggregated load test across ${reports.length} simulation${reports.length > 1 ? 's' : ''}` +
    ` (${simNames.join(', ')}). Stats parsed from index.html. ${ok}/${total} OK · ${ko} KO.`;

  return {
    kind: 'performance',
    id: 'gatling',
    name: 'Gatling',
    description,
    passed,
    failed,
    skipped: 0,
    duration: durationFromRps(perf.requests, perf.rps),
    perf,
    byType,
    ...(unclassified ? { unclassified } : {}),
  };
}
```

`buildPerfScenarios` and `durationFromRps` (below `ingestGatling` in the file) are unchanged — leave them as-is. `deriveDistribution`, `findGatlingDirs`, `loadReport`, `discoverReports`, `readSimulationName`, `extractRows`, `parseNumber` (above) are also unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter dashboard test -- test/ingest/gatling.test.ts`
Expected: PASS (all 6 tests: 2 original `buildPerfScenarios` + 7 `classifyPerfType` + 2 `rollUpReports`)

- [ ] **Step 5: Update the adapter pass-through test fixture**

In `apps/dashboard/test/adapters/gatling.test.ts`, replace the `fixture` object's `perf` block and add a `byType` field — full replacement:

```ts
import { describe, it, expect } from 'vitest';

import { gatlingAdapter } from '../../src/server/normalize/gatling';
import type { PerformanceTool } from '../../src/shared/types';
import { ctx } from './_helpers';

describe('gatlingAdapter', () => {
  const fixture: Omit<PerformanceTool, 'kind'> = {
    id: 'gatling',
    name: 'Gatling',
    description: 'Perf.',
    passed: 10,
    failed: 0,
    skipped: 0,
    duration: '5m',
    perf: {
      rps: 100, avgMs: 50, p75Ms: 140, p95Ms: 200, p99Ms: 400, maxMs: 900,
      errorRate: 0.1, requests: 5000, maxRps: 200,
      distribution: [{ label: '< 100 ms', pct: 80, count: 4000 }],
      scenarios: [
        {
          name: 'checkout-load',
          rps: 60,
          p95: 90,
          errors: 0.05,
          steps: [{ name: 'home', rps: 30, p95: 80, errors: 0 }],
        },
      ],
    },
    byType: [
      { type: 'load', perf: null },
      { type: 'stress', perf: null },
      { type: 'endurance', perf: null },
      { type: 'spike', perf: null },
      { type: 'scalability', perf: null },
      { type: 'volume', perf: null },
    ],
  };

  it('produces a performance tool with perf block intact', () => {
    const out = gatlingAdapter(fixture, ctx());
    expect(out.kind).toBe('performance');
    expect(out.perf.distribution).toHaveLength(1);
    expect(out.perf.scenarios[0].name).toBe('checkout-load');
    expect(out.perf.scenarios[0].steps).toHaveLength(1);
    expect(out.perf.scenarios[0].steps?.[0].name).toBe('home');
  });

  it('forwards byType and the new PerfBlock fields unchanged (pass-through adapter)', () => {
    const out = gatlingAdapter(fixture, ctx());
    expect(out.perf.p75Ms).toBe(140);
    expect(out.perf.maxMs).toBe(900);
    expect(out.byType).toEqual(fixture.byType);
  });
});
```

- [ ] **Step 6: Run the full ingest + adapter test files**

Run: `pnpm --filter dashboard test -- test/ingest/gatling.test.ts test/adapters/gatling.test.ts test/adapters/missing-tool.test.ts`
Expected: PASS (no adapter code changes needed — `gatlingAdapter` already spreads `data` verbatim, confirmed in Task 2 step 5's assertions)

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/scripts/ingest-gatling.ts apps/dashboard/test/ingest/gatling.test.ts apps/dashboard/test/adapters/gatling.test.ts
git commit -m "feat(dashboard): classify Gatling simulations by test type in ingest"
```

---

### Task 3: `PERF_TYPE_META` + field gauge config (client data)

**Files:**
- Create: `apps/dashboard/src/client/perf-type-meta.ts`
- Test: `apps/dashboard/test/perf-type-meta.test.ts`

**Interfaces:**
- Consumes: `PerfTestType`, `PERF_TEST_TYPES` (Task 1, `@shared/perf-types`), `PerfBlock` (Task 1, `@shared/types`).
- Produces: `PendingMetric { label: string; reason: string }`.
- Produces: `PerfGaugeRef { label: string; field: keyof PerfBlock }`.
- Produces: `PerfTypeMeta { label: string; description: string; gauges: PerfGaugeRef[]; pending: PendingMetric[] }`.
- Produces: `PERF_TYPE_META: Record<PerfTestType, PerfTypeMeta>`.
- Produces: `FieldGaugeConfig { kind: 'gauge' | 'stat'; unit: string; invert?: boolean; max?: number; maxField?: 'maxRps'; thresholdGood?: number; thresholdBad?: number; thresholdGoodFactor?: number; thresholdBadFactor?: number }`.
- Produces: `FIELD_GAUGE_CONFIG: Partial<Record<keyof PerfBlock, FieldGaugeConfig>>` — one entry per field ever referenced by a `PerfTypeMeta.gauges` list (`rps`, `avgMs`, `p95Ms`, `p99Ms`, `maxMs`, `errorRate`, `requests`).

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/test/perf-type-meta.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

import { FIELD_GAUGE_CONFIG, PERF_TYPE_META } from '../src/client/perf-type-meta';
import { PERF_TEST_TYPES } from '../src/shared/perf-types';

describe('PERF_TYPE_META', () => {
  it('has a non-empty label, description, and at least one gauge for every PerfTestType', () => {
    for (const type of PERF_TEST_TYPES) {
      const meta = PERF_TYPE_META[type];
      expect(meta).toBeDefined();
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect(meta.gauges.length).toBeGreaterThan(0);
    }
  });

  it('flags Stress with a breaking-point pending metric', () => {
    expect(PERF_TYPE_META.stress.pending.some((p) => p.label.includes('Breaking point'))).toBe(true);
  });

  it('Load has no pending metrics (everything it needs is in a Gatling summary)', () => {
    expect(PERF_TYPE_META.load.pending).toHaveLength(0);
  });

  it('every gauge field referenced by any PerfTypeMeta has a FIELD_GAUGE_CONFIG entry', () => {
    for (const type of PERF_TEST_TYPES) {
      for (const gauge of PERF_TYPE_META[type].gauges) {
        expect(FIELD_GAUGE_CONFIG[gauge.field]).toBeDefined();
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- test/perf-type-meta.test.ts`
Expected: FAIL — module `../src/client/perf-type-meta` doesn't exist yet.

- [ ] **Step 3: Create `perf-type-meta.ts`**

Create `apps/dashboard/src/client/perf-type-meta.ts`:

```ts
import type { PerfTestType } from '@shared/perf-types';
import type { PerfBlock } from '@shared/types';

export interface PendingMetric {
  label: string;
  reason: string;
}

export interface PerfGaugeRef {
  label: string;
  field: keyof PerfBlock;
}

export interface PerfTypeMeta {
  label: string;
  description: string;
  gauges: PerfGaugeRef[];
  pending: PendingMetric[];
}

export interface FieldGaugeConfig {
  kind: 'gauge' | 'stat';
  unit: string;
  invert?: boolean;
  max?: number;
  maxField?: 'maxRps';
  thresholdGood?: number;
  thresholdBad?: number;
  thresholdGoodFactor?: number;
  thresholdBadFactor?: number;
}

/**
 * How to render each PerfBlock field as a gauge tile — shared across every
 * tab that references the field, so bounds/thresholds don't drift per type.
 */
export const FIELD_GAUGE_CONFIG: Partial<Record<keyof PerfBlock, FieldGaugeConfig>> = {
  rps:       { kind: 'gauge', unit: 'req/s', maxField: 'maxRps', thresholdGoodFactor: 0.4, thresholdBadFactor: 0.7 },
  avgMs:     { kind: 'gauge', unit: 'ms', invert: true, max: 1000, thresholdGood: 200, thresholdBad: 500 },
  p95Ms:     { kind: 'gauge', unit: 'ms', invert: true, max: 1500, thresholdGood: 400, thresholdBad: 800 },
  p99Ms:     { kind: 'gauge', unit: 'ms', invert: true, max: 2000, thresholdGood: 500, thresholdBad: 1000 },
  maxMs:     { kind: 'gauge', unit: 'ms', invert: true, max: 3000, thresholdGood: 800, thresholdBad: 1600 },
  errorRate: { kind: 'gauge', unit: '% of requests', invert: true, max: 5, thresholdGood: 0.5, thresholdBad: 1.5 },
  requests:  { kind: 'stat', unit: 'requests' },
};

export const PERF_TYPE_META: Record<PerfTestType, PerfTypeMeta> = {
  load: {
    label: 'Load',
    description: 'Expected, steady traffic.',
    gauges: [
      { label: 'Throughput', field: 'rps' },
      { label: 'Avg response', field: 'avgMs' },
      { label: 'P95 latency', field: 'p95Ms' },
      { label: 'Error rate', field: 'errorRate' },
    ],
    pending: [],
  },
  stress: {
    label: 'Stress',
    description: 'Pushed past normal capacity to find the breaking point.',
    gauges: [
      { label: 'Throughput', field: 'rps' },
      { label: 'Error rate (KO)', field: 'errorRate' },
      { label: 'P99 latency', field: 'p99Ms' },
      { label: 'Max latency', field: 'maxMs' },
    ],
    pending: [
      { label: 'Breaking point (max sustainable RPS)', reason: 'needs per-request time-series, not just a run summary' },
      { label: 'Recovery time', reason: 'needs per-request time-series, not just a run summary' },
    ],
  },
  endurance: {
    label: 'Endurance',
    description: 'Sustained load over a long duration (soak).',
    gauges: [
      { label: 'Total requests', field: 'requests' },
      { label: 'Avg response', field: 'avgMs' },
      { label: 'P95 latency', field: 'p95Ms' },
      { label: 'Error rate', field: 'errorRate' },
    ],
    pending: [
      { label: 'Degradation trend over time', reason: 'needs per-request time-series, not just a run summary' },
      { label: 'Memory leaks', reason: 'no server-side metrics source connected' },
      { label: 'Storage saturation', reason: 'no server-side metrics source connected' },
    ],
  },
  spike: {
    label: 'Spike',
    description: 'A sudden, short-lived surge in traffic.',
    gauges: [
      { label: 'Max latency', field: 'maxMs' },
      { label: 'Error rate', field: 'errorRate' },
      { label: 'P99 latency', field: 'p99Ms' },
      { label: 'Throughput', field: 'rps' },
    ],
    pending: [
      { label: 'Auto-scaling reaction time', reason: 'no server-side metrics source connected' },
      { label: 'Network bandwidth saturation', reason: 'no server-side metrics source connected' },
    ],
  },
  scalability: {
    label: 'Scalability',
    description: 'Efficiency gained from adding resources.',
    gauges: [
      { label: 'Throughput', field: 'rps' },
      { label: 'Error rate', field: 'errorRate' },
      { label: 'P95 latency', field: 'p95Ms' },
    ],
    pending: [
      { label: 'RPS gained per added node', reason: 'needs comparing multiple runs at different node counts' },
      { label: 'Load balancer distribution', reason: 'no server-side metrics source connected' },
      { label: 'Cost per instance', reason: 'no server-side metrics source connected' },
    ],
  },
  volume: {
    label: 'Volume',
    description: 'Large datasets and payloads.',
    gauges: [
      { label: 'Total requests', field: 'requests' },
      { label: 'Avg response', field: 'avgMs' },
      { label: 'P95 latency', field: 'p95Ms' },
      { label: 'Error rate', field: 'errorRate' },
    ],
    pending: [
      { label: 'Large-payload load', reason: "Gatling's summary report has no payload/body size" },
      { label: 'Disk IOPS', reason: 'no server-side metrics source connected' },
      { label: 'Query locks', reason: 'no server-side metrics source connected' },
      { label: 'Cache hit ratio', reason: 'no server-side metrics source connected' },
    ],
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- test/perf-type-meta.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/client/perf-type-meta.ts apps/dashboard/test/perf-type-meta.test.ts
git commit -m "feat(dashboard): add per-test-type gauge/pending-metric config"
```

---

### Task 4: `PerfTypeIcon` component

**Files:**
- Create: `apps/dashboard/src/client/components/PerfTypeIcon.tsx`
- Test: `apps/dashboard/test/components/PerfTypeIcon.test.tsx`

**Interfaces:**
- Consumes: `PerfTestType` (Task 1, `@shared/perf-types`).
- Produces: `PerfTypeIcon({ type }: { type: PerfTestType })` — a 20×20 inline SVG, no props beyond `type`.

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/test/components/PerfTypeIcon.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { PerfTypeIcon } from '../../src/client/components/PerfTypeIcon';
import { PERF_TEST_TYPES } from '../../src/shared/perf-types';

describe('PerfTypeIcon', () => {
  it('renders an svg for every PerfTestType', () => {
    for (const type of PERF_TEST_TYPES) {
      const { container } = render(<PerfTypeIcon type={type} />);
      expect(container.querySelector('svg')).not.toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- test/components/PerfTypeIcon.test.tsx`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Create `PerfTypeIcon.tsx`**

Create `apps/dashboard/src/client/components/PerfTypeIcon.tsx`:

```tsx
import type { PerfTestType } from '@shared/perf-types';

interface PerfTypeIconProps {
  type: PerfTestType;
}

const COMMON_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function LoadIcon() {
  return (
    <svg {...COMMON_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12 L16 8" />
      <path d="M8 12a4 4 0 0 1 4-4" strokeOpacity="0.4" />
    </svg>
  );
}

function StressIcon() {
  return (
    <svg {...COMMON_PROPS} aria-hidden="true">
      <path d="M12 3c-1.5 3-5 5-5 9a5 5 0 0 0 10 0c0-1.7-.8-2.7-1.5-3.6.1 1.3-.6 2-1.3 2 .6-2.4-.7-4.9-2.2-7.4Z" />
    </svg>
  );
}

function EnduranceIcon() {
  return (
    <svg {...COMMON_PROPS} aria-hidden="true">
      <path d="M7 3h10M7 21h10" />
      <path d="M7 3c0 4 3 5 5 6-2 1-5 2-5 6h10c0-4-3-5-5-6 2-1 5-2 5-6H7Z" />
    </svg>
  );
}

function SpikeIcon() {
  return (
    <svg {...COMMON_PROPS} aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}

function ScalabilityIcon() {
  return (
    <svg {...COMMON_PROPS} aria-hidden="true">
      <path d="M4 20h16" />
      <rect x="5" y="14" width="3" height="6" />
      <rect x="10.5" y="10" width="3" height="10" />
      <rect x="16" y="5" width="3" height="15" />
      <path d="M5 9l5-4 4 3 6-6" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg {...COMMON_PROPS} aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

export function PerfTypeIcon({ type }: PerfTypeIconProps) {
  switch (type) {
    case 'load': return <LoadIcon />;
    case 'stress': return <StressIcon />;
    case 'endurance': return <EnduranceIcon />;
    case 'spike': return <SpikeIcon />;
    case 'scalability': return <ScalabilityIcon />;
    case 'volume': return <VolumeIcon />;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- test/components/PerfTypeIcon.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/client/components/PerfTypeIcon.tsx apps/dashboard/test/components/PerfTypeIcon.test.tsx
git commit -m "feat(dashboard): add hand-rolled SVG icon per performance test type"
```

---

### Task 5: `PendingMetricsPanel` component

**Files:**
- Create: `apps/dashboard/src/client/components/PendingMetricsPanel.tsx`
- Modify: `apps/dashboard/src/client/styles/styles.css`
- Test: `apps/dashboard/test/components/PendingMetricsPanel.test.tsx`

**Interfaces:**
- Consumes: `PendingMetric` (Task 3, `../perf-type-meta`).
- Produces: `PendingMetricsPanel({ items }: { items: PendingMetric[] })` — renders `null` when `items` is empty, otherwise one row per item.

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/test/components/PendingMetricsPanel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PendingMetricsPanel } from '../../src/client/components/PendingMetricsPanel';

describe('PendingMetricsPanel', () => {
  it('renders one row per item with label and reason', () => {
    render(
      <PendingMetricsPanel
        items={[
          { label: 'Breaking point', reason: 'needs time-series' },
          { label: 'Recovery time', reason: 'needs time-series' },
        ]}
      />,
    );
    expect(screen.getByText('Breaking point')).toBeInTheDocument();
    expect(screen.getAllByText('needs time-series')).toHaveLength(2);
  });

  it('renders nothing when items is empty', () => {
    const { container } = render(<PendingMetricsPanel items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- test/components/PendingMetricsPanel.test.tsx`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Create `PendingMetricsPanel.tsx`**

Create `apps/dashboard/src/client/components/PendingMetricsPanel.tsx`:

```tsx
import type { PendingMetric } from '../perf-type-meta';

interface PendingMetricsPanelProps {
  items: PendingMetric[];
}

export function PendingMetricsPanel({ items }: PendingMetricsPanelProps) {
  if (items.length === 0) return null;
  return (
    <div className="pending-metrics">
      <div className="pending-metrics-title">Not yet available</div>
      {items.map((item) => (
        <div className="pending-metric-row" key={item.label}>
          <span className="pending-metric-label">{item.label}</span>
          <span className="pending-metric-reason">{item.reason}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Add CSS**

In `apps/dashboard/src/client/styles/styles.css`, append after the `.sim-step-bad{...}` line (end of the "Simulation accordion cards" block):

```css
/* Pending performance metrics */
.pending-metrics { margin-top: 14px; }
.pending-metrics-title { font-size: 11px; color: var(--text-mute); text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 8px; }
.pending-metric-row { display: flex; justify-content: space-between; gap: 14px; padding: 8px 0; border-bottom: 1px dashed var(--line-soft); font-size: 12.5px; }
.pending-metric-row:last-child { border-bottom: none; }
.pending-metric-label { color: var(--text-mute); }
.pending-metric-reason { font-family: var(--mono); font-size: 11.5px; color: var(--text-dim); text-align: right; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- test/components/PendingMetricsPanel.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/client/components/PendingMetricsPanel.tsx apps/dashboard/src/client/styles/styles.css apps/dashboard/test/components/PendingMetricsPanel.test.tsx
git commit -m "feat(dashboard): add PendingMetricsPanel for not-yet-available metrics"
```

---

### Task 6: `PerfTypeTabs` component

**Files:**
- Create: `apps/dashboard/src/client/components/PerfTypeTabs.tsx`
- Modify: `apps/dashboard/src/client/styles/styles.css`
- Test: `apps/dashboard/test/components/PerfTypeTabs.test.tsx`

**Interfaces:**
- Consumes: `PerfTestType`, `PERF_TEST_TYPES` (Task 1), `PerfTypeBlock` (Task 1, `@shared/types`), `PERF_TYPE_META` (Task 3, `../perf-type-meta`), `PerfTypeIcon` (Task 4, `./PerfTypeIcon`).
- Produces: `PerfTypeTabs({ byType, active, onSelect }: { byType: PerfTypeBlock[]; active: PerfTestType; onSelect: (type: PerfTestType) => void })`.

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/test/components/PerfTypeTabs.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PerfTypeTabs } from '../../src/client/components/PerfTypeTabs';
import { PERF_TEST_TYPES } from '../../src/shared/perf-types';
import type { PerfBlock, PerfTypeBlock } from '../../src/shared/types';

function emptyPerf(): PerfBlock {
  return {
    rps: 10, avgMs: 10, p75Ms: 10, p95Ms: 10, p99Ms: 10, maxMs: 10,
    errorRate: 0, requests: 10, maxRps: 20, distribution: [],
    scenarios: [{ name: 'checkout-load', rps: 10, p95: 10, errors: 0 }],
  };
}

const byType: PerfTypeBlock[] = PERF_TEST_TYPES.map((type) => ({
  type,
  perf: type === 'load' ? emptyPerf() : null,
}));

describe('PerfTypeTabs', () => {
  it('renders one button per PerfTestType in fixed order', () => {
    render(<PerfTypeTabs byType={byType} active="load" onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(6);
    expect(buttons[0]).toHaveTextContent('Load');
    expect(buttons[5]).toHaveTextContent('Volume');
  });

  it('shows a "N runs" badge from the scenario count, 0 when perf is null', () => {
    render(<PerfTypeTabs byType={byType} active="load" onSelect={() => {}} />);
    expect(screen.getByText('Load').closest('button')).toHaveTextContent('1 runs');
    expect(screen.getByText('Stress').closest('button')).toHaveTextContent('0 runs');
  });

  it('marks the active tab', () => {
    render(<PerfTypeTabs byType={byType} active="stress" onSelect={() => {}} />);
    expect(screen.getByText('Stress').closest('button')).toHaveClass('active');
    expect(screen.getByText('Load').closest('button')).not.toHaveClass('active');
  });

  it('calls onSelect with the clicked type', () => {
    const onSelect = vi.fn();
    render(<PerfTypeTabs byType={byType} active="load" onSelect={onSelect} />);
    screen.getByText('Stress').closest('button')!.click();
    expect(onSelect).toHaveBeenCalledWith('stress');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- test/components/PerfTypeTabs.test.tsx`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Create `PerfTypeTabs.tsx`**

Create `apps/dashboard/src/client/components/PerfTypeTabs.tsx`:

```tsx
import { PERF_TEST_TYPES, type PerfTestType } from '@shared/perf-types';
import type { PerfTypeBlock } from '@shared/types';
import { PERF_TYPE_META } from '../perf-type-meta';
import { PerfTypeIcon } from './PerfTypeIcon';

interface PerfTypeTabsProps {
  byType: PerfTypeBlock[];
  active: PerfTestType;
  onSelect: (type: PerfTestType) => void;
}

export function PerfTypeTabs({ byType, active, onSelect }: PerfTypeTabsProps) {
  return (
    <div className="platform-tabs">
      {PERF_TEST_TYPES.map((type) => {
        const block = byType.find((b) => b.type === type);
        const runs = block?.perf ? block.perf.scenarios.length : 0;
        return (
          <button
            key={type}
            type="button"
            className={type === active ? 'active' : ''}
            onClick={() => onSelect(type)}
          >
            <PerfTypeIcon type={type} />
            {PERF_TYPE_META[type].label}
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--text-mute)',
                marginLeft: 4,
              }}
            >
              {runs} runs
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Add CSS for inline-SVG tab icons**

In `apps/dashboard/src/client/styles/styles.css`, right after the line:

```css
.platform-tabs button img{width:20px;height:20px;display:block}
```

add:

```css
.platform-tabs button svg{width:20px;height:20px;display:block}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- test/components/PerfTypeTabs.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/client/components/PerfTypeTabs.tsx apps/dashboard/src/client/styles/styles.css apps/dashboard/test/components/PerfTypeTabs.test.tsx
git commit -m "feat(dashboard): add PerfTypeTabs strip"
```

---

### Task 7: Wire tabs into `PerformanceDetail.tsx`

**Files:**
- Modify: `apps/dashboard/src/client/views/detail/PerformanceDetail.tsx`

**Interfaces:**
- Consumes: `PERF_TEST_TYPES`, `PerfTestType` (Task 1), `PERF_TYPE_META`, `FIELD_GAUGE_CONFIG` (Task 3), `PendingMetricsPanel` (Task 5), `PerfTypeTabs` (Task 6), `Speedometer` (existing, unchanged), `PerfBlock`/`PerfScenario`/`Tool` (Task 1, `@shared/types`).
- Produces: `PerformanceDetail({ runId, tool })` — same public signature as before, now tab-aware. No other file imports from this one, so nothing downstream needs updating.

No dedicated test file for this task, consistent with `Overview.tsx`/`ToolDetail.tsx` today (routing/wiring views verified manually, not unit tested) — verification is `pnpm --filter dashboard typecheck` + `pnpm --filter dashboard build` (Step 2) plus the full manual walkthrough in Task 8.

- [ ] **Step 1: Replace `PerformanceDetail.tsx`**

Replace the full contents of `apps/dashboard/src/client/views/detail/PerformanceDetail.tsx` with:

```tsx
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { PERF_TEST_TYPES, type PerfTestType } from '@shared/perf-types';
import type { PerfBlock, PerfScenario, Tool } from '@shared/types';

import { DetailHead } from '../../components/DetailHead';
import { PendingMetricsPanel } from '../../components/PendingMetricsPanel';
import { PerfTypeTabs } from '../../components/PerfTypeTabs';
import { Speedometer } from '../../components/Speedometer';
import { FIELD_GAUGE_CONFIG, PERF_TYPE_META } from '../../perf-type-meta';

interface PerformanceDetailProps {
  runId: string;
  tool: Tool;
}

function isPerfTestType(value: string | null): value is PerfTestType {
  return value !== null && (PERF_TEST_TYPES as readonly string[]).includes(value);
}

export function PerformanceDetail({ runId, tool }: PerformanceDetailProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeType, setActiveType] = useState<PerfTestType>(() => {
    const typeParam = searchParams.get('type');
    return isPerfTestType(typeParam) ? typeParam : 'load';
  });

  if (tool.kind !== 'performance') {
    return (
      <div className="state">
        <div className="title">Performance detail view</div>
        <div>
          Tool <code>{tool.id}</code> is not a performance tool.
        </div>
      </div>
    );
  }

  const selectType = (type: PerfTestType) => {
    setActiveType(type);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('type', type);
      return next;
    });
  };

  const activeBlock = tool.byType.find((b) => b.type === activeType);
  const p = activeBlock?.perf ?? null;
  const meta = PERF_TYPE_META[activeType];
  const noData = tool.missing === true || p === null || p.requests === 0;
  const maxDist = p && p.distribution.length ? Math.max(...p.distribution.map((d) => d.pct)) : 1;

  return (
    <div className="detail fade-in">
      <DetailHead
        runId={runId}
        tool={tool}
        right={
          <>
            <span className="pill">⏱ {tool.duration}</span>
            <button className="btn ghost">Download HAR</button>
          </>
        }
      />

      <PerfTypeTabs byType={tool.byType} active={activeType} onSelect={selectType} />

      <div className="panel">
        <h3>{meta.label} gauges</h3>
        {noData ? (
          <div className="empty">No data generated for {meta.label} in this run.</div>
        ) : (
          <div className="gauge-grid">
            {meta.gauges.map((g) => (
              <PerfFieldTile key={g.field} label={g.label} field={g.field} perf={p as PerfBlock} />
            ))}
          </div>
        )}
        <PendingMetricsPanel items={meta.pending} />
      </div>

      {!noData && p && (
        <div className="perf-grid">
          <div className="panel">
            <h3>Response time distribution</h3>
            {p.distribution.map((d, i) => (
              <div className="dist-row" key={i}>
                <div className="pct">{d.label}</div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: (d.pct / maxDist) * 100 + '%' }}
                  />
                </div>
                <div className="ms">{d.pct}%</div>
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 14,
                fontSize: 12,
                color: 'var(--text-mute)',
                fontFamily: 'var(--mono)',
              }}
            >
              <span>Total requests: {p.requests.toLocaleString()}</span>
              <span>P99: {p.p99Ms}ms</span>
            </div>
          </div>

          <div className="panel">
            <h3>Simulations</h3>
            <div className="sim-list">
              {p.scenarios.map((sim, i) => (
                <SimulationCard key={i} sim={sim} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PerfFieldTile({ label, field, perf }: { label: string; field: keyof PerfBlock; perf: PerfBlock }) {
  const config = FIELD_GAUGE_CONFIG[field];
  const value = perf[field] as number;

  if (!config || config.kind === 'stat') {
    return (
      <div className="gauge">
        <div className="label">{label}</div>
        <div className="value">{value.toLocaleString()}</div>
        <div className="unit">{config?.unit ?? ''}</div>
      </div>
    );
  }

  const max = config.maxField ? (perf[config.maxField] as number) : config.max!;
  const thresholdGood = config.thresholdGoodFactor ? max * config.thresholdGoodFactor : config.thresholdGood!;
  const thresholdBad = config.thresholdBadFactor ? max * config.thresholdBadFactor : config.thresholdBad!;

  return (
    <Speedometer
      label={label}
      value={value}
      max={max}
      unit={config.unit}
      invert={config.invert}
      thresholdGood={thresholdGood}
      thresholdBad={thresholdBad}
    />
  );
}

function SimulationCard({ sim }: { sim: PerfScenario }) {
  const [open, setOpen] = useState(sim.errors > 0);
  const hasSteps = Boolean(sim.steps && sim.steps.length);
  return (
    <div className={`scenario-card${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="scenario-card-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={'icon-dot ' + (sim.errors > 1 ? 'failed' : sim.errors > 0.3 ? 'skipped' : 'passed')} />
        <span className="name">{sim.name}</span>
        <span className="meta">{sim.rps} rps · p95 {sim.p95}ms · err {sim.errors}%</span>
        <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && hasSteps && (
        <div className="scenario-card-body">
          <table className="sim-steps">
            <thead>
              <tr><th>Step</th><th>RPS</th><th>P95 (ms)</th><th>%KO</th></tr>
            </thead>
            <tbody>
              {[...(sim.steps ?? [])].sort((a, b) => b.errors - a.errors).map((s, idx) => (
                <tr key={idx} className={s.errors > 0 ? 'sim-step-bad' : undefined}>
                  <td>{s.name}</td>
                  <td>{s.rps}</td>
                  <td>{s.p95}</td>
                  <td>{s.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && !hasSteps && (
        <div className="scenario-card-body empty">No per-request breakdown available.</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck and build to verify it compiles**

Run: `pnpm --filter dashboard typecheck`
Expected: no errors.

Run: `pnpm --filter dashboard build`
Expected: build succeeds.

(Both may still fail at this point only if Task 8's fixture file hasn't been updated yet and something in the build graph forces it to type-check — if so, that's expected and resolved in Task 8, not a regression in this task. If `typecheck`/`build` fail for any other reason, fix before proceeding.)

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/client/views/detail/PerformanceDetail.tsx
git commit -m "feat(dashboard): render per-test-type gauges and pending metrics in PerformanceDetail"
```

---

### Task 8: Dev fixtures + full verification

**Files:**
- Modify: `apps/dashboard/scripts/generate-fixtures.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–7. Produces nothing new — this task only updates dev-fixture data and runs the full verification suite.

- [ ] **Step 1: Update the Gatling dev fixture**

In `apps/dashboard/scripts/generate-fixtures.ts`, change the type-only import block from:

```ts
import type {
  AccessibilityTool,
  ApiTool,
  BrowserBlock,
  ManifestEntry,
  MobileSecurityTool,
  MobileUiTool,
  PerformanceTool,
  RunInfo,
  TestCase,
  VisualDiff,
  VisualTool,
  WebSecurityTool,
  WebUiTool,
} from '../src/shared/types.js';
```

to:

```ts
import type {
  AccessibilityTool,
  ApiTool,
  BrowserBlock,
  ManifestEntry,
  MobileSecurityTool,
  MobileUiTool,
  PerfBlock,
  PerformanceTool,
  RunInfo,
  TestCase,
  VisualDiff,
  VisualTool,
  WebSecurityTool,
  WebUiTool,
} from '../src/shared/types.js';
```

Then replace the existing `gatling1` declaration (currently lines 210–248):

```ts
const gatling1: PerformanceTool = {
  kind: 'performance',
  id: 'gatling',
  name: 'Gatling',
  description: 'Sustained load + spike scenarios against staging services.',
  passed: 18, failed: 2, skipped: 0, duration: '14m 30s',
  perf: {
    rps: 1842, avgMs: 124, p95Ms: 312, p99Ms: 612,
    errorRate: 0.42, requests: 1_672_481, maxRps: 2400,
    distribution: [
      { label: '< 100 ms',   pct: 62,  count: 1_037_000 },
      { label: '100–250 ms', pct: 24,  count: 401_000 },
      { label: '250–500 ms', pct: 9,   count: 150_500 },
      { label: '500 ms–1 s', pct: 3,   count: 50_100 },
      { label: '1 s–3 s',    pct: 1.5, count: 25_100 },
      { label: '> 3 s',      pct: 0.5, count: 8800 },
    ],
    scenarios: [
      {
        name: 'checkout-load',
        rps: 920, p95: 412, errors: 0.5,
        steps: [
          { name: 'home',      rps: 240, p95: 180, errors: 0    },
          { name: 'login',     rps: 220, p95: 220, errors: 0.05 },
          { name: 'addToCart', rps: 250, p95: 350, errors: 0.30 },
          { name: 'checkout',  rps: 210, p95: 520, errors: 1.10 },
        ],
      },
      {
        name: 'catalog-load',
        rps: 720, p95: 360, errors: 0.3,
        steps: [
          { name: 'home',   rps: 420, p95: 188, errors: 0    },
          { name: 'search', rps: 300, p95: 360, errors: 0.55 },
        ],
      },
    ],
  },
};
```

with:

```ts
const gatlingLoadPerf: PerfBlock = {
  rps: 1842, avgMs: 124, p75Ms: 210, p95Ms: 312, p99Ms: 612, maxMs: 1480,
  errorRate: 0.42, requests: 1_672_481, maxRps: 2400,
  distribution: [
    { label: '< 100 ms',   pct: 62,  count: 1_037_000 },
    { label: '100–250 ms', pct: 24,  count: 401_000 },
    { label: '250–500 ms', pct: 9,   count: 150_500 },
    { label: '500 ms–1 s', pct: 3,   count: 50_100 },
    { label: '1 s–3 s',    pct: 1.5, count: 25_100 },
    { label: '> 3 s',      pct: 0.5, count: 8800 },
  ],
  scenarios: [
    {
      name: 'checkout-load',
      rps: 920, p95: 412, errors: 0.5,
      steps: [
        { name: 'home',      rps: 240, p95: 180, errors: 0    },
        { name: 'login',     rps: 220, p95: 220, errors: 0.05 },
        { name: 'addToCart', rps: 250, p95: 350, errors: 0.30 },
        { name: 'checkout',  rps: 210, p95: 520, errors: 1.10 },
      ],
    },
    {
      name: 'catalog-load',
      rps: 720, p95: 360, errors: 0.3,
      steps: [
        { name: 'home',   rps: 420, p95: 188, errors: 0    },
        { name: 'search', rps: 300, p95: 360, errors: 0.55 },
      ],
    },
  ],
};

const gatlingStressPerf: PerfBlock = {
  rps: 640, avgMs: 340, p75Ms: 520, p95Ms: 980, p99Ms: 1650, maxMs: 3200,
  errorRate: 4.8, requests: 84_200, maxRps: 900,
  distribution: [
    { label: '< 100 ms',   pct: 12, count: 10_100 },
    { label: '100–250 ms', pct: 22, count: 18_500 },
    { label: '250–500 ms', pct: 28, count: 23_600 },
    { label: '500 ms–1 s', pct: 20, count: 16_800 },
    { label: '1 s–3 s',    pct: 13, count: 10_900 },
    { label: '> 3 s',      pct: 5,  count: 4200 },
  ],
  scenarios: [
    { name: 'checkout-stress', rps: 640, p95: 980, errors: 4.8 },
  ],
};

const gatling1: PerformanceTool = {
  kind: 'performance',
  id: 'gatling',
  name: 'Gatling',
  description: 'Sustained load + spike scenarios against staging services.',
  passed: 18, failed: 2, skipped: 0, duration: '14m 30s',
  perf: gatlingLoadPerf,
  byType: [
    { type: 'load', perf: gatlingLoadPerf },
    { type: 'stress', perf: gatlingStressPerf },
    { type: 'endurance', perf: null },
    { type: 'spike', perf: null },
    { type: 'scalability', perf: null },
    { type: 'volume', perf: null },
  ],
};
```

Leave `gatling2` (which spreads `...gatling1`) unchanged — it inherits `byType` automatically.

- [ ] **Step 2: Regenerate fixtures**

Run: `pnpm --filter dashboard fixtures:generate`
Expected: completes without error, writes into `reports/` at the repo root.

- [ ] **Step 3: Run full dashboard test suite**

Run: `pnpm --filter dashboard test`
Expected: all tests pass, including every new/modified file from Tasks 1–6.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `pnpm dashboard` (starts the dev server; leave it running)

In a browser, open the dashboard, navigate into a run, open the Gatling tool detail page, and confirm:
- 6 tabs render in order (Load, Stress, Endurance, Spike, Scalability, Volume), each with a distinct icon.
- Load tab: 4 gauges (Throughput, Avg response, P95 latency, Error rate), response-time distribution, 2 simulation cards (`checkout-load`, `catalog-load`), no "Not yet available" panel content.
- Stress tab: 4 gauges (Throughput, Error rate (KO), P99 latency, Max latency), 1 simulation card (`checkout-stress`), and a "Not yet available" panel listing "Breaking point" and "Recovery time".
- Endurance/Spike/Scalability/Volume tabs: "No data generated for `<Type>` in this run." message, plus each tab's own "Not yet available" panel (Endurance/Spike/Scalability/Volume-specific items from Task 3's `PERF_TYPE_META`).
- Clicking a tab updates the browser URL's `?type=` query param, and the tab strip's "N runs" badges match (Load: 1 runs, Stress: 1 runs, others: 0 runs — badge counts scenario cards, not requests).

Stop the dev server (Ctrl+C) once verified.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/scripts/generate-fixtures.ts
git commit -m "chore(dashboard): seed byType fixture data for the performance tabs"
```
