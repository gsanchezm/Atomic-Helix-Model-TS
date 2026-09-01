// Campaign orchestrator — §8.4 evaluation campaign (build-order step 5/6).
// See docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md §5
// and docs/paper/atomic-testing-formal-definition.md §8.3/§8.4.
//
// Drives all four instruments now: determinism (120: 2 arms x web+Android x N=30),
// parallel-safety (8: 2 arms x worker levels 1/2/4/8, web only), diagnosability
// (20: see lib/campaign-matrix.ts's DIAGNOSABILITY_CONDITIONS — 10 injected
// conditions x 2 arms, 11 of the 14 taxonomy buckets covered, 3 honestly
// excluded), plus the ancillary execution-efficiency instrument (--instrument
// efficiency, ancillary — see that instrument's own header comment in
// lib/campaign-matrix.ts). Diagnosability was wired in 2026-08-31 — its own
// design doc (docs/superpowers/specs/2026-08-23-diagnosability-fault-injection-
// harness-design.md line 12) originally deferred this pending
// DIAGNOSABILITY_CHAOS_USER/TOM_INJECT_FAULT/TOM_INJECT_FAULT_ACTION
// workflow_dispatch inputs and resolution of its 3 open empirical tensions
// (§7 of that doc) — both now done, see lib/campaign-matrix.ts's comment above
// DIAGNOSABILITY_CONDITIONS for how each tension was resolved. Like efficiency,
// diagnosability is invoked explicitly (--instrument diagnosability), not
// folded into --instrument all — determinism/parallel-safety already define
// what a bare 'all' means and both are long since dispatched under that
// definition; widening it now would silently change that meaning for anyone
// re-running it.
//
// Hard constraint this script exists to respect: both ahm-execution-helix.yml
// (atomic legs) and, since the 2026-08-29 split, ahm-evaluation-campaign.yml
// (twin legs — see that file's header for why it's a separate workflow now)
// each have their OWN workflow-level `concurrency: {group: <name>-${{
// github.ref }}, cancel-in-progress: true}`. Dispatching a second run on the
// same file+ref while a prior one on THAT SAME FILE is still in flight
// CANCELS the prior run outright — not queues it. This is now a per-file
// guarantee, not a single global one: GitHub itself no longer prevents an
// atomic-web dispatch (file A) and a twin-web dispatch (file B) from running
// concurrently. This script's own strictly-sequential dispatch loop — one
// workflow_dispatch call (against whichever file this item's leg maps to,
// see lib/campaign-matrix.ts's WORKFLOW_FILE), wait for that exact run to
// reach a terminal status, THEN the next — is therefore the ONLY thing
// serializing dispatches across both files; it does not lean on GitHub's
// per-file concurrency group for that property (only for same-file safety, as
// a backstop against a stray manual dispatch on the same file). A
// pre-dispatch safety check also refuses to fire if some other run for the
// TARGET workflow+ref is already in flight (e.g. a human manually dispatched
// one), rather than risk silently attributing that run's outcome to the
// wrong campaign item.
//
// Residual structural risk (disclosed, not fully closable): `gh workflow run`
// does not return a run id synchronously — there is no dispatch nonce GitHub's
// API exposes. `waitForNewRun()` identifies "our" run by polling for the
// newest workflow_dispatch run created after our dispatch instant. If another
// actor dispatches this same workflow+ref in the few seconds between our
// dispatch and detection, their run — not ours — would be the one found (and,
// per the concurrency group above, OUR run would be the one silently
// cancelled). The pre-dispatch check closes this for the common case (nothing
// in flight, then we dispatch); it cannot close the sub-window after our own
// dispatch fires. Operationally: do not manually dispatch either
// ahm-execution-helix.yml or ahm-evaluation-campaign.yml while this script
// is running a campaign.
//
// INFRASTRUCTURE_FAILURE is disclosed, not silently corrected. This script does
// NOT retry or backfill a flagged dispatch automatically — doing so would be a
// form of "re-roll until you get a lucky N=30", which is a construct-validity
// problem the paper (§8.5's no-fabrication evidence policy) explicitly guards
// against. It records a best-effort `likelyInfra` flag per dispatch (did the
// GH Actions job fail on a step other than its own known primary test-execution
// step, or end anything other than a clean success/failure — cancelled,
// timed_out, skipped, etc?) so a human can decide whether to exclude or backfill
// before running `pnpm metrics:experiment`. This is a coarse, disclosed
// heuristic operating only on GH Actions job/step conclusions (no artifact
// download, no log-content parsing) — it will not catch a backend 502 that
// surfaces AS a cucumber-level test failure mid-suite; that finer classification
// is the existing failure-bucket taxonomy's job once artifacts are downloaded.
// The primary-step match is an EXACT match against a per-job-type constant
// (PRIMARY_STEP_NAME below), not a prefix — GitHub auto-names any step that
// omits its own `name:` as "Run <command>" (confirmed empirically against this
// workflow's own `actions/checkout@v6` steps, which render as "Run
// actions/checkout@v6" and sit earlier in the steps array than the real test
// step), so a prefix match would misclassify an early infra failure as a clean
// method-arm result.
//
// Resumable by design: every dispatch's progress is persisted to the campaign
// manifest (reports/campaigns/<campaignId>.json, gitignored) as it happens, not
// only at the end — a 'pending' record right after the gh workflow run call
// succeeds, upgraded to 'in_progress' with the discovered GH run id once found,
// upgraded to 'completed' once classified. Re-running this script:
//   - skips any item already 'completed'.
//   - for an 'in_progress' item, resumes waiting on the SAME recorded run id
//     instead of re-dispatching (this is what actually prevents a duplicate
//     dispatch after a crash — without it, a crash between dispatch and
//     completion would silently fire a second workflow_dispatch for the same
//     (experiment_batch_id, run_index), and measure-reliability.ts has no
//     dedup/uniqueness check on run_index — a duplicate silently inflates N
//     and biases the transition-probability calculation the determinism
//     instrument depends on).
//   - for a 'pending' item (crashed before a run id was ever discovered — an
//     ambiguous state where we don't know if a run was actually created),
//     refuses to auto-resume and tells the operator to check `gh run list`
//     manually rather than guess.

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  CampaignItem,
  EXPECTED_JOB_COUNT,
  GH_PLATFORM_INPUT,
  JOB_NAME_PREFIXES,
  PlatformLeg,
  PRIMARY_STEP_NAME,
  WORKFLOW_FILE,
  buildCampaignItems,
  buildDiagnosabilityItems,
  buildExecutionEfficiencyItems,
  legKeyOf,
} from './lib/campaign-matrix';

const REPO_ROOT = join(__dirname, '..', '..');
const DEFAULT_REF = 'main';
const CAMPAIGNS_DIR = join(REPO_ROOT, 'reports', 'campaigns');

// ---------------------------------------------------------------------------
// CLI args — hand-rolled, no dependency. `pnpm experiments:run-campaign -- --help`.
// ---------------------------------------------------------------------------
interface Cli {
  instrument: 'determinism' | 'parallel-safety' | 'all' | 'efficiency' | 'diagnosability';
  ref: string;
  dryRun: boolean;
  cooldownSeconds: number;
  pollIntervalSeconds: number;
  detectPollSeconds: number;
  dispatchTimeoutSeconds: number;
  runTimeoutSeconds: number;
  batchSuffix: string;
  // --instrument efficiency only — REQUIRED (no default) when instrument === 'efficiency'; undefined
  // otherwise. No default: aggregate-campaign-artifacts.ts must be invoked with the EXACT SAME
  // --platform-leg/--repeats to reconstruct the same item-id set, and this script previously defaulted
  // to 'android' while execution-efficiency-delta.ts defaulted to 'web' — an easy-to-miss silent
  // mismatch caught by adversarial review (2026-08-26). Requiring an explicit value everywhere removes
  // the mismatch risk entirely rather than trying to keep multiple defaults in sync by convention.
  platformLeg?: PlatformLeg;
  repeats?: number;
}

function parseIntArg(flag: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${flag} must be a non-negative finite number, got "${raw}"`);
  }
  return n;
}

function parseCli(argv: string[]): Cli {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (flag: string): boolean => argv.includes(flag);

  if (has('--help')) {
    console.log(`
run-campaign.ts — §8.4 campaign orchestrator (see file header for scope)

  --instrument <determinism|parallel-safety|diagnosability|all|efficiency>   default: all
                                                    (all = determinism+parallel-safety only, unchanged
                                                    since before diagnosability existed — see file header)
  --ref <branch>                                   default: ${DEFAULT_REF}
                                                    NOTE: must be a branch name, not a tag or SHA —
                                                    'gh run list --branch' only accepts branch names;
                                                    a tag/SHA here would make the in-flight safety
                                                    check silently see nothing and the new-run
                                                    detection silently time out.
  --dry-run                                        print the matrix and exit; dispatches nothing
  --cooldown-seconds <n>                            default: 30 (pause between dispatches)
  --poll-interval-seconds <n>                       default: 15 (cadence for polling run completion)
  --detect-poll-seconds <n>                         default: 5 (cadence for detecting the new run right
                                                    after dispatch — kept separate from
                                                    --poll-interval-seconds and deliberately fast, to
                                                    narrow the misattribution race described in the
                                                    file header)
  --dispatch-timeout-seconds <n>                    default: 120 (max wait to observe the new run appear)
  --run-timeout-seconds <n>                         default: 5400 (max wait for one dispatch to reach a
                                                    terminal status before giving up on it)
  --batch-suffix <string>                           default: '' (appended to experiment_batch_id, e.g. for a second campaign attempt)
  --platform-leg <web|android>                      REQUIRED for --instrument efficiency, no default — must
                                                    exactly match the --platform-leg you later pass to
                                                    aggregate-campaign-artifacts.ts
  --repeats <n>                                     --instrument efficiency only. default: 1 (one clean
                                                    atomic + one clean twin dispatch per repeat, both at
                                                    cucumber_parallel=1 — must also match the --repeats you
                                                    later pass to aggregate-campaign-artifacts.ts)
`);
    process.exit(0);
  }

  const instrument = (get('--instrument') ?? 'all') as Cli['instrument'];
  if (!['determinism', 'parallel-safety', 'diagnosability', 'all', 'efficiency'].includes(instrument)) {
    throw new Error(`--instrument must be determinism|parallel-safety|diagnosability|all|efficiency, got "${instrument}"`);
  }

  let platformLeg: PlatformLeg | undefined;
  let repeats: number | undefined;
  if (instrument === 'efficiency') {
    const rawPlatformLeg = get('--platform-leg');
    if (rawPlatformLeg !== 'web' && rawPlatformLeg !== 'android') {
      throw new Error(
        `--instrument efficiency requires --platform-leg web|android (no default) — this MUST match the ` +
        `--platform-leg you later pass to aggregate-campaign-artifacts.ts, got "${rawPlatformLeg}"`,
      );
    }
    platformLeg = rawPlatformLeg;
    repeats = parseIntArg('--repeats', get('--repeats'), 1);
  }

  return {
    instrument,
    ref: get('--ref') ?? DEFAULT_REF,
    dryRun: has('--dry-run'),
    cooldownSeconds: parseIntArg('--cooldown-seconds', get('--cooldown-seconds'), 30),
    pollIntervalSeconds: parseIntArg('--poll-interval-seconds', get('--poll-interval-seconds'), 15),
    detectPollSeconds: parseIntArg('--detect-poll-seconds', get('--detect-poll-seconds'), 5),
    dispatchTimeoutSeconds: parseIntArg('--dispatch-timeout-seconds', get('--dispatch-timeout-seconds'), 120),
    runTimeoutSeconds: parseIntArg('--run-timeout-seconds', get('--run-timeout-seconds'), 5400),
    platformLeg,
    repeats,
    batchSuffix: get('--batch-suffix') ?? '',
  };
}

// ---------------------------------------------------------------------------
// Matrix — one entry per workflow_dispatch call. The item identity (arm,
// platform, batch id, run_index) lives in lib/campaign-matrix.ts, shared with
// aggregate-campaign-artifacts.ts so the two scripts can't drift apart on
// what the campaign actually consists of. This script extends each item with
// the dispatch-only concerns (which `platform` input to send, which job
// names/step name to expect back).
// ---------------------------------------------------------------------------
interface DispatchSpec extends CampaignItem {
  ghPlatformInput: string; // the `platform` workflow_dispatch input value
  // Which workflow_dispatch-able file to target — atomic legs on
  // ahm-execution-helix.yml, twin legs on ahm-evaluation-campaign.yml (split
  // 2026-08-29, see lib/campaign-matrix.ts's WORKFLOW_FILE and that
  // workflow's own header for the rationale).
  workflowFile: string;
  // Name-prefix matchers against `gh run view --json jobs`' job `name` field.
  // e2e-web's matrix (browser x suite) means MULTIPLE jobs share one dispatch
  // — see the "browser matrix" cost note in lib/campaign-matrix.ts. Only jobs
  // matching one of these prefixes are inspected for this dispatch's
  // outcome/infra classification; everything else in the run (gate-*,
  // resolve-*, and for web the non-Chromium matrix legs) is irrelevant to
  // this dispatch and ignored.
  relevantJobNamePrefixes: string[];
  // How many jobs SHOULD match relevantJobNamePrefixes. Asserted at runtime —
  // if it doesn't match, the job-name-prefix assumption has drifted from
  // reality (e.g. GitHub rendered a matrix job name differently than expected)
  // and this dispatch is refused rather than silently recorded as a clean,
  // empty result indistinguishable from "checked and found nothing wrong".
  // This matters most for the twin legs: JOB_NAME_PREFIXES['twin-web'/'twin-
  // android'] were verified against real completed runs on the ORIGINAL
  // shared file (efficiency-instrument dispatches, 2026-08-27/28), but the
  // 2026-08-29 split moved eval-twin-web/eval-twin-android into their own
  // file (ahm-evaluation-campaign.yml) — those job/step names have never
  // been observed rendered from THAT file against a real dispatch. Copied
  // verbatim, so drift is unexpected, but this assertion is the safety net
  // for the first real one.
  expectedJobCount: number;
  // Exact (not prefix) name of this leg's primary test-execution step —
  // confirmed by reading ahm-execution-helix.yml (atomic legs) /
  // ahm-evaluation-campaign.yml (twin legs, since the 2026-08-29 split)
  // directly for all four job types. Used by classifyLikelyInfra to
  // distinguish a genuine method-arm failure from an infra failure elsewhere
  // in the job.
  primaryStepName: string;
}

function toDispatchSpec(item: CampaignItem): DispatchSpec {
  const key = legKeyOf(item.arm, item.platformLeg);
  return {
    ...item,
    ghPlatformInput: GH_PLATFORM_INPUT[key],
    workflowFile: WORKFLOW_FILE[key],
    relevantJobNamePrefixes: JOB_NAME_PREFIXES[key],
    expectedJobCount: EXPECTED_JOB_COUNT[key],
    primaryStepName: PRIMARY_STEP_NAME[key],
  };
}

function buildSpecs(cli: Cli): DispatchSpec[] {
  if (cli.instrument === 'efficiency') {
    // parseCli() guarantees both are defined whenever instrument === 'efficiency' (throws otherwise) —
    // TS can't see that cross-function invariant, hence the cast.
    return buildExecutionEfficiencyItems(cli.batchSuffix, cli.platformLeg as PlatformLeg, cli.repeats as number).map(toDispatchSpec);
  }
  if (cli.instrument === 'diagnosability') {
    return buildDiagnosabilityItems(cli.batchSuffix).map(toDispatchSpec);
  }
  return buildCampaignItems(cli.instrument, cli.batchSuffix).map(toDispatchSpec);
}

// ---------------------------------------------------------------------------
// Manifest — resumability + audit trail. One file per (instrument set, batchSuffix).
// ---------------------------------------------------------------------------
type DispatchStatus = 'pending' | 'in_progress' | 'completed';

interface DispatchRecord {
  status: DispatchStatus;
  dispatchedAt: string;
  runId?: number; // populated once status is 'in_progress' or 'completed'
  ghRunConclusion?: string; // populated once status is 'completed'
  relevantJobs?: Array<{ name: string; conclusion: string | null; failingStep: string | null }>;
  likelyInfra?: boolean;
  completedAt?: string;
}

interface CampaignManifest {
  schemaVersion: '1.1.0';
  ref: string;
  createdAt: string;
  results: Record<string, DispatchRecord>; // keyed by DispatchSpec.id
}

function manifestPath(instrument: Cli['instrument'], batchSuffix: string): string {
  const name = `campaign-${instrument}${batchSuffix ? `-${batchSuffix}` : ''}.json`;
  return join(CAMPAIGNS_DIR, name);
}

function loadManifest(path: string, ref: string): CampaignManifest {
  if (existsSync(path)) {
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `Failed to read/parse campaign manifest at ${path}: ${err instanceof Error ? err.message : String(err)}. ` +
        `This file is the sole source of truth for resuming this campaign — it is NOT safe to just delete it and ` +
        `restart (that would re-dispatch everything, including items whose real GH runs already completed). ` +
        `Inspect it by hand before deciding how to recover.`,
      );
    }
  }
  return { schemaVersion: '1.1.0', ref, createdAt: new Date().toISOString(), results: {} };
}

// Atomic write (temp file + rename) — a crash mid-write must not leave a
// truncated/corrupted manifest, since it's this campaign's only resumability
// record and may be written to dozens of times over a multi-hour/day run.
function saveManifest(path: string, manifest: CampaignManifest): void {
  mkdirSync(CAMPAIGNS_DIR, { recursive: true });
  const tmpPath = `${path}.tmp-${process.pid}`;
  writeFileSync(tmpPath, JSON.stringify(manifest, null, 2) + '\n');
  renameSync(tmpPath, path);
}

// ---------------------------------------------------------------------------
// gh CLI wrappers
// ---------------------------------------------------------------------------
function gh(args: string[]): string {
  return execFileSync('gh', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

// Bounded retry around a single `gh` call, for transient API/network errors
// during what can be an hours-long polling loop — one rate-limit blip or
// network hiccup should not kill a 128-dispatch campaign outright.
function ghWithRetry(args: string[], maxAttempts = 5): string {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return gh(args);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const backoffMs = Math.min(30_000, 2000 * 2 ** (attempt - 1));
        console.warn(`  [gh retry ${attempt}/${maxAttempts}] ${args.join(' ')} failed, retrying in ${Math.round(backoffMs / 1000)}s: ${err instanceof Error ? err.message : String(err)}`);
        execFileSync('sleep', [String(backoffMs / 1000)]);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GhRunSummary {
  databaseId: number;
  status: string;
  conclusion: string | null;
  createdAt: string;
  event: string;
}

// NOTE: `--branch` only accepts a branch name, not a tag or SHA — if `--ref`
// is ever passed something else, this silently returns an empty/irrelevant
// list rather than erroring, which would make assertNothingInFlight() falsely
// report "all clear" and waitForNewRun() time out uninformatively. This
// script's default and documented usage is a branch (`main`); using a
// tag/SHA is unsupported.
function listRecentRuns(ref: string, limit: number, workflowFile: string): GhRunSummary[] {
  const out = ghWithRetry([
    'run', 'list',
    '--workflow', workflowFile,
    '--branch', ref,
    '--limit', String(limit),
    '--json', 'databaseId,status,conclusion,createdAt,event',
  ]);
  return JSON.parse(out);
}

// All distinct workflow files any campaign leg can target — derived from the
// shared WORKFLOW_FILE map (not hardcoded) so a future third file can't
// silently fall out of this safety net.
const ALL_CAMPAIGN_WORKFLOW_FILES = Array.from(new Set(Object.values(WORKFLOW_FILE)));

// Refuses to dispatch if something is already in flight on EITHER campaign
// workflow file — not just the one this dispatch targets. Two distinct
// hazards, both real:
//   1. Same-file: a run on the SAME file already in flight would get
//      auto-cancelled by that file's own concurrency group on a new
//      dispatch (or would cancel it) — the original reason this check
//      existed, back when there was only one file.
//   2. Cross-file (new since the 2026-08-29 split): ahm-execution-helix.yml
//      and ahm-evaluation-campaign.yml have INDEPENDENT concurrency groups,
//      so a run in flight on the OTHER file would NOT get auto-cancelled —
//      it would keep running concurrently with whatever this dispatch
//      starts, both hitting the same shared OmniPizza backend at once. This
//      repo has already been burned by exactly this class of confound
//      (concurrent-load backend overload; a load-triggered ZAP false
//      positive — see project memory). This script's own sequential
//      dispatch loop prevents this for anything IT dispatches; this check is
//      what catches an externally-triggered run (a human, or a run orphaned
//      by a crash between dispatch() and the first manifest write) on either
//      file.
// Does not attempt to wait either out; surfaces the conflict and lets the
// operator decide. See the file header for the residual race this does NOT
// close (the window between our own dispatch and detecting it).
function assertNothingInFlight(ref: string): void {
  const inFlightByFile = ALL_CAMPAIGN_WORKFLOW_FILES.map((file) => ({
    file,
    inFlight: listRecentRuns(ref, 5, file).filter((r) => ['in_progress', 'queued', 'waiting', 'requested', 'pending'].includes(r.status)),
  })).filter((f) => f.inFlight.length > 0);
  if (inFlightByFile.length > 0) {
    const detail = inFlightByFile.map((f) => `${f.file} (ids: ${f.inFlight.map((r) => r.databaseId).join(', ')})`).join('; ');
    throw new Error(
      `Refusing to dispatch: run(s) already in flight on ${inFlightByFile.length} campaign workflow file(s)@${ref}: ` +
      `${detail}. A same-file run would get auto-cancelled by that file's own concurrency group on a new ` +
      `dispatch; a different-file run would NOT be cancelled and would instead run concurrently against the ` +
      `same shared backend — both are unsafe to dispatch alongside. Wait for it to finish (or investigate what ` +
      `dispatched it) before re-running this script — it will resume from the manifest.`,
    );
  }
}

async function waitForNewRun(ref: string, dispatchedAfter: Date, timeoutSeconds: number, detectPollSeconds: number, workflowFile: string): Promise<number> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  // Small negative buffer: GH's own createdAt can be a couple seconds before
  // our local "just issued the dispatch" instant depending on clock skew.
  const cutoff = dispatchedAfter.getTime() - 5000;
  while (Date.now() < deadline) {
    const recent = listRecentRuns(ref, 5, workflowFile).filter((r) => r.event === 'workflow_dispatch');
    const candidates = recent.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.databaseId - a.databaseId);
      return candidates[0].databaseId;
    }
    await sleep(detectPollSeconds * 1000);
  }
  throw new Error(
    `Timed out after ${timeoutSeconds}s waiting for the dispatched run to appear in ` +
    `'gh run list' for ${workflowFile}@${ref}. Check 'gh run list --workflow=${workflowFile}' manually — ` +
    `the dispatch may have failed outright, or GH's API is lagging beyond the timeout.`,
  );
}

async function waitForRunCompletion(runId: number, pollIntervalSeconds: number, runTimeoutSeconds: number): Promise<{ conclusion: string }> {
  const deadline = Date.now() + runTimeoutSeconds * 1000;
  for (;;) {
    const out = ghWithRetry(['run', 'view', String(runId), '--json', 'status,conclusion']);
    const { status, conclusion } = JSON.parse(out) as { status: string; conclusion: string | null };
    if (status === 'completed') {
      return { conclusion: conclusion ?? 'unknown' };
    }
    if (Date.now() > deadline) {
      throw new Error(
        `GH run ${runId} did not reach a completed status within ${runTimeoutSeconds}s (last observed status: "${status}"). ` +
        `Not auto-cancelling it — investigate with 'gh run view ${runId}' or 'gh run watch ${runId}' before deciding whether ` +
        `to cancel it manually and re-run this script (it will resume from the manifest's 'in_progress' entry).`,
      );
    }
    await sleep(pollIntervalSeconds * 1000);
  }
}

interface GhJobDetail {
  name: string;
  conclusion: string | null;
  steps: Array<{ name: string; conclusion: string | null }>;
}

function getRunJobs(runId: number): GhJobDetail[] {
  const out = ghWithRetry(['run', 'view', String(runId), '--json', 'jobs']);
  const { jobs } = JSON.parse(out) as { jobs: GhJobDetail[] };
  return jobs;
}

// Coarse, disclosed heuristic (see file header) — does NOT parse log content.
// success -> clean. failure -> genuine method-arm result ONLY if the failing
// step is an EXACT match for this leg's known primary test-execution step;
// any other failing step (setup, checkout, teardown, ...) is infra-suspect.
// Anything that isn't a clean success or a classified failure (cancelled,
// timed_out, skipped, neutral, null, ...) means this job produced no valid
// test data and is also infra-suspect — there is no fallthrough "assume
// clean" case.
function classifyLikelyInfra(job: GhJobDetail, primaryStepName: string): { likelyInfra: boolean; failingStep: string | null } {
  if (job.conclusion === 'success') {
    return { likelyInfra: false, failingStep: null };
  }
  if (job.conclusion === 'failure') {
    const failingStep = job.steps.find((s) => s.conclusion === 'failure');
    if (!failingStep) {
      // Failed job, no step individually marked failed (can happen with
      // cancellation propagation edge cases) — treat as infra-suspect.
      return { likelyInfra: true, failingStep: null };
    }
    const isPrimaryTestStep = failingStep.name === primaryStepName;
    return { likelyInfra: !isPrimaryTestStep, failingStep: failingStep.name };
  }
  // cancelled | timed_out | skipped | neutral | action_required | stale | null | ...
  return { likelyInfra: true, failingStep: null };
}

// ---------------------------------------------------------------------------
// Dispatch execution
// ---------------------------------------------------------------------------
function dispatch(spec: DispatchSpec, ref: string): void {
  const args = [
    'workflow', 'run', spec.workflowFile,
    '--ref', ref,
    '-f', `platform=${spec.ghPlatformInput}`,
    '-f', 'architecture_type=TOM',
    '-f', `experiment_batch_id=${spec.experimentBatchId}`,
    '-f', `run_index=${spec.runIndex}`,
  ];
  if (spec.cucumberParallel) {
    args.push('-f', `cucumber_parallel=${spec.cucumberParallel}`);
  }
  // §9.2 diagnosability — at most one of these three is ever set per item (see
  // lib/campaign-matrix.ts's DIAGNOSABILITY_CONDITIONS), matching "one fault active per process".
  if (spec.diagnosabilityChaosUser) {
    args.push('-f', `diagnosability_chaos_user=${spec.diagnosabilityChaosUser}`);
  }
  if (spec.tomInjectFault && spec.tomInjectFaultAction) {
    args.push('-f', `tom_inject_fault=${spec.tomInjectFault}`);
    args.push('-f', `tom_inject_fault_action=${spec.tomInjectFaultAction}`);
  }
  if (spec.tomInfraBreakPort) {
    args.push('-f', `tom_infra_break_port=${spec.tomInfraBreakPort}`);
  }
  gh(args);
}

// Waits for `runId` to complete, fetches its jobs, asserts the expected
// number of relevant jobs actually matched (see DispatchSpec.expectedJobCount),
// and classifies each. Shared tail for both a fresh dispatch and a resumed
// 'in_progress' item — does NOT dispatch anything.
async function waitAndClassify(spec: DispatchSpec, runId: number, cli: Cli): Promise<Omit<DispatchRecord, 'status' | 'dispatchedAt' | 'runId'>> {
  const { conclusion } = await waitForRunCompletion(runId, cli.pollIntervalSeconds, cli.runTimeoutSeconds);
  const jobs = getRunJobs(runId);
  const relevant = jobs.filter((j) => spec.relevantJobNamePrefixes.some((p) => j.name.startsWith(p)));
  if (relevant.length !== spec.expectedJobCount) {
    throw new Error(
      `Dispatch ${spec.id} (GH run ${runId}): expected ${spec.expectedJobCount} job(s) matching prefixes ` +
      `[${spec.relevantJobNamePrefixes.map((p) => `"${p}"`).join(', ')}], found ${relevant.length}. ` +
      `Job names actually present in this run: ${jobs.map((j) => `"${j.name}"`).join(', ')}. ` +
      `This means JOB_NAME_PREFIXES no longer matches how GitHub is rendering job names — fix that constant ` +
      `before trusting any further results (this is the first real check for the twin legs, which were never ` +
      `verified against a live run). This dispatch's manifest entry stays 'in_progress' with runId=${runId}; ` +
      `re-running this script after the fix will resume classification on this same run rather than re-dispatching.`,
    );
  }
  const classified = relevant.map((j) => {
    const { likelyInfra, failingStep } = classifyLikelyInfra(j, spec.primaryStepName);
    return { name: j.name, conclusion: j.conclusion, failingStep, likelyInfra };
  });
  const likelyInfra = classified.some((j) => j.likelyInfra);
  return {
    ghRunConclusion: conclusion,
    relevantJobs: classified.map(({ name, conclusion: c, failingStep }) => ({ name, conclusion: c, failingStep })),
    likelyInfra,
    completedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));

  const specs = buildSpecs(cli);

  console.log(`Campaign matrix: ${specs.length} dispatches (instrument=${cli.instrument}, ref=${cli.ref})`);
  const byInstrument = specs.reduce<Record<string, number>>((acc, s) => {
    acc[s.instrument] = (acc[s.instrument] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  breakdown: ${JSON.stringify(byInstrument)}`);

  if (cli.dryRun) {
    for (const s of specs) {
      const diagFields = [
        s.diagnosabilityChaosUser && `diagnosability_chaos_user=${s.diagnosabilityChaosUser}`,
        s.tomInjectFault && `tom_inject_fault=${s.tomInjectFault}+${s.tomInjectFaultAction}`,
        s.tomInfraBreakPort && `tom_infra_break_port=${s.tomInfraBreakPort}`,
      ].filter(Boolean).join('  ');
      console.log(
        `  [dry-run] ${s.id}  workflow=${s.workflowFile}  platform=${s.ghPlatformInput}  batch=${s.experimentBatchId}  ` +
        `run_index=${s.runIndex}${s.cucumberParallel ? `  cucumber_parallel=${s.cucumberParallel}` : ''}` +
        `${diagFields ? `  ${diagFields}` : ''}`,
      );
    }
    return;
  }

  console.warn(
    'Do not manually dispatch ahm-execution-helix.yml or ahm-evaluation-campaign.yml on this ref while ' +
    'this script is running — see the "Residual structural risk" note in this file\'s header.',
  );

  const path = manifestPath(cli.instrument, cli.batchSuffix);
  const manifest = loadManifest(path, cli.ref);
  if (manifest.ref !== cli.ref) {
    throw new Error(`Manifest at ${path} was created for ref "${manifest.ref}", refusing to reuse it for "${cli.ref}". Use --batch-suffix to start a fresh manifest.`);
  }

  const alreadyDone = specs.filter((s) => manifest.results[s.id]?.status === 'completed').length;
  console.log(`Resuming: ${alreadyDone}/${specs.length} already completed in ${path}`);

  for (const [i, spec] of specs.entries()) {
    const existing = manifest.results[spec.id];
    if (existing?.status === 'completed') {
      continue;
    }

    console.log(`[${i + 1}/${specs.length}] ${spec.id}`);
    let runId: number;

    if (existing?.status === 'in_progress' && existing.runId) {
      console.log(`  resuming existing GH run ${existing.runId} (recorded 'in_progress', not re-dispatching)`);
      runId = existing.runId;
    } else if (existing?.status === 'pending') {
      throw new Error(
        `Dispatch ${spec.id} is stuck in 'pending' state in ${path} (dispatched at ${existing.dispatchedAt}, ` +
        `but no GH run id was ever recorded — this script likely crashed between issuing 'gh workflow run' and ` +
        `finding the resulting run). Refusing to auto-resume: check ` +
        `'gh run list --workflow=${spec.workflowFile} --branch=${cli.ref}' manually. If a matching run exists, edit ` +
        `${path} to set this entry's status to "in_progress" with its runId, then re-run this script. If no run ` +
        `was actually created, delete this entry from the manifest and re-run to dispatch it fresh.`,
      );
    } else {
      const dispatchedAt = new Date();
      assertNothingInFlight(cli.ref);
      dispatch(spec, cli.ref);
      manifest.results[spec.id] = { status: 'pending', dispatchedAt: dispatchedAt.toISOString() };
      saveManifest(path, manifest);

      runId = await waitForNewRun(cli.ref, dispatchedAt, cli.dispatchTimeoutSeconds, cli.detectPollSeconds, spec.workflowFile);
      console.log(`  -> dispatched as GH run ${runId}; polling for completion...`);
      manifest.results[spec.id] = { status: 'in_progress', dispatchedAt: dispatchedAt.toISOString(), runId };
      saveManifest(path, manifest);
    }

    const tail = await waitAndClassify(spec, runId, cli);
    manifest.results[spec.id] = {
      status: 'completed',
      dispatchedAt: manifest.results[spec.id].dispatchedAt,
      runId,
      ...tail,
    };
    saveManifest(path, manifest);

    console.log(
      `  <- conclusion=${tail.ghRunConclusion}  likelyInfra=${tail.likelyInfra}  ` +
      `(${(tail.relevantJobs ?? []).map((j) => `${j.name}:${j.conclusion}`).join(', ')})`,
    );
    const isLast = i === specs.length - 1;
    if (!isLast) {
      console.log(`  cooling down ${cli.cooldownSeconds}s before next dispatch...`);
      await sleep(cli.cooldownSeconds * 1000);
    }
  }

  const completed = Object.values(manifest.results).filter((r) => r.status === 'completed');
  const flagged = completed.filter((r) => r.likelyInfra).length;
  console.log(`\nCampaign complete: ${completed.length}/${specs.length} dispatches completed, recorded in ${path}.`);
  console.log(`${flagged} flagged likelyInfra=true — review before running 'pnpm metrics:experiment' on downloaded artifacts.`);
}

main().catch((err) => {
  console.error(`[run-campaign] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
