import { useMemo, useState } from 'react';

import type { A11yAudit, A11yViolation, Tool } from '@shared/types';
import { DetailHead } from '../../components/DetailHead';
import { KpiStrip } from '../../components/KpiStrip';

interface AccessibilityDetailProps {
  runId: string;
  tool: Tool;
}

/** Impact buckets in render order (worst first). `unknown` collects null impacts. */
const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor', 'unknown'] as const;
type ImpactBucket = (typeof IMPACT_ORDER)[number];

const IMPACT_COLOR: Record<ImpactBucket, string> = {
  critical: 'var(--fail)',
  serious:  'oklch(0.72 0.18 50)',
  moderate: 'var(--skip)',
  minor:    'var(--text-mute)',
  unknown:  'var(--text-dim)',
};

interface FlatViolation {
  violation: A11yViolation;
  audit: A11yAudit;
}

function impactBucket(v: A11yViolation): ImpactBucket {
  return v.impact ?? 'unknown';
}

/** Detail view for the `accessibility` kind (axe-core): violations grouped by impact. */
export function AccessibilityDetail({ runId, tool }: AccessibilityDetailProps) {
  if (tool.kind !== 'accessibility') {
    return (
      <div className="state">
        <div className="title">AccessibilityDetail received an unexpected tool kind</div>
        <div>
          <code>{tool.kind}</code>
        </div>
      </div>
    );
  }

  const audits = tool.audits;

  const flat = useMemo<FlatViolation[]>(
    () => audits.flatMap((audit) => audit.violations.map((violation) => ({ violation, audit }))),
    [audits],
  );

  const grouped = useMemo(() => {
    const map = new Map<ImpactBucket, FlatViolation[]>();
    for (const bucket of IMPACT_ORDER) map.set(bucket, []);
    for (const fv of flat) map.get(impactBucket(fv.violation))!.push(fv);
    return map;
  }, [flat]);

  const totals = useMemo(() => {
    const blocking = flat.filter((fv) => fv.violation.impact === 'critical' || fv.violation.impact === 'serious').length;
    const advisory = flat.filter((fv) => fv.violation.impact === 'moderate' || fv.violation.impact === 'minor').length;
    return {
      violations: flat.length,
      blocking,
      advisory,
      passes: audits.reduce((a, r) => a + r.passes, 0),
      incomplete: audits.reduce((a, r) => a + r.incomplete, 0),
    };
  }, [flat, audits]);

  const noData = tool.missing === true || audits.length === 0;

  return (
    <div className="detail fade-in">
      <DetailHead
        runId={runId}
        tool={tool}
        right={
          <span className="pill" style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>
            {audits.length} audit{audits.length === 1 ? '' : 's'}
          </span>
        }
      />

      <KpiStrip
        items={[
          { label: 'Pages audited',      value: audits.length },
          { label: 'Violations',         value: totals.violations, tone: totals.violations > 0 ? 'fail' : 'pass' },
          { label: 'Critical + Serious', value: totals.blocking, tone: 'fail', sub: 'gate: must be zero' },
          { label: 'Moderate + Minor',   value: totals.advisory, tone: 'skip', sub: 'advisory' },
          { label: 'Rules passed',       value: totals.passes, tone: 'pass' },
          { label: 'Incomplete',         value: totals.incomplete, sub: 'needs manual review' },
        ]}
      />

      <div className="panel">
        <h3>Violations by impact</h3>
        {noData ? (
          <div className="empty">No data generated for this tool in this run.</div>
        ) : flat.length === 0 ? (
          <div className="empty">No accessibility violations — every audited page passed axe.</div>
        ) : (
          IMPACT_ORDER.map((bucket) => {
            const items = grouped.get(bucket)!;
            if (items.length === 0) return null;
            return <ImpactGroup key={bucket} bucket={bucket} items={items} />;
          })
        )}
      </div>
    </div>
  );
}

function ImpactGroup({ bucket, items }: { bucket: ImpactBucket; items: FlatViolation[] }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 8px' }}>
        <ImpactBadge bucket={bucket} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--text-mute)' }}>
          {items.length} violation{items.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="tests">
        {items.map((fv, i) => (
          <ViolationRow key={`${fv.audit.auditId}:${fv.violation.id}:${i}`} fv={fv} />
        ))}
      </div>
    </div>
  );
}

function ImpactBadge({ bucket, small }: { bucket: ImpactBucket; small?: boolean }) {
  return (
    <span
      className="pill"
      style={{
        color: IMPACT_COLOR[bucket],
        borderColor: 'currentColor',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontSize: small ? 10 : 11,
        fontWeight: 700,
      }}
    >
      {bucket}
    </span>
  );
}

function ViolationRow({ fv }: { fv: FlatViolation }) {
  const [open, setOpen] = useState(false);
  const { violation: v, audit } = fv;
  const bucket = impactBucket(v);

  return (
    <div className="test-row-group">
      <button
        type="button"
        className={`test-row test-row-toggle${open ? ' is-open' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="icon-dot failed" style={{ background: IMPACT_COLOR[bucket] }} />
        <div>
          <div className="name">
            <code style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{v.id}</code> — {v.help}
          </div>
          <div className="file">{audit.feature} · {audit.url}</div>
        </div>
        <div className="suite">{audit.auditId}</div>
        <div className="dur">{v.nodes.length} node{v.nodes.length === 1 ? '' : 's'}</div>
        <div>
          <ImpactBadge bucket={bucket} small />
        </div>
        <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="test-row-body">
          <div style={{ fontSize: 13, color: 'var(--text-mute)', marginBottom: 10 }}>
            {v.description}
            {v.helpUrl && (
              <>
                {' '}
                <a
                  href={v.helpUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--primary-3)', textDecoration: 'underline' }}
                >
                  Rule documentation ↗
                </a>
              </>
            )}
          </div>
          {v.tags && v.tags.length > 0 && (
            <div className="chips" style={{ marginBottom: 10 }}>
              {v.tags.map((t) => (
                <span key={t} className="chip">{t}</span>
              ))}
            </div>
          )}
          {v.nodes.map((n, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mute)' }}>
                {n.target.join(' ')}
              </div>
              <pre className="failure" style={{ marginTop: 6 }}>
                {n.html}
                {'\n\n'}
                {n.failureSummary}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
