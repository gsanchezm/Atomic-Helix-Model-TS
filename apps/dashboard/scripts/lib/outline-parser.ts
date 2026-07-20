import { promises as fs } from 'node:fs';
import { generateMessages } from '@cucumber/gherkin';

export interface OutlineRow {
  /** Stable per-outline id: the .feature path + the outline's own declaration line. */
  outlineKey: string;
  /** Scenario Outline template name, placeholders intact. */
  templateName: string;
  /** Examples row data keyed by column header. */
  example: Record<string, string>;
}

/**
 * Parse a .feature file and map each Examples row's source line to the
 * outline it belongs to and that row's structured data. Never throws —
 * a missing file, unreadable file, or Gherkin parse error all resolve to
 * an empty map, so callers can fall back to flat ingestion.
 */
export async function parseOutlineRows(featurePath: string): Promise<Map<number, OutlineRow>> {
  const rows = new Map<number, OutlineRow>();

  let text: string;
  try {
    text = await fs.readFile(featurePath, 'utf8');
  } catch {
    return rows;
  }

  let envelopes: ReturnType<typeof generateMessages>;
  try {
    envelopes = generateMessages(
      text,
      featurePath,
      'text/x.cucumber.gherkin+plain' as Parameters<typeof generateMessages>[2],
      { includeGherkinDocument: true, includeSource: false, includePickles: false, newId: () => '' },
    );
  } catch {
    return rows;
  }
  if (envelopes.some((e) => e.parseError)) return rows;

  const doc = envelopes.find((e) => e.gherkinDocument)?.gherkinDocument;
  if (!doc) return rows;

  for (const child of doc.feature?.children ?? []) {
    const scenario = child.scenario;
    // examples.length === 0 is the signal cucumber-js's own compiler uses to
    // distinguish an Outline from a plain Scenario -- not the keyword text.
    if (!scenario || scenario.examples.length === 0) continue;

    const outlineKey = `${featurePath}#${scenario.location.line}`;
    for (const ex of scenario.examples) {
      const header = ex.tableHeader?.cells.map((c) => c.value) ?? [];
      for (const row of ex.tableBody) {
        const example: Record<string, string> = {};
        row.cells.forEach((cell, i) => {
          if (header[i]) example[header[i]] = cell.value;
        });
        rows.set(row.location.line, { outlineKey, templateName: scenario.name, example });
      }
    }
  }

  return rows;
}
