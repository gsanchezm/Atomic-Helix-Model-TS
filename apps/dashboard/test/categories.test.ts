import { describe, it, expect } from 'vitest';

import { CATEGORY_META, catStats, toolsByKind } from '../src/client/categories';
import { TOOL_KINDS } from '../src/shared/kinds';
import type { ToolSummary } from '../src/shared/types';

function tool(kind: 'web_ui' | 'api', passed: number, failed: number, skipped: number, id: string): ToolSummary {
  return { id, kind, name: id, description: '', passed, failed, skipped, duration: '1m' };
}

describe('CATEGORY_META', () => {
  it('has a non-empty name and desc for every ToolKind', () => {
    for (const kind of TOOL_KINDS) {
      expect(CATEGORY_META[kind]).toBeDefined();
      expect(CATEGORY_META[kind].name.length).toBeGreaterThan(0);
      expect(CATEGORY_META[kind].desc.length).toBeGreaterThan(0);
    }
  });
});

describe('catStats', () => {
  it('is ok tone with 100% pct when everything passed', () => {
    const s = catStats([tool('web_ui', 10, 0, 0, 'playwright')]);
    expect(s.tone).toBe('ok');
    expect(s.pct).toBe(100);
    expect(s.total).toBe(10);
  });

  it('is warn tone when there are skips but no failures', () => {
    const s = catStats([tool('web_ui', 8, 0, 2, 'playwright')]);
    expect(s.tone).toBe('warn');
  });

  it('is fail tone when there is at least one failure', () => {
    const s = catStats([tool('web_ui', 7, 1, 2, 'playwright')]);
    expect(s.tone).toBe('fail');
  });

  it('sums counts across multiple tools', () => {
    const s = catStats([tool('web_ui', 10, 1, 0, 'playwright'), tool('web_ui', 5, 0, 1, 'cypress')]);
    expect(s.total).toBe(17);
    expect(s.passed).toBe(15);
    expect(s.failed).toBe(1);
    expect(s.skipped).toBe(1);
  });

  it('returns 0 pct (not NaN) for an empty list', () => {
    const s = catStats([]);
    expect(s.pct).toBe(0);
    expect(s.total).toBe(0);
  });
});

describe('toolsByKind', () => {
  it('filters tools down to the given kind', () => {
    const tools = [tool('web_ui', 1, 0, 0, 'playwright'), tool('api', 2, 0, 0, 'api')];
    expect(toolsByKind(tools, 'web_ui')).toHaveLength(1);
    expect(toolsByKind(tools, 'web_ui')[0].id).toBe('playwright');
    expect(toolsByKind(tools, 'performance')).toHaveLength(0);
  });
});
