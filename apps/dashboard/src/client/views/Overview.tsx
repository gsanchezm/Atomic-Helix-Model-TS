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
