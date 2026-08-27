// Architecture-quality: Reliability.
// Derives pass/fail rates, flakiness, and transition probabilities from accumulated
// scenario outcome history, plus infrastructure/tool failure rates from failure buckets.
// Missing evidence -> NOT_AVAILABLE; genuinely-undefined probabilities -> null (empty cell).
import { join } from 'path';
import { writeQualityCsv, QualityRecord, safeMain, NA } from './lib/quality';
import { readCsv, round2 } from './lib/csv';
import { P } from './lib/paths';

const CATEGORY = 'Reliability';
type TrackedOutcome = 'PASS' | 'FAIL';

interface TransitionCounter {
  total: number;
  changed: number;
  changesTo: TrackedOutcome;
}

function isTrackedOutcome(value: string): value is TrackedOutcome {
  return value === 'PASS' || value === 'FAIL';
}

// Outcome value lives in `outcome` (Task 1.3) — tolerate `status` as a fallback name.
const outcomeOf = (r: Record<string, string>): string =>
  (r.outcome || r.status || '').trim().toUpperCase();

const bucketOf = (r: Record<string, string>): string => (r.failure_bucket || '').trim().toUpperCase();

const TOOL_FAILURE_BUCKETS = new Set([
  'WEB_SESSION_FAILURE',
  'MOBILE_SESSION_FAILURE',
  'LOCATOR_RESOLUTION_FAILURE',
]);

// Computes the full Reliability metric set for one slice of scenario_outcome_history.csv rows
// (already filtered to a single tool_name upstream, or the unfiltered whole for the 'ALL' slice) and
// the failure_buckets.csv rows filtered to match. §9.3's actual claim ("twin shows a higher transition
// rate than atomic") is a CROSS-ARM comparison — this only becomes answerable once main() calls this
// once per distinct tool_name, not just once globally, since fail_rate/transition-probability computed
// across a pooled mix of arms cannot be attributed to either one.
function computeReliabilityMetrics(
  outcomeRows: Record<string, string>[],
  bucketRows: Record<string, string>[],
  toolName: string | undefined, // undefined -> QualityRecord.tool_name defaults to 'ALL'
): QualityRecord[] {
  const records: QualityRecord[] = [];
  const tag = { tool_name: toolName };

  const total = outcomeRows.length;
  const passes = outcomeRows.filter((r) => outcomeOf(r) === 'PASS').length;
  const fails = outcomeRows.filter((r) => outcomeOf(r) === 'FAIL').length;

  // --- pass_rate / fail_rate: NA when there is no outcome history for this slice ---
  records.push({
    metric_category: CATEGORY,
    metric_name: 'pass_rate',
    metric_value: total > 0 ? (round2(passes / total) as number) : NA,
    metric_unit: 'ratio',
    source_file: 'metrics/processed/scenario_outcome_history.csv',
    ...tag,
  });
  records.push({
    metric_category: CATEGORY,
    metric_name: 'fail_rate',
    metric_value: total > 0 ? (round2(fails / total) as number) : NA,
    metric_unit: 'ratio',
    source_file: 'metrics/processed/scenario_outcome_history.csv',
    ...tag,
  });

  // --- Group by (scenario, tool_name, platform); order by run_index for transitions ---
  // tool_name stays IN the key even though outcomeRows is already tool_name-filtered for every
  // per-tool_name call site (main() below) — it's redundant there (empirically confirmed: partitioning
  // by the 2-part vs. 3-part key produces identical groups within a single-tool_name slice) but it is
  // NOT redundant for the 'ALL' slice, which is fed the full, unfiltered, multi-arm outcome array.
  // Dropping it there would merge two different arms' rows sharing one (scenario, platform) into a
  // single transition sequence — fabricating flaky_scenario_count / pass_to_fail_probability /
  // fail_to_pass_probability out of pure interleaving, not real flakiness in either arm. Caught by
  // adversarial review (2026-08-26) with an empirical repro before this was ever committed.
  const groups = new Map<string, Record<string, string>[]>();
  for (const r of outcomeRows) {
    const scenario = r.scenario || r.scenario_name || '';
    const key = `${scenario}::${r.tool_name || ''}::${r.platform || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  let flakyCount = 0;
  const transitions: Record<TrackedOutcome, TransitionCounter> = {
    PASS: { total: 0, changed: 0, changesTo: 'FAIL' },
    FAIL: { total: 0, changed: 0, changesTo: 'PASS' },
  };

  for (const rows of groups.values()) {
    const ordered = [...rows].sort((a, b) =>
      String(a.run_index || '').localeCompare(String(b.run_index || '')),
    );
    const seq = ordered.map(outcomeOf);
    if (seq.includes('PASS') && seq.includes('FAIL')) flakyCount += 1;

    for (let i = 0; i < seq.length - 1; i++) {
      const current = seq[i];
      if (!isTrackedOutcome(current)) continue;

      const counter = transitions[current];
      counter.total += 1;
      if (seq[i + 1] === counter.changesTo) counter.changed += 1;
    }
  }

  records.push({
    metric_category: CATEGORY,
    metric_name: 'flaky_scenario_count',
    metric_value: flakyCount,
    metric_unit: 'count',
    source_file: 'metrics/processed/scenario_outcome_history.csv',
    ...tag,
  });

  // Transition probabilities: null (undefined) when no qualifying transitions exist.
  records.push({
    metric_category: CATEGORY,
    metric_name: 'pass_to_fail_probability',
    metric_value: transitions.PASS.total > 0
      ? (round2(transitions.PASS.changed / transitions.PASS.total) as number)
      : null,
    metric_unit: 'ratio',
    source_file: 'metrics/processed/scenario_outcome_history.csv',
    ...tag,
  });
  records.push({
    metric_category: CATEGORY,
    metric_name: 'fail_to_pass_probability',
    metric_value: transitions.FAIL.total > 0
      ? (round2(transitions.FAIL.changed / transitions.FAIL.total) as number)
      : null,
    metric_unit: 'ratio',
    source_file: 'metrics/processed/scenario_outcome_history.csv',
    ...tag,
  });

  // retry_count: not tracked upstream -> NA.
  records.push({
    metric_category: CATEGORY,
    metric_name: 'retry_count',
    metric_value: NA,
    metric_unit: 'count',
    source_file: 'not measured upstream',
    ...tag,
  });

  // --- Failure-bucket distribution -> infrastructure / tool failure rates, same slice ---
  const scopedBuckets = toolName === undefined
    ? bucketRows
    : bucketRows.filter((r) => (r.tool_name || '').trim() === toolName);

  if (scopedBuckets.length === 0 || total === 0) {
    records.push({
      metric_category: CATEGORY,
      metric_name: 'infrastructure_failure_rate',
      metric_value: NA,
      metric_unit: 'ratio',
      source_file: 'metrics/processed/failure_buckets.csv',
      ...tag,
    });
    records.push({
      metric_category: CATEGORY,
      metric_name: 'tool_failure_rate',
      metric_value: NA,
      metric_unit: 'ratio',
      source_file: 'metrics/processed/failure_buckets.csv',
      ...tag,
    });
  } else {
    const infra = scopedBuckets.filter((r) => bucketOf(r) === 'INFRASTRUCTURE_FAILURE').length;
    const toolFails = scopedBuckets.filter((r) => TOOL_FAILURE_BUCKETS.has(bucketOf(r))).length;
    records.push({
      metric_category: CATEGORY,
      metric_name: 'infrastructure_failure_rate',
      metric_value: round2(infra / total) as number,
      metric_unit: 'ratio',
      source_file: 'metrics/processed/failure_buckets.csv (INFRASTRUCTURE_FAILURE / total observations)',
      ...tag,
    });
    records.push({
      metric_category: CATEGORY,
      metric_name: 'tool_failure_rate',
      metric_value: round2(toolFails / total) as number,
      metric_unit: 'ratio',
      source_file:
        'metrics/processed/failure_buckets.csv (WEB/MOBILE_SESSION + LOCATOR_RESOLUTION / total observations)',
      ...tag,
    });
  }

  return records;
}

function main(): void {
  const outcome = readCsv(join(P.processed, 'scenario_outcome_history.csv'));
  const buckets = readCsv(join(P.processed, 'failure_buckets.csv'));

  // 'ALL' slice — kept for backward compatibility with anything reading the pre-existing pooled row.
  const records: QualityRecord[] = [...computeReliabilityMetrics(outcome, buckets, undefined)];

  // Per-tool_name slices — the actual cross-arm breakdown §9.3 needs (e.g. 'playwright' vs
  // 'non-atomic-twin-web'). Blank/missing tool_name is skipped (nothing meaningful to slice on);
  // 'UNKNOWN' is NOT filtered out here — it's reported as its own honest slice like any other value,
  // since deciding what counts as noise vs. signal is a reporting-layer judgment, not this script's.
  // The literal string 'ALL' IS excluded, even though nothing in this codebase's manifest schema
  // currently produces it: writeQualityCsv (lib/quality.ts) reserves 'ALL' as the default tag for the
  // pooled slice above, and a raw input row that happened to carry tool_name==='ALL' would otherwise
  // get its own per-tool slice that's key-identical to the pooled one on every column except
  // metric_value — two silently-conflicting rows under one tag, with no dedup in writeCsv. Caught by
  // adversarial review (2026-08-26).
  const toolNames = [...new Set(outcome.map((r) => (r.tool_name || '').trim()).filter(Boolean))]
    .filter((t) => t !== 'ALL')
    .sort();
  for (const toolName of toolNames) {
    const slice = outcome.filter((r) => (r.tool_name || '').trim() === toolName);
    records.push(...computeReliabilityMetrics(slice, buckets, toolName));
  }

  writeQualityCsv(join(P.processed, 'reliability_metrics.csv'), records);
  console.log(
    `[measure-reliability] wrote ${records.length} records (1 'ALL' slice + ${toolNames.length} per-tool_name slice(s): ${toolNames.join(', ') || 'none'})`,
  );
}

safeMain('measure-reliability', main);
