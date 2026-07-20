export type PerfTestType =
  | 'load'
  | 'stress'
  | 'endurance'
  | 'spike'
  | 'scalability'
  | 'volume';

export const PERF_TEST_TYPES: readonly PerfTestType[] = [
  'load',
  'stress',
  'endurance',
  'spike',
  'scalability',
  'volume',
] as const;
