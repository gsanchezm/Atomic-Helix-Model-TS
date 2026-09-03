// One-off historical validation — research hardening approval condition 7 ("Complete and validate
// the compatibility wiring between the new horizontal-e2e experiment interface and legacy
// non-atomic-twin artifact/analysis naming before the experiment freeze. Prove ingestion using all
// six already completed smoke combinations.").
//
// Two DISTINCT compatibility gaps existed before this, both real:
//   1. Artifact-name wiring: aggregate-campaign-artifacts.ts never called experimentArtifactNamesFor
//      — every experiment-mode dispatch's artifact would have failed to download (now fixed, see
//      that script + lib/artifact-merge.ts). This script downloads the 6 REAL smoke artifacts using
//      the same fixed path to prove the naming resolves against real GH Actions data, not just a
//      dry-run string match.
//   2. Analysis-layer naming: the experiment workflow stamps NEW tool_name values
//      (playwright/horizontal-e2e-web/appium-android/horizontal-e2e-android/appium-ios/
//      horizontal-e2e-ios — see atomic-testing-experiment.yml's per-job TOOL_NAME env) that the
//      legacy analysis layer (diagnosability-table.ts's TOOL_NAME_FOR_LEG, classifyFailure()'s
//      context fallback) has never seen. This repo has already been burned once by a silent
//      tool_name=UNKNOWN failure mode (normalize-telemetry.ts's file header, 2026-08-25) — this
//      script runs the REAL normalize-telemetry.ts pass over the merged data and asserts none of
//      the 6 run ids' scenario_outcome_history.csv rows come back UNKNOWN.
//
// The 6 run ids below are exactly the Phase 3 smoke table in
// docs/research/2026-09-02-phase2-implementation.md — historical, one-off, not a recurring
// instrument, so deliberately NOT added to lib/campaign-matrix.ts's CampaignItem/instrument system
// (which is scoped to web|android PlatformLeg; two of these six are ios, which has no legacy
// meaning and would force meaningless ios entries into every legacy Record in that module).
//
// Read-only against GH Actions (the 6 runs are long since completed — this dispatches nothing) and
// writes only to local metrics/raw + reports/ — safe to re-run.

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { experimentArtifactNamesFor, ExperimentPlatform, Arm } from './lib/campaign-matrix';
import { cleanupDownloadRoot, downloadArtifact, ensureDownloadRoot, mergeArtifactMetricsRaw } from './lib/artifact-merge';

const REPO_ROOT = join(__dirname, '..', '..');

interface SmokeRun {
  label: string;
  arm: Arm; // 'atomic' | 'twin' (twin === horizontal-e2e in the experiment naming layer)
  platform: ExperimentPlatform;
  runId: number;
}

const SMOKE_RUNS: SmokeRun[] = [
  { label: 'atomic / web (matched)', arm: 'atomic', platform: 'web', runId: 33691229416 },
  { label: 'horizontal-e2e / web', arm: 'twin', platform: 'web', runId: 33691719476 },
  { label: 'atomic / android (matched)', arm: 'atomic', platform: 'android', runId: 33691968941 },
  { label: 'horizontal-e2e / android', arm: 'twin', platform: 'android', runId: 33692562468 },
  { label: 'atomic / ios (matched)', arm: 'atomic', platform: 'ios', runId: 33695331381 },
  { label: 'horizontal-e2e / ios', arm: 'twin', platform: 'ios', runId: 33696552483 },
];

const EXPECTED_TOOL_NAME: Record<string, string> = {
  'atomic::web': 'playwright',
  'twin::web': 'horizontal-e2e-web',
  'atomic::android': 'appium-android',
  'twin::android': 'horizontal-e2e-android',
  'atomic::ios': 'appium-ios',
  'twin::ios': 'horizontal-e2e-ios',
};

function main(): void {
  console.log(`Validating experiment-mode artifact/analysis-naming wiring against ${SMOKE_RUNS.length} real smoke runs.\n`);

  ensureDownloadRoot();
  let downloadFailures = 0;
  for (const run of SMOKE_RUNS) {
    const names = experimentArtifactNamesFor(run.platform, run.runId);
    console.log(`[${run.label}] run ${run.runId} -> artifact ${names.join(', ')}`);
    for (const name of names) {
      const dir = downloadArtifact(run.runId, name);
      if (!dir) {
        downloadFailures++;
        continue;
      }
      const filesCopied = mergeArtifactMetricsRaw(dir);
      console.log(`    merged ${filesCopied} file(s)`);
    }
  }
  cleanupDownloadRoot();

  if (downloadFailures > 0) {
    throw new Error(`${downloadFailures} artifact download(s) failed — see warnings above. Naming did not resolve cleanly against real data.`);
  }
  console.log(`\nAll ${SMOKE_RUNS.length} smoke artifacts downloaded and merged into metrics/raw/ under their real names — artifact-naming wiring confirmed against real data.\n`);

  console.log('Running scripts/metrics/normalize-telemetry.ts over the merged data (analysis-layer naming check)...');
  execFileSync(
    join(REPO_ROOT, 'node_modules', '.bin', 'ts-node'),
    ['-r', 'tsconfig-paths/register', join(REPO_ROOT, 'scripts', 'metrics', 'normalize-telemetry.ts')],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );

  const csvPath = join(REPO_ROOT, 'metrics', 'processed', 'scenario_outcome_history.csv');
  const lines = readFileSync(csvPath, 'utf8').split('\n').filter(Boolean);
  const header = lines[0].split(',');
  const runIdCol = header.indexOf('run_id');
  const toolNameCol = header.indexOf('tool_name');
  const platformCol = header.indexOf('platform');
  if (runIdCol === -1 || toolNameCol === -1 || platformCol === -1) {
    throw new Error(`scenario_outcome_history.csv is missing an expected column (run_id/tool_name/platform); header: ${lines[0]}`);
  }

  console.log(`\nAnalysis-layer tool_name resolution, by smoke run (from ${csvPath}):`);
  let mismatches = 0;
  for (const run of SMOKE_RUNS) {
    // TOM_RUN_ID for these dispatches embeds github.run_id (= run.runId) — a prefix match against
    // the CSV's run_id column is enough to identify "some row from this dispatch" without needing
    // the exact TOM_RUN_ID format (matrix suffixes etc.) reconstructed here.
    const rows = lines.slice(1).filter((line) => {
      const cols = line.split(',');
      return cols[runIdCol]?.includes(String(run.runId));
    });
    const toolNames = new Set(rows.map((line) => line.split(',')[toolNameCol]));
    const expected = EXPECTED_TOOL_NAME[`${run.arm}::${run.platform}`];
    const ok = rows.length > 0 && [...toolNames].every((t) => t === expected);
    if (!ok) mismatches++;
    console.log(
      `  [${ok ? 'OK' : 'MISMATCH'}] ${run.label}  run=${run.runId}  rows=${rows.length}  ` +
      `tool_name observed=${[...toolNames].join('|') || '(none)'}  expected=${expected}`,
    );
  }

  if (mismatches > 0) {
    throw new Error(
      `${mismatches}/${SMOKE_RUNS.length} smoke run(s) did not resolve to their expected tool_name in ` +
      `scenario_outcome_history.csv — this is the "tool_name=UNKNOWN" failure mode from project history recurring ` +
      `for the new strategy naming. Fix before trusting Campaign A analysis output.`,
    );
  }
  console.log(`\nAll ${SMOKE_RUNS.length} smoke runs resolved to their expected tool_name — analysis-layer naming confirmed compatible.`);
}

main();
