# Test Automation Dashboard — Category Grouping (Sidebar variant)

**Date:** 2026-07-17
**Scope:** group the Overview's tool cards into 7 test-type categories, navigable from a left sidebar, matching the design handoff in `design_handoff_category_sidebar/` (variant "Sidebar" only — "Sections"/"Filters" are comparison-only, not implemented). Builds on the existing v1 dashboard (`apps/dashboard/`, see `2026-05-24-test-dashboard-design.md`).

## 1. Goals

- Add a `SideNav` (7 categories + "All tools") to the Overview, with per-category health dot, tool count, and failed-tests badge.
- Add hero chips (one per populated category, health dot + pass %) between `HeroStrip` and the "Tools" section head.
- Add a `CategoryHeader` (name, tool count pill, description, aggregate stats) above each category's 2-column tool grid.
- Preserve the selected category when navigating into a tool's detail view and back.
- Reuse the existing visual system as-is — `apps/dashboard/src/client/styles/styles.css` tokens already match the handoff's `Design Tokens` section exactly (verified line-by-line); only new CSS classes are added, no token changes.

## 2. Non-goals

- Wiring the 9 additional tools that only exist in the handoff's mock data (Cypress, WebdriverIO, OpenAPI, Postman, k6, JMeter, Percy, Applitools Eyes, TestMu AI SmartUI) and Mobilewright. The 8 tools already wired (`playwright`, `appium`, `api`, `gatling`, `pixelmatch`, `axe`, `zap`, `mobsf`) already cover all 7 categories, so the sidebar ships fully functional without touching the ingestion pipeline. **Consequence:** categories will show 1–2 tools instead of the handoff screenshots' 2–4 — visual comparison is about layout/behavior, not tool density.
- The "Sections" and "Filters" layout variants, and the `VariantSwitch` control — sidebar is the only variant shipped.
- Any change to `AccessibilityDetail`/`SecurityDetail`/`MobileDetail`/`PerformanceDetail`/`VisualDetail`/`WebUiDetail`/`GenericDetail` content. The handoff's README lists axe-core/ZAP/MobSF under its `generic` template, but the real app already has richer, dedicated views for `accessibility` and `security` (impact-bucketed a11y violations, risk-grouped ZAP alerts, MobSF platform tabs) — per the handoff's own precedence rule ("si algo del stack real contradice este documento, gana el stack real"), those are kept unchanged.
- A `category` or `template` field on `Tool`/`ToolSummary`. `ToolKind` already maps 1:1 to the handoff's 7 categories, and `DETAIL_BY_KIND` already dispatches by `kind` with 7 components (stricter than the handoff's 4 templates). Category display metadata is a small derived lookup, not wire-format state (decided during brainstorming; see §3).

## 3. Decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| `category` field | Not added. Derive from `tool.kind` via a new `CATEGORY_META: Record<ToolKind, {name, desc}>` lookup. | `kind` already discriminates the `Tool` union 1:1 with the handoff's categories; a stored field would duplicate it and risk drift. |
| `template` field | Not added. Detail-view dispatch keeps using the existing `DETAIL_BY_KIND` (`kind` → component). | Already more granular than the handoff's 4 templates; adding `template` per the handoff's literal `generic\|mobile\|perf\|visual` enum would force `accessibility`/`security` onto the generic list and regress their existing bespoke views. |
| Tool scope | Ship against the 8 real wired tools, not the handoff's 17 mock tools. | All 7 categories already have ≥1 real tool; wiring 9 new adapters/fixtures/logos is a separate, much larger effort and out of scope for a grouping-UI feature. |
| Category order | Reuse `TOOL_KINDS` from `shared/kinds.ts` (`web_ui, mobile_ui, api, performance, visual, accessibility, security`). | Already in the exact fixed order the handoff specifies (Web → Security); no second source of truth. |
| Active-category state | URL search param `?cat=<kind>` on `/runs/:runId` (via `useSearchParams`), not component state. | Deep-linkable, and — combined with the Back-button change below — survives navigating into a tool detail view and back with zero prop drilling. |
| Back-button navigation | `DetailHead`'s Back control changes from a fixed `<Link to={/runs/:runId}>` to `navigate(-1)` (browser history), falling back to `/runs/:runId` when there's no in-app history entry (e.g. a deep link straight into a tool). | The Overview URL (`?cat=...`) is already in history when a tool is opened; going back restores it verbatim. `DetailHead` needs no knowledge of categories. |
| CSS | Port the handoff's `v2: category grouping` block (`design_handoff_category_sidebar/src/styles.css:338-376`) into `apps/dashboard/src/client/styles/styles.css` verbatim, minus `.pills-bar`/`.pill-btn`/`.variant-switch` (unused variants). | Tokens already match; no translation needed. |

## 4. Component additions

All new files under `apps/dashboard/src/client/`:

```
categories.ts                       # CATEGORY_META, catStats() — pure, no React
components/
  HealthDot.tsx                     # <span class="cat-dot {tone}"/>
  CategoryHeader.tsx                # { kind, tools } → .cat-head block
  HeroCategoryChips.tsx             # { tools, onPick } → .hero-chips row
  SideNav.tsx                       # { tools, active, onPick } → .side-nav
  CategorySection.tsx               # { kind, tools, runId } → CategoryHeader + tool-grid.two of ToolCards
```

`categories.ts`:

```ts
import type { ToolKind } from '@shared/kinds';
import type { ToolSummary } from '@shared/types';

export interface CategoryMeta { name: string; desc: string }

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
  total: number; passed: number; failed: number; skipped: number;
  pct: number; tone: Tone;
}

export function catStats(tools: ToolSummary[]): CategoryStats {
  const s = tools.reduce(
    (a, t) => { a.passed += t.passed; a.failed += t.failed; a.skipped += t.skipped; return a; },
    { passed: 0, failed: 0, skipped: 0 },
  );
  const total = s.passed + s.failed + s.skipped;
  const pct = total ? (s.passed / total) * 100 : 0;
  const tone: Tone = s.failed > 0 ? 'fail' : s.skipped > 0 ? 'warn' : 'ok';
  return { ...s, total, pct, tone };
}

export function toolsByKind(tools: ToolSummary[], kind: ToolKind): ToolSummary[] {
  return tools.filter((t) => t.kind === kind);
}
```

`CategoryHeader`, `HeroCategoryChips`, `SideNav` mirror `design_handoff_category_sidebar/src/category.jsx`'s `CategoryHeader`/`HeroCategoryChips`/`SideNav` 1:1 in markup and class names (`.cat-head`, `.cat-title`, `.cat-count`, `.cat-desc`, `.cat-stats`, `.hero-chips`, `.hero-chip`, `.side-nav`, `.side-title`, `.nm`, `.ct`, `.fl`), typed against `ToolSummary`/`ToolKind` instead of the prototype's untyped mock objects. `ToolCard`, `HeroStrip`, `Topbar`, `DetailHead` (aside from the Back-button change in §5) are unchanged.

## 5. `Overview.tsx` changes

```tsx
const [searchParams, setSearchParams] = useSearchParams();
const activeCat = (searchParams.get('cat') as ToolKind | null) ?? 'all';
const pick = (id: 'all' | ToolKind) =>
  setSearchParams(id === 'all' ? {} : { cat: id }, { replace: false });
```

Render order inside the existing `<div className="fade-in">`:

```
HeroStrip                                   (unchanged)
HeroCategoryChips  tools={tools} onPick={pick}     (new)
section-head "Tools"                        (subtitle → "{tools.length} testing tools · {populatedCategoryCount} test types · click a card to drill in")
<div className="sidebar-layout">
  <SideNav tools={tools} active={activeCat} onPick={pick} />
  <div>
    {populatedActiveKind
      ? <CategorySection kind={populatedActiveKind} tools={tools} runId={runId} />
      : TOOL_KINDS.filter(k => toolsByKind(tools, k).length > 0).map(k => <CategorySection key={k} kind={k} tools={tools} runId={runId} />)}
  </div>
</div>
```

Where `populatedActiveKind` resolves the raw `?cat=` string against both validity and population in one place, so the render logic and the §8 edge-case rule ("unknown/empty category falls back to `all`") can't drift apart:

```ts
const populatedActiveKind: ToolKind | null =
  activeCat !== 'all' && TOOL_KINDS.includes(activeCat as ToolKind) && toolsByKind(tools, activeCat as ToolKind).length > 0
    ? (activeCat as ToolKind)
    : null;
```

`pick` pushes a history entry (default `replace: false`) so Back/Forward through category switches behaves predictably; picking a category is a distinct navigation step, matching the handoff's "opcionalmente reflejar en query param" note taken as the default rather than optional.

## 6. `DetailHead.tsx` change

```tsx
const navigate = useNavigate();
const location = useLocation();
const back = () => {
  if (location.key !== 'default') navigate(-1);
  else navigate(`/runs/${runId}`);
};
```
Replace the `<Link to={...}>` Back control with `<button className="btn ghost" onClick={back}>`. No other markup changes.

## 7. Styling

Append to `apps/dashboard/src/client/styles/styles.css`, under a new `/* v2: category grouping */` comment: `.cat-section`, `.cat-head`, `.cat-title` (+ `h2`), `.cat-count`, `.cat-desc`, `.cat-stats` (+ `b`, `b.pass`, `b.fail`), `.cat-dot` (+ `.ok`/`.warn`/`.fail`), `.hero-chips`, `.hero-chip` (+ `b`, `:hover`), `.sidebar-layout`, `.side-nav` (+ `button`, `.nm`, `.ct`, `.fl`, hover/active states), `.tool-grid.two` — copied verbatim from `design_handoff_category_sidebar/src/styles.css:338-376`, dropping `.pills-bar`/`.pill-btn`/`.variant-switch`.

## 8. Edge cases (already-existing patterns, reused not reinvented)

- **Tool with no report ingested**: `ToolCard`'s existing `missing` handling (`tool.missing === true` → "No data this run" chip, "No report ingested" body) is untouched; such a tool still counts toward its category's tool count but not its `catStats` totals (its `passed/failed/skipped` are already `0` in that state today).
- **Category with zero tools**: never rendered — both the `all` loop and `SideNav` filter on `toolsByKind(tools, kind).length > 0` before rendering a row/section, matching the handoff ("Una categoría sin herramientas no se renderiza").
- **Unknown `?cat=` value** (stale link, hand-edited URL, or a kind that's since lost all its tools): treat as `all` — `toolsByKind` returns `[]`, and the single-category branch only renders when the category is actually populated; anything else falls back to the grouped `all` view.
- **Unknown `toolId` in the URL**: unchanged — existing `ToolDetail`/`NotFound` behavior, not touched by this feature.

## 9. Tests

Mirrors the existing conventions (`test/registry.test.ts` for completeness checks, `test/components/*.test.tsx` with Vitest + React Testing Library for presentational components):

- `test/categories.test.ts` — `CATEGORY_META` has an entry for every `TOOL_KINDS` member; `catStats` tone/pct math (all-pass → `ok`, any skip-no-fail → `warn`, any fail → `fail`; `pct` on an empty array is `0`, not `NaN`).
- `test/components/SideNav.test.tsx` — renders one row per populated category in `TOOL_KINDS` order, "All tools" first; failed-badge only rendered when `failed > 0`; `onPick` called with the clicked row's id.
- `test/components/CategoryHeader.test.tsx` — stats line renders `{total} tests · {pct}% pass · {failed} failed`; dot tone matches `catStats`.
- `test/components/HeroCategoryChips.test.tsx` — one chip per populated category; `onPick` wired.

`Overview.tsx`'s routing/search-param wiring gets no new automated test, consistent with `Overview.tsx`/`ToolDetail.tsx` today (neither has a test file — only their child components and the adapters do); verify manually with `pnpm dashboard`, comparing against `design_handoff_category_sidebar/screenshots/01-overview-all.png` and `02-overview-categoria-web.png` for layout/behavior (not tool density, per §2).

## 10. Implementation order

1. `categories.ts` + its unit test.
2. CSS block (§7) — additive, safe to land alone.
3. `HealthDot`, `CategoryHeader`, `HeroCategoryChips`, `SideNav`, `CategorySection` + their component tests — each only depends on `categories.ts` + existing `ToolCard`/types, so independent of each other.
4. `Overview.tsx` wiring (§5) — depends on step 3's components.
5. `DetailHead.tsx` Back-button change (§6) — independent of steps 1–4, touches a different file.
6. Manual verification: `pnpm dashboard`, click through All tools / single category / tool detail / Back, compare against screenshots 01–02.

Steps 2, 3, and 5 have no dependencies on each other and can be built in parallel; step 4 depends on step 3; step 6 depends on everything.

## 11. Risks / things to flag during implementation

- `location.key !== 'default'` is the React Router v6 idiom for "was this SPA navigation reached via an internal push, or is it the first entry in the tab's history" — confirm behavior in-browser (a direct URL paste into `/runs/:runId/:toolId` should land on `default` and fall back to the `/runs/:runId` link; clicking a card should not).
- `setSearchParams` triggers a re-render of `Overview` but not a re-fetch (the `useEffect` in `Overview.tsx` keys off `runId`, not search params) — verify no redundant `/api/runs/:runId` calls fire on category switch.
- Existing `KIND_LABEL` maps (`ToolCard.tsx`, `DetailHead.tsx`) are separate from the new `CATEGORY_META` (kind → short UI label like "Web UI" vs. kind → category name "Web") — don't conflate or try to unify them, they serve different UI spots with intentionally different strings.
