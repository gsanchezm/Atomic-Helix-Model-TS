import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseOutlineRows } from '../../scripts/lib/outline-parser';

const FEATURE = [
  'Feature: Login',
  '',
  '  Scenario Outline: Logout label is translated to <language> after market <market>',
  '    Given the login screen is open',
  '    When the user selects market "<market>" with language "<language>"',
  '    Then the logout button label is "<logoutLabel>"',
  '',
  '    Examples:',
  '      | market | language | logoutLabel |',
  '      | US     | English  | Logout      |',
  '      | MX     | Spanish  | Salir       |',
  '',
  '  Scenario: Plain scenario, not an outline',
  '    Given something',
  '    Then something else',
  '',
].join('\n');

function lineOf(needle: string): number {
  return FEATURE.split('\n').findIndex((l) => l.includes(needle)) + 1;
}

describe('parseOutlineRows', () => {
  let dir: string;
  let featurePath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'outline-parser-'));
    featurePath = path.join(dir, 'login.feature');
    writeFileSync(featurePath, FEATURE, 'utf8');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('maps each Examples row source line to its outline template and structured data', async () => {
    const rows = await parseOutlineRows(featurePath);
    const usLine = lineOf('| US ');
    const mxLine = lineOf('| MX ');

    expect(rows.size).toBe(2);
    const us = rows.get(usLine);
    expect(us).toBeDefined();
    expect(us!.templateName).toBe('Logout label is translated to <language> after market <market>');
    expect(us!.example).toEqual({ market: 'US', language: 'English', logoutLabel: 'Logout' });

    const mx = rows.get(mxLine);
    expect(mx).toBeDefined();
    expect(mx!.example).toEqual({ market: 'MX', language: 'Spanish', logoutLabel: 'Salir' });
    expect(mx!.outlineKey).toBe(us!.outlineKey);
  });

  it('does not produce a row for a plain Scenario', async () => {
    const rows = await parseOutlineRows(featurePath);
    for (const row of rows.values()) {
      expect(row.templateName).not.toContain('Plain scenario');
    }
  });

  it('returns an empty map for a missing file', async () => {
    const rows = await parseOutlineRows(path.join(dir, 'does-not-exist.feature'));
    expect(rows.size).toBe(0);
  });

  it('returns an empty map for unparseable Gherkin, without throwing', async () => {
    const badPath = path.join(dir, 'broken.feature');
    writeFileSync(badPath, 'this is not valid gherkin {{{', 'utf8');
    await expect(parseOutlineRows(badPath)).resolves.toBeInstanceOf(Map);
    const rows = await parseOutlineRows(badPath);
    expect(rows.size).toBe(0);
  });
});
