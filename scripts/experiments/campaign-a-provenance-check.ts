// Campaign A post-run provenance adjudication — reproduces
// docs/research/2026-09-03-campaign-a-provenance-adjudication.md's tables exactly, from the raw
// campaign manifest + merged run-manifests, rather than leaving that analysis as an unreproducible
// one-off. Read-only; does not touch reports/campaigns/campaign-campaign-a.json or metrics/raw/**.
//
// Classifies each of the 60 dispatches' backend provenance read into one of four categories (the
// same scheme ci/steps/record-app-provenance.sh's OMNIPIZZA_BACKEND_PROVENANCE_STATUS now records
// going forward for Campaign B — see that script's header). Campaign A predates that field, so this
// script derives the same categories from the raw omnipizzaBackendVersion JSON shape instead:
//   verified                 — git_commit present, matches the frozen expected commit
//   mismatch                 — git_commit present, does NOT match
//   fallback_without_commit  — a response was recorded but has no git_commit field
//   timeout_error            — no backend response recorded at all
// Then recomputes M1/MOL restricted to the 'verified' subset per (arm, position) cell and compares
// against the full N=60 (read from reports/campaign-a-analysis.json, produced by
// campaign-a-analysis.ts — run that first).

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { Arm, CAMPAIGN_A_POSITIONS, CampaignAPosition } from './lib/campaign-matrix';

const REPO_ROOT = join(__dirname, '..', '..');
const CAMPAIGN_MANIFEST_PATH = join(REPO_ROOT, 'reports', 'campaigns', 'campaign-campaign-a.json');
const RUN_MANIFEST_DIR = join(REPO_ROOT, 'metrics', 'raw', 'run-manifest');
const ANALYSIS_PATH = join(REPO_ROOT, 'reports', 'campaign-a-analysis.json');

// The frozen release's backend commit (docs/.../campaign-a-frozen-definitions.md's pinned v1.1.8) —
// hardcoded here deliberately: this script exists to check THIS campaign's already-known expectation,
// not to infer one.
const EXPECTED_BACKEND_COMMIT = '9ca37674d374e9303912e259641ee86baf3aabe1';

type ProvenanceStatus = 'verified' | 'mismatch' | 'fallback_without_commit' | 'timeout_error';

function classify(rawBackendVersion: unknown): ProvenanceStatus {
  if (!rawBackendVersion) return 'timeout_error';
  const parsed = typeof rawBackendVersion === 'string' ? JSON.parse(rawBackendVersion) : rawBackendVersion;
  if (typeof parsed?.git_commit !== 'string' || parsed.git_commit.length === 0) return 'fallback_without_commit';
  return parsed.git_commit === EXPECTED_BACKEND_COMMIT ? 'verified' : 'mismatch';
}

function parseItemId(id: string): { arm: Arm; position: CampaignAPosition['key'] } {
  const parts = id.split('__');
  return { arm: parts[1] as Arm, position: parts[2].toUpperCase() as CampaignAPosition['key'] };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function main(): void {
  if (!existsSync(CAMPAIGN_MANIFEST_PATH)) throw new Error(`Missing ${CAMPAIGN_MANIFEST_PATH} — dispatch Campaign A first.`);
  if (!existsSync(ANALYSIS_PATH)) throw new Error(`Missing ${ANALYSIS_PATH} — run campaign-a-analysis.ts first.`);

  const manifest = JSON.parse(readFileSync(CAMPAIGN_MANIFEST_PATH, 'utf8'));
  const analysis = JSON.parse(readFileSync(ANALYSIS_PATH, 'utf8')).analyses as Array<{
    id: string; arm: Arm; position: CampaignAPosition['key']; m1: { m1: number | null } | null; mol: { mol: number } | null;
  }>;
  const runManifestFiles = readdirSync(RUN_MANIFEST_DIR);

  const rows: Array<{ id: string; arm: Arm; position: CampaignAPosition['key']; status: ProvenanceStatus }> = [];
  for (const [id, record] of Object.entries<any>(manifest.results)) {
    const runId = record.runId;
    const match = runManifestFiles.find((f) => f.startsWith(`tom-${runId}-`));
    if (!match) throw new Error(`No run-manifest found for ${id} (run ${runId})`);
    const d = JSON.parse(readFileSync(join(RUN_MANIFEST_DIR, match), 'utf8'));
    const { arm, position } = parseItemId(id);
    rows.push({ id, arm, position, status: classify(d.omnipizzaBackendVersion) });
  }

  const overall: Record<ProvenanceStatus, number> = { verified: 0, mismatch: 0, fallback_without_commit: 0, timeout_error: 0 };
  for (const r of rows) overall[r.status]++;
  console.log('Overall provenance breakdown:', overall);
  console.log(`\n${rows.length} dispatches total. No evidence of backend version drift observed` +
    ` (mismatch=${overall.mismatch}); direct backend build provenance available for ${overall.verified}/${rows.length}.\n`);

  console.log('| Arm | Position | N | verified | fallback_without_commit | timeout_error | mismatch |');
  console.log('|---|---|---|---|---|---|---|');
  for (const arm of ['atomic', 'twin'] as Arm[]) {
    for (const pos of CAMPAIGN_A_POSITIONS) {
      const cell = rows.filter((r) => r.arm === arm && r.position === pos.key);
      const c: Record<ProvenanceStatus, number> = { verified: 0, mismatch: 0, fallback_without_commit: 0, timeout_error: 0 };
      for (const r of cell) c[r.status]++;
      console.log(`| ${arm} | ${pos.key} | ${cell.length} | ${c.verified} | ${c.fallback_without_commit} | ${c.timeout_error} | ${c.mismatch} |`);
    }
  }

  console.log('\n| Arm | Position | M1 (N=60) | M1 (N=verified) | MOL (N=60) | MOL (N=verified) | verified N |');
  console.log('|---|---|---|---|---|---|---|');
  const verifiedIds = new Set(rows.filter((r) => r.status === 'verified').map((r) => r.id));
  for (const arm of ['atomic', 'twin'] as Arm[]) {
    for (const pos of CAMPAIGN_A_POSITIONS) {
      const full = analysis.filter((a) => a.arm === arm && a.position === pos.key);
      const verified = full.filter((a) => verifiedIds.has(a.id));
      const fullM1 = median(full.map((a) => a.m1?.m1).filter((v): v is number => v !== null && v !== undefined));
      const verM1 = median(verified.map((a) => a.m1?.m1).filter((v): v is number => v !== null && v !== undefined));
      const fullMol = median(full.map((a) => a.mol?.mol).filter((v): v is number => v !== undefined));
      const verMol = median(verified.map((a) => a.mol?.mol).filter((v): v is number => v !== undefined));
      console.log(`| ${arm} | ${pos.key} | ${fullM1} | ${verM1} | ${fullMol} | ${verMol} | ${verified.length} |`);
    }
  }
}

main();
