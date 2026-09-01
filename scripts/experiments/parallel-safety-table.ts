// Parallel-safety table — §9.1 instrument (Corollary 2, reframed per §8.4's
// "Note on the parallel-safety instrument's reframing": this application has
// no username-keyed shared mutable state, so the claim under test is
// resilience under concurrent same-account UI traffic, not data-collision
// correctness).
//
// measure-reliability.ts's per-(tool_name, experiment_batch_id) slice (added
// 2026-08-31 for §9.3) deliberately POOLS every run_index within a batch —
// correct for determinism/efficiency, where run_index is a repeat of the
// SAME condition. parallel-safety repurposes run_index as a worker-level
// LABEL (w1/w2/w4/w8) — four distinct conditions, one dispatch each, not
// repeats of one condition — so pooling them together would average away
// the exact per-worker-level breakdown §9.1's table needs. This script reads
// the same upstream scenario_outcome_history.csv and adds that one missing
// breakdown, without changing measure-reliability.ts's pooled-slice
// semantics (which stay correct and useful for every other instrument that
// reads that file).

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { readCsv, round2 } from '../metrics/lib/csv';
import { P } from '../metrics/lib/paths';

const BATCH_ID = 'ps-2026-campaign';
const WORKER_LEVELS = [1, 2, 4, 8];

// Confirmed against campaign-matrix.ts's GH_PLATFORM_INPUT / normalize-telemetry.ts's tool_name
// stamping — parallel-safety is web-only (see buildParallelSafetyItems's own comment).
const ARM_TOOL_NAME: Record<'atomic' | 'twin', string> = {
  atomic: 'playwright',
  twin: 'non-atomic-twin-web',
};

interface Cell {
  workers: number;
  total: number;
  fails: number;
  failRate: number;
}

function main(): void {
  const outcome = readCsv(join(P.processed, 'scenario_outcome_history.csv'));
  const rows = outcome.filter((r) => (r.experiment_batch_id || '').trim() === BATCH_ID);
  if (rows.length === 0) {
    throw new Error(
      `No scenario_outcome_history.csv rows tagged experiment_batch_id="${BATCH_ID}" — run ` +
        `'pnpm experiments:run-campaign -- --instrument parallel-safety', then ` +
        `'pnpm experiments:aggregate-campaign -- --instrument parallel-safety', then ` +
        `'pnpm metrics:experiment' before this script.`,
    );
  }

  const table: Record<'atomic' | 'twin', Record<number, Cell>> = { atomic: {}, twin: {} };
  for (const arm of ['atomic', 'twin'] as const) {
    const toolName = ARM_TOOL_NAME[arm];
    for (const workers of WORKER_LEVELS) {
      const runIndex = `w${workers}`;
      const slice = rows.filter(
        (r) => (r.tool_name || '').trim() === toolName && (r.run_index || '').trim() === runIndex,
      );
      if (slice.length === 0) {
        throw new Error(
          `No rows for arm=${arm} (tool_name=${toolName}) workers=${workers} (run_index=${runIndex}) in batch ` +
            `"${BATCH_ID}" — the campaign matrix expects exactly one dispatch per (arm, worker level); this one ` +
            `is missing from scenario_outcome_history.csv.`,
        );
      }
      const fails = slice.filter((r) => (r.outcome || r.status || '').trim().toUpperCase() === 'FAIL').length;
      table[arm][workers] = {
        workers,
        total: slice.length,
        fails,
        failRate: round2(fails / slice.length) as number,
      };
    }
  }

  const report = {
    experimentBatchId: BATCH_ID,
    generatedFrom: 'metrics/processed/scenario_outcome_history.csv',
    table,
  };
  mkdirSync(join(P.reports), { recursive: true });
  writeFileSync(join(P.reports, 'parallel-safety-table.json'), JSON.stringify(report, null, 2) + '\n');

  console.log(`Parallel safety (batch=${BATCH_ID}) — failure rate per worker level:\n`);
  console.log('| Workers | Atomic suite — failure rate | Non-atomic twin — failure rate |');
  console.log('|---|---|---|');
  for (const workers of WORKER_LEVELS) {
    const a = table.atomic[workers];
    const t = table.twin[workers];
    console.log(
      `| ${workers} | ${a.failRate.toFixed(2)} (${a.fails}/${a.total}) | ${t.failRate.toFixed(2)} (${t.fails}/${t.total}) |`,
    );
  }
  console.log(`\nWritten to ${join(P.reports, 'parallel-safety-table.json')}`);
}

main();
