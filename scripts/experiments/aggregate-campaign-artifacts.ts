// Campaign artifact aggregator — companion to run-campaign.ts.
// See docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md §5:
// "Aggregation after dispatch reuses the existing pnpm metrics:experiment pipeline
// unchanged — no new aggregation logic, since the manifest/CSV join already
// supports multiple run_index values per batch." That pipeline (`pnpm
// metrics:experiment` -> `metrics:all` + `metrics:quality:all`) reads from LOCAL
// metrics/raw/** (gitignored). run-campaign.ts dispatches and classifies GH
// Actions runs but never downloads anything — this script is the missing link:
// for every 'completed' item in a campaign manifest, download the relevant GH
// Actions artifact(s) and merge their metrics/raw/** subtree into the local
// metrics/ directory, so pnpm metrics:experiment has something to read.
//
// Why merging is safe (not requiring per-file conflict resolution): every file
// under metrics/raw/<category>/ is named by that job's own TOM_RUN_ID
// (generate-run-manifest.ts: "metrics/raw/run-manifest/<runId>.json"; same
// per-run-id convention across raw/api, raw/visual, raw/gatling, raw/proxy-jsonl,
// raw/cucumber-jsonl, raw/tool-events, raw/tool-integration — confirmed by
// reading scripts/metrics/lib/paths.ts and normalize-telemetry.ts). TOM_RUN_ID
// is unique per GH Actions job (it embeds github.run_id + run_attempt + the
// campaign's own run_index + matrix.suite/matrix.browser where applicable), so
// files from different dispatches — and different jobs within the SAME
// dispatch (e.g. atomic-web's reads-chromium vs writes-chromium legs) — never
// collide. A plain recursive copy is therefore lossless; nothing needs to be
// JSON-merged by hand. metrics/processed/** and metrics/figures/** are NOT
// copied from artifacts at all — those are derived output that
// `pnpm metrics:experiment` regenerates locally from the merged raw/ data, so
// copying them would be redundant work importing stale, per-job-partial
// aggregates.
//
// Artifact names were confirmed by reading each relevant job's own
// `actions/upload-artifact@v7` step (see lib/campaign-matrix.ts's
// artifactNamesFor) and cross-checked against a real completed run's actual
// artifact list via `gh api .../actions/runs/<id>/artifacts` (2026-08-24).
//
// Idempotent by design: a small state file
// (reports/campaigns/aggregated-<instrument>.json, gitignored, same directory
// as run-campaign.ts's own manifest) tracks which campaign item ids have been
// fully merged, so re-running this script after new dispatches complete only
// downloads what's new — it does not re-fetch ~130 artifacts on every
// invocation. An item that had SOME but not all of its artifacts fail to
// download is recorded as 'partial', not skipped on the next run, so a
// transient failure is retried rather than silently leaving a gap in the
// merged data. A 'complete' record is only trusted if its stored runId still
// matches the campaign manifest's CURRENT runId for that item id — see the
// "stale runId" note below.
//
// Two correctness gaps found by adversarial review (2026-08-24), both fixed:
//   1. run-campaign.ts's manifest file is instrument-scoped
//      (campaign-all-*.json / campaign-determinism-*.json / campaign-
//      parallel-safety-*.json), but a campaign ITEM id is only scoped by
//      batchSuffix, not by which of those files produced it. Running a
//      narrow trial (e.g. --instrument determinism) and later the real
//      campaign (e.g. bare `pnpm experiments:run-campaign`, --instrument
//      defaults to 'all') produces two files with colliding item ids but
//      DIFFERENT runIds. Blindly letting one candidate file always win by
//      array position (the original implementation) could silently prefer
//      stale trial data over the real campaign's data. Fixed: on a
//      collision, keep whichever record's completedAt/dispatchedAt is more
//      recent, and warn loudly — never silent. ref mismatches across
//      candidate files are also rejected outright, mirroring the guard
//      run-campaign.ts itself applies to a single manifest.
//   2. status: 'completed' in run-campaign.ts's manifest means "the GH
//      Actions run reached a terminal status" — NOT "passed cleanly". A
//      dispatch run-campaign.ts itself flagged likelyInfra=true (or whose
//      ghRunConclusion wasn't success/failure — cancelled, timed_out, ...)
//      still uploads a metrics-bearing artifact (every job's "Collect
//      artifacts"/"Upload artifacts" step runs `if: always()`), so it would
//      merge into metrics/raw identically to a clean run with zero trace of
//      the flag. Fixed: likelyInfra=true items are excluded from the merge
//      by default (recorded 'skipped-infra', not silently dropped — visible
//      in the state file and the final summary) unless
//      --include-infra-flagged is passed. Genuine method-arm failures
//      (ghRunConclusion: 'failure' with likelyInfra: false) are NOT
//      excluded — for the determinism instrument specifically, a real
//      pass<->fail transition IS the signal being measured, not noise.

import { execFileSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  CampaignItem,
  PlatformLeg,
  artifactNamesFor,
  buildCampaignItems,
  buildExecutionEfficiencyItems,
  legKeyOf,
} from './lib/campaign-matrix';

const REPO_ROOT = join(__dirname, '..', '..');
const CAMPAIGNS_DIR = join(REPO_ROOT, 'reports', 'campaigns');
const METRICS_DIR = join(REPO_ROOT, 'metrics');
const TMP_DOWNLOAD_ROOT = join(REPO_ROOT, 'reports', 'campaigns', '.artifact-tmp');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
interface Cli {
  instrument: 'determinism' | 'parallel-safety' | 'all' | 'efficiency';
  batchSuffix: string;
  dryRun: boolean;
  includeInfraFlagged: boolean;
  // --instrument efficiency only — REQUIRED (no default), and must match the exact values passed to
  // run-campaign.ts's own --platform-leg/--repeats for this dispatch. Item ids are deterministically
  // built from these two values (buildExecutionEfficiencyItems), and this script's whole
  // manifest-cross-reference (items.filter(item => dispatched.get(item.id)...)) depends on
  // reconstructing the EXACT same id set that was actually dispatched — a mismatched or defaulted
  // value here would silently miss real completed items rather than fail loudly, which is worse than
  // requiring the caller to state it explicitly. Caught by adversarial review (2026-08-26): the two
  // scripts previously had OPPOSITE --platform-leg defaults ('android' here... actually run-campaign.ts;
  // 'web' in execution-efficiency-delta.ts), a silent-mismatch risk on top of this one.
  platformLeg?: PlatformLeg;
  repeats?: number;
}

function parseCli(argv: string[]): Cli {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (flag: string): boolean => argv.includes(flag);

  if (has('--help')) {
    console.log(`
aggregate-campaign-artifacts.ts — downloads GH Actions artifacts for every 'completed'
item in a run-campaign.ts manifest and merges their metrics/raw/** into the local
metrics/ tree, so 'pnpm metrics:experiment' has data to read.

  --instrument <determinism|parallel-safety|all|efficiency>   default: all — must match the
                                                    run-campaign.ts manifest(s) you want to aggregate
  --batch-suffix <string>                           default: '' — must match run-campaign.ts's --batch-suffix
  --dry-run                                         list what would be downloaded/merged; touches nothing
  --include-infra-flagged                           also merge items run-campaign.ts flagged likelyInfra=true
                                                    (default: excluded, recorded 'skipped-infra' — only pass
                                                    this after manually reviewing that the flag was a false
                                                    positive for the specific items you're including)
  --platform-leg <web|android>                      REQUIRED for --instrument efficiency, no default — must
                                                    exactly match the --platform-leg passed to
                                                    run-campaign.ts for this dispatch
  --repeats <n>                                     REQUIRED for --instrument efficiency, no default — must
                                                    exactly match the --repeats passed to run-campaign.ts
                                                    for this dispatch (determines the item-id set this
                                                    script reconstructs to cross-reference the manifest)
`);
    process.exit(0);
  }

  const instrument = (get('--instrument') ?? 'all') as Cli['instrument'];
  if (!['determinism', 'parallel-safety', 'all', 'efficiency'].includes(instrument)) {
    throw new Error(`--instrument must be determinism|parallel-safety|all|efficiency, got "${instrument}"`);
  }

  let platformLeg: PlatformLeg | undefined;
  let repeats: number | undefined;
  if (instrument === 'efficiency') {
    const rawPlatformLeg = get('--platform-leg');
    if (rawPlatformLeg !== 'web' && rawPlatformLeg !== 'android') {
      throw new Error(
        `--instrument efficiency requires --platform-leg web|android (no default) — pass the exact value ` +
        `used when dispatching with run-campaign.ts, got "${rawPlatformLeg}"`,
      );
    }
    platformLeg = rawPlatformLeg;
    const rawRepeats = get('--repeats');
    const parsedRepeats = Number(rawRepeats);
    if (!rawRepeats || !Number.isInteger(parsedRepeats) || parsedRepeats < 1) {
      throw new Error(
        `--instrument efficiency requires --repeats <positive integer> (no default) — pass the exact value ` +
        `used when dispatching with run-campaign.ts, got "${rawRepeats}"`,
      );
    }
    repeats = parsedRepeats;
  }

  return {
    instrument,
    platformLeg,
    repeats,
    batchSuffix: get('--batch-suffix') ?? '',
    dryRun: has('--dry-run'),
    includeInfraFlagged: has('--include-infra-flagged'),
  };
}

// ---------------------------------------------------------------------------
// run-campaign.ts's manifest — read-only here (this script never dispatches).
// Duplicated minimal shape rather than importing run-campaign.ts, since that
// file's own module-level code (CLI parsing calling process.exit on --help,
// etc.) isn't meant to be imported as a library.
// ---------------------------------------------------------------------------
interface DispatchRecord {
  status: 'pending' | 'in_progress' | 'completed';
  runId?: number;
  dispatchedAt?: string;
  completedAt?: string;
  ghRunConclusion?: string;
  likelyInfra?: boolean;
}

interface CampaignManifest {
  ref: string;
  results: Record<string, DispatchRecord>;
}

function campaignManifestPath(instrument: Cli['instrument'], batchSuffix: string): string {
  const name = `campaign-${instrument}${batchSuffix ? `-${batchSuffix}` : ''}.json`;
  return join(CAMPAIGNS_DIR, name);
}

function recordTimestamp(r: DispatchRecord): number {
  const t = r.completedAt ?? r.dispatchedAt;
  return t ? new Date(t).getTime() : 0;
}

// The campaign manifest is written per single-instrument or 'all' CLI
// invocation of run-campaign.ts — mirror that same set of possible files here
// rather than assuming exactly one. Two or more of these files CAN contain a
// record for the same item id (e.g. a narrow --instrument determinism trial
// followed later by the real --instrument all campaign) with DIFFERENT
// runIds — see the file header. Reconciled by recency (completedAt falling
// back to dispatchedAt), not by array position, with a loud warning on any
// genuine conflict.
function loadRelevantCampaignManifests(instrument: Cli['instrument'], batchSuffix: string): Map<string, DispatchRecord> {
  const candidatePaths =
    instrument === 'all'
      ? [
          campaignManifestPath('all', batchSuffix),
          campaignManifestPath('determinism', batchSuffix),
          campaignManifestPath('parallel-safety', batchSuffix),
        ]
      : [campaignManifestPath(instrument, batchSuffix)];

  const merged = new Map<string, DispatchRecord>();
  let ref: string | undefined;
  let foundAny = false;
  for (const p of candidatePaths) {
    if (!existsSync(p)) continue;
    foundAny = true;
    let manifest: CampaignManifest;
    try {
      manifest = JSON.parse(readFileSync(p, 'utf8'));
    } catch (err) {
      throw new Error(`Failed to parse campaign manifest at ${p}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (ref === undefined) {
      ref = manifest.ref;
    } else if (manifest.ref !== ref) {
      throw new Error(
        `Campaign manifests disagree on ref: ${p} was created for "${manifest.ref}", but an earlier candidate ` +
        `manifest was for "${ref}". Refusing to merge data dispatched against different refs — this would ` +
        `silently mix results from different code states.`,
      );
    }
    for (const [id, record] of Object.entries(manifest.results)) {
      const existing = merged.get(id);
      if (!existing) {
        merged.set(id, record);
        continue;
      }
      if (existing.runId !== record.runId) {
        const keepNew = recordTimestamp(record) >= recordTimestamp(existing);
        console.warn(
          `  ! item "${id}" has conflicting records across manifest files (runId ${existing.runId} vs ${record.runId}) ` +
          `— keeping the more recent one (runId ${keepNew ? record.runId : existing.runId}). This usually means a ` +
          `narrower trial run and a later full campaign run both dispatched the same item id; verify this is what ` +
          `you expect, e.g. via --batch-suffix isolation for trial runs going forward.`,
        );
        if (keepNew) merged.set(id, record);
      } else {
        merged.set(id, record);
      }
    }
  }
  if (!foundAny) {
    throw new Error(
      `No campaign manifest found for instrument="${instrument}" batchSuffix="${batchSuffix}" under ${CAMPAIGNS_DIR}. ` +
      `Run 'pnpm experiments:run-campaign' first — this script only aggregates dispatches that script has already recorded.`,
    );
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Aggregation state — this script's OWN idempotency record, separate from
// run-campaign.ts's dispatch manifest.
// ---------------------------------------------------------------------------
type ItemAggregationStatus = 'complete' | 'partial' | 'skipped-infra';

interface AggregationRecord {
  status: ItemAggregationStatus;
  runId: number;
  artifactsDownloaded: string[];
  artifactsFailed: string[];
  aggregatedAt: string;
}

interface AggregationState {
  schemaVersion: '1.0.0';
  results: Record<string, AggregationRecord>;
}

function aggregationStatePath(instrument: Cli['instrument'], batchSuffix: string): string {
  const name = `aggregated-${instrument}${batchSuffix ? `-${batchSuffix}` : ''}.json`;
  return join(CAMPAIGNS_DIR, name);
}

function loadAggregationState(path: string): AggregationState {
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      throw new Error(
        `Failed to parse aggregation state at ${path}: ${err instanceof Error ? err.message : String(err)}. ` +
        `This file only tracks what's already been merged — if genuinely corrupted, deleting it is safe ` +
        `(worst case: this script re-downloads and re-merges everything, which is redundant but not harmful, ` +
        `since raw/ files are per-run-id-named and re-copying identical content is a no-op).`,
      );
    }
  }
  return { schemaVersion: '1.0.0', results: {} };
}

function saveAggregationState(path: string, state: AggregationState): void {
  mkdirSync(CAMPAIGNS_DIR, { recursive: true });
  const tmpPath = `${path}.tmp-${process.pid}`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2) + '\n');
  renameSync(tmpPath, path);
}

// ---------------------------------------------------------------------------
// gh CLI + filesystem merge
// ---------------------------------------------------------------------------

// Downloads one named artifact from `runId` into a fresh temp dir and returns
// that dir, or null if the artifact doesn't exist / download failed (logged,
// not thrown — a missing artifact on a likelyInfra-flagged dispatch is
// expected, not exceptional).
function downloadArtifact(runId: number, artifactName: string): string | null {
  const dest = join(TMP_DOWNLOAD_ROOT, artifactName);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  try {
    execFileSync('gh', ['run', 'download', String(runId), '--name', artifactName, '--dir', dest], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return dest;
  } catch (err) {
    console.warn(`    ! failed to download artifact "${artifactName}" from run ${runId}: ${err instanceof Error ? err.message : String(err)}`);
    rmSync(dest, { recursive: true, force: true });
    return null;
  }
}

// Recursively copies every file under `srcDir` into the identically-relative
// path under `destDir`, creating directories as needed. Safe to call
// repeatedly (overwrite-in-place) since source files are per-run-id-named —
// see the file header for why this can't collide across dispatches or across
// jobs within one dispatch.
function copyTree(srcDir: string, destDir: string): number {
  if (!existsSync(srcDir)) return 0;
  let count = 0;
  for (const entry of readdirSync(srcDir)) {
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    const st = statSync(srcPath);
    if (st.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      count += copyTree(srcPath, destPath);
    } else {
      mkdirSync(destDir, { recursive: true });
      copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

// Merges only metrics/raw/** from a downloaded artifact — see file header for
// why processed/figures are deliberately excluded.
function mergeArtifactMetricsRaw(artifactDir: string): number {
  const rawSrc = join(artifactDir, 'metrics', 'raw');
  const rawDest = join(METRICS_DIR, 'raw');
  return copyTree(rawSrc, rawDest);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));

  const items: CampaignItem[] =
    cli.instrument === 'efficiency'
      ? buildExecutionEfficiencyItems(cli.batchSuffix, cli.platformLeg as PlatformLeg, cli.repeats as number)
      : buildCampaignItems(cli.instrument, cli.batchSuffix);
  const dispatched = loadRelevantCampaignManifests(cli.instrument, cli.batchSuffix);

  const completedItems = items.filter((item) => dispatched.get(item.id)?.status === 'completed');
  console.log(
    `Campaign items: ${items.length} total, ${completedItems.length} recorded 'completed' in the dispatch manifest ` +
    `(instrument=${cli.instrument})`,
  );

  const statePath = aggregationStatePath(cli.instrument, cli.batchSuffix);
  const state = loadAggregationState(statePath);

  // A 'complete' state entry is only trusted if it was aggregated against the
  // SAME runId the dispatch manifest currently reports for that item — see
  // the file header's item 1. If the manifest's winning record for an id
  // changed (a later, more recent dispatch superseded an earlier one), the
  // old merged data is stale and must be re-aggregated from the new run.
  const isStale = (item: CampaignItem): boolean => {
    const existing = state.results[item.id];
    if (!existing || existing.status !== 'complete') return false;
    return existing.runId !== dispatched.get(item.id)?.runId;
  };
  for (const item of completedItems) {
    if (isStale(item)) {
      console.warn(`  ! ${item.id}: aggregation state's runId (${state.results[item.id].runId}) no longer matches the dispatch manifest's runId (${dispatched.get(item.id)?.runId}) — re-aggregating from the new run.`);
    }
  }

  const alreadyComplete = completedItems.filter((item) => state.results[item.id]?.status === 'complete' && !isStale(item)).length;
  console.log(`Already fully aggregated: ${alreadyComplete}/${completedItems.length}`);

  // likelyInfra=true items are excluded by default — see file header item 2.
  // A genuine method-arm failure (ghRunConclusion: 'failure', likelyInfra:
  // false) is NOT excluded; it's real determinism-instrument signal, not noise.
  const infraFlagged = completedItems.filter((item) => dispatched.get(item.id)?.likelyInfra === true);
  const eligible = cli.includeInfraFlagged ? completedItems : completedItems.filter((item) => dispatched.get(item.id)?.likelyInfra !== true);
  if (infraFlagged.length > 0) {
    console.log(
      `${infraFlagged.length} item(s) flagged likelyInfra=true by run-campaign.ts: ` +
      `${cli.includeInfraFlagged ? 'including anyway (--include-infra-flagged)' : "excluded by default (recorded 'skipped-infra')"}.`,
    );
  }

  const toProcess = eligible.filter((item) => state.results[item.id]?.status !== 'complete' || isStale(item));

  if (cli.dryRun) {
    for (const item of toProcess) {
      const runId = dispatched.get(item.id)?.runId;
      const key = legKeyOf(item.arm, item.platformLeg);
      const names = runId ? artifactNamesFor(key, runId) : ['<no runId recorded>'];
      console.log(`  [dry-run] ${item.id}  runId=${runId ?? '?'}  artifacts=${names.join(', ')}`);
    }
    if (!cli.includeInfraFlagged) {
      for (const item of infraFlagged) {
        console.log(`  [dry-run] ${item.id}  SKIPPED (likelyInfra=true) — pass --include-infra-flagged to override`);
      }
    }
    return;
  }

  mkdirSync(TMP_DOWNLOAD_ROOT, { recursive: true });
  mkdirSync(join(METRICS_DIR, 'raw'), { recursive: true });

  if (!cli.includeInfraFlagged) {
    for (const item of infraFlagged) {
      const record = dispatched.get(item.id);
      state.results[item.id] = {
        status: 'skipped-infra',
        runId: record?.runId ?? -1,
        artifactsDownloaded: [],
        artifactsFailed: [],
        aggregatedAt: new Date().toISOString(),
      };
    }
    if (infraFlagged.length > 0) saveAggregationState(statePath, state);
  }

  for (const [i, item] of toProcess.entries()) {
    const record = dispatched.get(item.id);
    if (!record?.runId || !Number.isInteger(record.runId) || record.runId <= 0) {
      console.warn(`[${i + 1}/${toProcess.length}] ${item.id}: no valid runId in the dispatch manifest (got ${JSON.stringify(record?.runId)}) — skipping (likely still 'pending'/'in_progress', or a hand-edited manifest entry).`);
      continue;
    }
    const runId = record.runId;
    const key = legKeyOf(item.arm, item.platformLeg);
    const artifactNames = artifactNamesFor(key, runId);
    console.log(`[${i + 1}/${toProcess.length}] ${item.id}  (GH run ${runId}, ${artifactNames.length} artifact(s))`);

    const downloaded: string[] = [];
    const failed: string[] = [];
    let filesCopied = 0;
    for (const name of artifactNames) {
      const dir = downloadArtifact(runId, name);
      if (!dir) {
        failed.push(name);
        continue;
      }
      filesCopied += mergeArtifactMetricsRaw(dir);
      downloaded.push(name);
      rmSync(dir, { recursive: true, force: true });
    }

    state.results[item.id] = {
      status: failed.length === 0 ? 'complete' : 'partial',
      runId,
      artifactsDownloaded: downloaded,
      artifactsFailed: failed,
      aggregatedAt: new Date().toISOString(),
    };
    saveAggregationState(statePath, state);
    console.log(`    <- merged ${filesCopied} file(s) from ${downloaded.length}/${artifactNames.length} artifact(s)${failed.length ? `, FAILED: ${failed.join(', ')}` : ''}`);
  }

  rmSync(TMP_DOWNLOAD_ROOT, { recursive: true, force: true });

  const finalComplete = Object.values(state.results).filter((r) => r.status === 'complete').length;
  const finalPartial = Object.values(state.results).filter((r) => r.status === 'partial').length;
  const finalSkipped = Object.values(state.results).filter((r) => r.status === 'skipped-infra').length;
  console.log(`\nAggregation done: ${finalComplete} complete, ${finalPartial} partial (re-run to retry), ${finalSkipped} skipped-infra, recorded in ${statePath}.`);
  console.log(`Do not run this concurrently with 'pnpm metrics:experiment' — a read racing a write under metrics/raw is self-healing on the next run but can silently drop one manifest for a single invocation.`);
  console.log(`Next: 'pnpm metrics:experiment' to regenerate metrics/processed + metrics/figures from the merged raw data.`);
}

main().catch((err) => {
  console.error(`[aggregate-campaign-artifacts] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
