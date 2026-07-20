import { describe, it, expect } from 'vitest';

import { buildPerfScenarios, classifyPerfType, rollUpReports, type SimulationReport } from '../../scripts/ingest-gatling';

const sim = (name: string, root: Record<string, number>, requests: Record<string, Record<string, number>>): SimulationReport => ({
  simulation: name,
  dir: `/tmp/${name}`,
  mtimeMs: 0,
  root: { label: 'ROOT', values: root },
  scenarios: Object.entries(requests).map(([label, values]) => ({ label, values })),
});

describe('buildPerfScenarios', () => {
  it('produces one PerfScenario per simulation with simulation-level metrics from ROOT', () => {
    const reports = [
      sim('checkout-load',
          { 'col-6': 120, 'col-10': 350, 'col-5': 0.5 },
          {
            home:      { 'col-6': 40, 'col-10': 200, 'col-5': 0   },
            addToCart: { 'col-6': 80, 'col-10': 450, 'col-5': 1.0 },
          }),
    ];
    const out = buildPerfScenarios(reports);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      name: 'checkout-load',
      rps: 120,
      p95: 350,
      errors: 0.5,
    });
    expect(out[0].steps).toHaveLength(2);
    expect(out[0].steps?.[1]).toMatchObject({ name: 'addToCart', rps: 80, p95: 450, errors: 1.0 });
  });

  it('omits steps[] when a simulation has no per-request rows', () => {
    const reports = [sim('login-load', { 'col-6': 10, 'col-10': 50, 'col-5': 0 }, {})];
    const out = buildPerfScenarios(reports);
    expect(out[0].steps).toBeUndefined();
  });
});

describe('classifyPerfType', () => {
  it.each([
    ['checkout-load', 'load'],
    ['checkout-stress', 'stress'],
    ['profile-endurance', 'endurance'],
    ['catalog-spike', 'spike'],
    ['checkout-scalability', 'scalability'],
    ['order-volume', 'volume'],
    ['CHECKOUT-LOAD', 'load'],
  ])('classifies "%s" as %s', (name, expected) => {
    expect(classifyPerfType(name)).toBe(expected);
  });

  it('returns "other" for names with no recognized suffix', () => {
    expect(classifyPerfType('checkout-smoke')).toBe('other');
    expect(classifyPerfType('checkout')).toBe('other');
  });
});

describe('rollUpReports', () => {
  it('computes request-weighted percentiles including the new p75Ms/maxMs fields', () => {
    const reports = [
      sim('checkout-load',
          { 'col-2': 100, 'col-3': 99, 'col-4': 1, 'col-5': 1, 'col-6': 50, 'col-8': 120, 'col-9': 180, 'col-10': 250, 'col-11': 400, 'col-12': 900, 'col-13': 130 },
          {}),
    ];
    const out = rollUpReports(reports);
    expect(out).toMatchObject({
      rps: 50,
      avgMs: 130,
      p75Ms: 180,
      p95Ms: 250,
      p99Ms: 400,
      maxMs: 900,
      errorRate: 1,
      requests: 100,
    });
  });

  it('weights percentiles by request count across multiple simulations', () => {
    const reports = [
      sim('checkout-load', { 'col-2': 100, 'col-3': 100, 'col-4': 0, 'col-6': 40, 'col-8': 100, 'col-9': 150, 'col-10': 200, 'col-11': 300, 'col-12': 500, 'col-13': 110 }, {}),
      sim('catalog-load',  { 'col-2': 300, 'col-3': 300, 'col-4': 0, 'col-6': 60, 'col-8': 100, 'col-9': 150, 'col-10': 400, 'col-11': 600, 'col-12': 900, 'col-13': 150 }, {}),
    ];
    const out = rollUpReports(reports);
    // p95: (200*100 + 400*300) / 400 = 350
    expect(out.p95Ms).toBe(350);
    expect(out.requests).toBe(400);
    expect(out.rps).toBe(100);
  });
});
