// Shared GH Actions artifact download + metrics/raw merge logic — extracted from
// aggregate-campaign-artifacts.ts (research hardening Phase 2 follow-up, 2026-09-02) so
// scripts/experiments/validate-experiment-ingestion.ts can reuse the EXACT same download/merge
// path when proving the experiment-mode artifact-naming wiring against real historical runs,
// rather than re-implementing (and risking silently diverging from) it.

import { execFileSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const METRICS_DIR = join(REPO_ROOT, 'metrics');
const TMP_DOWNLOAD_ROOT = join(REPO_ROOT, 'reports', 'campaigns', '.artifact-tmp');

// Downloads one named artifact from `runId` into a fresh temp dir and returns that dir, or null
// if the artifact doesn't exist / download failed (logged, not thrown — a missing artifact on a
// likelyInfra-flagged dispatch is expected, not exceptional).
export function downloadArtifact(runId: number, artifactName: string): string | null {
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

// Recursively copies every file under `srcDir` into the identically-relative path under
// `destDir`, creating directories as needed. Safe to call repeatedly (overwrite-in-place) since
// source files are per-run-id-named (see aggregate-campaign-artifacts.ts's file header).
export function copyTree(srcDir: string, destDir: string): number {
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

// Merges only metrics/raw/** from a downloaded artifact — processed/figures are deliberately
// excluded (derived output, regenerated locally by `pnpm metrics:experiment`).
export function mergeArtifactMetricsRaw(artifactDir: string): number {
  const rawSrc = join(artifactDir, 'metrics', 'raw');
  const rawDest = join(METRICS_DIR, 'raw');
  return copyTree(rawSrc, rawDest);
}

export function ensureDownloadRoot(): void {
  mkdirSync(TMP_DOWNLOAD_ROOT, { recursive: true });
  mkdirSync(join(METRICS_DIR, 'raw'), { recursive: true });
}

export function cleanupDownloadRoot(): void {
  rmSync(TMP_DOWNLOAD_ROOT, { recursive: true, force: true });
}
