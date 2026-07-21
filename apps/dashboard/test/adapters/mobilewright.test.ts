import { describe, it, expect } from 'vitest';

import { mobilewrightAdapter } from '../../src/server/normalize/mobilewright';
import type { MobileUiTool } from '../../src/shared/types';
import { isTestCaseGroup } from '../../src/shared/types';
import { ctx } from './_helpers';

describe('mobilewrightAdapter', () => {
  const platformBlock = (passed: number, failed: number) => ({
    passed,
    failed,
    skipped: 0,
    duration: '3m',
    device: 'z_flip_6',
    suites: ['Login'],
    tests: [
      { name: 'invalid login', suite: 'Login', file: 'login.feature', dur: '2s', status: 'passed' as const },
    ],
  });

  const fixture: Omit<MobileUiTool, 'kind'> = {
    id: 'mobilewright',
    name: 'Mobilewright',
    description: 'Mobile flows via mobilecli.',
    passed: 5,
    failed: 0,
    skipped: 0,
    duration: '3m (Android)',
    platforms: {
      android: platformBlock(5, 0),
      ios: { passed: 0, failed: 0, skipped: 0, duration: '—', device: '—', suites: [], tests: [] },
    },
  };

  it('produces a mobile_ui tool with android populated and ios empty', () => {
    const out = mobilewrightAdapter(fixture, ctx());
    expect(out.kind).toBe('mobile_ui');
    expect(out.id).toBe('mobilewright');
    expect(out.platforms.android.tests).toHaveLength(1);
    expect(out.platforms.ios.tests).toHaveLength(0);
    const androidTest = out.platforms.android.tests[0];
    if (isTestCaseGroup(androidTest)) throw new Error('expected a single test case');
    expect(androidTest.status).toBe('passed');
  });

  it('rejects non-object inputs', () => {
    expect(() => mobilewrightAdapter(null, ctx())).toThrow();
    expect(() => mobilewrightAdapter([], ctx())).toThrow();
    expect(() => mobilewrightAdapter('nope', ctx())).toThrow();
  });
});
