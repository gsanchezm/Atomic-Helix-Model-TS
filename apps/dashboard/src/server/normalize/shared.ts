import type { RunInfo, Tool, ToolSummary } from '../../shared/types.js';
import type { ToolKind } from '../../shared/kinds.js';

export interface AdapterContext {
  runId: string;
  runDir: string;
  runInfo: RunInfo;
}

export type Adapter = (
  raw: unknown,
  ctx: AdapterContext,
) => Tool | Promise<Tool>;

type SummaryHandler = (tool: Tool) => ToolSummary;

const SUMMARY_HANDLERS: Readonly<Record<ToolKind, SummaryHandler>> = {
  web_ui: (tool) => {
    const { tests: _tests, browsers: _browsers, viewports: _viewports, ...rest } =
      tool as Extract<Tool, { kind: 'web_ui' }>;
    void _tests;
    void _browsers;
    void _viewports;
    return rest;
  },
  api: (tool) => {
    const { tests: _tests, ...rest } = tool as Extract<Tool, { kind: 'api' }>;
    void _tests;
    return rest;
  },
  mobile_ui: (tool) => {
    const { platforms, ...rest } = tool as Extract<Tool, { kind: 'mobile_ui' }>;
    return {
      ...rest,
      platforms: {
        android: stripTests(platforms.android),
        ios: stripTests(platforms.ios),
      },
    };
  },
  performance: (tool) => {
    const { perf, ...rest } = tool as Extract<Tool, { kind: 'performance' }>;
    const { distribution: _distribution, scenarios: _scenarios, ...perfRest } = perf;
    void _distribution;
    void _scenarios;
    return { ...rest, perf: perfRest };
  },
  visual: (tool) => {
    const { diffs: _diffs, ...rest } = tool as Extract<Tool, { kind: 'visual' }>;
    void _diffs;
    return rest;
  },
};

/**
 * Strip detail-heavy arrays from a Tool to produce its ToolSummary.
 * The /api/runs/:runId endpoint returns these summaries so the overview
 * page doesn't have to download every test case for every tool.
 */
export function summarize(tool: Tool): ToolSummary {
  return SUMMARY_HANDLERS[tool.kind](tool);
}

function stripTests<T extends { tests: unknown }>(
  block: T,
): Omit<T, 'tests'> {
  const { tests: _tests, ...rest } = block;
  void _tests;
  return rest;
}

export function assertObject(raw: unknown, label: string): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Adapter input for ${label} is not a JSON object`);
  }
  return raw as Record<string, unknown>;
}
