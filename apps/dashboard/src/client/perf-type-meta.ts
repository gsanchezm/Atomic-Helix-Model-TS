import type { PerfTestType } from '@shared/perf-types';
import type { PerfBlock } from '@shared/types';

export interface PendingMetric {
  label: string;
  reason: string;
}

export interface PerfGaugeRef {
  label: string;
  field: keyof PerfBlock;
}

export interface PerfTypeMeta {
  label: string;
  description: string;
  gauges: PerfGaugeRef[];
  pending: PendingMetric[];
}

export interface FieldGaugeConfig {
  kind: 'gauge' | 'stat';
  unit: string;
  invert?: boolean;
  max?: number;
  maxField?: 'maxRps';
  thresholdGood?: number;
  thresholdBad?: number;
  thresholdGoodFactor?: number;
  thresholdBadFactor?: number;
}

/**
 * How to render each PerfBlock field as a gauge tile — shared across every
 * tab that references the field, so bounds/thresholds don't drift per type.
 */
export const FIELD_GAUGE_CONFIG: Partial<Record<keyof PerfBlock, FieldGaugeConfig>> = {
  rps:       { kind: 'gauge', unit: 'req/s', maxField: 'maxRps', thresholdGoodFactor: 0.4, thresholdBadFactor: 0.7 },
  avgMs:     { kind: 'gauge', unit: 'ms', invert: true, max: 1000, thresholdGood: 200, thresholdBad: 500 },
  p95Ms:     { kind: 'gauge', unit: 'ms', invert: true, max: 1500, thresholdGood: 400, thresholdBad: 800 },
  p99Ms:     { kind: 'gauge', unit: 'ms', invert: true, max: 2000, thresholdGood: 500, thresholdBad: 1000 },
  maxMs:     { kind: 'gauge', unit: 'ms', invert: true, max: 3000, thresholdGood: 800, thresholdBad: 1600 },
  errorRate: { kind: 'gauge', unit: '% of requests', invert: true, max: 5, thresholdGood: 0.5, thresholdBad: 1.5 },
  requests:  { kind: 'stat', unit: 'requests' },
};

export const PERF_TYPE_META: Record<PerfTestType, PerfTypeMeta> = {
  smoke: {
    label: 'Smoke',
    description: 'A single-user pass to validate the chain still works end to end.',
    gauges: [
      { label: 'Avg response', field: 'avgMs' },
      { label: 'Error rate', field: 'errorRate' },
    ],
    pending: [
      { label: 'Throughput / P95 / P99', reason: 'a single-user run has no meaningful concurrency signal' },
    ],
  },
  load: {
    label: 'Load',
    description: 'Expected, steady traffic.',
    gauges: [
      { label: 'Throughput', field: 'rps' },
      { label: 'Avg response', field: 'avgMs' },
      { label: 'P95 latency', field: 'p95Ms' },
      { label: 'Error rate', field: 'errorRate' },
    ],
    pending: [],
  },
  stress: {
    label: 'Stress',
    description: 'Pushed past normal capacity to find the breaking point.',
    gauges: [
      { label: 'Throughput', field: 'rps' },
      { label: 'Error rate (KO)', field: 'errorRate' },
      { label: 'P99 latency', field: 'p99Ms' },
      { label: 'Max latency', field: 'maxMs' },
    ],
    pending: [
      { label: 'Breaking point (max sustainable RPS)', reason: 'needs per-request time-series, not just a run summary' },
      { label: 'Recovery time', reason: 'needs per-request time-series, not just a run summary' },
    ],
  },
  endurance: {
    label: 'Endurance',
    description: 'Sustained load over a long duration (soak).',
    gauges: [
      { label: 'Total requests', field: 'requests' },
      { label: 'Avg response', field: 'avgMs' },
      { label: 'P95 latency', field: 'p95Ms' },
      { label: 'Error rate', field: 'errorRate' },
    ],
    pending: [
      { label: 'Degradation trend over time', reason: 'needs per-request time-series, not just a run summary' },
      { label: 'Memory leaks', reason: 'no server-side metrics source connected' },
      { label: 'Storage saturation', reason: 'no server-side metrics source connected' },
    ],
  },
  spike: {
    label: 'Spike',
    description: 'A sudden, short-lived surge in traffic.',
    gauges: [
      { label: 'Max latency', field: 'maxMs' },
      { label: 'Error rate', field: 'errorRate' },
      { label: 'P99 latency', field: 'p99Ms' },
      { label: 'Throughput', field: 'rps' },
    ],
    pending: [
      { label: 'Auto-scaling reaction time', reason: 'no server-side metrics source connected' },
      { label: 'Network bandwidth saturation', reason: 'no server-side metrics source connected' },
    ],
  },
  scalability: {
    label: 'Scalability',
    description: 'Efficiency gained from adding resources.',
    gauges: [
      { label: 'Throughput', field: 'rps' },
      { label: 'Error rate', field: 'errorRate' },
      { label: 'P95 latency', field: 'p95Ms' },
    ],
    pending: [
      { label: 'RPS gained per added node', reason: 'needs comparing multiple runs at different node counts' },
      { label: 'Load balancer distribution', reason: 'no server-side metrics source connected' },
      { label: 'Cost per instance', reason: 'no server-side metrics source connected' },
    ],
  },
  volume: {
    label: 'Volume',
    description: 'Large datasets and payloads.',
    gauges: [
      { label: 'Total requests', field: 'requests' },
      { label: 'Avg response', field: 'avgMs' },
      { label: 'P95 latency', field: 'p95Ms' },
      { label: 'Error rate', field: 'errorRate' },
    ],
    pending: [
      { label: 'Large-payload load', reason: "Gatling's summary report has no payload/body size" },
      { label: 'Disk IOPS', reason: 'no server-side metrics source connected' },
      { label: 'Query locks', reason: 'no server-side metrics source connected' },
      { label: 'Cache hit ratio', reason: 'no server-side metrics source connected' },
    ],
  },
};
