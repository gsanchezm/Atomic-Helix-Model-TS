// Retry-sensitivity re-analysis of the N=30 determinism campaign (research
// hardening Phase 2, decision (b) — docs/research/2026-09-02-research-hardening-
// phase1-audit.md finding (b)).
//
// The completed det-2026-campaign ran with ASYMMETRIC retry between arms:
// the atomic arm on cucumber.js's `default` profile (retry: 1), the twin on
// `nonAtomicTwin` (retry: 0). scenario_outcome_history.csv records FINAL
// scenario status, and cucumber's JSON formatter drops the attempt-1 record
// of a retried scenario outright (node_modules/@cucumber/cucumber/lib/
// formatter/json_formatter.js:90 — `if (!testCaseAttempt.willBeRetried)`),
// so an atomic flake healed by the retry is INVISIBLE in every per-scenario
// artifact this repo stores. Part of the published pass->fail divergence
// could therefore be retry policy, not authoring discipline.
//
// Attempt-1 outcomes ARE recoverable, exactly (not approximately), from the
// GH Actions job logs: the cucumber `progress` formatter prints every
// retried attempt under "Warnings:" as
//   "N) Scenario: <name> (attempt 1, retried) # <feature>:<line>"
// while a scenario whose retry ALSO failed appears under "Failures:" (and in
// the CSV as FAIL — no adjustment needed there). Those logs were scanned
// into the archived dataset by the archival step of the same Phase 2 work:
//   archives/atomic-testing-dataset-v1/retry-evidence/determinism-flaky-scan.json
// (one record per campaign item, with the per-job cucumber summary lines and
// every "(attempt 1, retried)" warning). This script joins that evidence
// against scenario_outcome_history.csv and reports the determinism metrics
// BOTH ways:
//   - original: final-status sequences exactly as published;
//   - retry-adjusted: every retry-healed (dispatch, scenario) cell flipped
//     to its attempt-1 outcome (FAIL), i.e. what a symmetric retry:0 run
//     would have recorded, under the standard assumption that the retry
//     itself does not change attempt-1 behavior.
//
// The transition computation deliberately replicates
// scripts/metrics/measure-reliability.ts's grouping (scenario x tool_name x
// platform x experiment_batch_id, ordered by run_index) so the "original"
// numbers are the same ones the paper's §4.3 draws on — with exact fractions
// rather than that script's 2-decimal rounding.
//
// Usage:
//   pnpm experiments:retry-sensitivity
//   ts-node -r tsconfig-paths/register scripts/experiments/retry-sensitivity-analysis.ts \
//     [--scan <path to determinism-flaky-scan.json>] [--batch det-2026-campaign]
//
// Output: reports/retry-sensitivity.json + a human-readable table on stdout.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..');
const DEFAULT_SCAN = join(
  REPO_ROOT,
  'archives',
  'atomic-testing-dataset-v1',
  'retry-evidence',
  'determinism-flaky-scan.json',
);
const OUTCOME_CSV = join(REPO_ROOT, 'metrics', 'processed', 'scenario_outcome_history.csv');
const OUT_JSON = join(REPO_ROOT, 'reports', 'retry-sensitivity.json');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const scanPath = argValue('--scan') ?? DEFAULT_SCAN;
const batchId = argValue('--batch') ?? 'det-2026-campaign';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
interface FlakyEvidence {
  scenario: string;
  file: string;
  line: number;
}
interface ScanJob {
  jobMatch: string;
  logFile: string | null;
  summaries: Array<{ total: number; detail: string }>;
  flaky: FlakyEvidence[];
  failures: Array<{ scenario: string; file: string }>;
}
interface ScanItem {
  item: string;
  runId: number;
  arm: 'atomic' | 'twin';
  platform: 'web' | 'android';
  runIndex: string;
  jobs: ScanJob[];
}
interface Scan {
  scannedItems: number;
  missingLogs: string[];
  items: ScanItem[];
}

// Minimal CSV reader for this file's known shape (no quoted commas are used in
// the identity columns we need; scenario names CAN contain commas, so parse
// with a real quote-aware splitter rather than String.split).
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

interface OutcomeRow {
  experiment_batch_id: string;
  run_index: string;
  workflow_run_id: string;
  tool_name: string;
  platform: string;
  scenario: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
}

function loadOutcomeRows(): OutcomeRow[] {
  const raw = readFileSync(OUTCOME_CSV, 'utf8').split('\n').filter((l) => l.trim() !== '');
  const header = parseCsvLine(raw[0]);
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`scenario_outcome_history.csv is missing expected column "${name}"`);
    return i;
  };
  const cBatch = col('experiment_batch_id');
  const cRunIndex = col('run_index');
  const cWfRun = col('workflow_run_id');
  const cTool = col('tool_name');
  const cPlatform = col('platform');
  const cScenario = col('scenario');
  const cStatus = col('status');
  return raw.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return {
      experiment_batch_id: cells[cBatch],
      run_index: cells[cRunIndex],
      workflow_run_id: cells[cWfRun],
      tool_name: cells[cTool],
      platform: cells[cPlatform],
      scenario: cells[cScenario],
      status: cells[cStatus] as OutcomeRow['status'],
    };
  });
}

// ---------------------------------------------------------------------------
// Transition computation — replicates measure-reliability.ts's grouping
// (scenario::tool_name::platform::batch, ordered by run_index) with exact
// fractions.
// ---------------------------------------------------------------------------
interface ArmStats {
  observations: number;
  passObservations: number;
  failObservations: number;
  passToFail: { changed: number; total: number };
  failToPass: { changed: number; total: number };
  unstableScenarios: number; // scenarios whose 30-run sequence contains both PASS and FAIL
}

function computeStats(rows: OutcomeRow[]): ArmStats {
  const groups = new Map<string, OutcomeRow[]>();
  for (const r of rows) {
    const key = `${r.scenario}::${r.tool_name}::${r.platform}::${r.experiment_batch_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const stats: ArmStats = {
    observations: rows.length,
    passObservations: rows.filter((r) => r.status === 'PASS').length,
    failObservations: rows.filter((r) => r.status === 'FAIL').length,
    passToFail: { changed: 0, total: 0 },
    failToPass: { changed: 0, total: 0 },
    unstableScenarios: 0,
  };
  for (const group of groups.values()) {
    const seq = [...group]
      .sort((a, b) => a.run_index.localeCompare(b.run_index))
      .map((r) => r.status);
    if (seq.includes('PASS') && seq.includes('FAIL')) stats.unstableScenarios += 1;
    for (let i = 0; i < seq.length - 1; i++) {
      if (seq[i] === 'PASS') {
        stats.passToFail.total += 1;
        if (seq[i + 1] === 'FAIL') stats.passToFail.changed += 1;
      } else if (seq[i] === 'FAIL') {
        stats.failToPass.total += 1;
        if (seq[i + 1] === 'PASS') stats.failToPass.changed += 1;
      }
    }
  }
  return stats;
}

const pct = (n: number, d: number): string => (d > 0 ? `${((n / d) * 100).toFixed(3)}%` : 'n/a');

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): void {
  if (!existsSync(scanPath)) {
    throw new Error(
      `Flaky-scan evidence not found at ${scanPath}. Regenerate it from the archived GH run logs ` +
      `(see archives/atomic-testing-dataset-v1/README.md, "Retry evidence") or pass --scan <path>.`,
    );
  }
  const scan: Scan = JSON.parse(readFileSync(scanPath, 'utf8'));
  if (scan.missingLogs.length > 0) {
    console.warn(
      `WARNING: the scan is missing logs for ${scan.missingLogs.length} item(s): ${scan.missingLogs.join(', ')} — ` +
      `their retry-heals (if any) cannot be counted, so the adjusted numbers are a LOWER BOUND for those items.`,
    );
  }

  const all = loadOutcomeRows().filter((r) => r.experiment_batch_id === batchId);
  if (all.length === 0) throw new Error(`No rows with experiment_batch_id="${batchId}" in ${OUTCOME_CSV}`);

  // Evidence join: (workflow_run_id, scenario name) -> attempt-1 FAIL.
  // Joining on workflow_run_id (not run_index) survives any run_index reuse
  // across batches; scenario names are unique per run in the CSV (outline
  // name collisions are already collapsed upstream by normalize-telemetry).
  const flips = new Map<string, FlakyEvidence & { item: string }>();
  let evidenceCount = 0;
  for (const item of scan.items) {
    for (const job of item.jobs) {
      for (const f of job.flaky) {
        evidenceCount += 1;
        flips.set(`${item.runId}::${f.scenario}`, { ...f, item: item.item });
      }
    }
  }

  const adjusted: OutcomeRow[] = [];
  const applied: Array<{ item: string; scenario: string; originalStatus: string }> = [];
  const unmatched: string[] = [];
  const matchedKeys = new Set<string>();
  for (const r of all) {
    const key = `${r.workflow_run_id}::${r.scenario}`;
    const flip = flips.get(key);
    if (flip) {
      matchedKeys.add(key);
      applied.push({ item: flip.item, scenario: r.scenario, originalStatus: r.status });
      // A retried-then-passed scenario is PASS in the CSV — flip it to its
      // attempt-1 outcome. (If it were FAIL the retry also failed and the
      // CSV already carries the right symmetric value; flip is a no-op.)
      adjusted.push({ ...r, status: 'FAIL' });
    } else {
      adjusted.push(r);
    }
  }
  for (const [key, f] of flips) {
    if (!matchedKeys.has(key)) unmatched.push(`${f.item}: "${f.scenario}"`);
  }
  if (unmatched.length > 0) {
    throw new Error(
      `${unmatched.length} retry-heal evidence item(s) did not match any CSV row — scenario-name join is broken, ` +
      `refusing to report a silently-partial adjustment:\n  ${unmatched.join('\n  ')}`,
    );
  }

  const toolNames = [...new Set(all.map((r) => r.tool_name))].sort();
  const perTool: Record<string, { original: ArmStats; adjusted: ArmStats }> = {};
  for (const tool of toolNames) {
    perTool[tool] = {
      original: computeStats(all.filter((r) => r.tool_name === tool)),
      adjusted: computeStats(adjusted.filter((r) => r.tool_name === tool)),
    };
  }

  // The paper's headline contrast is per-platform (twin vs atomic on the same
  // platform). Ratios are computed on exact fractions.
  const ratio = (twin: ArmStats, atomic: ArmStats): number | null => {
    const t = twin.passToFail.total > 0 ? twin.passToFail.changed / twin.passToFail.total : null;
    const a = atomic.passToFail.total > 0 ? atomic.passToFail.changed / atomic.passToFail.total : null;
    if (t === null || a === null || a === 0) return null;
    return t / a;
  };

  const pairings: Array<{ platform: string; atomicTool: string; twinTool: string }> = [
    { platform: 'web', atomicTool: 'playwright', twinTool: 'non-atomic-twin-web' },
    { platform: 'android', atomicTool: 'appium-android', twinTool: 'non-atomic-twin-android' },
  ].filter((p) => toolNames.includes(p.atomicTool) && toolNames.includes(p.twinTool));

  const report = {
    batchId,
    scanPath,
    retryHealEvidence: {
      count: evidenceCount,
      applied,
    },
    perTool: Object.fromEntries(
      Object.entries(perTool).map(([tool, s]) => [
        tool,
        {
          original: {
            observations: s.original.observations,
            passToFail: `${s.original.passToFail.changed}/${s.original.passToFail.total}`,
            passToFailRate: s.original.passToFail.total > 0 ? s.original.passToFail.changed / s.original.passToFail.total : null,
            unstableScenarios: s.original.unstableScenarios,
          },
          retryAdjusted: {
            observations: s.adjusted.observations,
            passToFail: `${s.adjusted.passToFail.changed}/${s.adjusted.passToFail.total}`,
            passToFailRate: s.adjusted.passToFail.total > 0 ? s.adjusted.passToFail.changed / s.adjusted.passToFail.total : null,
            unstableScenarios: s.adjusted.unstableScenarios,
          },
        },
      ]),
    ),
    crossArmRatios: pairings.map((p) => ({
      platform: p.platform,
      originalTwinOverAtomic: ratio(perTool[p.twinTool].original, perTool[p.atomicTool].original),
      retryAdjustedTwinOverAtomic: ratio(perTool[p.twinTool].adjusted, perTool[p.atomicTool].adjusted),
    })),
  };

  mkdirSync(join(REPO_ROOT, 'reports'), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n');

  // ---- human-readable output ----
  console.log(`Retry-sensitivity analysis — batch ${batchId}`);
  console.log(`Retry-heal evidence (attempt-1 failures healed by cucumber retry): ${evidenceCount}`);
  const byItem = new Map<string, number>();
  for (const a of applied) byItem.set(a.item.replace(/__\d+$/, ''), (byItem.get(a.item.replace(/__\d+$/, '')) ?? 0) + 1);
  for (const [leg, n] of byItem) console.log(`  ${leg}: ${n} dispatch(es) affected`);
  console.log('');
  for (const tool of toolNames) {
    const s = perTool[tool];
    console.log(`${tool}`);
    console.log(
      `  original:       P->F ${s.original.passToFail.changed}/${s.original.passToFail.total} (${pct(s.original.passToFail.changed, s.original.passToFail.total)}), unstable scenarios ${s.original.unstableScenarios}`,
    );
    console.log(
      `  retry-adjusted: P->F ${s.adjusted.passToFail.changed}/${s.adjusted.passToFail.total} (${pct(s.adjusted.passToFail.changed, s.adjusted.passToFail.total)}), unstable scenarios ${s.adjusted.unstableScenarios}`,
    );
  }
  console.log('');
  for (const r of report.crossArmRatios) {
    const fmt = (v: number | null): string => (v === null ? 'undefined (atomic rate is 0)' : `${v.toFixed(1)}x`);
    console.log(`${r.platform}: twin/atomic P->F ratio — original ${fmt(r.originalTwinOverAtomic)}, retry-adjusted ${fmt(r.retryAdjustedTwinOverAtomic)}`);
  }
  console.log(`\nWrote ${OUT_JSON}`);
}

main();
