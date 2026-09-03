// Campaign A analysis pipeline — implements docs/research/2026-09-02-campaign-a-frozen-definitions.md
// §3 (Metric 1), §4 (Metric 2 / MOL), and §10 (deterministic fault attribution) EXACTLY, written
// and unit-tested against synthetic fixtures BEFORE any real Campaign A data exists (author
// requirement — "do not wait for real results to decide implementation details").
//
// Deterministic attribution, without touching the wire protocol or hot dispatch path: the
// injected-fault error string (src/kernel/fault-injection.ts's FAULT_MESSAGES, exported for this
// purpose) is ALREADY recorded, per real verified data, in the exact (feature, scenario, step) that
// carried it — see lib/campaign-a-identity.ts's header for how this was confirmed against a real
// LOCATOR_RESOLUTION_FAILURE dispatch before choosing this over adding a proto field. A dispatch's
// "actual intervention identity" is therefore read directly out of its own merged cucumber-jsonl,
// not inferred or assumed.
//
// Three-way (four-way) dispatch classification — deliberately NOT collapsed into a single
// valid/invalid boolean (adversarial review, 2026-09-02): a stale attribution-table entry or a
// require-glob miss must be visibly distinguishable from a genuine wrong-semantic-target result,
// or a tooling bug would silently masquerade as an experimental finding.
//   - tooling_error       — the PRE-REGISTERED expected (feature,scenario,step) doesn't even exist
//                           among this dispatch's own recorded scenarios. Not a valid/invalid
//                           experimental outcome at all — a bug in this file's own tables, the
//                           evaluation_slice wiring, or cucumber's require glob. Must be fixed, not
//                           backfilled as if it were data.
//   - fault_not_injected  — the injected-fault marker never appears in the dispatch. Invalid,
//                           backfill under the frozen invalid-run policy (§13).
//   - multiple_fires      — the marker appears more than once. Should be structurally impossible
//                           under max_fires=1; if it happens, investigate before trusting anything
//                           from that dispatch. Invalid, not backfilled automatically.
//   - wrong_semantic_target — the marker appears exactly once, but not on the pre-registered
//                           carrier. A genuine scientific invalid (the fault landed somewhere the
//                           design didn't intend) — backfill under §13, exclusion reason recorded.
//   - valid               — the marker appears exactly once, on the pre-registered carrier. M1/MOL
//                           are computed and the dispatch enters the campaign's analyzed set.
//
// Metric 1 and MOL are computed ONLY for 'valid' dispatches — an invalid dispatch never silently
// contributes to either metric (the author's explicit requirement).

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Arm, CAMPAIGN_A_POSITIONS, CampaignAPosition } from './lib/campaign-matrix';
import { CAMPAIGN_A_EXPECTED_ATTRIBUTION, CAMPAIGN_A_ORACLE_CARRIERS, ORACLE_KEYS, OracleKey, SemanticCase } from './lib/campaign-a-identity';
import { FAULT_MESSAGES } from '../../src/kernel/fault-injection';

const REPO_ROOT = join(__dirname, '..', '..');
const CUCUMBER_JSONL_DIR = join(REPO_ROOT, 'metrics', 'raw', 'cucumber-jsonl');
const CAMPAIGNS_DIR = join(REPO_ROOT, 'reports', 'campaigns');

// Campaign A's one fault class (frozen §1/§7) — the marker to search for.
export const CAMPAIGN_A_FAULT_MARKER = FAULT_MESSAGES.LOCATOR_RESOLUTION_FAILURE;

// ---------------------------------------------------------------------------
// Data shapes — matches NormalizedScenario exactly (scripts/metrics/normalize-telemetry.ts),
// since that's the real shape this script reads off disk. Declared locally (not imported) since
// normalize-telemetry.ts's module has CLI-invocation side effects at load time (matches the existing
// convention: aggregate-campaign-artifacts.ts also duplicates run-campaign.ts's manifest shape
// rather than importing it, for the same reason).
// ---------------------------------------------------------------------------
export interface StepRecord {
  name: string;
  status: string;
  durationMs: number;
  errorMessage: string | null;
}
export interface ScenarioRecord {
  runId: string;
  feature: string;
  scenario: string;
  status: string;
  steps: StepRecord[];
}

// ---------------------------------------------------------------------------
// §10 — deterministic attribution
// ---------------------------------------------------------------------------
export type AttributionStatus = 'valid' | 'wrong_semantic_target' | 'fault_not_injected' | 'multiple_fires' | 'tooling_error';

export interface FaultOccurrence {
  feature: string;
  scenario: string;
  step: string;
  status: string;
}

export interface AttributionResult {
  status: AttributionStatus;
  expected: SemanticCase;
  occurrences: FaultOccurrence[];
  detail: string;
}

export function findFaultOccurrences(scenarios: ScenarioRecord[], marker: string): FaultOccurrence[] {
  const out: FaultOccurrence[] = [];
  for (const s of scenarios) {
    for (const st of s.steps) {
      if (st.errorMessage && st.errorMessage.includes(marker)) {
        out.push({ feature: s.feature, scenario: s.scenario, step: st.name, status: st.status });
      }
    }
  }
  return out;
}

function expectedCaseExists(scenarios: ScenarioRecord[], expected: SemanticCase): boolean {
  return scenarios.some(
    (s) =>
      s.feature === expected.feature &&
      s.scenario === expected.scenario &&
      s.steps.some((st) => st.name === expected.step),
  );
}

export function classifyAttribution(
  scenarios: ScenarioRecord[],
  arm: Arm,
  position: CampaignAPosition['key'],
  marker: string = CAMPAIGN_A_FAULT_MARKER,
): AttributionResult {
  const expected = CAMPAIGN_A_EXPECTED_ATTRIBUTION[arm][position];

  if (!expectedCaseExists(scenarios, expected)) {
    return {
      status: 'tooling_error',
      expected,
      occurrences: [],
      detail:
        `Pre-registered expected case (feature="${expected.feature}", scenario="${expected.scenario}", ` +
        `step="${expected.step}") was not found among this dispatch's own recorded scenarios at all. This is ` +
        `a tooling problem (stale attribution table, wrong evaluation_slice, or a require-glob/registration ` +
        `miss) — NOT a scientific result. Fix the cause before trusting anything else from this dispatch.`,
    };
  }

  const occurrences = findFaultOccurrences(scenarios, marker);

  if (occurrences.length === 0) {
    return {
      status: 'fault_not_injected',
      expected,
      occurrences,
      detail: `Injected-fault marker ("${marker}") not found anywhere in this dispatch's recorded steps.`,
    };
  }

  if (occurrences.length > 1) {
    return {
      status: 'multiple_fires',
      expected,
      occurrences,
      detail:
        `Injected-fault marker found ${occurrences.length} times — expected exactly 1 under max_fires=1. ` +
        `Structurally unexpected; investigate before trusting this dispatch.`,
    };
  }

  const [actual] = occurrences;
  const matches = actual.feature === expected.feature && actual.scenario === expected.scenario && actual.step === expected.step;
  if (!matches) {
    return {
      status: 'wrong_semantic_target',
      expected,
      occurrences,
      detail:
        `Fault fired in (feature="${actual.feature}", scenario="${actual.scenario}", step="${actual.step}"), ` +
        `not the pre-registered (feature="${expected.feature}", scenario="${expected.scenario}", step="${expected.step}").`,
    };
  }

  return {
    status: 'valid',
    expected,
    occurrences,
    detail: 'Fault fired exactly once, on the pre-registered semantic target.',
  };
}

// ---------------------------------------------------------------------------
// §3 — Metric 1 (within-failed-scenario skipped-step containment)
// ---------------------------------------------------------------------------
const GHERKIN_PREFIXES = ['Given ', 'When ', 'Then ', 'And ', 'But ', '* '];

export function isSemanticStep(name: string): boolean {
  return GHERKIN_PREFIXES.some((p) => name.startsWith(p));
}

export interface PerScenarioM1 {
  scenario: string;
  total: number;
  skipped: number;
  m1: number;
}

export interface M1Result {
  m1: number | null; // null when there is no failed scenario in this dispatch to measure
  perScenario: PerScenarioM1[];
}

// restrictToScenario (Campaign A usage): M1 must measure the INJECTED FAULT's own containment
// cost, not be diluted/inflated by an unrelated scenario that happens to also fail in the same
// dispatch. analyzeDispatch() passes the attribution-confirmed carrier scenario here — an unrelated
// failure elsewhere in the dispatch is simply not part of F(d) for Campaign A, matching the same
// principle (deterministic attribution, not "any failure in the dispatch") that governs §10's
// validity rule. Omitting it reproduces the original generic diagnosability-table.ts convention
// (any FAILed scenario), which is intentionally NOT what Campaign A uses.
export function computeM1(scenarios: ScenarioRecord[], restrictToScenario?: string): M1Result {
  const failed = scenarios.filter((s) => s.status === 'FAIL' && (restrictToScenario === undefined || s.scenario === restrictToScenario));
  const perScenario: PerScenarioM1[] = failed.map((s) => {
    const semantic = s.steps.filter((st) => isSemanticStep(st.name));
    const total = semantic.length;
    const skipped = semantic.filter((st) => st.status === 'SKIP').length;
    return { scenario: s.scenario, total, skipped, m1: total > 0 ? skipped / total : 0 };
  });
  if (perScenario.length === 0) return { m1: null, perScenario };
  const totalSteps = perScenario.reduce((a, b) => a + b.total, 0);
  const totalSkipped = perScenario.reduce((a, b) => a + b.skipped, 0);
  return { m1: totalSteps > 0 ? totalSkipped / totalSteps : 0, perScenario };
}

// ---------------------------------------------------------------------------
// §4 — Metric 2 (Matched Oracle Loss)
// ---------------------------------------------------------------------------
export type OracleVerdict = 'DELIVERED' | 'LOST_FAIL' | 'LOST_SKIP' | 'LOST_ABSENT';

export interface MOLResult {
  mol: number;
  perOracle: Record<OracleKey, OracleVerdict>;
}

export function computeMOL(scenarios: ScenarioRecord[], arm: Arm): MOLResult {
  const carriers = CAMPAIGN_A_ORACLE_CARRIERS[arm];
  const perOracle = {} as Record<OracleKey, OracleVerdict>;
  for (const key of ORACLE_KEYS) {
    const c = carriers[key];
    const scenario = scenarios.find((s) => s.feature === c.feature && s.scenario === c.scenario);
    const step = scenario?.steps.find((st) => st.name === c.step);
    if (!step) {
      perOracle[key] = 'LOST_ABSENT';
    } else if (step.status === 'PASS') {
      perOracle[key] = 'DELIVERED';
    } else if (step.status === 'FAIL') {
      perOracle[key] = 'LOST_FAIL';
    } else {
      perOracle[key] = 'LOST_SKIP'; // SKIP, or any other non-PASS/FAIL recorded status
    }
  }
  const lost = ORACLE_KEYS.filter((k) => perOracle[k] !== 'DELIVERED').length;
  return { mol: lost / ORACLE_KEYS.length, perOracle };
}

// ---------------------------------------------------------------------------
// Per-dispatch classification, combining attribution + both metrics.
// ---------------------------------------------------------------------------
export interface DispatchAnalysis {
  id: string;
  arm: Arm;
  position: CampaignAPosition['key'];
  attribution: AttributionResult;
  m1: M1Result | null; // null unless attribution.status === 'valid'
  mol: MOLResult | null; // null unless attribution.status === 'valid'
}

export function analyzeDispatch(id: string, scenarios: ScenarioRecord[], arm: Arm, position: CampaignAPosition['key']): DispatchAnalysis {
  const attribution = classifyAttribution(scenarios, arm, position);
  const valid = attribution.status === 'valid';
  return {
    id,
    arm,
    position,
    attribution,
    m1: valid ? computeM1(scenarios, attribution.occurrences[0].scenario) : null,
    mol: valid ? computeMOL(scenarios, arm) : null,
  };
}

// ---------------------------------------------------------------------------
// CLI — reads a run-campaign.ts campaign-a manifest, loads each completed item's cucumber-jsonl,
// analyzes it, and writes reports/campaign-a-analysis.json + a per-cell summary table.
// ---------------------------------------------------------------------------
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

function scenariosForRun(runId: number): ScenarioRecord[] {
  const prefix = `tom-${runId}-`;
  const files = readdirSync(CUCUMBER_JSONL_DIR).filter((f) => f.startsWith(prefix));
  if (files.length === 0) {
    throw new Error(`No cucumber-jsonl files found for run ${runId} (prefix "${prefix}") — aggregate artifacts first.`);
  }
  return files.flatMap((f) => loadJsonl(join(CUCUMBER_JSONL_DIR, f)));
}

function parseItemId(id: string): { arm: Arm; position: CampaignAPosition['key'] } {
  // campaign-a__<arm>__<position-lowercase>__<repeat> — see buildCampaignAItems.
  const parts = id.split('__');
  const arm = parts[1] as Arm;
  const position = parts[2].toUpperCase() as CampaignAPosition['key'];
  return { arm, position };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function main(): void {
  const batchSuffix = process.argv[2] ?? '';
  const manifestPath = join(CAMPAIGNS_DIR, `campaign-campaign-a${batchSuffix ? `-${batchSuffix}` : ''}.json`);
  if (!existsSync(manifestPath)) {
    throw new Error(`No campaign manifest at ${manifestPath} — dispatch Campaign A first.`);
  }
  const manifest: CampaignManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  const analyses: DispatchAnalysis[] = [];
  for (const [id, record] of Object.entries(manifest.results)) {
    if (record.status !== 'completed' || !record.runId) continue;
    const { arm, position } = parseItemId(id);
    const scenarios = scenariosForRun(record.runId);
    analyses.push(analyzeDispatch(id, scenarios, arm, position));
  }

  const byStatus: Record<string, number> = {};
  for (const a of analyses) byStatus[a.attribution.status] = (byStatus[a.attribution.status] ?? 0) + 1;
  console.log(`Campaign A analysis — ${analyses.length} completed dispatches analyzed.`);
  console.log(`Attribution status breakdown: ${JSON.stringify(byStatus)}`);
  if (byStatus.tooling_error) {
    console.warn(
      `\n! ${byStatus.tooling_error} dispatch(es) classified tooling_error — these are NOT experimental data, ` +
      `they indicate a bug in this script's own tables or the dispatch pipeline. Fix before trusting any other results.\n`,
    );
  }

  console.log('\n| Arm | Position | Valid N | M1 (median) | MOL (median) |');
  console.log('|---|---|---|---|---|');
  for (const arm of ['atomic', 'twin'] as Arm[]) {
    for (const position of CAMPAIGN_A_POSITIONS) {
      const cell = analyses.filter((a) => a.arm === arm && a.position === position.key && a.attribution.status === 'valid');
      const m1Median = median(cell.map((a) => a.m1?.m1).filter((v): v is number => v !== null && v !== undefined));
      const molMedian = median(cell.map((a) => a.mol?.mol).filter((v): v is number => v !== undefined));
      console.log(`| ${arm} | ${position.key} | ${cell.length} | ${m1Median ?? '—'} | ${molMedian ?? '—'} |`);
    }
  }

  const outPath = join(REPO_ROOT, 'reports', 'campaign-a-analysis.json');
  mkdirSync(join(REPO_ROOT, 'reports'), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ analyses }, null, 2) + '\n');
  console.log(`\nWritten to ${outPath}`);
}

if (require.main === module) {
  main();
}
