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
// (at the time, the twin legs' job names had never been observed against a
// real dispatch; expectedJobCount exists specifically to fail loudly rather
// than silently if that assumption turns out wrong). The twin legs
// (eval-twin-web/eval-twin-android) moved to their own file,
// ahm-evaluation-campaign.yml, on 2026-08-29 (see WORKFLOW_FILE below and
// that file's own header) — their job/step names were copied verbatim, so
// the constants below are unchanged, but re-verify against
// ahm-evaluation-campaign.yml specifically if these ever need re-confirming.

export type Arm = 'atomic' | 'twin';
export type PlatformLeg = 'web' | 'android';
export type LegKey = `${Arm}-${PlatformLeg}`;

export interface CampaignItem {
  id: string; // stable, human-readable — the manifest key both scripts share
  instrument: 'determinism' | 'parallel-safety' | 'efficiency' | 'diagnosability';
  arm: Arm;
  platformLeg: PlatformLeg;
  experimentBatchId: string;
  runIndex: string; // repurposed as a worker-level label for parallel-safety, a bucket name for diagnosability
  cucumberParallel?: string;
  // diagnosability only (§9.2) — see buildDiagnosabilityItems below for the full mechanism-per-bucket
  // rationale. At most one of diagnosabilityChaosUser / (tomInjectFault + tomInjectFaultAction) /
  // tomInfraBreakPort is set per item, matching "one fault active per process" (design doc §3 decision 2).
  diagnosabilityBucket?: string; // the true injected bucket, for the §9.2 localization-accuracy comparison
  diagnosabilityChaosUser?: string; // backend-layer injection — DIAGNOSABILITY_CHAOS_USER
  tomInjectFault?: string; // chaos-proxy-layer injection — TOM_INJECT_FAULT
  tomInjectFaultAction?: string; // chaos-proxy-layer injection — TOM_INJECT_FAULT_ACTION
  tomInfraBreakPort?: string; // INFRASTRUCTURE_FAILURE only — TOM_INFRA_BREAK_PORT
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

// Which workflow_dispatch-able file a leg's `gh workflow run` targets. Split
// 2026-08-29: the non-atomic twin's jobs moved out of ahm-execution-helix.yml
// into their own file (ahm-evaluation-campaign.yml) to isolate the campaign's
// dispatches from ordinary CI's — see that file's header for the full
// rationale. atomic-web/atomic-android are the reference implementation's own
// e2e-web/e2e-android jobs and stay on the main workflow.
export const WORKFLOW_FILE: Record<LegKey, string> = {
  'atomic-web': 'ahm-execution-helix.yml',
  'atomic-android': 'ahm-execution-helix.yml',
  'twin-web': 'ahm-evaluation-campaign.yml',
  'twin-android': 'ahm-evaluation-campaign.yml',
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

// §9.2 diagnosability instrument (build-order step 3's harness, wired into the orchestrator 2026-08-31
// — see docs/superpowers/specs/2026-08-23-diagnosability-fault-injection-harness-design.md and the
// 2026-08-31 addendum in project memory for the empirical checks below). Design doc §3 decision 5
// originally planned 14 buckets × 2 arms = 28 dispatches; three buckets turned out not to be
// injectable at all (VISUAL_DIFF_FAILURE / VISUAL_BASELINE_MISSING — no shared visual-comparison
// surface, as the design doc already suspected; API_CONTRACT_FAILURE — confirmed 2026-08-31 by reading
// every candidate error path directly: neither the login 403 fallback message nor any
// security_glitch_user checkout-leak string matches failure-buckets.ts's `schema|contract
// violation|invalid body|json schema` regex anywhere in this suite, so nothing here can even
// accidentally produce that bucket). TIMEOUT_FAILURE and PERFORMANCE_THRESHOLD_FAILURE share ONE
// injected condition (performance_glitch_user) per the design doc's own table — which bucket the
// classifier actually reports for each arm is itself part of what's measured, not a dispatch choice.
// Net: 10 distinct injected conditions × 2 arms = 20 dispatches, covering 11 of the 14 taxonomy rows.
//
// Platform: web for every condition except MOBILE_SESSION_FAILURE (android — a mobile-session fault
// has no meaning on web) and WEB_SESSION_FAILURE (web — already the default, listed for clarity).
export interface DiagnosabilityCondition {
  bucket: string; // FailureBucket name(s) this dispatch is scored against — comma-joined when shared
  platformLeg: PlatformLeg;
  diagnosabilityChaosUser?: string;
  tomInjectFault?: string;
  tomInjectFaultAction?: string;
  tomInfraBreakPort?: string;
}

// Backend-layer (chaos user, threaded through both arms' shared login step) — see
// checkout.steps.ts / checkout-nonatomic.steps.ts's DIAGNOSABILITY_CHAOS_USER read.
// Chaos-proxy-layer (fault-injection.ts hook, fires once per process, see that file's 2026-08-31 latch
// fix) — targets CLICK, which both arms' journeys always call at least once before this fires.
export const DIAGNOSABILITY_CONDITIONS: DiagnosabilityCondition[] = [
  { bucket: 'DATA_SETUP_FAILURE', platformLeg: 'web', diagnosabilityChaosUser: 'locked_out_user' },
  { bucket: 'ASSERTION_FAILURE', platformLeg: 'web', diagnosabilityChaosUser: 'problem_user' },
  {
    bucket: 'TIMEOUT_FAILURE,PERFORMANCE_THRESHOLD_FAILURE',
    platformLeg: 'web',
    diagnosabilityChaosUser: 'performance_glitch_user',
  },
  { bucket: 'API_RESPONSE_FAILURE', platformLeg: 'web', diagnosabilityChaosUser: 'error_user' },
  {
    bucket: 'LOCATOR_RESOLUTION_FAILURE',
    platformLeg: 'web',
    tomInjectFault: 'LOCATOR_RESOLUTION_FAILURE',
    tomInjectFaultAction: 'CLICK',
  },
  {
    bucket: 'UI_ACTION_FAILURE',
    platformLeg: 'web',
    tomInjectFault: 'UI_ACTION_FAILURE',
    tomInjectFaultAction: 'CLICK',
  },
  {
    bucket: 'WEB_SESSION_FAILURE',
    platformLeg: 'web',
    tomInjectFault: 'WEB_SESSION_FAILURE',
    tomInjectFaultAction: 'CLICK',
  },
  {
    bucket: 'MOBILE_SESSION_FAILURE',
    platformLeg: 'android',
    tomInjectFault: 'MOBILE_SESSION_FAILURE',
    tomInjectFaultAction: 'CLICK',
  },
  {
    bucket: 'UNKNOWN_FAILURE',
    platformLeg: 'web',
    tomInjectFault: 'UNKNOWN_FAILURE',
    tomInjectFaultAction: 'CLICK',
  },
  // Needs no new fault-injection.ts code — a closed port produces a real ECONNREFUSED that
  // suppressChaos's own transient-jitter classifier still fails deterministically after maxRetries=3
  // (~1.4-1.8s of backoff, well inside the 300s step timeout — confirmed by reading chaos-proxy.ts's
  // retry loop directly, not assumed). Port 1 is a reserved/always-closed port, chosen to avoid any
  // collision with a real service.
  { bucket: 'INFRASTRUCTURE_FAILURE', platformLeg: 'web', tomInfraBreakPort: '1' },
];

// Buckets with no dispatch above — reported in §9.2 as honestly excluded, not silently dropped.
export const DIAGNOSABILITY_EXCLUDED_BUCKETS: Array<{ bucket: string; reason: string }> = [
  {
    bucket: 'VISUAL_DIFF_FAILURE',
    reason: 'the non-atomic twin runs no visual/pixelmatch contract — no shared comparison surface to inject into',
  },
  {
    bucket: 'VISUAL_BASELINE_MISSING',
    reason: 'same as VISUAL_DIFF_FAILURE — no shared visual-comparison surface',
  },
  {
    bucket: 'API_CONTRACT_FAILURE',
    reason:
      "confirmed 2026-08-31: no error path in this suite (login's 403 fallback, security_glitch_user's " +
      "checkout leak) produces a message matching failure-buckets.ts's schema/contract-violation regex",
  },
];

export function buildDiagnosabilityItems(batchSuffix: string): CampaignItem[] {
  const batchId = `diag-2026-campaign${batchSuffix}`;
  const arms: Arm[] = ['atomic', 'twin'];
  const items: CampaignItem[] = [];
  for (const condition of DIAGNOSABILITY_CONDITIONS) {
    for (const arm of arms) {
      const slug = condition.bucket.split(',')[0];
      items.push({
        id: `diagnosability__${arm}__${condition.platformLeg}__${slug}`,
        instrument: 'diagnosability',
        arm,
        platformLeg: condition.platformLeg,
        experimentBatchId: batchId,
        runIndex: slug,
        diagnosabilityBucket: condition.bucket,
        diagnosabilityChaosUser: condition.diagnosabilityChaosUser,
        tomInjectFault: condition.tomInjectFault,
        tomInjectFaultAction: condition.tomInjectFaultAction,
        tomInfraBreakPort: condition.tomInfraBreakPort,
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
