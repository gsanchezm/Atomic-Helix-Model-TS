// Shared campaign matrix — single source of truth for both run-campaign.ts
// (dispatch) and aggregate-campaign-artifacts.ts (artifact download). Keeping
// this in one module means a change to N=30, the worker-level sweep, or the
// workflow's job/artifact shape can't silently drift between the two scripts.
//
// Every string constant below (job name prefixes, artifact name templates,
// primary step names) was confirmed by reading ahm-execution-helix.yml
// directly and cross-checking against a real completed run's
// `gh run view --json jobs` / `gh api .../artifacts` output (2026-08-24) —
// see run-campaign.ts's file header for what was verified and what wasn't
// (the twin legs' job names have never been observed against a real
// dispatch; expectedJobCount exists specifically to fail loudly rather than
// silently if that assumption turns out wrong on the first real one).

export type Arm = 'atomic' | 'twin';
export type PlatformLeg = 'web' | 'android';
export type LegKey = `${Arm}-${PlatformLeg}`;

export interface CampaignItem {
  id: string; // stable, human-readable — the manifest key both scripts share
  instrument: 'determinism' | 'parallel-safety' | 'efficiency';
  arm: Arm;
  platformLeg: PlatformLeg;
  experimentBatchId: string;
  runIndex: string; // repurposed as a worker-level label for parallel-safety
  cucumberParallel?: string;
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

export const GH_PLATFORM_INPUT: Record<LegKey, string> = {
  'atomic-web': 'playwright-desktop',
  'atomic-android': 'appium-android',
  'twin-web': 'twin-web',
  'twin-android': 'twin-android',
};

// Confirmed against ahm-execution-helix.yml (2026-08-24 read):
//   e2e-web        name: "E2E — Playwright Desktop ${{ matrix.suite }} (${{ matrix.browser }})"
//                  matrix: browser=[chromium,firefox,webkit] x suite=[reads,writes]
//                  primary step: "Run E2E tests"
//   e2e-android    name: "E2E — Appium Android ${{ matrix.suite }}", matrix: suite=[reads,writes]
//                  primary step: "Run E2E tests"
//   eval-twin-web  name: "Eval — Non-atomic Twin (Web, parallel=<N>)", single job
//                  primary step: "Run non-atomic twin"
//   eval-twin-android  name: "Eval — Non-atomic Twin (Android)", single job
//                  primary step: "Run non-atomic twin"
//
// atomic-web/atomic-android strings verified against a real completed run
// (`gh run view <id> --json jobs`). twin-web/twin-android were NOT — the twin
// had never been dispatched in CI before this repo's history as of writing.
export const JOB_NAME_PREFIXES: Record<LegKey, string[]> = {
  'atomic-web': [
    'E2E — Playwright Desktop reads (chromium)',
    'E2E — Playwright Desktop writes (chromium)',
  ],
  'atomic-android': ['E2E — Appium Android reads', 'E2E — Appium Android writes'],
  'twin-web': ['Eval — Non-atomic Twin (Web'],
  'twin-android': ['Eval — Non-atomic Twin (Android)'],
};

export const EXPECTED_JOB_COUNT: Record<LegKey, number> = {
  'atomic-web': 2,
  'atomic-android': 2,
  'twin-web': 1,
  'twin-android': 1,
};

export const PRIMARY_STEP_NAME: Record<LegKey, string> = {
  'atomic-web': 'Run E2E tests',
  'atomic-android': 'Run E2E tests',
  'twin-web': 'Run non-atomic twin',
  'twin-android': 'Run non-atomic twin',
};

// Artifact name templates — confirmed against each job's own
// `actions/upload-artifact@v7` step in ahm-execution-helix.yml (2026-08-24
// read) AND against real artifact names on a completed run via
// `gh api .../actions/runs/<id>/artifacts` for the e2e-web/e2e-android shape
// (matrix legs interpolate matrix.suite/matrix.browser into the artifact
// name — `${{ github.job }}` alone, which is constant across matrix
// instances of the same job, would otherwise collide). twin-web/twin-android
// have no matrix, so their artifact name is just `ahm-artifacts-<job>-<runId>`.
// One artifact per relevant job — same count/order as JOB_NAME_PREFIXES.
export function artifactNamesFor(leg: LegKey, runId: number): string[] {
  switch (leg) {
    case 'atomic-web':
      return [
        `ahm-artifacts-e2e-web-reads-chromium-${runId}`,
        `ahm-artifacts-e2e-web-writes-chromium-${runId}`,
      ];
    case 'atomic-android':
      return [
        `ahm-artifacts-e2e-android-reads-${runId}`,
        `ahm-artifacts-e2e-android-writes-${runId}`,
      ];
    case 'twin-web':
      return [`ahm-artifacts-eval-twin-web-${runId}`];
    case 'twin-android':
      return [`ahm-artifacts-eval-twin-android-${runId}`];
  }
}

export function legKeyOf(arm: Arm, platformLeg: PlatformLeg): LegKey {
  return `${arm}-${platformLeg}`;
}

// §3 decision 3: N=30 run_index values per arm, web + Appium-Android, both arms.
export function buildDeterminismItems(batchSuffix: string): CampaignItem[] {
  const batchId = `det-2026-campaign${batchSuffix}`;
  const legs: Array<[Arm, PlatformLeg]> = [
    ['atomic', 'web'],
    ['atomic', 'android'],
    ['twin', 'web'],
    ['twin', 'android'],
  ];
  const items: CampaignItem[] = [];
  for (const [arm, platformLeg] of legs) {
    for (let i = 1; i <= 30; i++) {
      items.push({
        id: `determinism__${arm}__${platformLeg}__${pad3(i)}`,
        instrument: 'determinism',
        arm,
        platformLeg,
        experimentBatchId: batchId,
        runIndex: pad3(i),
      });
    }
  }
  return items;
}

// §3 decision 4: 4 worker levels (1/2/4/8) x 2 arms, web only.
export function buildParallelSafetyItems(batchSuffix: string): CampaignItem[] {
  const batchId = `ps-2026-campaign${batchSuffix}`;
  const workerLevels = [1, 2, 4, 8];
  const arms: Arm[] = ['atomic', 'twin'];
  const items: CampaignItem[] = [];
  for (const arm of arms) {
    for (const level of workerLevels) {
      items.push({
        id: `parallel-safety__${arm}__web__w${level}`,
        instrument: 'parallel-safety',
        arm,
        platformLeg: 'web',
        experimentBatchId: batchId,
        runIndex: `w${level}`,
        cucumberParallel: String(level),
      });
    }
  }
  return items;
}

// Ancillary execution-efficiency instrument (§8.4/§9.5 — not one of the four §5 Rule-derived
// corollaries, see docs/superpowers/specs/2026-08-25-execution-efficiency-instrument-design.md).
// One clean single-worker dispatch per arm per repeat — cucumber_parallel='1' on both arms, matching
// the parallel-safety w1 methodology, to avoid the backend-contention confound a higher worker count
// would introduce into a per-operation step-time comparison. For the WEB leg this reaches
// e2e-web/eval-twin-web's own `CUCUMBER_PARALLEL: ${{ inputs.cucumber_parallel || '4' }}` and actually
// changes behavior. For the ANDROID leg it's a harmless no-op — e2e-android/eval-twin-android never read
// that input at all (confirmed against ahm-execution-helix.yml, 2026-08-26 adversarial review); both
// android jobs always run single-worker by construction (one emulator per job), so the "avoid
// contention" property already holds there for a structural reason unrelated to this field. Kept set on
// both legs for a uniform CampaignItem shape, not because android needs it. Deliberately NOT folded
// into 'all' (kept a separate, explicitly-invoked instrument) — this measurement is ancillary to the
// paper's four primary causal instruments, not part of the formal 128/156-dispatch campaign.
export function buildExecutionEfficiencyItems(
  batchSuffix: string,
  platformLeg: PlatformLeg,
  repeats: number,
): CampaignItem[] {
  const batchId = `eff-2026-campaign-${platformLeg}${batchSuffix}`;
  const arms: Arm[] = ['atomic', 'twin'];
  const items: CampaignItem[] = [];
  for (const arm of arms) {
    for (let i = 1; i <= repeats; i++) {
      items.push({
        id: `efficiency__${arm}__${platformLeg}__${pad3(i)}`,
        instrument: 'efficiency',
        arm,
        platformLeg,
        experimentBatchId: batchId,
        runIndex: pad3(i),
        cucumberParallel: '1',
      });
    }
  }
  return items;
}

export function buildCampaignItems(
  instrument: 'determinism' | 'parallel-safety' | 'all',
  batchSuffix: string,
): CampaignItem[] {
  let items: CampaignItem[] = [];
  if (instrument === 'determinism' || instrument === 'all') {
    items = items.concat(buildDeterminismItems(batchSuffix));
  }
  if (instrument === 'parallel-safety' || instrument === 'all') {
    items = items.concat(buildParallelSafetyItems(batchSuffix));
  }
  return items;
}
