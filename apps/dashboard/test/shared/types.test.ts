import { describe, it, expect } from 'vitest';
import { isTestCaseGroup } from '../../src/shared/types';
import type { TestCase, TestCaseSingle } from '../../src/shared/types';

describe('TestCase discriminated union', () => {
  it('isTestCaseGroup narrows a group case and exposes structured iteration data', () => {
    const group: TestCase = {
      kind: 'group',
      name: 'Logout label is translated to <language> after market <market>',
      suite: 'Login',
      file: 'login/features/market-language-localization.feature',
      dur: '1.2s',
      status: 'failed',
      iterations: [
        {
          name: 'Logout label is translated to English after market US',
          example: { market: 'US', language: 'English', logoutLabel: 'Logout' },
          status: 'passed',
        },
        {
          name: 'Logout label is translated to Spanish after market MX',
          example: { market: 'MX', language: 'Spanish', logoutLabel: 'Salir' },
          status: 'failed',
          error: 'boom',
        },
      ],
    };
    expect(isTestCaseGroup(group)).toBe(true);
    if (!isTestCaseGroup(group)) throw new Error('unreachable');
    expect(group.iterations).toHaveLength(2);
    expect(group.iterations[1].example.market).toBe('MX');
  });

  it('isTestCaseGroup returns false for a legacy record with no kind field', () => {
    const single: TestCase = {
      name: 'Login with valid credentials',
      suite: 'Auth',
      file: 'auth/login.feature',
      dur: '2.4s',
      status: 'passed',
    };
    expect(isTestCaseGroup(single)).toBe(false);
  });

  it('isTestCaseGroup returns false for an explicit kind: single', () => {
    const single: TestCaseSingle = {
      kind: 'single',
      name: 'Login with valid credentials',
      suite: 'Auth',
      file: 'auth/login.feature',
      dur: '2.4s',
      status: 'passed',
    };
    expect(isTestCaseGroup(single)).toBe(false);
  });
});
