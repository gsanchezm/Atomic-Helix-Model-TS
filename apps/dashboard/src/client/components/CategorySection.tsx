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
