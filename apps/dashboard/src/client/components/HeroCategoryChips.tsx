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
