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
      <button type="button" className={active === 'all' ? 'active' : ''} onClick={() => onPick('all')}>
        <span className="nm">All tools</span>
        <span className="ct">{tools.length}</span>
      </button>
      {TOOL_KINDS.map((kind) => {
        const ts = toolsByKind(tools, kind);
        if (!ts.length) return null;
        const stats = catStats(ts);
        return (
          <button type="button" key={kind} className={active === kind ? 'active' : ''} onClick={() => onPick(kind)}>
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
