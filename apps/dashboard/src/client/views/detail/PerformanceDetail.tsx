import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { PERF_TEST_TYPES, type PerfTestType } from '@shared/perf-types';
import type { PerfBlock, PerfScenario, Tool } from '@shared/types';

import { DetailHead } from '../../components/DetailHead';
import { PendingMetricsPanel } from '../../components/PendingMetricsPanel';
import { PerfTypeTabs } from '../../components/PerfTypeTabs';
import { Speedometer } from '../../components/Speedometer';
import { FIELD_GAUGE_CONFIG, PERF_TYPE_META } from '../../perf-type-meta';

interface PerformanceDetailProps {
  runId: string;
  tool: Tool;
}

function isPerfTestType(value: string | null): value is PerfTestType {
  return value !== null && (PERF_TEST_TYPES as readonly string[]).includes(value);
}

export function PerformanceDetail({ runId, tool }: PerformanceDetailProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeType, setActiveType] = useState<PerfTestType>(() => {
    const typeParam = searchParams.get('type');
    return isPerfTestType(typeParam) ? typeParam : 'load';
  });

  if (tool.kind !== 'performance') {
    return (
      <div className="state">
        <div className="title">Performance detail view</div>
        <div>
          Tool <code>{tool.id}</code> is not a performance tool.
        </div>
      </div>
    );
  }

  const selectType = (type: PerfTestType) => {
    setActiveType(type);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('type', type);
      return next;
    });
  };

  const activeBlock = tool.byType.find((b) => b.type === activeType);
  const p = activeBlock?.perf ?? null;
  const meta = PERF_TYPE_META[activeType];
  const noData = tool.missing === true || p === null || p.requests === 0;
  const maxDist = p && p.distribution.length ? Math.max(...p.distribution.map((d) => d.pct)) : 1;

  return (
    <div className="detail fade-in">
      <DetailHead
        runId={runId}
        tool={tool}
        right={
          <>
            <span className="pill">⏱ {tool.duration}</span>
            <button className="btn ghost">Download HAR</button>
          </>
        }
      />

      <PerfTypeTabs byType={tool.byType} active={activeType} onSelect={selectType} />

      <div className="panel">
        <h3>{meta.label} gauges</h3>
        {noData ? (
          <div className="empty">No data generated for {meta.label} in this run.</div>
        ) : (
          <div className="gauge-grid">
            {meta.gauges.map((g) => (
              <PerfFieldTile key={g.field} label={g.label} field={g.field} perf={p as PerfBlock} />
            ))}
          </div>
        )}
        <PendingMetricsPanel items={meta.pending} />
      </div>

      {!noData && p && (
        <div className="perf-grid">
          <div className="panel">
            <h3>Response time distribution</h3>
            {p.distribution.map((d, i) => (
              <div className="dist-row" key={i}>
                <div className="pct">{d.label}</div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: (d.pct / maxDist) * 100 + '%' }}
                  />
                </div>
                <div className="ms">{d.pct}%</div>
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 14,
                fontSize: 12,
                color: 'var(--text-mute)',
                fontFamily: 'var(--mono)',
              }}
            >
              <span>Total requests: {p.requests.toLocaleString()}</span>
              <span>P99: {p.p99Ms}ms</span>
            </div>
          </div>

          <div className="panel">
            <h3>Simulations</h3>
            <div className="sim-list">
              {p.scenarios.map((sim, i) => (
                <SimulationCard key={i} sim={sim} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PerfFieldTile({ label, field, perf }: { label: string; field: keyof PerfBlock; perf: PerfBlock }) {
  const config = FIELD_GAUGE_CONFIG[field];
  const value = perf[field] as number;

  if (!config || config.kind === 'stat') {
    return (
      <div className="gauge">
        <div className="label">{label}</div>
        <div className="value">{value.toLocaleString()}</div>
        <div className="unit">{config?.unit ?? ''}</div>
      </div>
    );
  }

  const max = config.maxField ? (perf[config.maxField] as number) : config.max!;
  const thresholdGood = config.thresholdGoodFactor ? max * config.thresholdGoodFactor : config.thresholdGood!;
  const thresholdBad = config.thresholdBadFactor ? max * config.thresholdBadFactor : config.thresholdBad!;

  return (
    <Speedometer
      label={label}
      value={value}
      max={max}
      unit={config.unit}
      invert={config.invert}
      thresholdGood={thresholdGood}
      thresholdBad={thresholdBad}
    />
  );
}

function SimulationCard({ sim }: { sim: PerfScenario }) {
  const [open, setOpen] = useState(sim.errors > 0);
  const hasSteps = Boolean(sim.steps && sim.steps.length);
  return (
    <div className={`scenario-card${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="scenario-card-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={'icon-dot ' + (sim.errors > 1 ? 'failed' : sim.errors > 0.3 ? 'skipped' : 'passed')} />
        <span className="name">{sim.name}</span>
        <span className="meta">{sim.rps} rps · p95 {sim.p95}ms · err {sim.errors}%</span>
        <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && hasSteps && (
        <div className="scenario-card-body">
          <table className="sim-steps">
            <thead>
              <tr><th>Step</th><th>RPS</th><th>P95 (ms)</th><th>%KO</th></tr>
            </thead>
            <tbody>
              {[...(sim.steps ?? [])].sort((a, b) => b.errors - a.errors).map((s, idx) => (
                <tr key={idx} className={s.errors > 0 ? 'sim-step-bad' : undefined}>
                  <td>{s.name}</td>
                  <td>{s.rps}</td>
                  <td>{s.p95}</td>
                  <td>{s.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && !hasSteps && (
        <div className="scenario-card-body empty">No per-request breakdown available.</div>
      )}
    </div>
  );
}
