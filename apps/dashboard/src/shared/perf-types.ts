export type PerfTestType =
  | 'smoke'
  | 'load'
  | 'stress'
  | 'endurance'
  | 'spike'
  | 'scalability'
  | 'volume';

export const PERF_TEST_TYPES: readonly PerfTestType[] = [
  'smoke',
  'load',
  'stress',
  'endurance',
  'spike',
  'scalability',
  'volume',
] as const;
