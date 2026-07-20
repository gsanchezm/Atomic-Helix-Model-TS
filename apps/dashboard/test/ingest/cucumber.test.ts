import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ingestCucumber } from '../../scripts/ingest-run';
import { isTestCaseGroup } from '../../src/shared/types';

describe('ingestCucumber — step extraction', () => {
  const passingScenario = {
    name: 'login feature',
    uri: 'src/core/tests/login/features/login.feature',
    elements: [
      {
        name: 'user logs in',
        type: 'scenario',
        steps: [
          {
            keyword: 'Given ', name: 'a fresh browser',
            match: { location: 'src/login/steps.ts:5' },
            result: { status: 'passed', duration: 100_000_000 },
          },
          {
            keyword: 'When ', name: 'they submit credentials',
            match: { location: 'src/login/steps.ts:15' },
            result: { status: 'passed', duration: 200_000_000 },
          },
          {
            keyword: 'Then ', name: 'they land on the dashboard',
            match: { location: 'src/login/steps.ts:25' },
            result: { status: 'passed', duration: 50_000_000 },
          },
        ],
      },
    ],
  };

  it('emits one TestStep per cucumber step with keyword, name, status, dur, location', async () => {
    const out = await ingestCucumber([passingScenario]);
    expect(out.tests).toHaveLength(1);
    const t = out.tests[0];
    if (isTestCaseGroup(t)) throw new Error('expected a single test case');
    expect(t.steps).toBeDefined();
    expect(t.steps).toHaveLength(3);
    expect(t.steps?.[0]).toMatchObject({
      keyword: 'Given ',
      name: 'a fresh browser',
      status: 'passed',
      location: 'src/login/steps.ts:5',
    });
    expect(t.failedStepIndex).toBeUndefined();
  });

  it('sets failedStepIndex to the index of the first failing step and copies its error message', async () => {
    const failing = {
      ...passingScenario,
      elements: [
        {
          ...passingScenario.elements[0],
          steps: [
            { keyword: 'Given ', name: 'setup', result: { status: 'passed', duration: 10_000_000 } },
            {
              keyword: 'When ', name: 'broken action',
              result: { status: 'failed', duration: 20_000_000, error_message: 'AssertionError: expected truthy' },
            },
            { keyword: 'Then ', name: 'never runs', result: { status: 'skipped', duration: 0 } },
          ],
        },
      ],
    };
    const out = await ingestCucumber([failing]);
    const t = out.tests[0];
    if (isTestCaseGroup(t)) throw new Error('expected a single test case');
    expect(t.failedStepIndex).toBe(1);
    expect(t.steps?.[1].error).toBe('AssertionError: expected truthy');
    expect(t.steps?.[1].status).toBe('failed');
    expect(t.steps?.[2].status).toBe('skipped');
  });

  it('filters hidden hooks when passing but keeps them when failing', async () => {
    const withHiddenHooks = {
      ...passingScenario,
      elements: [
        {
          ...passingScenario.elements[0],
          steps: [
            { keyword: 'Before', hidden: true, result: { status: 'passed', duration: 1_000_000 } },
            { keyword: 'Given ', name: 'setup', result: { status: 'passed', duration: 10_000_000 } },
            {
              keyword: 'After', hidden: true,
              result: { status: 'failed', duration: 5_000_000, error_message: 'teardown failed' },
            },
          ],
        },
      ],
    };
    const out = await ingestCucumber([withHiddenHooks]);
    const t = out.tests[0];
    if (isTestCaseGroup(t)) throw new Error('expected a single test case');
    expect(t.steps).toHaveLength(2);
    expect(t.steps?.[0].name).toBe('setup');
    expect(t.steps?.[1].hidden).toBe(true);
    expect(t.steps?.[1].error).toBe('teardown failed');
    expect(t.failedStepIndex).toBe(1);
  });
});

describe('ingestCucumber — Scenario Outline grouping', () => {
  let dir: string;
  let featurePath: string;
  let featureUri: string;

  const FEATURE = [
    'Feature: Login',
    '',
    '  Scenario Outline: Logout label is translated to <language> after market <market>',
    '    Given the login screen is open',
    '    Then the logout button label is "<logoutLabel>"',
    '',
    '    Examples:',
    '      | market | language | logoutLabel |',
    '      | US     | English  | Logout      |',
    '      | MX     | Spanish  | Salir       |',
    '',
  ].join('\n');

  function lineOf(needle: string): number {
    return FEATURE.split('\n').findIndex((l) => l.includes(needle)) + 1;
  }

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'ingest-outline-'));
    featurePath = path.join(dir, 'login.feature');
    writeFileSync(featurePath, FEATURE, 'utf8');
    featureUri = featurePath.replace(/\\/g, '/');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('groups Examples rows into one TestCaseGroup, correlated by source line', async () => {
    const feature = {
      name: 'login feature',
      uri: featureUri,
      elements: [
        {
          name: 'Logout label is translated to English after market US',
          type: 'scenario',
          keyword: 'Scenario Outline',
          line: lineOf('| US '),
          steps: [{ keyword: 'Given ', name: 'the login screen is open', result: { status: 'passed', duration: 10_000_000 } }],
        },
        {
          name: 'Logout label is translated to Spanish after market MX',
          type: 'scenario',
          keyword: 'Scenario Outline',
          line: lineOf('| MX '),
          steps: [{ keyword: 'Given ', name: 'the login screen is open', result: { status: 'failed', duration: 10_000_000, error_message: 'nope' } }],
        },
      ],
    };

    const out = await ingestCucumber([feature]);
    expect(out.tests).toHaveLength(1);
    const t = out.tests[0];
    if (!isTestCaseGroup(t)) throw new Error('expected a group');
    expect(t.name).toBe('Logout label is translated to <language> after market <market>');
    expect(t.status).toBe('failed');
    expect(t.iterations).toHaveLength(2);
    expect(t.iterations[0].example).toEqual({ market: 'US', language: 'English', logoutLabel: 'Logout' });
    expect(t.iterations[1].example).toEqual({ market: 'MX', language: 'Spanish', logoutLabel: 'Salir' });
    expect(t.iterations[1].status).toBe('failed');
    // Grouping counts as ONE toward the suite total, not two.
    expect(out.passed).toBe(0);
    expect(out.failed).toBe(1);
  });

  it('sorts iterations by source line, not JSON arrival order', async () => {
    const feature = {
      name: 'login feature',
      uri: featureUri,
      elements: [
        {
          name: 'Logout label is translated to Spanish after market MX',
          type: 'scenario',
          keyword: 'Scenario Outline',
          line: lineOf('| MX '),
          steps: [],
        },
        {
          name: 'Logout label is translated to English after market US',
          type: 'scenario',
          keyword: 'Scenario Outline',
          line: lineOf('| US '),
          steps: [],
        },
      ],
    };
    const out = await ingestCucumber([feature]);
    const t = out.tests[0];
    if (!isTestCaseGroup(t)) throw new Error('expected a group');
    expect(t.iterations.map((i) => i.example.market)).toEqual(['US', 'MX']);
  });

  it('falls back to a standalone TestCaseSingle when the line matches no parsed Examples row, and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const feature = {
      name: 'login feature',
      uri: featureUri,
      elements: [
        {
          name: 'Logout label is translated to English after market US',
          type: 'scenario',
          keyword: 'Scenario Outline',
          line: 999,
          steps: [{ keyword: 'Given ', name: 'the login screen is open', result: { status: 'passed', duration: 10_000_000 } }],
        },
      ],
    };
    const out = await ingestCucumber([feature]);
    expect(out.tests).toHaveLength(1);
    expect(isTestCaseGroup(out.tests[0])).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('does not attempt outline correlation for plain Scenarios (no keyword/line)', async () => {
    const feature = {
      name: 'login feature',
      uri: featureUri,
      elements: [{ name: 'a plain scenario', type: 'scenario', steps: [] }],
    };
    const out = await ingestCucumber([feature]);
    expect(out.tests).toHaveLength(1);
    expect(isTestCaseGroup(out.tests[0])).toBe(false);
  });
});
