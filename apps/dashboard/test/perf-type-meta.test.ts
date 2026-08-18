import { describe, it, expect } from 'vitest';

import { FIELD_GAUGE_CONFIG, PERF_TYPE_META } from '../src/client/perf-type-meta';
import { PERF_TEST_TYPES } from '../src/shared/perf-types';

describe('PERF_TYPE_META', () => {
  it('has a non-empty label, description, and at least one gauge for every PerfTestType', () => {
    for (const type of PERF_TEST_TYPES) {
      const meta = PERF_TYPE_META[type];
      expect(meta).toBeDefined();
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect(meta.gauges.length).toBeGreaterThan(0);
    }
  });

  it('flags Stress with a breaking-point pending metric', () => {
    expect(PERF_TYPE_META.stress.pending.some((p) => p.label.includes('Breaking point'))).toBe(true);
  });

  it('Load has no pending metrics (everything it needs is in a Gatling summary)', () => {
    expect(PERF_TYPE_META.load.pending).toHaveLength(0);
  });

  it('every gauge field referenced by any PerfTypeMeta has a FIELD_GAUGE_CONFIG entry', () => {
    for (const type of PERF_TEST_TYPES) {
      for (const gauge of PERF_TYPE_META[type].gauges) {
        expect(FIELD_GAUGE_CONFIG[gauge.field]).toBeDefined();
      }
    }
  });
});
