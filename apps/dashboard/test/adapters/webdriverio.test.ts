import { describe, it, expect } from 'vitest';

import { webdriverioAdapter } from '../../src/server/normalize/webdriverio';
import type { WebUiTool } from '../../src/shared/types';
import { isTestCaseGroup } from '../../src/shared/types';
import { ctx } from './_helpers';

describe('webdriverioAdapter', () => {
  const fixture: Omit<WebUiTool, 'kind'> = {
    id: 'webdriverio',
    name: 'WebdriverIO',
    description: 'Web UI suite via Selenium.',
    passed: 4,
    failed: 1,
    skipped: 0,
    duration: '2m 0s',
    suites: ['Catalog'],
    tests: [
      { name: 'browse catalog', suite: 'Catalog', file: 'catalog.spec.ts', dur: '2s', status: 'passed' },
      {
        name: 'add to cart', suite: 'Catalog', file: 'catalog.spec.ts', dur: '3s', status: 'failed', error: 'timeout',
        steps: [
          { keyword: 'Given ', name: 'catalog open', status: 'passed', dur: '1s' },
          { keyword: 'When ',  name: 'tap add',       status: 'failed', dur: '2s', error: 'timeout' },
        ],
        failedStepIndex: 1,
      },
    ],
  };

  it('produces a web_ui tool with the same data and the kind set', () => {
    const out = webdriverioAdapter(fixture, ctx());
    expect(out.kind).toBe('web_ui');
    expect(out.id).toBe('webdriverio');
    expect(out.passed).toBe(4);
    expect(out.tests).toHaveLength(2);
    const second = out.tests[1];
    if (isTestCaseGroup(second)) throw new Error('expected a single test case');
    expect(second.error).toBe('timeout');
    expect(second.steps).toHaveLength(2);
    expect(second.failedStepIndex).toBe(1);
  });

  it('rejects non-object inputs', () => {
    expect(() => webdriverioAdapter(null, ctx())).toThrow();
    expect(() => webdriverioAdapter([], ctx())).toThrow();
    expect(() => webdriverioAdapter('nope', ctx())).toThrow();
  });
});
