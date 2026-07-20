import { describe, it, expect } from 'vitest';

import { makeMissingTool } from '../../src/server/normalize/index';
import { PERF_TEST_TYPES } from '../../src/shared/perf-types';

describe('makeMissingTool', () => {
  it('produces a performance placeholder with a null-perf entry for every PerfTestType', () => {
    const tool = makeMissingTool('gatling');
    if (tool.kind !== 'performance') throw new Error('expected performance kind');
    expect(tool.missing).toBe(true);
    expect(tool.byType).toHaveLength(PERF_TEST_TYPES.length);
    expect(tool.byType.map((b) => b.type)).toEqual(PERF_TEST_TYPES);
    expect(tool.byType.every((b) => b.perf === null)).toBe(true);
    expect(tool.perf.p75Ms).toBe(0);
    expect(tool.perf.maxMs).toBe(0);
  });
});
