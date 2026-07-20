import { describe, it, expect } from 'vitest';

import { gatlingAdapter } from '../../src/server/normalize/gatling';
import type { PerformanceTool } from '../../src/shared/types';
import { ctx } from './_helpers';

describe('gatlingAdapter', () => {
  const fixture: Omit<PerformanceTool, 'kind'> = {
    id: 'gatling',
    name: 'Gatling',
    description: 'Perf.',
    passed: 10,
    failed: 0,
    skipped: 0,
    duration: '5m',
    perf: {
      rps: 100, avgMs: 50, p75Ms: 140, p95Ms: 200, p99Ms: 400, maxMs: 900,
      errorRate: 0.1, requests: 5000, maxRps: 200,
      distribution: [{ label: '< 100 ms', pct: 80, count: 4000 }],
      scenarios: [
        {
          name: 'checkout-load',
          rps: 60,
          p95: 90,
          errors: 0.05,
          steps: [{ name: 'home', rps: 30, p95: 80, errors: 0 }],
        },
      ],
    },
    byType: [
      { type: 'load', perf: null },
      { type: 'stress', perf: null },
      { type: 'endurance', perf: null },
      { type: 'spike', perf: null },
      { type: 'scalability', perf: null },
      { type: 'volume', perf: null },
    ],
  };

  it('produces a performance tool with perf block intact', () => {
    const out = gatlingAdapter(fixture, ctx());
    expect(out.kind).toBe('performance');
    expect(out.perf.distribution).toHaveLength(1);
    expect(out.perf.scenarios[0].name).toBe('checkout-load');
    expect(out.perf.scenarios[0].steps).toHaveLength(1);
    expect(out.perf.scenarios[0].steps?.[0].name).toBe('home');
  });

  it('forwards byType and the new PerfBlock fields unchanged (pass-through adapter)', () => {
    const out = gatlingAdapter(fixture, ctx());
    expect(out.perf.p75Ms).toBe(140);
    expect(out.perf.maxMs).toBe(900);
    expect(out.byType).toEqual(fixture.byType);
  });
});
