export interface EfficiencySeriesPoint {
  runId: string;
  durationMs: number;
}

export interface EfficiencySeries {
  tool: string;
  points: EfficiencySeriesPoint[]; // oldest-first
}

interface EfficiencyChartProps {
  series: EfficiencySeries[];
  title: string;
}

const PALETTE = [
  'oklch(0.72 0.15 295)', // primary purple, matches the existing gauge gradient start
  'oklch(0.78 0.15 330)', // secondary pink, matches the gauge gradient end
];

const WIDTH = 480;
const HEIGHT = 160;
const PAD = 28;

export function EfficiencyChart({ series, title }: EfficiencyChartProps) {
  const withData = series.filter((s) => s.points.length > 0);

  if (withData.length === 0) {
    return (
      <div className="efficiency-chart">
        <div className="label">{title}</div>
        <div className="empty" style={{ height: HEIGHT }}>No data</div>
      </div>
    );
  }

  const allDurations = withData.flatMap((s) => s.points.map((p) => p.durationMs));
  const maxMs = Math.max(...allDurations, 1);
  const maxPoints = Math.max(...withData.map((s) => s.points.length), 1);

  const x = (i: number) => (maxPoints === 1 ? WIDTH / 2 : PAD + (i / (maxPoints - 1)) * (WIDTH - 2 * PAD));
  const y = (ms: number) => HEIGHT - PAD - (ms / maxMs) * (HEIGHT - 2 * PAD);

  return (
    <div className="efficiency-chart">
      <div className="label">{title}</div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT}>
        {withData.map((s, si) => {
          const color = PALETTE[si % PALETTE.length];
          const pts = s.points.map((p, i) => [x(i), y(p.durationMs)] as const);
          return (
            <g key={s.tool}>
              {pts.length > 1 && (
                <polyline
                  points={pts.map(([px, py]) => `${px},${py}`).join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                />
              )}
              {pts.map(([px, py], i) => (
                <circle key={i} cx={px} cy={py} r={4} fill={color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {withData.map((s, si) => (
          <span key={s.tool} className="legend-item">
            <span className="swatch" style={{ background: PALETTE[si % PALETTE.length] }} />
            {s.tool}
          </span>
        ))}
      </div>
    </div>
  );
}
