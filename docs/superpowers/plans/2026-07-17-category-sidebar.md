# Category Sidebar (Test Automation Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the dashboard Overview's tool cards into 7 test-type categories navigable from a left sidebar, per `docs/superpowers/specs/2026-07-17-category-sidebar-design.md`.

**Architecture:** Purely a client-side presentational layer on top of `apps/dashboard/`'s existing `ToolKind`/`ToolSummary` — no server or wire-format changes. Category display metadata is a new derived lookup (`CATEGORY_META`), not a stored field. The selected category lives in the `/runs/:runId` route's `?cat=` search param, so it round-trips through a tool-detail visit via ordinary browser history (`navigate(-1)`) with no prop drilling.

**Tech Stack:** React 18 + TypeScript (strict) + React Router v6, Vitest + `@testing-library/react` for tests. All work is inside `apps/dashboard/`; run every command from the repo root using `pnpm --filter dashboard <script>`.

## Global Constraints

- Do not add `category` or `template` fields to `Tool`/`ToolSummary`. Category metadata is a `Record<ToolKind, {...}>` lookup; detail-view dispatch keeps using the existing `DETAIL_BY_KIND` (`apps/dashboard/src/client/registry/tool-registry.ts`) unchanged.
- Do not modify `AccessibilityDetail.tsx`, `SecurityDetail.tsx`, `MobileDetail.tsx`, `PerformanceDetail.tsx`, `VisualDetail.tsx`, `WebUiDetail.tsx`, `GenericDetail.tsx`, or any server/adapter/ingest code. This feature is Overview-only plus one navigation fix in `DetailHead.tsx`.
- Do not add the handoff's "Sections"/"Filters" layout variants or a `VariantSwitch` control. Sidebar is the only variant shipped.
- Category order is fixed Web → Security: reuse `TOOL_KINDS` from `apps/dashboard/src/shared/kinds.ts` verbatim, do not redeclare it.
- Do not change any CSS custom property in `apps/dashboard/src/client/styles/styles.css`'s `:root` block — tokens already match the design handoff exactly. Only append new classes.
- TypeScript strict mode is on (`strict`, `noUnusedLocals`, `noUnusedParameters` in `apps/dashboard/tsconfig.json`) — every task that touches `.ts`/`.tsx` ends with `pnpm --filter dashboard typecheck` passing clean.
- Path aliases available in both source and tests: `@shared/*` → `apps/dashboard/src/shared/*`, `@client/*` → `apps/dashboard/src/client/*` (existing code favors relative imports between sibling client files and the `@shared/*` alias for shared types — match that convention, don't introduce `@client/*` where a relative import already reads clearly).
- Test command for a single file: `pnpm --filter dashboard test -- <path>` (e.g. `pnpm --filter dashboard test -- test/categories.test.ts`). Full suite: `pnpm --filter dashboard test`.

## Parallelization (worktrees)

Tasks are ordered by dependency below, but the dependency graph allows 3 waves of parallel work. Each wave's tasks touch disjoint files and can run in separate git worktrees simultaneously; merge a wave back to the integration branch before starting the next.

- **Wave 1 (parallel):** Task 1 (`categories.ts`), Task 2 (CSS), Task 3 (`HealthDot`), Task 8 (`DetailHead` back button) — zero interdependencies, disjoint files.
- **Wave 2 (parallel, after Wave 1 merges):** Task 4 (`CategoryHeader`), Task 5 (`HeroCategoryChips`), Task 6 (`SideNav`) — each needs Task 1 + Task 3, independent of each other.
- **Wave 3 (solo, after Wave 2 merges):** Task 7 (`CategorySection`) — needs Task 4.
- **Wave 4 (solo, after Wave 3 merges):** Task 9 (`Overview.tsx` wiring) — needs Tasks 1, 5, 6, 7.
- **Wave 5 (solo, after Waves 1–4 merge):** Task 10 (end-to-end manual verification) — needs everything, especially Task 8 + Task 9 together.

---

### Task 1: `categories.ts` — category metadata and stats

**Files:**
- Create: `apps/dashboard/src/client/categories.ts`
- Test: `apps/dashboard/test/categories.test.ts`

**Interfaces:**
- Consumes: `ToolKind`, `TOOL_KINDS` from `@shared/kinds`; `ToolSummary` from `@shared/types`.
- Produces: `CATEGORY_META: Record<ToolKind, { name: string; desc: string }>`, `type Tone = 'ok' | 'warn' | 'fail'`, `catStats(tools: ToolSummary[]): { total, passed, failed, skipped, pct, tone }`, `toolsByKind(tools: ToolSummary[], kind: ToolKind): ToolSummary[]`. Every later task that groups or displays tools by category imports from here.

- [ ] **Step 1: Write the failing test**

`apps/dashboard/test/categories.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- test/categories.test.ts`
Expected: FAIL — cannot resolve `../src/client/categories` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

`apps/dashboard/src/client/categories.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- test/categories.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/client/categories.ts apps/dashboard/test/categories.test.ts
git commit -m "feat(dashboard): add category metadata and stats helpers"
```

---

### Task 2: CSS — port the category-grouping styles

**Files:**
- Modify: `apps/dashboard/src/client/styles/styles.css` (append at end of file, currently 452 lines)

**Interfaces:**
- Consumes: existing `:root` custom properties (`--pass`, `--fail`, `--skip`, `--surface`, `--line-soft`, `--text`, `--text-mute`, `--text-dim`, `--mono`, `--radius`) — already defined, unchanged.
- Produces: class names `.cat-section`, `.cat-head`, `.cat-title` (+ `h2`), `.cat-count`, `.cat-desc`, `.cat-stats` (+ `b`, `b.pass`, `b.fail`), `.cat-dot` (+ `.ok`/`.warn`/`.fail`), `.hero-chips`, `.hero-chip` (+ `b`, `:hover`), `.sidebar-layout`, `.side-nav` (+ `button`, `.nm`, `.ct`, `.fl`, `button:hover`, `button.active`), `.tool-grid.two` — every component task below (3–7) renders these class names.

No automated test for CSS in this codebase; verified by the components that consume these classes (Tasks 3–7) and the final manual pass (Task 10).

- [ ] **Step 1: Append the CSS block**

Append to the end of `apps/dashboard/src/client/styles/styles.css` (after the existing `.failure-screenshot-close:hover` rule on line 452):

```css

/* ───────────────── v2: category grouping ───────────────── */
.cat-section{margin-bottom:36px}
.cat-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin:0 2px 16px;padding-bottom:11px;border-bottom:1px solid var(--line-soft)}
.cat-title{display:flex;align-items:center;gap:11px}
.cat-title h2{margin:0;font-size:17px;font-weight:650;letter-spacing:-0.01em}
.cat-count{font-family:var(--mono);font-size:11px;color:var(--text-dim);background:oklch(0.26 0.045 290 / 0.7);border:1px solid var(--line-soft);padding:3px 8px;border-radius:99px;white-space:nowrap}
.cat-desc{font-size:12.5px;color:var(--text-dim);margin-left:4px}
.cat-stats{display:flex;gap:18px;font-family:var(--mono);font-size:12px;color:var(--text-mute);white-space:nowrap}
.cat-stats b{color:var(--text);font-weight:600}
.cat-stats b.pass{color:var(--pass)}
.cat-stats b.fail{color:var(--fail)}
.cat-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;display:inline-block}
.cat-dot.ok{background:var(--pass);box-shadow:0 0 0 3px oklch(0.78 0.16 155 / 0.18)}
.cat-dot.warn{background:var(--skip);box-shadow:0 0 0 3px oklch(0.78 0.13 80 / 0.18)}
.cat-dot.fail{background:var(--fail);box-shadow:0 0 0 3px oklch(0.68 0.22 22 / 0.18)}
.hero-chips{display:flex;flex-wrap:wrap;gap:8px;margin:-12px 0 26px}
.hero-chip{appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border-radius:99px;background:oklch(0.24 0.045 290 / 0.75);border:1px solid var(--line-soft);color:var(--text-mute);font-size:12px;font-weight:500;transition:border-color .15s ease,color .15s ease}
.hero-chip:hover{border-color:oklch(0.45 0.10 300);color:var(--text)}
.hero-chip b{font-family:var(--mono);font-weight:600;color:var(--text)}
.sidebar-layout{display:grid;grid-template-columns:232px 1fr;gap:22px;align-items:start}
.side-nav{position:sticky;top:20px;display:flex;flex-direction:column;gap:3px;padding:12px;background:var(--surface);border:1px solid var(--line-soft);border-radius:var(--radius)}
.side-title{font-size:10.5px;text-transform:uppercase;letter-spacing:0.16em;color:var(--text-dim);padding:4px 10px 10px;font-weight:600}
.side-nav button{appearance:none;cursor:pointer;display:flex;align-items:center;gap:9px;width:100%;text-align:left;padding:9px 10px;border-radius:9px;border:1px solid transparent;background:transparent;color:var(--text-mute);font-size:13px;font-weight:500}
.side-nav button:hover{background:oklch(0.27 0.05 290 / 0.7);color:var(--text)}
.side-nav button.active{background:oklch(0.31 0.08 295 / 0.75);border-color:oklch(0.45 0.10 300);color:var(--text)}
.side-nav .nm{flex:1}
.side-nav .ct{font-family:var(--mono);font-size:11px;color:var(--text-dim)}
.side-nav .fl{font-family:var(--mono);font-size:10.5px;color:var(--fail);background:oklch(0.30 0.10 22 / 0.3);padding:2px 7px;border-radius:99px}
.tool-grid.two{grid-template-columns:repeat(2,1fr)}
```

- [ ] **Step 2: Verify nothing else broke**

Run: `pnpm --filter dashboard test`
Expected: PASS (same pass count as before this change — CSS has no test coverage of its own, this just guards against an unrelated regression).

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/client/styles/styles.css
git commit -m "feat(dashboard): add category-grouping CSS (sidebar, chips, category header)"
```

---

### Task 3: `HealthDot` component

**Files:**
- Create: `apps/dashboard/src/client/components/HealthDot.tsx`
- Test: `apps/dashboard/test/components/HealthDot.test.tsx`

**Interfaces:**
- Consumes: `Tone` from `../categories`.
- Produces: `HealthDot({ tone: Tone })` — a `<span className="cat-dot {tone}">`. Used by `CategoryHeader`, `HeroCategoryChips`, `SideNav` (Tasks 4–6).

- [ ] **Step 1: Write the failing test**

`apps/dashboard/test/components/HealthDot.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { HealthDot } from '../../src/client/components/HealthDot';

describe('HealthDot', () => {
  it.each(['ok', 'warn', 'fail'] as const)('renders the %s tone as a cat-dot class', (tone) => {
    const { container } = render(<HealthDot tone={tone} />);
    const dot = container.querySelector('span');
    expect(dot).not.toBeNull();
    expect(dot!.className).toBe(`cat-dot ${tone}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- test/components/HealthDot.test.tsx`
Expected: FAIL — cannot resolve `../../src/client/components/HealthDot`.

- [ ] **Step 3: Write minimal implementation**

`apps/dashboard/src/client/components/HealthDot.tsx`:

```tsx
import type { Tone } from '../categories';

interface HealthDotProps {
  tone: Tone;
}

export function HealthDot({ tone }: HealthDotProps) {
  return <span className={`cat-dot ${tone}`} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- test/components/HealthDot.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/client/components/HealthDot.tsx apps/dashboard/test/components/HealthDot.test.tsx
git commit -m "feat(dashboard): add HealthDot component"
```

---

### Task 4: `CategoryHeader` component

**Files:**
- Create: `apps/dashboard/src/client/components/CategoryHeader.tsx`
- Test: `apps/dashboard/test/components/CategoryHeader.test.tsx`

**Interfaces:**
- Consumes: `CATEGORY_META`, `catStats` from `../categories`; `HealthDot` from `./HealthDot`; `ToolKind` from `@shared/kinds`; `ToolSummary` from `@shared/types`.
- Produces: `CategoryHeader({ kind: ToolKind; tools: ToolSummary[] })` — renders `.cat-head`. Used by `CategorySection` (Task 7).

- [ ] **Step 1: Write the failing test**

`apps/dashboard/test/components/CategoryHeader.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { CategoryHeader } from '../../src/client/components/CategoryHeader';
import type { ToolSummary } from '../../src/shared/types';

function tool(id: string, passed: number, failed: number, skipped: number): ToolSummary {
  return { id, kind: 'web_ui', name: id, description: '', passed, failed, skipped, duration: '1m' };
}

describe('CategoryHeader', () => {
  it('renders the category name and description', () => {
    render(<CategoryHeader kind="web_ui" tools={[tool('playwright', 10, 0, 0)]} />);
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('Browser end-to-end suites')).toBeInTheDocument();
  });

  it('shows a singular tool count for one tool', () => {
    render(<CategoryHeader kind="web_ui" tools={[tool('playwright', 10, 0, 0)]} />);
    expect(screen.getByText('1 tool')).toBeInTheDocument();
  });

  it('pluralizes the tool count for multiple tools', () => {
    render(<CategoryHeader kind="web_ui" tools={[tool('playwright', 10, 0, 0), tool('cypress', 5, 0, 0)]} />);
    expect(screen.getByText('2 tools')).toBeInTheDocument();
  });

  it('shows total tests, pass percentage, and failed count', () => {
    render(<CategoryHeader kind="web_ui" tools={[tool('playwright', 7, 2, 1)]} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('70.0%')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- test/components/CategoryHeader.test.tsx`
Expected: FAIL — cannot resolve `../../src/client/components/CategoryHeader`.

- [ ] **Step 3: Write minimal implementation**

`apps/dashboard/src/client/components/CategoryHeader.tsx`:

```tsx
import type { ToolKind } from '@shared/kinds';
import type { ToolSummary } from '@shared/types';
import { CATEGORY_META, catStats } from '../categories';
import { HealthDot } from './HealthDot';

interface CategoryHeaderProps {
  kind: ToolKind;
  tools: ToolSummary[];
}

export function CategoryHeader({ kind, tools }: CategoryHeaderProps) {
  const meta = CATEGORY_META[kind];
  const stats = catStats(tools);
  return (
    <div className="cat-head">
      <div className="cat-title">
        <HealthDot tone={stats.tone} />
        <h2>{meta.name}</h2>
        <span className="cat-count">{tools.length} {tools.length === 1 ? 'tool' : 'tools'}</span>
        <span className="cat-desc">{meta.desc}</span>
      </div>
      <div className="cat-stats">
        <span><b>{stats.total.toLocaleString()}</b> tests</span>
        <span><b className="pass">{stats.pct.toFixed(1)}%</b> pass</span>
        <span><b className={stats.failed ? 'fail' : ''}>{stats.failed}</b> failed</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- test/components/CategoryHeader.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/client/components/CategoryHeader.tsx apps/dashboard/test/components/CategoryHeader.test.tsx
git commit -m "feat(dashboard): add CategoryHeader component"
```

---

### Task 5: `HeroCategoryChips` component

**Files:**
- Create: `apps/dashboard/src/client/components/HeroCategoryChips.tsx`
- Test: `apps/dashboard/test/components/HeroCategoryChips.test.tsx`

**Interfaces:**
- Consumes: `CATEGORY_META`, `catStats`, `toolsByKind` from `../categories`; `HealthDot` from `./HealthDot`; `TOOL_KINDS`, `ToolKind` from `@shared/kinds`; `ToolSummary` from `@shared/types`.
- Produces: `HeroCategoryChips({ tools: ToolSummary[]; onPick: (kind: ToolKind) => void })` — renders `.hero-chips`. Used by `Overview.tsx` (Task 9).

- [ ] **Step 1: Write the failing test**

`apps/dashboard/test/components/HeroCategoryChips.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { HeroCategoryChips } from '../../src/client/components/HeroCategoryChips';
import type { ToolSummary } from '../../src/shared/types';

function tool(id: string, kind: ToolSummary['kind'], passed: number, failed: number, skipped: number): ToolSummary {
  return { id, kind, name: id, description: '', passed, failed, skipped, duration: '1m' };
}

describe('HeroCategoryChips', () => {
  it('renders one chip per populated category, skipping empty ones', () => {
    const tools = [tool('playwright', 'web_ui', 10, 0, 0), tool('api', 'api', 5, 0, 0)];
    render(<HeroCategoryChips tools={tools} onPick={() => {}} />);
    expect(screen.getByRole('button', { name: /^Web/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^API/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Mobile/ })).toBeNull();
  });

  it("calls onPick with the chip's kind when clicked", () => {
    const onPick = vi.fn();
    const tools = [tool('playwright', 'web_ui', 10, 0, 0)];
    render(<HeroCategoryChips tools={tools} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /^Web/ }));
    expect(onPick).toHaveBeenCalledWith('web_ui');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- test/components/HeroCategoryChips.test.tsx`
Expected: FAIL — cannot resolve `../../src/client/components/HeroCategoryChips`.

- [ ] **Step 3: Write minimal implementation**

`apps/dashboard/src/client/components/HeroCategoryChips.tsx`:

```tsx
import { TOOL_KINDS, type ToolKind } from '@shared/kinds';
import type { ToolSummary } from '@shared/types';
import { CATEGORY_META, catStats, toolsByKind } from '../categories';
import { HealthDot } from './HealthDot';

interface HeroCategoryChipsProps {
  tools: ToolSummary[];
  onPick: (kind: ToolKind) => void;
}

export function HeroCategoryChips({ tools, onPick }: HeroCategoryChipsProps) {
  return (
    <div className="hero-chips">
      {TOOL_KINDS.map((kind) => {
        const ts = toolsByKind(tools, kind);
        if (!ts.length) return null;
        const stats = catStats(ts);
        return (
          <button key={kind} className="hero-chip" onClick={() => onPick(kind)}>
            <HealthDot tone={stats.tone} />
            {CATEGORY_META[kind].name}
            <b>{stats.pct.toFixed(0)}%</b>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- test/components/HeroCategoryChips.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/client/components/HeroCategoryChips.tsx apps/dashboard/test/components/HeroCategoryChips.test.tsx
git commit -m "feat(dashboard): add HeroCategoryChips component"
```

---

### Task 6: `SideNav` component

**Files:**
- Create: `apps/dashboard/src/client/components/SideNav.tsx`
- Test: `apps/dashboard/test/components/SideNav.test.tsx`

**Interfaces:**
- Consumes: `CATEGORY_META`, `catStats`, `toolsByKind` from `../categories`; `HealthDot` from `./HealthDot`; `TOOL_KINDS`, `ToolKind` from `@shared/kinds`; `ToolSummary` from `@shared/types`.
- Produces: `type ActiveCategory = 'all' | ToolKind`; `SideNav({ tools: ToolSummary[]; active: ActiveCategory; onPick: (id: ActiveCategory) => void })` — renders `.side-nav`. `ActiveCategory` and `SideNav` are used by `Overview.tsx` (Task 9).

- [ ] **Step 1: Write the failing test**

`apps/dashboard/test/components/SideNav.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SideNav } from '../../src/client/components/SideNav';
import type { ToolSummary } from '../../src/shared/types';

function tool(id: string, kind: ToolSummary['kind'], passed: number, failed: number, skipped: number): ToolSummary {
  return { id, kind, name: id, description: '', passed, failed, skipped, duration: '1m' };
}

const tools = [
  tool('playwright', 'web_ui', 10, 1, 0),
  tool('appium', 'mobile_ui', 5, 0, 0),
];

describe('SideNav', () => {
  it('renders "All tools" first with the total tool count', () => {
    render(<SideNav tools={tools} active="all" onPick={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('All tools');
    expect(buttons[0]).toHaveTextContent('2');
  });

  it('renders one row per populated category, skipping empty ones', () => {
    render(<SideNav tools={tools} active="all" onPick={() => {}} />);
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();
    expect(screen.queryByText('API')).toBeNull();
  });

  it('shows a failed-count badge only when a category has failures', () => {
    render(<SideNav tools={tools} active="all" onPick={() => {}} />);
    const webRow = screen.getByText('Web').closest('button')!;
    expect(webRow.querySelector('.fl')).not.toBeNull();
    expect(webRow.querySelector('.fl')!.textContent).toBe('1');
    const mobileRow = screen.getByText('Mobile').closest('button')!;
    expect(mobileRow.querySelector('.fl')).toBeNull();
  });

  it('marks the active category row', () => {
    render(<SideNav tools={tools} active="mobile_ui" onPick={() => {}} />);
    expect(screen.getByText('Mobile').closest('button')).toHaveClass('active');
    expect(screen.getByText('Web').closest('button')).not.toHaveClass('active');
  });

  it('calls onPick with the clicked category id', () => {
    const onPick = vi.fn();
    render(<SideNav tools={tools} active="all" onPick={onPick} />);
    screen.getByText('Web').closest('button')!.click();
    expect(onPick).toHaveBeenCalledWith('web_ui');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- test/components/SideNav.test.tsx`
Expected: FAIL — cannot resolve `../../src/client/components/SideNav`.

- [ ] **Step 3: Write minimal implementation**

`apps/dashboard/src/client/components/SideNav.tsx`:

```tsx
import { TOOL_KINDS, type ToolKind } from '@shared/kinds';
import type { ToolSummary } from '@shared/types';
import { CATEGORY_META, catStats, toolsByKind } from '../categories';
import { HealthDot } from './HealthDot';

export type ActiveCategory = 'all' | ToolKind;

interface SideNavProps {
  tools: ToolSummary[];
  active: ActiveCategory;
  onPick: (id: ActiveCategory) => void;
}

export function SideNav({ tools, active, onPick }: SideNavProps) {
  return (
    <nav className="side-nav">
      <div className="side-title">Test types</div>
      <button className={active === 'all' ? 'active' : ''} onClick={() => onPick('all')}>
        <span className="nm">All tools</span>
        <span className="ct">{tools.length}</span>
      </button>
      {TOOL_KINDS.map((kind) => {
        const ts = toolsByKind(tools, kind);
        if (!ts.length) return null;
        const stats = catStats(ts);
        return (
          <button key={kind} className={active === kind ? 'active' : ''} onClick={() => onPick(kind)}>
            <HealthDot tone={stats.tone} />
            <span className="nm">{CATEGORY_META[kind].name}</span>
            {stats.failed > 0 && <span className="fl">{stats.failed}</span>}
            <span className="ct">{ts.length}</span>
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- test/components/SideNav.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/client/components/SideNav.tsx apps/dashboard/test/components/SideNav.test.tsx
git commit -m "feat(dashboard): add SideNav component"
```

---

### Task 7: `CategorySection` component

**Files:**
- Create: `apps/dashboard/src/client/components/CategorySection.tsx`
- Test: `apps/dashboard/test/components/CategorySection.test.tsx`

**Interfaces:**
- Consumes: `toolsByKind` from `../categories`; `CategoryHeader` from `./CategoryHeader`; `ToolCard` from `./ToolCard` (existing, unchanged); `ToolKind` from `@shared/kinds`; `ToolSummary` from `@shared/types`.
- Produces: `CategorySection({ kind: ToolKind; tools: ToolSummary[]; runId: string })` — renders `.cat-section` (a `CategoryHeader` plus a `.tool-grid.two` of `ToolCard`s for that kind only). Used by `Overview.tsx` (Task 9).

- [ ] **Step 1: Write the failing test**

`apps/dashboard/test/components/CategorySection.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { CategorySection } from '../../src/client/components/CategorySection';
import type { ToolSummary } from '../../src/shared/types';

function tool(id: string, kind: ToolSummary['kind'], passed: number, failed: number, skipped: number): ToolSummary {
  return { id, kind, name: id, description: '', passed, failed, skipped, duration: '3m 0s' };
}

describe('CategorySection', () => {
  it('renders a CategoryHeader and only the tools of the given kind, in a two-column grid', () => {
    const tools = [
      tool('playwright', 'web_ui', 10, 0, 0),
      tool('cypress', 'web_ui', 5, 0, 0),
      tool('api', 'api', 3, 0, 0),
    ];
    const { container } = render(
      <MemoryRouter>
        <CategorySection kind="web_ui" tools={tools} runId="r1" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('playwright')).toBeInTheDocument();
    expect(screen.getByText('cypress')).toBeInTheDocument();
    expect(screen.queryByText('api')).toBeNull();
    expect(container.querySelector('.tool-grid.two')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- test/components/CategorySection.test.tsx`
Expected: FAIL — cannot resolve `../../src/client/components/CategorySection`.

- [ ] **Step 3: Write minimal implementation**

`apps/dashboard/src/client/components/CategorySection.tsx`:

```tsx
import type { ToolKind } from '@shared/kinds';
import type { ToolSummary } from '@shared/types';
import { toolsByKind } from '../categories';
import { CategoryHeader } from './CategoryHeader';
import { ToolCard } from './ToolCard';

interface CategorySectionProps {
  kind: ToolKind;
  tools: ToolSummary[];
  runId: string;
}

export function CategorySection({ kind, tools, runId }: CategorySectionProps) {
  const ts = toolsByKind(tools, kind);
  return (
    <section className="cat-section">
      <CategoryHeader kind={kind} tools={ts} />
      <div className="tool-grid two">
        {ts.map((t) => (
          <ToolCard key={t.id} runId={runId} tool={t} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- test/components/CategorySection.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/client/components/CategorySection.tsx apps/dashboard/test/components/CategorySection.test.tsx
git commit -m "feat(dashboard): add CategorySection component"
```

---

### Task 8: `DetailHead` — preserve category on Back

**Files:**
- Modify: `apps/dashboard/src/client/components/DetailHead.tsx`
- Test: `apps/dashboard/test/components/DetailHead.test.tsx` (new)

**Interfaces:**
- Consumes: `useNavigate`, `useLocation` from `react-router-dom` (replacing the current `Link` import).
- Produces: no change to `DetailHead`'s exported props (`{ runId, tool, right? }` — unchanged signature, `ToolDetail.tsx` and all detail views keep calling it exactly as today). Independent of Tasks 1–7.

This task is a pure behavior change to an existing file — no new file, but it does need a first failing test since the current Back behavior (fixed `Link`) doesn't do what the new test expects.

- [ ] **Step 1: Write the failing test**

`apps/dashboard/test/components/DetailHead.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';

import { DetailHead } from '../../src/client/components/DetailHead';
import type { Tool } from '../../src/shared/types';

const tool: Tool = {
  id: 'playwright', kind: 'web_ui', name: 'Playwright', description: 'End-to-end tests',
  passed: 10, failed: 0, skipped: 0, duration: '1m', tests: [],
};

function OverviewMarker() {
  const [params] = useSearchParams();
  return <div>Overview marker cat={params.get('cat') ?? 'none'}</div>;
}

function renderAt(entries: string[], initialIndex: number) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
      <Routes>
        <Route path="/runs/:runId" element={<OverviewMarker />} />
        <Route path="/runs/:runId/:toolId" element={<DetailHead runId="r1" tool={tool} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DetailHead Back navigation', () => {
  it('goes back in browser history, restoring the category that was selected on Overview', () => {
    renderAt(['/runs/r1?cat=web_ui', '/runs/r1/playwright'], 1);
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Overview marker cat=web_ui')).toBeInTheDocument();
  });

  it('falls back to the plain run overview when there is no in-app history (direct link)', () => {
    renderAt(['/runs/r1/playwright'], 0);
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Overview marker cat=none')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter dashboard test -- test/components/DetailHead.test.tsx`
Expected: FAIL on the first test — today's `DetailHead` always links to `/runs/r1` with no query string, so clicking Back from `/runs/r1/playwright` (reached from `/runs/r1?cat=web_ui`) lands on `Overview marker cat=none`, not `cat=web_ui`.

- [ ] **Step 3: Update the implementation**

Replace the full contents of `apps/dashboard/src/client/components/DetailHead.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import type { Tool } from '@shared/types';
import { ToolLogo } from './ToolLogo';

interface DetailHeadProps {
  runId: string;
  tool: Tool;
  right?: ReactNode;
}

const KIND_LABEL: Record<Tool['kind'], string> = {
  web_ui:        'Web UI',
  mobile_ui:     'Mobile UI',
  api:           'API · Contract',
  performance:   'Performance · Load',
  visual:        'Visual · Regression',
  accessibility: 'Accessibility',
  security:      'Security',
};

export function DetailHead({ runId, tool, right }: DetailHeadProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const back = () => {
    // location.key is 'default' only for the very first history entry in this
    // tab (e.g. a direct link straight into a tool). Anywhere else, going back
    // in history returns to the Overview URL exactly as it was — including
    // its `?cat=` — with no need for DetailHead to know about categories.
    if (location.key !== 'default') navigate(-1);
    else navigate(`/runs/${runId}`);
  };

  return (
    <div className="detail-head">
      <button type="button" className="btn ghost" onClick={back} style={{ padding: '9px 12px' }}>
        <ChevronLeft /> Back
      </button>
      <div className="tool-logo">
        <ToolLogo toolId={tool.id} size={38} />
      </div>
      <div>
        <div className="title">{tool.name}</div>
        <div className="sub">
          {KIND_LABEL[tool.kind]} · {tool.description}
        </div>
      </div>
      <div className="right">{right}</div>
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} fill="none">
      <path d="M10 3 L 5 8 L 10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter dashboard test -- test/components/DetailHead.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full test suite**

Run: `pnpm --filter dashboard test`
Expected: PASS — in particular, no existing test asserted the old `<Link to="/runs/:runId">` markup (verify by reading the failure output if anything breaks; none should).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/client/components/DetailHead.tsx apps/dashboard/test/components/DetailHead.test.tsx
git commit -m "fix(dashboard): DetailHead Back button preserves the selected category via history"
```

---

### Task 9: Wire the sidebar into `Overview.tsx`

**Files:**
- Modify: `apps/dashboard/src/client/views/Overview.tsx`

**Interfaces:**
- Consumes: `TOOL_KINDS`, `ToolKind` from `@shared/kinds`; `toolsByKind` from `../categories` (Task 1); `HeroCategoryChips` (Task 5); `SideNav`, `ActiveCategory` (Task 6); `CategorySection` (Task 7); `useSearchParams` from `react-router-dom`.
- Produces: no exported interface change (`Overview` is only ever used as a route element) — this is the integration point, nothing downstream depends on its internals.

No new automated test for this task, matching the existing convention: neither `Overview.tsx` nor `ToolDetail.tsx` has a test file today (only their child components and the server adapters do — see `docs/superpowers/specs/2026-05-24-test-dashboard-design.md` §13). This task's correctness is verified by typecheck plus the manual browser pass below, and end-to-end together with Task 8 in Task 10.

- [ ] **Step 1: Replace the full contents of `Overview.tsx`**

`apps/dashboard/src/client/views/Overview.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import type { RunPayload } from '@shared/types';
import { TOOL_KINDS, type ToolKind } from '@shared/kinds';
import { ApiError, fetchRun } from '../api';
import { HeroStrip } from '../components/HeroStrip';
import { HeroCategoryChips } from '../components/HeroCategoryChips';
import { SideNav, type ActiveCategory } from '../components/SideNav';
import { CategorySection } from '../components/CategorySection';
import { toolsByKind } from '../categories';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; payload: RunPayload }
  | { kind: 'error'; error: Error };

export function Overview() {
  const { runId } = useParams();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!runId) return;
    const ac = new AbortController();
    setState({ kind: 'loading' });
    fetchRun(runId, ac.signal)
      .then((payload) => setState({ kind: 'ok', payload }))
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setState({ kind: 'error', error: err });
      });
    return () => ac.abort();
  }, [runId]);

  if (state.kind === 'loading') return <div className="state">Loading run…</div>;
  if (state.kind === 'error') {
    const detail = state.error instanceof ApiError
      ? `${state.error.status} · ${state.error.url}`
      : state.error.message;
    return (
      <div className="state">
        <div className="title">Couldn't load run</div>
        <div>{detail}</div>
      </div>
    );
  }

  const { tools } = state.payload;
  const rawCat = searchParams.get('cat');
  const populatedActiveKind: ToolKind | null =
    rawCat !== null && (TOOL_KINDS as readonly string[]).includes(rawCat) && toolsByKind(tools, rawCat as ToolKind).length > 0
      ? (rawCat as ToolKind)
      : null;
  const populatedKinds = TOOL_KINDS.filter((k) => toolsByKind(tools, k).length > 0);

  const pick = (id: ActiveCategory) => {
    if (id === 'all') setSearchParams({});
    else setSearchParams({ cat: id });
  };

  return (
    <div className="fade-in">
      <HeroStrip tools={tools} />
      <HeroCategoryChips tools={tools} onPick={pick} />
      <div className="section-head">
        <h2>
          Tools <small>{tools.length} testing tools · {populatedKinds.length} test types · click a card to drill in</small>
        </h2>
        <div className="legend">
          <span>
            <i style={{ background: 'var(--pass)' }} />Passed
          </span>
          <span>
            <i style={{ background: 'var(--fail)' }} />Failed
          </span>
          <span>
            <i style={{ background: 'var(--skip)' }} />Skipped
          </span>
        </div>
      </div>
      <div className="sidebar-layout">
        <SideNav tools={tools} active={populatedActiveKind ?? 'all'} onPick={pick} />
        <div>
          {populatedActiveKind
            ? <CategorySection kind={populatedActiveKind} tools={tools} runId={runId!} />
            : populatedKinds.map((k) => <CategorySection key={k} kind={k} tools={tools} runId={runId!} />)}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `pnpm --filter dashboard test`
Expected: PASS — no test targets `Overview.tsx` directly, this confirms nothing it imports regressed.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter dashboard typecheck`
Expected: no errors. Pay special attention to the `(TOOL_KINDS as readonly string[]).includes(rawCat)` cast — `TOOL_KINDS` is `readonly ToolKind[]`, and `rawCat` is a plain `string`, so the cast is required for `.includes()` to typecheck; the narrowing back to `ToolKind` still needs the explicit `as ToolKind` on the line below since TypeScript can't infer it through the widened cast.

- [ ] **Step 4: Manual verification**

Run `pnpm dashboard` from the repo root, open `http://localhost:5173`, and check against `design_handoff_category_sidebar/screenshots/01-overview-all.png` and `02-overview-categoria-web.png` (layout/behavior — tool density will differ, see the spec's §2 Non-goals):
- "All tools" (default) shows the hero chips row, then the sidebar with 7 category rows (one per populated `ToolKind`) plus "All tools" at the top, and the content area stacks a `CategoryHeader` + 2-column tool grid per category, in Web → Security order.
- Clicking a sidebar row or a hero chip filters the content area to that one category and highlights the row as active; the URL gains `?cat=<kind>`.
- Clicking "All tools" clears `?cat=` and restacks every category.
- A category with zero real tools (there shouldn't currently be one, since all 8 wired tools cover all 7 kinds) does not appear in the sidebar or as a hero chip — confirm by temporarily checking the `tools` array length in a breakpoint or console log equals 8 and all 7 kinds are represented, rather than fabricating a missing one.
- Edit the URL to an invalid category, e.g. `/runs/<runId>?cat=bogus` — confirm this renders the grouped "All tools" view (not a blank content area or a crash) and the sidebar shows no row as active, per the spec's §8 edge case ("unknown `?cat=` value falls back to `all`").
- Open the browser devtools Network tab, load Overview once, then click through 2–3 different sidebar rows — confirm no additional `/api/runs/:runId` requests fire after the first load (`useEffect`'s dependency array is `[runId]`, not search params, so switching categories must be a pure re-render, per the spec's §11 risk note).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/client/views/Overview.tsx
git commit -m "feat(dashboard): wire category sidebar, hero chips, and grouped grid into Overview"
```

---

### Task 10: End-to-end verification (Back-button + category integration)

**Files:** none (verification only — no code changes).

**Interfaces:** N/A — this task exercises the integration of Task 8 (`DetailHead`) and Task 9 (`Overview`) together in a real browser, which their separate unit/component tests approximate but don't fully cover live.

- [ ] **Step 1: Full regression pass**

Run from the repo root:

```bash
pnpm --filter dashboard test
pnpm --filter dashboard typecheck
```

Expected: both clean.

- [ ] **Step 2: Manual click-through**

Run `pnpm dashboard`, open `http://localhost:5173`, and walk through:
1. On Overview, click the "Mobile" row in the sidebar (or the Mobile hero chip). Confirm the URL shows `?cat=mobile_ui` and only Mobile tools are shown.
2. Click "View results" on a Mobile tool's card to open its detail view. Confirm the URL is `/runs/<runId>/<toolId>`.
3. Click "Back". Confirm you land back on Overview with Mobile still selected (sidebar row still highlighted, URL still carries `?cat=mobile_ui`) — this is the behavior Task 8's `navigate(-1)` change and Task 9's `?cat=` wiring jointly provide.
4. Paste `/runs/<runId>/<toolId>` directly into the address bar (simulating a fresh/shared link, bypassing Overview entirely) and press Back. Confirm it lands on the plain Overview (`/runs/<runId>`, no `?cat=`) rather than erroring or leaving the app.
5. Open each of the 4 detail templates present among the 8 real tools (`web_ui`/`WebUiDetail` via Playwright, `mobile_ui`/`MobileDetail` via Appium, `performance`/`PerformanceDetail` via Gatling, `visual`/`VisualDetail` via PixelMatch) plus `accessibility`/`AccessibilityDetail` (axe) and `security`/`SecurityDetail` (ZAP or MobSF) — confirm all render exactly as before this feature (unchanged per the spec's Non-goals), and Back works from each.

- [ ] **Step 3: Report results**

No commit for this task (verification only). If any check in Step 2 fails, file it as a new task appended to this plan (with the specific failing scenario and file to fix) rather than patching silently — this plan's tasks are considered complete only once every check above passes.
