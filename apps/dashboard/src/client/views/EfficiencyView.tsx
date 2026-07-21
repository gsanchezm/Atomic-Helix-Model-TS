import { useEffect, useState } from 'react';

import type { EfficiencyRunPoint } from '@shared/types';
import { EFFICIENCY_GROUPS } from '../efficiency-meta';
import { EfficiencyChart, type EfficiencySeries } from '../components/EfficiencyChart';
import { ApiError, fetchEfficiency } from '../api';

// A tab left open on /efficiency during a long orchestrated run would
// otherwise show a permanently-empty page: the mount-once fetch races
// ingest, and nothing ever tells it to look again. Poll at a low rate while
// mounted, and refetch immediately when the tab regains focus/visibility —
// both are cheap (one small JSON GET) and self-correct the stale-empty case
// without the user needing to know to hard-refresh.
const POLL_INTERVAL_MS = 30_000;

export function EfficiencyView() {
  const [points, setPoints] = useState<EfficiencyRunPoint[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    function load() {
      fetchEfficiency(ac.signal)
        .then((data) => {
          if (!cancelled) setPoints(data);
        })
        .catch((err) => {
          if (!cancelled && err.name !== 'AbortError') setError(err);
        });
    }

    load();
    const intervalId = setInterval(load, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      ac.abort();
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
          // A tool can have multiple subtypes in one run (e.g. playwright's
          // desktop + responsive, gatling's smoke/load/stress) — sum them so
          // the series reflects total wall-clock time for the tool, not just
          // whichever subtype happened to be first in the array.
          const matches = run.timings.filter((tm) => tm.tool === tool);
          if (matches.length === 0) return null;
          const durationMs = matches.reduce((sum, tm) => sum + tm.durationMs, 0);
          return { runId: run.runId, durationMs };
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
