// Execution-efficiency delta — ancillary R3 instrument (companion to the
// Platform-invariance corollary, not one of the four §5 Rule-derived
// corollaries). See
// docs/superpowers/specs/2026-08-25-execution-efficiency-instrument-design.md
// for the full design, the rejected alternatives (whole-job wall-clock,
// assembled-scenario "sum"), and why per-operation step-time is what's used.
//
// Measures cucumber STEP-time (metrics/raw/cucumber-jsonl/*.jsonl), not
// sendIntent-level mechanism-time — metrics/raw/tool-events/*.jsonl (what
// aggregate-durations.ts reads) is not populated by this campaign's uploaded
// artifacts; proxy-jsonl/ is present but empty besides .gitkeep. Confirmed by
// inspection before writing this, not assumed.
//
// Two comparandum pairs only — both reach the SAME functional end state via a
// genuinely different mechanism in each arm, with no R1 scenario-independence
// cost baked into either side (see the design doc's "Explicitly excluded"
// section for what was deliberately left out and why: catalog/builder-click
// steps are UI in both arms and kept only as a negative control; the
// standalone atomic "Given the pizza builder is open for..." step pays R1's
// independence cost, not R3's mechanism cost, and is excluded entirely).

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..');
const CUCUMBER_JSONL_DIR = join(REPO_ROOT, 'metrics', 'raw', 'cucumber-jsonl');
const SAMPLES_PATH = join(REPO_ROOT, 'reports', 'execution-efficiency-samples.json');

interface StepRecord {
  name: string;
  status: string;
  durationMs: number;
}
interface ScenarioRecord {
  runId: string;
  feature: string;
  scenario: string;
  status: string;
  durationMs: number;
  steps: StepRecord[];
}

function loadJsonl(path: string): ScenarioRecord[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ScenarioRecord);
}

function findFilesForRun(runId: string, suffixPattern: RegExp): string[] {
  return readdirSync(CUCUMBER_JSONL_DIR)
    .filter((f) => f.startsWith(`tom-${runId}-`) && suffixPattern.test(f))
    .map((f) => join(CUCUMBER_JSONL_DIR, f));
}

// A step that never ran because an earlier step in the same scenario failed still appears in the
// jsonl (status SKIP, durationMs 0, per normalize-telemetry.ts's nsToMs) — matching it by name alone
// would silently fold a 0ms "didn't run" into the mean. Require every matched step to be a real PASS.
function stepDuration(scenario: ScenarioRecord, stepNamePredicate: (name: string) => boolean): number {
  const matches = scenario.steps.filter((s) => stepNamePredicate(s.name));
  if (matches.length === 0) {
    throw new Error(
      `No step matched in scenario "${scenario.scenario}" (${scenario.runId}) — the predicate or the scenario text has drifted from what this script expects. Steps present: ${scenario.steps.map((s) => s.name).join(' | ')}`,
    );
  }
  const notPassed = matches.filter((s) => s.status !== 'PASS');
  if (notPassed.length > 0) {
    throw new Error(
      `Scenario "${scenario.scenario}" (${scenario.runId}) has a non-PASS matched step (${notPassed.map((s) => `${s.name}=${s.status}`).join(', ')}) — this run isn't a valid data point for this comparandum. Re-dispatch instead of averaging in a partial/failed run.`,
    );
  }
  return matches.reduce((sum, s) => sum + s.durationMs, 0);
}

// .find() would silently pick the first of several same-named scenarios (real in this repo's data —
// e.g. catalog/pizzaBuilder Outlines interpolate only <market> into the title while Examples also vary
// <language>, so CH has two rows both named "... in CH"). Require exactly one match so an ambiguous
// scenario name fails loudly instead of silently returning the wrong row's duration.
function findScenario(records: ScenarioRecord[], scenarioName: string): ScenarioRecord {
  const matches = records.filter((r) => r.scenario === scenarioName);
  if (matches.length === 0) {
    throw new Error(
      `Scenario "${scenarioName}" not found. Scenarios present: ${records.map((r) => r.scenario).join(' | ')}`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Scenario name "${scenarioName}" is ambiguous — ${matches.length} rows share it (likely an Outline whose title doesn't fully disambiguate its Examples). Narrow the query.`,
    );
  }
  if (matches[0].status !== 'PASS') {
    throw new Error(`Scenario "${scenarioName}" (${matches[0].runId}) status=${matches[0].status}, not PASS — not a valid data point.`);
  }
  return matches[0];
}

interface Comparandum {
  key: string;
  description: string;
  atomicMs: number;
  twinMsSamples: number[];
}

function extractAtomicWeb(runId: string) {
  const readsFiles = findFilesForRun(runId, /reads-chromium\.jsonl$/);
  const writesFiles = findFilesForRun(runId, /writes-chromium\.jsonl$/);
  if (readsFiles.length !== 1 || writesFiles.length !== 1) {
    throw new Error(
      `Expected exactly one reads-chromium and one writes-chromium cucumber-jsonl file for run ${runId}; found reads=${readsFiles.length} writes=${writesFiles.length}. Did aggregate-campaign-artifacts.ts merge this run yet?`,
    );
  }
  const reads = loadJsonl(readsFiles[0]);
  const writes = loadJsonl(writesFiles[0]);

  const catalogOpenUS = findScenario(reads, 'Opening a pizza card launches the builder in US');
  const checkoutCreditCardUS = findScenario(writes, 'Place a delivery order in US paying with credit card');

  return {
    loginMs: stepDuration(catalogOpenUS, (n) => n.startsWith('Given the OmniPizza user is logged in')),
    cartPopulatedMs: stepDuration(checkoutCreditCardUS, (n) => n.startsWith('And they have an order with')),
    negativeControlMs: stepDuration(
      catalogOpenUS,
      (n) => n.startsWith('When they open the pizza') || n.startsWith('Then the pizza builder is displayed'),
    ),
  };
}

function extractTwinWeb(runId: string) {
  const files = findFilesForRun(runId, /non-atomic-twin-web\.jsonl$/);
  if (files.length !== 1) {
    throw new Error(`Expected exactly one non-atomic-twin-web cucumber-jsonl file for run ${runId}; found ${files.length}.`);
  }
  const allRows = loadJsonl(files[0]);
  if (allRows.length === 0) throw new Error(`Twin run ${runId}'s cucumber-jsonl has zero rows.`);
  const rows = allRows.filter((r) => r.status === 'PASS');
  if (rows.length < allRows.length) {
    console.warn(
      `[execution-efficiency-delta] twin run ${runId}: dropped ${allRows.length - rows.length}/${allRows.length} non-PASS Outline row(s) from the sample (a real run partially failing mid-journey shouldn't drag the mean toward zero).`,
    );
  }
  if (rows.length === 0) throw new Error(`Twin run ${runId}: all ${allRows.length} rows are non-PASS — no valid data point.`);

  const loginMs: number[] = [];
  const cartPopulatedMs: number[] = [];
  const negativeControlMs: number[] = [];
  for (const row of rows) {
    loginMs.push(
      stepDuration(
        row,
        (n) => n.startsWith('Given the OmniPizza login screen is open') || n.startsWith('When they log in as'),
      ),
    );
    cartPopulatedMs.push(
      stepDuration(
        row,
        (n) =>
          n.startsWith('And they are browsing the catalog') ||
          n.startsWith('Then the catalog screen is fully displayed') ||
          n.startsWith('When they open the pizza') ||
          n.startsWith('Then the pizza builder is displayed') ||
          n.startsWith('When they select size') ||
          n.startsWith('And they add toppings') ||
          n.startsWith('When they confirm add to cart') ||
          n.startsWith('Then the pizza builder is closed'),
      ),
    );
    negativeControlMs.push(
      stepDuration(
        row,
        (n) => n.startsWith('When they open the pizza') || n.startsWith('Then the pizza builder is displayed'),
      ),
    );
  }
  return { loginMs, cartPopulatedMs, negativeControlMs };
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

interface SamplesFile {
  comparanda: Record<string, { atomicMs: number[]; twinMs: number[] }>;
  ingestedPairs: string[]; // `${atomicRunId}::${twinRunId}` — re-running the same pair must not double N
}

function loadSamples(): SamplesFile {
  if (!existsSync(SAMPLES_PATH)) return { comparanda: {}, ingestedPairs: [] };
  const raw = readFileSync(SAMPLES_PATH, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${SAMPLES_PATH} exists but isn't valid JSON (${(e as Error).message}) — fix or delete it by hand before re-running.`);
  }
  const p = parsed as Partial<SamplesFile>;
  return { comparanda: p.comparanda ?? {}, ingestedPairs: p.ingestedPairs ?? [] };
}

// Plain read-modify-write, no temp-file+rename (unlike aggregate-campaign-artifacts.ts's
// saveAggregationState). Acceptable here: this is a manually-invoked, one-at-a-time CLI tool, and the
// far more likely failure mode — re-running the SAME pair sequentially — is guarded by ingestedPairs
// below, not by file-locking. Two genuinely concurrent invocations would still race; don't run this
// script from two terminals at once.
function appendSamples(atomicRunId: string, twinRunId: string, atomic: ReturnType<typeof extractAtomicWeb>, twin: ReturnType<typeof extractTwinWeb>) {
  const samples = loadSamples();
  const pairKey = `${atomicRunId}::${twinRunId}`;
  if (samples.ingestedPairs.includes(pairKey)) {
    console.warn(
      `[execution-efficiency-delta] atomic run ${atomicRunId} / twin run ${twinRunId} was already ingested — skipping to avoid doubling N. Delete its entry from ${SAMPLES_PATH}'s ingestedPairs first if you actually intend to re-ingest.`,
    );
    return samples;
  }
  const push = (key: string, atomicMs: number, twinMs: number[]) => {
    const entry = (samples.comparanda[key] ??= { atomicMs: [], twinMs: [] });
    entry.atomicMs.push(atomicMs);
    entry.twinMs.push(...twinMs);
  };
  push('login', atomic.loginMs, twin.loginMs);
  push('cart-populated', atomic.cartPopulatedMs, twin.cartPopulatedMs);
  push('negative-control-catalog-click', atomic.negativeControlMs, twin.negativeControlMs);
  samples.ingestedPairs.push(pairKey);
  mkdirSync(join(REPO_ROOT, 'reports'), { recursive: true });
  writeFileSync(SAMPLES_PATH, JSON.stringify(samples, null, 2) + '\n');
  return samples;
}

function parseArgs(argv: string[]) {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const atomicRun = get('--atomic-run');
  const twinRun = get('--twin-run');
  if (!atomicRun || !twinRun) {
    throw new Error('Usage: execution-efficiency-delta --atomic-run <ghRunId> --twin-run <ghRunId>');
  }
  return { atomicRun, twinRun };
}

function main(): void {
  const { atomicRun, twinRun } = parseArgs(process.argv.slice(2));

  const atomic = extractAtomicWeb(atomicRun);
  const twin = extractTwinWeb(twinRun);
  const before = loadSamples().ingestedPairs.length;
  const samples = appendSamples(atomicRun, twinRun, atomic, twin);
  const wasAppended = samples.ingestedPairs.length > before;

  console.log(
    wasAppended
      ? `Extracted from atomic run ${atomicRun} / twin run ${twinRun} — appended to ${SAMPLES_PATH}\n`
      : `Atomic run ${atomicRun} / twin run ${twinRun} already recorded — nothing appended (see warning above).\n`,
  );
  for (const [key, { atomicMs, twinMs }] of Object.entries(samples.comparanda)) {
    console.log(
      `${key}: atomic mean=${mean(atomicMs).toFixed(0)}ms (N=${atomicMs.length})  twin mean=${mean(twinMs).toFixed(0)}ms (N=${twinMs.length})  ratio=${(mean(twinMs) / mean(atomicMs)).toFixed(2)}x`,
    );
  }
  console.log(
    '\nNot a §9 result until N is adequate (§8.5 evidence policy) — see the design doc\'s "Recommended next step" for how many more dispatches that needs.',
  );
}

main();
