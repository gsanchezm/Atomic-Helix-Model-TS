import { describe, it, expect } from 'vitest';

import { summarize } from '../../src/server/normalize/shared';
import type { PerformanceTool, PerfBlock } from '../../src/shared/types';

function perfBlock(overrides: Partial<PerfBlock> = {}): PerfBlock {
  return {
    rps: 100,
    avgMs: 50,
    p75Ms: 140,
    p95Ms: 200,
    p99Ms: 400,
    maxMs: 900,
    errorRate: 0.1,
    requests: 5000,
    maxRps: 200,
    distribution: [{ label: '< 100 ms', pct: 80, count: 4000 }],
    scenarios: [{ name: 'checkout-load', rps: 60, p95: 90, errors: 0.05 }],
    ...overrides,
  };
}

describe('summarize (performance)', () => {
  const tool: PerformanceTool = {
    kind: 'performance',
    id: 'gatling',
    name: 'Gatling',
    description: 'Perf.',
    passed: 10,
    failed: 0,
    skipped: 0,
    duration: '5m',
    perf: perfBlock(),
    byType: [
      { type: 'load', perf: perfBlock() },
      { type: 'stress', perf: null },
    ],
    unclassified: perfBlock(),
  };

  it('strips distribution/scenarios from the top-level perf block', () => {
    const out = summarize(tool);
    expect(out.kind).toBe('performance');
    if (out.kind !== 'performance') throw new Error('unreachable');
    expect(out.perf).not.toHaveProperty('distribution');
    expect(out.perf).not.toHaveProperty('scenarios');
    expect(out.perf.rps).toBe(100);
  });

  it('strips distribution/scenarios from each byType entry, preserving null perf', () => {
    const out = summarize(tool);
    if (out.kind !== 'performance') throw new Error('unreachable');
    expect(out.byType).toHaveLength(2);

    const load = out.byType.find((b) => b.type === 'load');
    expect(load?.perf).not.toBeNull();
    expect(load?.perf).not.toHaveProperty('distribution');
    expect(load?.perf).not.toHaveProperty('scenarios');
    expect(load?.perf?.rps).toBe(100);

    const stress = out.byType.find((b) => b.type === 'stress');
    expect(stress?.perf).toBeNull();
  });

  it('strips distribution/scenarios from unclassified when present', () => {
    const out = summarize(tool);
    if (out.kind !== 'performance') throw new Error('unreachable');
    expect(out.unclassified).not.toHaveProperty('distribution');
    expect(out.unclassified).not.toHaveProperty('scenarios');
    expect(out.unclassified?.rps).toBe(100);
  });

  it('omits unclassified entirely when the tool has none', () => {
    const { unclassified: _unclassified, ...withoutUnclassified } = tool;
    void _unclassified;
    const out = summarize(withoutUnclassified as PerformanceTool);
    if (out.kind !== 'performance') throw new Error('unreachable');
    expect(out).not.toHaveProperty('unclassified');
  });
});
