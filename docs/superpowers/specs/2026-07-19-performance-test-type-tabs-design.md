# Performance Dashboard — Test-Type Tabs (Load/Stress/Endurance/Spike/Scalability/Volume)

**Date:** 2026-07-19
**Scope:** add 6 fixed test-type tabs (Load, Stress, Endurance, Spike, Scalability, Volume) to the Performance category's Gatling detail view, each with a distinct icon and a curated set of metrics. Adapts the existing Gatling HTML-report ingester to classify simulations by test type instead of flattening everything into one aggregate. Builds on the existing v1/v2 dashboard (`apps/dashboard/`, see `2026-05-24-test-dashboard-design.md`, `2026-07-17-category-sidebar-design.md`).

## 1. Goals

- Add a fixed-order, always-visible 6-tab strip to `PerformanceDetail.tsx` (Load/Stress/Endurance/Spike/Scalability/Volume), each with its own hand-rolled SVG icon, mirroring the existing `.platform-tabs` visual pattern used elsewhere (Android/iOS, browser tabs).
- Classify each ingested Gatling simulation into one of the 6 types by its name suffix (`checkout-load` → `load`), reusing the naming convention the simulation files already follow — no changes needed to existing `*.gatling.ts` files.
- Per tab, show the real client-side metrics Gatling's HTML report actually contains (throughput, avg/p95/p99/max response time, error rate, request count), re-emphasized per test type to match testing vocabulary (e.g. Stress leads with error rate + peak throughput; Spike leads with max latency).
- Per tab, show an honest "not yet available" panel listing the metrics from the original spec that this phase cannot produce (things needing raw per-request time-series parsing, multi-run comparison, or a server-side metrics source that doesn't exist in this repo) — no fabricated numbers.
- Two new real fields surface in `PerfBlock` (`p75Ms`, `maxMs`) — both already parsed from Gatling's HTML table today but previously discarded.

## 2. Non-goals

- **New Gatling injection profiles.** `PerfProfile` (`src/plugins/gatling/support/types.ts`) still only executes `smoke | load | stress`. Endurance/spike/scalability/volume simulations are not written in this task — the dashboard ships ready to display them once they exist, showing an empty state ("0 runs") until then.
- **Server-side metrics** (CPU/RAM, thread pools, DB connection pool, auto-scaling reaction time, IOPS, cache hit ratio, etc.). Nothing in this repo collects these today (no Prometheus/APM/exporter integration). They render as explicitly labeled "not connected" placeholders, never as invented numbers.
- **Raw `simulation.log` time-series parsing.** Gatling's binary/text event log has per-request timestamps that *could* eventually power breaking-point curves, recovery time, degradation trends, and spike timing — but parsing that format is a separate, substantial effort (the existing code already treats `simulation.log` gingerly, reading only the first 256 bytes for the sim name and noting format volatility across Gatling versions). Those metrics are flagged pending, not computed.
- **Multi-run/cross-node comparison** for Scalability's "RPS gained per added node" — this needs linking multiple runs at different node counts, which no part of the ingest pipeline tracks today.
- **New tool cards** (k6, JMeter) mentioned as a future roster in `design_handoff_category_sidebar/README.md`. Out of scope; this task only touches the existing `gatling` tool.
- Changing `apps/dashboard/src/server/normalize/gatling.ts` (the pass-through server adapter) — it forwards whatever `ingest-gatling.ts` already wrote; the new fields pass through unchanged with no adapter code changes expected.

## 3. Decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Dashboard/visualization only. | User-selected; execution-side profile work is a separate, larger task. |
| Server-side metrics | Reserved placeholder UI, "no data" state, no mock numbers. | User-selected; avoids fabricating data with no real source. |
| Type classification | Simulation-name suffix (`-load`, `-stress`, ...), matching the existing `<feature>-load.gatling.ts` convention. | User-selected; zero changes needed to existing simulation files, consistent with how the repo already names things. |
| Icons | Hand-rolled inline SVG per type, no external image assets. | User-selected; matches the existing hand-rolled SVG convention (`Speedometer.tsx`) and avoids depending on unavailable image sources. |
| UI language | English. | Matches 100% of existing dashboard copy ("Performance gauges", "Simulations", etc.); no code-switching mid-dashboard. |
| Reuse `TabbedTestDetail`? | No — new lightweight `PerfTypeTabs` component reusing only the `.platform-tabs` CSS class. | `TabbedTestDetail` is tightly coupled to `Counts & { tests: TestCase[] }` (donut, filter bar, test table) — forcing gauges through it would require an awkward adapter shape or would regress the Android/iOS/browser tabs it already serves. |
| `perf` (aggregate) field | Kept unchanged, computed across all simulations as today. | Backward-compatible: `ToolCard`, `CategorySection`, `CategoryHeader` and any other existing reader of `tool.perf` keeps working untouched. `byType` is purely additive. |
| Unclassified simulations (e.g. future `*-smoke` runs) | Rolled into an optional `unclassified` block, surfaced only if non-empty. | No silent data loss — every ingested simulation is accounted for somewhere, without inventing a 7th permanent tab for a currently-empty bucket. |

## 4. Data model changes

`apps/dashboard/src/shared/perf-types.ts` (new file, mirrors the `ToolKind`/`TOOL_KINDS` pattern in `kinds.ts`):

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

`apps/dashboard/src/shared/types.ts` — extend `PerfBlock` and `PerformanceTool`:

```ts
export interface PerfBlock {
  rps: number;
  avgMs: number;
  p75Ms: number;      // new — already parsed (col-9), previously unused
  p95Ms: number;
  p99Ms: number;
  maxMs: number;       // new — already parsed (col-12), previously unused
  errorRate: number;
  requests: number;
  maxRps: number;
  distribution: PerfDistributionBucket[];
  scenarios: PerfScenario[];
}

export interface PerfTypeBlock {
  type: PerfTestType;
  perf: PerfBlock | null;   // null = no simulations of this type in this run
}

export interface PerformanceTool extends BaseTool {
  kind: 'performance';
  perf: PerfBlock;                 // unchanged: aggregate across ALL simulations
  byType: PerfTypeBlock[];         // always 6 entries, PERF_TEST_TYPES order
  unclassified?: PerfBlock;        // simulations matching none of the 6 suffixes; omitted when empty
}
```

## 5. Ingest changes (`apps/dashboard/scripts/ingest-gatling.ts`)

- Extract the existing roll-up loop (lines 244–324: total/ok/ko/rpsSum/p50w/p95w/p99w/meanw accumulation, `deriveDistribution`, `buildPerfScenarios`, `durationFromRps`) into a reusable `rollUpReports(reports: SimulationReport[]): PerfBlock`, adding `p75w`/`maxw` accumulators alongside the existing weighted-average ones (same request-weighted-average approach, using `col-9`/`col-12`).
- Add `classifyPerfType(simulationName: string): PerfTestType | 'other'`:
  ```ts
  const SUFFIX_RE = /-(load|stress|endurance|spike|scalability|volume)$/i;
  function classifyPerfType(name: string): PerfTestType | 'other' {
    const m = SUFFIX_RE.exec(name);
    return (m ? m[1].toLowerCase() : 'other') as PerfTestType | 'other';
  }
  ```
- In `ingestGatling()`:
  1. `discoverReports()` — unchanged.
  2. `perf = rollUpReports(reports)` — unchanged aggregate (same output as today).
  3. Group `reports` by `classifyPerfType(report.simulation)`.
  4. `byType = PERF_TEST_TYPES.map(type => ({ type, perf: groups[type]?.length ? rollUpReports(groups[type]) : null }))`.
  5. `unclassified = groups.other?.length ? rollUpReports(groups.other) : undefined`.
  6. `passed`/`failed` — unchanged, computed across all scenarios' steps as today.
  7. Return `{ ...existing top-level fields, perf, byType, ...(unclassified && { unclassified }) }`.

Existing simulations (`checkout-load`, `catalog-load`, `login-load`, `invalid-login-load`, `pizzaBuilder-load`, `profile-load`, `order-success-load`) all match `-load` today, so they populate the Load tab with zero changes to the simulation files; the other 5 tabs render their "0 runs" empty state until matching simulations exist.

## 6. Client UI

### 6.1 `PerfTypeTabs` (new, `apps/dashboard/src/client/components/PerfTypeTabs.tsx`)

Presentational tab strip, styled with the existing `.platform-tabs` class (no new CSS needed beyond a small badge tweak):

```tsx
interface PerfTypeTabsProps {
  byType: PerfTypeBlock[];       // PERF_TEST_TYPES order
  active: PerfTestType;
  onSelect: (t: PerfTestType) => void;
}
```

Each button: `<PerfTypeIcon type={t.type} />` + label (`PERF_TYPE_META[t.type].label`) + a muted `{count} runs` badge (`0` when `perf === null`).

### 6.2 `PerfTypeIcon` (new, `apps/dashboard/src/client/components/PerfTypeIcon.tsx`)

One inline SVG per type, `currentColor` stroke, sized to match the existing tab-icon slot (20×20, matching `.platform-tabs button img` sizing):

| Type | Glyph |
|---|---|
| Load | speedometer/gauge |
| Stress | flame |
| Endurance | hourglass |
| Spike | lightning bolt |
| Scalability | ascending bar chart |
| Volume | stacked database cylinder |

### 6.3 `PERF_TYPE_META` (new, `apps/dashboard/src/client/perf-type-meta.ts`)

Pure data, no React — one entry per `PerfTestType`:

```ts
interface PerfTypeMeta {
  label: string;
  description: string;
  gauges: Array<{ label: string; field: keyof PerfBlock; unit: string; invert?: boolean }>;
  pending: Array<{ label: string; reason: string }>;
}
```

Driving table (client-side gauges pull straight from `PerfBlock`; nothing here is computed specially per type beyond field selection/labeling):

| Type | Gauges (label → `PerfBlock` field) | Pending (label — reason) |
|---|---|---|
| **Load** | Throughput → `rps`/`maxRps`; Avg response → `avgMs`; P95 latency → `p95Ms`; Error rate → `errorRate` | — |
| **Stress** | Throughput → `rps`/`maxRps`; Error rate (KO) → `errorRate`; P99 latency → `p99Ms`; Max latency → `maxMs` | Breaking point (max sustainable RPS before errors spike) — needs time-series; Recovery time — needs time-series |
| **Endurance** | Total requests → `requests`; Avg response → `avgMs`; P95 latency → `p95Ms`; Error rate → `errorRate` | Degradation trend over time — needs time-series; Memory leaks — server-side; Storage saturation — server-side |
| **Spike** | Max latency → `maxMs`; Error rate → `errorRate`; P99 latency → `p99Ms`; Throughput → `rps` | Auto-scaling reaction time — server-side; Network bandwidth saturation — server-side |
| **Scalability** | Throughput → `rps`; Error rate → `errorRate`; P95 latency → `p95Ms` | RPS gained per added node — needs multi-run comparison; Load balancer distribution — server-side; Cost/instance — server-side |
| **Volume** | Total requests → `requests`; Avg response → `avgMs`; P95 latency → `p95Ms`; Error rate → `errorRate` | Large-payload load — Gatling summary has no payload size; Disk IOPS — server-side; Query locks — server-side; Cache hit ratio — server-side |

### 6.4 `PendingMetricsPanel` (new, small, `apps/dashboard/src/client/components/PendingMetricsPanel.tsx`)

```tsx
interface PendingMetricsPanelProps {
  items: Array<{ label: string; reason: string }>;
}
```
Renders a muted list (dashed border, matching `.empty` panel tone) — one row per item: `{label}` + small `{reason}` sub-text. Always rendered (even for Load, where it's simply empty/omitted) so every tab has the same panel shape.

### 6.5 `PerformanceDetail.tsx` changes

- Add `const [activeType, setActiveType] = useState<PerfTestType>(() => (searchParams.get('type') as PerfTestType) ?? 'load')`, synced to `?type=` via `useSearchParams` (same pattern as the category sidebar's `?cat=`).
- Render `<PerfTypeTabs byType={tool.byType} active={activeType} onSelect={...} />` above the existing "Performance gauges" panel.
- The gauge grid, distribution panel, and simulation list all read from `tool.byType.find(t => t.type === activeType)?.perf` instead of `tool.perf` directly; when that's `null`, show the existing `.empty` "No data generated for this tool in this run." state (already the pattern used for `noData` today) — gauges are hidden, but the `PendingMetricsPanel` for that type still renders so users see what to expect once matching simulations run.
- Gauge selection per tab is driven by `PERF_TYPE_META[activeType].gauges`, reusing the existing `Speedometer` component (label/value/unit/thresholds computed the same way `Load`'s hard-coded gauges are today — thresholds scale off `maxRps`/fixed ms bands, unchanged math, just parameterized).

## 7. Edge cases

- **All 6 tabs always render**, even with 0 runs — consistent with the dashboard's existing "missing tool" pattern (cards render, then show an empty state) rather than hiding untested types.
- **Unknown `?type=` value** (stale link, hand-edited URL): falls back to `load`, mirroring the category sidebar's "unknown `?cat=` → fall back to all" rule.
- **`unclassified` simulations**: not shown as a 7th tab. They're still fully captured in the data model — counted in the top-level `perf` aggregate (already true today) and separately available on `tool.unclassified` for future use — just with no dedicated UI surface in this phase. Nothing about an unmatched simulation name is silently dropped.
- **A run with zero Gatling simulations at all**: `ingestGatling()` already returns `null` in this case (unchanged); `PerformanceDetail` continues to hit its top-level `tool.missing` empty state before ever reaching the tab strip.

## 8. Tests

- `apps/dashboard/test/ingest/gatling.test.ts` — add cases for `classifyPerfType` (all 6 suffixes, case-insensitivity, unmatched → `'other'`), and for `byType` grouping (fixture with simulations across 2+ types produces correct per-type `PerfBlock`s; a type with no matching simulations gets `perf: null`; `unclassified` populated/omitted correctly).
- `apps/dashboard/test/adapters/gatling.test.ts` — verify the pass-through adapter forwards `byType`/`unclassified`/new `p75Ms`/`maxMs` fields unchanged.
- `apps/dashboard/test/components/PerfTypeTabs.test.tsx` (new) — renders 6 buttons in `PERF_TEST_TYPES` order, correct "N runs" badges, `onSelect` wired, active class on the right tab.
- `apps/dashboard/test/components/PendingMetricsPanel.test.tsx` (new) — renders one row per item; empty `items` renders nothing (or an appropriately empty container).
- `PerformanceDetail.tsx`'s routing/search-param wiring gets no new automated test, consistent with `Overview.tsx`/`ToolDetail.tsx` today; verify manually with `pnpm dashboard`, running an actual Gatling load simulation and confirming the Load tab populates while the other 5 show their empty state with pending-metrics panels visible.

## 9. Implementation order

1. `shared/perf-types.ts` (`PerfTestType`, `PERF_TEST_TYPES`) + `shared/types.ts` extensions (`p75Ms`, `maxMs`, `PerfTypeBlock`, `byType`, `unclassified`).
2. `ingest-gatling.ts`: `rollUpReports` extraction, `classifyPerfType`, `byType`/`unclassified` wiring + tests (step 8's ingest test).
3. `perf-type-meta.ts` (pure data, no dependencies beyond step 1's types).
4. `PerfTypeIcon.tsx`, `PendingMetricsPanel.tsx` — independent presentational components, can build in parallel with step 3.
5. `PerfTypeTabs.tsx` — depends on steps 1, 3, 4.
6. `PerformanceDetail.tsx` wiring — depends on step 5.
7. Component tests (step 8) + manual verification via `pnpm dashboard`.

Steps 3 and 4 have no dependency on each other and can be built in parallel; step 2 (ingest) is independent of steps 3–6 (pure client UI) and can also proceed in parallel once step 1 lands.

## 10. Risks / things to flag during implementation

- The request-weighted-average approach for `p75Ms`/`maxMs` mirrors the existing (already-approximate) approach for `p95Ms`/`p99Ms`/`avgMs` — averaging a `max` across simulations is statistically questionable (the true max of a union isn't the weighted average of per-simulation maxes), but it's consistent with how the codebase already blends percentiles from summary-only data (see the file's own top-of-file comment acknowledging this trade-off). Flag clearly in a code comment rather than presenting it as more precise than it is.
- `maxRps` is a synthetic gauge ceiling (`Math.max(rps, rps * 1.4)`), not an observed peak — the existing Load gauge's unit text already (pre-existingly) reads "req/s · peak {maxRps}", which overstates what the number is. Don't propagate that "peak" wording into the new per-type `PERF_TYPE_META` unit strings when generalizing the Throughput gauge to Stress/Spike/Scalability — reuse `maxRps` only as the gauge's visual ceiling, not as a claimed observed value. Fixing the pre-existing Load copy is optional/out of scope, but don't make it worse by repeating it elsewhere.
- `classifyPerfType`'s regex only matches a trailing `-<type>` suffix; a simulation named e.g. `checkout-load-v2` would fall into `unclassified`. Confirm this is acceptable (matches today's actual naming convention) rather than trying to be cleverer about substring matching.
- Confirm `apps/dashboard/src/server/normalize/gatling.ts` really is a no-op pass-through (per the design's Non-goals assumption) before treating it as untouched — a quick read during implementation, not assumed blindly.
- Verify no other existing consumer of `PerfBlock` (search for `.perf.` across `apps/dashboard/src/client`) destructures it in a way that would break by gaining two new required fields (`p75Ms`, `maxMs`) — since `PerfBlock` is only ever produced by `ingest-gatling.ts` and the Gatling adapter/tests, this should be low-risk, but confirm before landing.
