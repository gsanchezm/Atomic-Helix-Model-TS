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
