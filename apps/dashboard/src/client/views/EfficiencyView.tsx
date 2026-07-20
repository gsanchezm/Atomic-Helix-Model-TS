import { useEffect, useState } from 'react';

import type { EfficiencyRunPoint } from '@shared/types';
import { EFFICIENCY_GROUPS } from '../efficiency-meta';
import { EfficiencyChart, type EfficiencySeries } from '../components/EfficiencyChart';
import { ApiError, fetchEfficiency } from '../api';

export function EfficiencyView() {
  const [points, setPoints] = useState<EfficiencyRunPoint[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchEfficiency(ac.signal)
      .then(setPoints)
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err);
      });
    return () => ac.abort();
  }, []);

  if (error) {
    const detail = error instanceof ApiError ? `${error.status} · ${error.url}` : error.message;
    return (
      <div className="state">
        <div className="title">Couldn't load efficiency data</div>
        <div>{detail}</div>
      </div>
    );
  }
  if (!points) return <div className="state">Loading…</div>;

  // Oldest-first per series, matching EfficiencyChart's expected point order.
  const runsOldestFirst = [...points].reverse();

  function seriesFor(tools: readonly string[]): EfficiencySeries[] {
    return tools.map((tool) => ({
      tool,
      points: runsOldestFirst
        .map((run) => {
          const t = run.timings.find((tm) => tm.tool === tool);
          return t ? { runId: run.runId, durationMs: t.durationMs } : null;
        })
        .filter((p): p is { runId: string; durationMs: number } => p !== null),
    }));
  }

  return (
    <div className="efficiency-view">
      <h1>Tool Efficiency</h1>
      <p className="subtitle">
        Wall-clock execution time per tool, across the last {points.length} run(s). Only
        genuinely comparable tools are charted together.
      </p>
      <div className="efficiency-grid">
        {EFFICIENCY_GROUPS.map((group) => (
          <EfficiencyChart key={group.title} title={group.title} series={seriesFor(group.tools)} />
        ))}
      </div>
    </div>
  );
}
