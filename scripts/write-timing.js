import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Writes reports/<runId>/timing/<tool>-<subtype>.json — a sidecar the
 * dashboard's ingest-run.ts reads to build the Tool Efficiency charts.
 * Never touches any existing per-tool report shape.
 */
export async function writeTiming({ reportsDir, runId, tool, category, subtype, startedAt, endedAt }) {
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const dir = path.join(reportsDir, runId, 'timing');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${tool}-${subtype}.json`);
  const payload = { tool, category, subtype, startedAt, endedAt, durationMs };
  await writeFile(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return file;
}

// CLI entry point — invoked by orchestrate-full-run.sh's run_timed() wrapper.
async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce((pairs, arg, i, arr) => {
      if (arg.startsWith('--')) pairs.push([arg.slice(2), arr[i + 1]]);
      return pairs;
    }, []),
  );
  const file = await writeTiming({
    reportsDir: args['reports-dir'] ?? 'reports',
    runId: args['run-id'],
    tool: args.tool,
    category: args.category,
    subtype: args.subtype,
    startedAt: args.started,
    endedAt: args.ended,
  });
  console.log(`[write-timing] wrote ${file}`);
}

// Only run as CLI when invoked directly (not when imported by the test above).
// Compare via pathToFileURL rather than a hand-built `file://${path}` string —
// on Windows, process.argv[1] is a drive-letter path ("C:\...") whose correct
// file:// form needs an extra slash and forward-slash normalization, which a
// naive template string gets wrong, making this guard silently never match
// under Git Bash/win32 (main() would never run, and no timing files would be
// written despite the orchestrator invoking this script with `node ...`).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
