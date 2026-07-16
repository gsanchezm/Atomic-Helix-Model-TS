import { useState } from 'react';

import type {
  MobileSecurityTool,
  MobsfPlatformBlock,
  SecurityGate,
  Tool,
  WebSecurityTool,
  ZapScanBlock,
} from '@shared/types';
import { DetailHead } from '../../components/DetailHead';
import { KpiStrip } from '../../components/KpiStrip';
import { PlatformLogo } from '../../components/ToolLogo';

interface SecurityDetailProps {
  runId: string;
  tool: Tool;
}

/**
 * Detail view for the `security` kind. Two tools share it:
 *  - mobsf (`scope: 'mobile'`) → Android/iOS sub-tabs, mirroring MobileDetail.
 *  - zap (`scope: 'web'`)      → risk-grouped alert tables + TLS / schema-fuzz gates.
 */
export function SecurityDetail({ runId, tool }: SecurityDetailProps) {
  if (tool.kind !== 'security') {
    return (
      <div className="state">
        <div className="title">SecurityDetail received an unexpected tool kind</div>
        <div>
          <code>{tool.kind}</code>
        </div>
      </div>
    );
  }

  return tool.scope === 'mobile' ? (
    <MobsfDetail runId={runId} tool={tool} />
  ) : (
    <ZapDetail runId={runId} tool={tool} />
  );
}

/* ═══════════════════════════ ZAP (web scope) ═══════════════════════════ */

const RISK_ORDER = ['High', 'Medium', 'Low', 'Informational'] as const;

const RISK_COLOR: Record<string, string> = {
  High:          'var(--fail)',
  Medium:        'oklch(0.72 0.18 50)',
  Low:           'var(--skip)',
  Informational: 'var(--text-mute)',
};

function riskCount(block: ZapScanBlock | null, risk: string): number {
  return block?.byRisk[risk] ?? 0;
}

function ZapDetail({ runId, tool }: { runId: string; tool: WebSecurityTool }) {
  const scans: { id: string; label: string; block: ZapScanBlock | null }[] = [
    { id: 'baseline', label: 'Baseline scan (passive crawl)', block: tool.baseline },
    { id: 'apiScan',  label: 'API scan (active)',             block: tool.apiScan },
  ];

  const totalsByRisk = RISK_ORDER.map((risk) => ({
    risk,
    count: riskCount(tool.baseline, risk) + riskCount(tool.apiScan, risk),
  }));

  const noData =
    tool.missing === true ||
    (!tool.baseline && !tool.apiScan && !tool.tls && !tool.schemaFuzz);

  return (
    <div className="detail fade-in">
      <DetailHead
        runId={runId}
        tool={tool}
        right={
          <span className="pill" style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>
            {tool.targetUrl}
          </span>
        }
      />

      <KpiStrip
        items={[
          { label: 'High',          value: totalsByRisk[0].count, tone: 'fail', sub: 'gate: must be zero' },
          { label: 'Medium',        value: totalsByRisk[1].count, tone: 'fail' },
          { label: 'Low',           value: totalsByRisk[2].count, tone: 'skip' },
          { label: 'Informational', value: totalsByRisk[3].count },
          { label: 'TLS check',     value: gateLabel(tool.tls),        tone: gateTone(tool.tls) },
          { label: 'Schema fuzz',   value: gateLabel(tool.schemaFuzz), tone: gateTone(tool.schemaFuzz) },
        ]}
      />

      {noData ? (
        <div className="panel">
          <h3>Security alerts</h3>
          <div className="empty">No data generated for this tool in this run.</div>
        </div>
      ) : (
        <>
          {scans.map(({ id, label, block }) => (
            <div className="panel" key={id}>
              <h3>{label}</h3>
              {block === null ? (
                <div className="empty">This scan did not run.</div>
              ) : block.findings.length === 0 ? (
                <div className="empty">No alerts raised by this scan.</div>
              ) : (
                <ZapAlertTable block={block} />
              )}
            </div>
          ))}

          <div className="panel">
            <h3>Infrastructure gates</h3>
            <GateRow name="TLS configuration"  gate={tool.tls} />
            <GateRow name="API schema fuzzing" gate={tool.schemaFuzz} />
          </div>
        </>
      )}
    </div>
  );
}

function ZapAlertTable({ block }: { block: ZapScanBlock }) {
  return (
    <>
      {RISK_ORDER.map((risk) => {
        const findings = block.findings.filter((f) => f.risk === risk);
        if (findings.length === 0) return null;
        return (
          <div key={risk} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 6px' }}>
              <SeverityPill label={risk} color={RISK_COLOR[risk]} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--text-mute)' }}>
                {findings.length} alert{findings.length === 1 ? '' : 's'}
              </span>
            </div>
            <SimpleTable
              head={['Alert', 'Confidence', 'Instances']}
              widths={['1fr', '160px', '110px']}
              rows={findings.map((f) => [
                f.name,
                f.confidence,
                <span key="n" style={{ fontFamily: 'var(--mono)' }}>{f.instances}</span>,
              ])}
            />
          </div>
        );
      })}
      {/* Findings whose risk word isn't one of the four canonical buckets. */}
      {block.findings.some((f) => !RISK_ORDER.includes(f.risk as (typeof RISK_ORDER)[number])) && (
        <SimpleTable
          head={['Alert (unrecognized risk)', 'Confidence', 'Instances']}
          widths={['1fr', '160px', '110px']}
          rows={block.findings
            .filter((f) => !RISK_ORDER.includes(f.risk as (typeof RISK_ORDER)[number]))
            .map((f) => [`${f.name} (${f.risk})`, f.confidence, String(f.instances)])}
        />
      )}
    </>
  );
}

function gateLabel(gate: SecurityGate | null): string {
  if (!gate) return '—';
  return gate.pass ? 'PASS' : 'FAIL';
}

function gateTone(gate: SecurityGate | null): 'pass' | 'fail' | undefined {
  if (!gate) return undefined;
  return gate.pass ? 'pass' : 'fail';
}

function GateRow({ name, gate }: { name: string; gate: SecurityGate | null }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 90px 1fr',
        gap: 14,
        alignItems: 'center',
        padding: '10px 4px',
        borderBottom: '1px solid var(--line-soft)',
      }}
    >
      <div style={{ fontWeight: 600 }}>{name}</div>
      {gate === null ? (
        <span className="pill" style={{ color: 'var(--text-dim)' }}>not run</span>
      ) : (
        <SeverityPill
          label={gate.pass ? 'PASS' : 'FAIL'}
          color={gate.pass ? 'var(--pass)' : 'var(--fail)'}
        />
      )}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mute)' }}>
        {gate ? (
          <>
            {gate.reportPath}
            {typeof gate.findingsCount === 'number' && ` · ${gate.findingsCount} finding${gate.findingsCount === 1 ? '' : 's'}`}
          </>
        ) : (
          '—'
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════ MobSF (mobile scope) ═══════════════════════ */

const MOBSF_SEVERITY_ORDER = ['high', 'warning', 'info', 'secure'] as const;

const MOBSF_SEVERITY_COLOR: Record<string, string> = {
  high:    'var(--fail)',
  warning: 'var(--skip)',
  info:    'var(--text-mute)',
  secure:  'var(--pass)',
};

function MobsfDetail({ runId, tool }: { runId: string; tool: MobileSecurityTool }) {
  const tabs = [
    { id: 'android' as const, label: 'Android', block: tool.platforms.android },
    { id: 'ios' as const,     label: 'iOS',     block: tool.platforms.ios },
  ];
  const [activeId, setActiveId] = useState<'android' | 'ios'>(
    tool.platforms.android ? 'android' : tool.platforms.ios ? 'ios' : 'android',
  );
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <div className="detail fade-in">
      <DetailHead
        runId={runId}
        tool={tool}
        right={
          <span className="pill" style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>
            static analysis
          </span>
        }
      />

      <div className="panel" style={{ paddingBottom: 14 }}>
        <div className="platform-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === active.id ? 'active' : ''}
              onClick={() => setActiveId(t.id)}
            >
              <PlatformLogo platform={t.id} size={20} /> {t.label}
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: 'var(--text-mute)',
                  marginLeft: 4,
                }}
              >
                {t.block ? `${t.block.findings.length} findings` : 'not scanned'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <MobsfPlatformPanel key={active.id} label={active.label} block={active.block} toolMissing={tool.missing} />
    </div>
  );
}

function MobsfPlatformPanel({
  label,
  block,
  toolMissing,
}: {
  label: string;
  block: MobsfPlatformBlock | null;
  toolMissing?: boolean;
}) {
  if (toolMissing || block === null) {
    return (
      <div className="panel">
        <h3>{label} scan</h3>
        <div className="empty">No MobSF scan for {label} in this run.</div>
      </div>
    );
  }

  const score = block.securityScore;
  const scoreTone: 'pass' | 'fail' | 'skip' | undefined =
    score === null ? undefined : score >= 70 ? 'pass' : score >= 40 ? 'skip' : 'fail';

  return (
    <>
      <KpiStrip
        items={[
          { label: 'Security score', value: score === null ? '—' : `${score}/100`, tone: scoreTone, sub: 'MobSF app score' },
          { label: 'High',    value: block.high,    tone: 'fail', sub: 'gate: must be zero' },
          { label: 'Warning', value: block.warning, tone: 'skip' },
          { label: 'Info',    value: block.info },
          { label: 'Binary',  value: block.appFile },
        ]}
      />

      <div className="panel">
        <h3>{label} findings by severity</h3>
        {block.findings.length === 0 ? (
          <div className="empty">No findings reported for this binary.</div>
        ) : (
          MOBSF_SEVERITY_ORDER.map((sev) => {
            const items = block.findings.filter((f) => f.severity === sev);
            if (items.length === 0) return null;
            return (
              <div key={sev} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 6px' }}>
                  <SeverityPill label={sev} color={MOBSF_SEVERITY_COLOR[sev]} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--text-mute)' }}>
                    {items.length} finding{items.length === 1 ? '' : 's'}
                  </span>
                </div>
                <SimpleTable
                  head={['Finding', 'Description']}
                  widths={['minmax(220px, 1fr)', '1.4fr']}
                  rows={items.map((f) => [
                    <span key="t" style={{ fontWeight: 600 }}>{f.title}</span>,
                    <span key="d" style={{ color: 'var(--text-mute)' }}>{f.description ?? '—'}</span>,
                  ])}
                />
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════ Shared bits ════════════════════════════════ */

function SeverityPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="pill"
      style={{
        color,
        borderColor: 'currentColor',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

function SimpleTable({
  head,
  widths,
  rows,
}: {
  head: string[];
  widths: string[];
  rows: React.ReactNode[][];
}) {
  const gridTemplateColumns = widths.join(' ');
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns,
          gap: 14,
          padding: '6px 4px',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-dim)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        {head.map((h) => (
          <div key={h}>{h}</div>
        ))}
      </div>
      {rows.map((cells, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns,
            gap: 14,
            padding: '9px 4px',
            fontSize: 13,
            alignItems: 'baseline',
            borderBottom: '1px solid var(--line-soft)',
          }}
        >
          {cells.map((c, j) => (
            <div key={j}>{c}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
