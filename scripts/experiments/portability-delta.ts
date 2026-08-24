// Portability delta — §8.4 Corollary 1 instrument (build-order step 4).
// See docs/paper/atomic-testing-formal-definition.md §8.4/§9.4 and
// docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md §4.
//
// Two DELIBERATELY SEPARATE measurements — not one hybrid number. A single
// "atomic: 0 vs twin: N" delta would mix a structural claim (inspecting the
// current tree) with a historical git-diff (a past port event), which fails
// §8.1's own construct-validity standard: the same operator, applied the
// same way, to both arms.
//
//   1. structuralResult — symmetric, computed identically for both arms:
//      does the .feature/step_definitions specification layer contain any
//      PLATFORM/DRIVER-conditional code? This IS Corollary 1's actual claim
//      (the specification doesn't change across platforms) and is directly
//      comparable across arms.
//   2. twinOnlyMobilePortCost — NOT symmetric. The twin's mobile-port commits
//      (342d2e0, 6561098) are diffed and hand-classified per §8.4's counting
//      policy. The atomic suite has no equivalent commits in this evaluation
//      (its Android support predates it, at unknown effort/circumstance
//      parity) — reported as a labeled, non-comparable line item, not forced
//      into a fake atomic-side number.
//
// Classification below was recorded by hand on 2026-08-23 while construction
// was still fresh (see the paper's working notes) — this script measures the
// LOC/files it implies, it does not re-derive the classification itself.

import { execFileSync } from 'child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..');
const PLATFORM_CONDITIONAL = /process\.env\.(PLATFORM|DRIVER)\b|\b(PLATFORM|DRIVER)\s*===/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

interface StructuralResult {
  arm: string;
  filesScanned: number;
  platformConditionalFiles: string[];
}

// Visual After-hooks are excluded: they're the visual contract (Pixelmatch),
// explicitly out of this paper's tool scope (§7.1), not part of the R1-R4
// functional specification this instrument measures.
function structuralCheck(arm: string, dirs: string[]): StructuralResult {
  let filesScanned = 0;
  const hits: string[] = [];
  for (const dir of dirs) {
    for (const f of walk(join(REPO_ROOT, dir))) {
      const isSpecLayer = f.endsWith('.feature') || (f.endsWith('.ts') && f.includes('step_definitions'));
      if (!isSpecLayer || f.includes('visual.hooks.ts')) continue;
      filesScanned++;
      if (PLATFORM_CONDITIONAL.test(readFileSync(f, 'utf8'))) {
        hits.push(f.replace(REPO_ROOT + '/', ''));
      }
    }
  }
  return { arm, filesScanned, platformConditionalFiles: hits };
}

type Classification = 'spec-forced' | 'plugin-gap' | 'out-of-scope-mobilewright';

interface ClassifiedFile {
  path: string;
  commit: string;
  classification: Classification;
  note: string;
}

const TWIN_MOBILE_PORT_FILES: ClassifiedFile[] = [
  {
    path: 'evaluation/non-atomic-twin/checkout/organisms/checkout-nonatomic.route.ts',
    commit: '342d2e0',
    classification: 'spec-forced',
    note: "seedAndReadCartFromDraft — mobile checkout deep-links with hydrateCart=true, forcing a real backend cart the twin had no equivalent of. Twin-only code (evaluation/non-atomic-twin/); verified present, same lines, at 6561098 (Appium-green) and HEAD — this is not Mobilewright-only cruft.",
  },
  {
    path: 'src/core/tests/login/contracts/login.wright.locators.json',
    commit: '342d2e0',
    classification: 'out-of-scope-mobilewright',
    note: "Stale logoutButton locator for the Mobilewright plugin specifically. Mobilewright is excluded from this paper's tool scope (§7.1) and was abandoned the same day (6561098) — never exercised again under the paper's actual mobile instrument (Appium).",
  },
  {
    path: 'src/plugins/mobilewright/actions/Type.ts',
    commit: '342d2e0',
    classification: 'out-of-scope-mobilewright',
    note: "IME-dismiss-via-BACK workaround inside the Mobilewright plugin's own TYPE action. src/plugins/mobilewright/ is entirely outside §7.1's tool scope — same reasoning as above.",
  },
  {
    path: 'src/core/tests/login/contracts/login.webdriver.locators.json',
    commit: '6561098',
    classification: 'plugin-gap',
    note: 'Stale logoutButton locator for Appium (the "webdriver" contract) — shared, plugin-contract-layer code that also affects the atomic suite\'s own Appium runs, not twin-specific.',
  },
];

function gitNumstat(commit: string, path: string): { added: number; deleted: number } {
  const out = execFileSync('git', ['show', commit, '--numstat', '--', path], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const line = out.trim().split('\n').filter(Boolean).pop() ?? '';
  const [added, deleted] = line.split('\t');
  return { added: Number(added) || 0, deleted: Number(deleted) || 0 };
}

function sum(files: Array<{ added: number; deleted: number }>) {
  return { files: files.length, locChanged: files.reduce((n, f) => n + f.added + f.deleted, 0) };
}

function main(): void {
  const structuralResult = {
    description:
      'Files under each arm\'s .feature/step_definitions specification layer containing PLATFORM/DRIVER-conditional code. Zero for both arms, computed identically, is the direct structural support for Corollary 1 (the specification is unchanged across platforms).',
    atomic: structuralCheck('atomic (login+catalog+pizzaBuilder+checkout)', [
      'src/core/tests/login',
      'src/core/tests/catalog',
      'src/core/tests/pizzaBuilder',
      'src/core/tests/checkout',
    ]),
    twin: structuralCheck('non-atomic twin', ['evaluation/non-atomic-twin']),
  };

  const classified = TWIN_MOBILE_PORT_FILES.map((f) => ({ ...f, ...gitNumstat(f.commit, f.path) }));
  const specForced = classified.filter((f) => f.classification === 'spec-forced');
  const pluginGap = classified.filter((f) => f.classification === 'plugin-gap');
  const outOfScope = classified.filter((f) => f.classification === 'out-of-scope-mobilewright');

  const twinOnlyMobilePortCost = {
    applicableTo:
      'twin only — no atomic-arm equivalent exists. Android/Appium support for the atomic suites predates this evaluation; a historical diff of those original enablement commits was considered and rejected (different time, unknown effort/circumstance parity — would not be a like-for-like §8.1 construct-validity comparison). Reported here as a labeled, non-comparable line item, not forced into a fake atomic-side number.',
    files: classified,
    totals: {
      specForcedReportedInDelta: sum(specForced),
      excludedPluginGap: sum(pluginGap),
      excludedOutOfScopeMobilewright: sum(outOfScope),
    },
  };

  const report = {
    generatedBy: 'scripts/experiments/portability-delta.ts',
    structuralResult,
    twinOnlyMobilePortCost,
  };

  mkdirSync(join(REPO_ROOT, 'reports'), { recursive: true });
  writeFileSync(join(REPO_ROOT, 'reports', 'portability-delta.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

main();
