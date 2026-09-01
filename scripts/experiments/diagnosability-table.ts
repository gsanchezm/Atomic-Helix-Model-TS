// Diagnosability table — §9.2 instrument (design doc §6: blast radius + localization accuracy).
// See docs/superpowers/specs/2026-08-23-diagnosability-fault-injection-harness-design.md.
//
// No generic pipeline computes this (measure-reliability.ts's per-batch slice pools every run_index —
// wrong here for the same reason it was wrong for §9.1, see parallel-safety-table.ts's header — and
// blast-radius/localization-accuracy isn't a reliability metric at all). Reads
// metrics/raw/cucumber-jsonl/*.jsonl directly (one dispatch = one GH run id = a unique file-name
// prefix, confirmed against the real diag-2026-campaign artifacts) and reuses the EXISTING classifier
// (scripts/metrics/lib/failure-buckets.ts) unchanged — this script does no new classification logic,
// only counts + compares.
//
// Definitions (design doc §6):
//   - Blast radius = count of scenarios that failed as a result of the one injected fault.
//   - Localization accuracy = does classifyFailure() report the bucket that was ACTUALLY injected, or
//     a different one (a mismatch is itself the diagnosability signal, not a harness bug)?
// A failing scenario's OWN first FAIL step is what's fed to classifyFailure() — matching how
// scripts/metrics/normalize-telemetry.ts / measure-reliability.ts treat "the" error for a scenario
// elsewhere in this pipeline (one classification per scenario, not per step).

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { classifyFailure } from '../metrics/lib/failure-buckets';
import { Arm, DIAGNOSABILITY_CONDITIONS, DIAGNOSABILITY_EXCLUDED_BUCKETS, PlatformLeg, legKeyOf } from './lib/campaign-matrix';

// Real TOOL_NAME values per leg — confirmed against each job's own `env:` block in
// ahm-execution-helix.yml / ahm-evaluation-campaign.yml (same constants campaign-matrix.ts's own
// TOM_RUN_ID comments document). classifyFailure()'s context-based fallback (used only when no regex
// rule matches the message) keys off exactly these.
const TOOL_NAME_FOR_LEG: Record<string, string> = {
  'atomic-web': 'playwright',
  'atomic-android': 'appium-android',
  'twin-web': 'non-atomic-twin-web',
  'twin-android': 'non-atomic-twin-android',
};

const REPO_ROOT = join(__dirname, '..', '..');
const CUCUMBER_JSONL_DIR = join(REPO_ROOT, 'metrics', 'raw', 'cucumber-jsonl');
const MANIFEST_PATH = join(REPO_ROOT, 'reports', 'campaigns', 'campaign-diagnosability.json');

interface StepRecord {
  name: string;
  status: string;
  durationMs: number;
  errorMessage: string | null;
}
interface ScenarioRecord {
  runId: string;
  feature: string;
  scenario: string;
  status: string;
  steps: StepRecord[];
}

// Which CI job a scenario ran under — encoded in the jsonl file name itself, e.g.
// tom-<runId>-1-<bucket>-playwright-desktop-reads-chromium.jsonl /
// tom-<runId>-1-<bucket>-appium-android-writes.jsonl. Needed because atomic's "reads"/"writes" job
// split means a raw scenario-count denominator (89-106 depending on dispatch) isn't directly
// comparable to the twin's much smaller single-job suite (16) — see per-job breakdown below.
function jobOfFile(fileName: string): string {
  if (fileName.includes('-reads-') || fileName.includes('-reads.')) return 'reads';
  if (fileName.includes('-writes-') || fileName.includes('-writes.')) return 'writes';
  return 'unknown';
}

interface DispatchRecord {
  status: string;
  runId?: number;
}
interface CampaignManifest {
  results: Record<string, DispatchRecord>;
}

function loadJsonl(path: string): ScenarioRecord[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ScenarioRecord);
}

// Scenario plus the job (reads/writes) its own source file encodes — job is lost once flattened,
// so it's threaded through here rather than re-derived later.
interface ScenarioWithJob extends ScenarioRecord {
  job: string;
}

function scenariosForRun(runId: number): ScenarioWithJob[] {
  const prefix = `tom-${runId}-`;
  const files = readdirSync(CUCUMBER_JSONL_DIR).filter((f) => f.startsWith(prefix));
  if (files.length === 0) {
    throw new Error(`No cucumber-jsonl files found for run ${runId} (prefix "${prefix}") — aggregate first.`);
  }
  return files.flatMap((f) => {
    const job = jobOfFile(f);
    return loadJsonl(join(CUCUMBER_JSONL_DIR, f)).map((s) => ({ ...s, job }));
  });
}

// The scenario's own first FAIL step's errorMessage — matching how the rest of this pipeline treats
// "the" error for a scenario (one classification per scenario).
function firstFailStep(scenario: ScenarioRecord): StepRecord | undefined {
  return scenario.steps.find((s) => s.status === 'FAIL');
}

interface FailedScenarioSteps {
  job: string;
  totalSteps: number;
  passedSteps: number;
  skippedSteps: number; // steps never reached because an earlier step in the SAME scenario failed —
  // the "wasted oracle" cost of the one injected fault (design doc §6: scenarios/oracles are the unit
  // that discriminates atomic from non-atomic here, not the scenario-count blast radius alone).
}

interface DispatchResult {
  bucket: string; // true injected bucket(s), comma-joined for the shared TIMEOUT/PERFORMANCE condition
  arm: 'atomic' | 'twin';
  platformLeg: string;
  runId: number;
  totalScenarios: number;
  failedScenarios: number;
  scenariosByJob: Record<string, number>; // job -> total scenario count (reads/writes/unknown)
  failedByJob: Record<string, number>; // job -> failed scenario count
  reportedBuckets: Record<string, number>; // classifyFailure() result -> count among failed scenarios
  sampleErrorMessage: string | null; // first failed scenario's error, for manual spot-check
  failedScenarioSteps: FailedScenarioSteps[]; // per-failed-scenario step accounting, see above
}

function main(): void {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`No campaign manifest at ${MANIFEST_PATH} — run the diagnosability campaign first.`);
  }
  const manifest: CampaignManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const arms: Array<'atomic' | 'twin'> = ['atomic', 'twin'];

  const results: DispatchResult[] = [];
  for (const condition of DIAGNOSABILITY_CONDITIONS) {
    const slug = condition.bucket.split(',')[0];
    for (const arm of arms) {
      const id = `diagnosability__${arm}__${condition.platformLeg}__${slug}`;
      const record = manifest.results[id];
      if (!record || record.status !== 'completed' || !record.runId) {
        throw new Error(`Manifest item "${id}" is not a completed dispatch with a runId — cannot extract.`);
      }
      const scenarios = scenariosForRun(record.runId);
      const failed = scenarios.filter((s) => s.status === 'FAIL');
      const reportedBuckets: Record<string, number> = {};
      const scenariosByJob: Record<string, number> = {};
      const failedByJob: Record<string, number> = {};
      const failedScenarioSteps: FailedScenarioSteps[] = [];
      let sampleErrorMessage: string | null = null;
      for (const scenario of scenarios) {
        scenariosByJob[scenario.job] = (scenariosByJob[scenario.job] ?? 0) + 1;
      }
      for (const scenario of failed) {
        failedByJob[scenario.job] = (failedByJob[scenario.job] ?? 0) + 1;
        const step = firstFailStep(scenario);
        const errorMessage = step?.errorMessage ?? null;
        if (sampleErrorMessage === null) sampleErrorMessage = errorMessage;
        const bucket = classifyFailure('FAIL', errorMessage, {
          toolName: TOOL_NAME_FOR_LEG[legKeyOf(arm, condition.platformLeg as PlatformLeg)],
          platform: condition.platformLeg,
        });
        const key = bucket ?? 'NULL';
        reportedBuckets[key] = (reportedBuckets[key] ?? 0) + 1;
        const passedSteps = scenario.steps.filter((s) => s.status === 'PASS').length;
        const skippedSteps = scenario.steps.filter((s) => s.status === 'SKIP').length;
        failedScenarioSteps.push({
          job: scenario.job,
          totalSteps: scenario.steps.length,
          passedSteps,
          skippedSteps,
        });
      }
      results.push({
        bucket: condition.bucket,
        arm,
        platformLeg: condition.platformLeg,
        runId: record.runId,
        totalScenarios: scenarios.length,
        failedScenarios: failed.length,
        scenariosByJob,
        failedByJob,
        reportedBuckets,
        sampleErrorMessage,
        failedScenarioSteps,
      });
    }
  }

  const outPath = join(REPO_ROOT, 'reports', 'diagnosability-table.json');
  mkdirSync(join(REPO_ROOT, 'reports'), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify({ results, excludedBuckets: DIAGNOSABILITY_EXCLUDED_BUCKETS }, null, 2) + '\n',
  );

  console.log('§9.2 diagnosability — blast radius + localization accuracy\n');
  console.log(
    '| True bucket | Arm | Failed scenarios by job | Reported bucket(s) | Skipped steps per failed scenario |',
  );
  console.log('|---|---|---|---|---|');
  for (const r of results) {
    const reportedStr = Object.entries(r.reportedBuckets)
      .map(([b, n]) => `${b}×${n}`)
      .join(', ') || '—';
    const byJobStr = Object.entries(r.scenariosByJob)
      .map(([job, total]) => `${job}: ${r.failedByJob[job] ?? 0}/${total}`)
      .join(', ');
    const skipsStr = r.failedScenarioSteps
      .map((s) => `${s.skippedSteps}/${s.totalSteps} (${s.job})`)
      .join(', ') || '—';
    console.log(
      `| ${r.bucket} | ${r.arm} | ${byJobStr} | ${reportedStr} | ${skipsStr} |`,
    );
  }
  console.log(`\nExcluded buckets (not injected): ${DIAGNOSABILITY_EXCLUDED_BUCKETS.map((b) => b.bucket).join(', ')}`);
  console.log(`\nWritten to ${outPath}`);
}

main();
