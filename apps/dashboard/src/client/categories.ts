import type { ToolKind } from '@shared/kinds';
import type { ToolSummary } from '@shared/types';

export interface CategoryMeta {
  name: string;
  desc: string;
}

export const CATEGORY_META: Record<ToolKind, CategoryMeta> = {
  web_ui:        { name: 'Web',            desc: 'Browser end-to-end suites' },
  mobile_ui:     { name: 'Mobile',         desc: 'Native app flows on device farms' },
  api:           { name: 'API',            desc: 'Contract, schema & collection tests' },
  performance:   { name: 'Performance',    desc: 'Load, stress & spike scenarios' },
  visual:        { name: 'Visual Testing', desc: 'Screenshot & pixel regression' },
  accessibility: { name: 'Accessibility',  desc: 'WCAG 2.2 automated audits' },
  security:      { name: 'Security',       desc: 'DAST & mobile security analysis' },
};

export type Tone = 'ok' | 'warn' | 'fail';

export interface CategoryStats {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  pct: number;
  tone: Tone;
}

export function catStats(tools: ToolSummary[]): CategoryStats {
  const sums = tools.reduce(
    (acc, t) => {
      acc.passed += t.passed;
      acc.failed += t.failed;
      acc.skipped += t.skipped;
      return acc;
    },
    { passed: 0, failed: 0, skipped: 0 },
  );
  const total = sums.passed + sums.failed + sums.skipped;
  const pct = total ? (sums.passed / total) * 100 : 0;
  const tone: Tone = sums.failed > 0 ? 'fail' : sums.skipped > 0 ? 'warn' : 'ok';
  return { ...sums, total, pct, tone };
}

export function toolsByKind(tools: ToolSummary[], kind: ToolKind): ToolSummary[] {
  return tools.filter((t) => t.kind === kind);
}
