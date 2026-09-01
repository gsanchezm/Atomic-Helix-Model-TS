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
//
// batchId (optional): when provided (the new per-(tool_name, batch) call sites in main(), below), tags
// every output record's experiment_batch_id with that EXACT batch. When undefined (the 'ALL' and pooled
// per-tool_name call sites), records are explicitly tagged 'ALL' — mirroring how `toolName: undefined`
// already means "tag as the literal sentinel 'ALL'" for tool_name. This is NOT optional/cosmetic: without
// an explicit sentinel here, lib/quality.ts's writeQualityCsv falls back to a "representative manifest"
// batch id that has NO relationship to which batches actually fed a pooled slice — confirmed to produce
// real false attribution (a tool_name tagged with a batch it has zero rows from) and ambiguous duplicate
// rows (a pooled row's fallback label colliding with a genuine same-tool per-batch row) by adversarial
// review 2026-08-31, the same day the per-batch slices below were added. Explicit 'ALL' closes it the
// same way sentinel tool_name='ALL' already does.
//
// The transition-detection grouping key below keys off each ROW's own experiment_batch_id (not this
// batchId parameter) — so cross-batch interleaving is prevented for EVERY call site, pooled or scoped,
// regardless of what's passed here. Pooling here only sums already-batch-clean transition counts across
// batches, which is a legitimate "aggregate across everything measured so far" statistic, not fabrication
// (verified independently 2026-08-31 by adversarial review, recomputing a pooled slice by hand). A POOLED
// number is still never the right one to read for a claim scoped to one specific batch (e.g. §9.3's
// determinism-only numbers) — use the per-(tool_name, batch) slices in main() for that.
function computeReliabilityMetrics(
  outcomeRows: Record<string, string>[],
  bucketRows: Record<string, string>[],
  toolName: string | undefined, // undefined -> QualityRecord.tool_name defaults to 'ALL'
  batchId?: string,
): QualityRecord[] {
  const records: QualityRecord[] = [];
  const tag = { tool_name: toolName, experiment_batch_id: batchId ?? 'ALL' };

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

  // --- Group by (scenario, tool_name, platform, experiment_batch_id); order by run_index for transitions ---
  // tool_name stays IN the key even though outcomeRows is already tool_name-filtered for every
  // per-tool_name call site (main() below) — it's redundant there (empirically confirmed: partitioning
  // by the 2-part vs. 3-part key produces identical groups within a single-tool_name slice) but it is
  // NOT redundant for the 'ALL' slice, which is fed the full, unfiltered, multi-arm outcome array.
  // Dropping it there would merge two different arms' rows sharing one (scenario, platform) into a
  // single transition sequence — fabricating flaky_scenario_count / pass_to_fail_probability /
  // fail_to_pass_probability out of pure interleaving, not real flakiness in either arm. Caught by
  // adversarial review (2026-08-26) with an empirical repro before this was ever committed.
  //
  // experiment_batch_id added to the key 2026-08-31 for the identical reason, one axis up: once more
  // than one campaign batch's repeated-run data coexists in scenario_outcome_history.csv for the same
  // (scenario, tool_name, platform) — e.g. the determinism campaign's det-2026-campaign (run_index
  // '001'-'030', a real temporal repeat sequence) and the earlier efficiency instrument's
  // eff-2026-campaign-android (run_index '001'-'013', a DIFFERENT, unrelated repeat sequence) both use
  // the same tool_name/platform and the same zero-padded run_index scheme — a 2-part-plus-scenario key
  // sorts their rows into ONE interleaved sequence by run_index string, fabricating transitions between
  // two batches that were never actually adjacent in time or purpose. Empirically confirmed present in
  // this exact dataset before the fix (every appium-android / non-atomic-twin-android scenario had both
  // det-2026-campaign and eff-2026-campaign-android rows sharing run_index '001'-'013'). This key
  // addition is a no-op for any already-batch-filtered call (every row shares one batch id already) and
  // only changes behavior for a call fed multiple batches' rows at once — i.e. it protects the pooled
  // 'ALL'/per-tool_name slices from the same fabrication risk the 2026-08-26 fix closed for arms.
  const groups = new Map<string, Record<string, string>[]>();
  for (const r of outcomeRows) {
    const scenario = r.scenario || r.scenario_name || '';
    const key = `${scenario}::${r.tool_name || ''}::${r.platform || ''}::${r.experiment_batch_id || ''}`;
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
  // Scoped by batchId too (when given), matching outcomeRows' own scoping — otherwise the numerator
  // here could still pull in another batch's bucket rows against this batch's `total` denominator.
  const scopedBuckets = bucketRows.filter(
    (r) =>
      (toolName === undefined || (r.tool_name || '').trim() === toolName) &&
      (batchId === undefined || (r.experiment_batch_id || '').trim() === batchId),
  );

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

  // Per-(tool_name, experiment_batch_id) slices — added 2026-08-31. The per-tool_name slices above pool
  // every batch ever collected for that tool (correct for an "aggregate reliability so far" number, now
  // that the grouping-key fix prevents them from fabricating cross-batch transitions) but CANNOT answer
  // a claim scoped to one specific campaign batch (e.g. §9.3's determinism-only transition rates) — a
  // pooled number silently blends in unrelated batches (parallel-safety's worker-level "sequence",
  // the efficiency instrument's differently-purposed repeats) that happen to share a tool_name/platform.
  // One slice per (tool_name, batch) actually present in the data; batchId is tagged explicitly on the
  // output rows via lib/quality.ts's per-record experiment_batch_id override (also added 2026-08-31) so
  // a reader of reliability_metrics.csv can filter to exactly the batch a claim needs, unambiguously.
  // The literal string 'ALL' is excluded from batchId here for the identical reason toolName==='ALL' is
  // excluded above: computeReliabilityMetrics()'s pooled call sites (batchId undefined) now explicitly
  // tag their own output rows experiment_batch_id='ALL' — a raw input row that happened to carry that
  // literal value would otherwise get its own per-batch slice key-identical to the pooled one.
  const toolBatchPairs = [...new Set(
    outcome
      .filter((r) => toolNames.includes((r.tool_name || '').trim()))
      .map((r) => `${(r.tool_name || '').trim()}::${(r.experiment_batch_id || '').trim()}`),
  )].sort();
  let batchSliceCount = 0;
  for (const pairKey of toolBatchPairs) {
    const [toolName, batchId] = pairKey.split('::');
    if (!batchId || batchId === 'ALL') continue; // no batch id recorded upstream, or reserved sentinel — nothing meaningful to scope to
    const slice = outcome.filter(
      (r) => (r.tool_name || '').trim() === toolName && (r.experiment_batch_id || '').trim() === batchId,
    );
    records.push(...computeReliabilityMetrics(slice, buckets, toolName, batchId));
    batchSliceCount++;
  }

  writeQualityCsv(join(P.processed, 'reliability_metrics.csv'), records);
  console.log(
    `[measure-reliability] wrote ${records.length} records (1 'ALL' slice + ${toolNames.length} per-tool_name slice(s): ${toolNames.join(', ') || 'none'} + ${batchSliceCount} per-tool_name-per-batch slice(s))`,
  );
}

safeMain('measure-reliability', main);
