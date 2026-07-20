import type { PendingMetric } from '../perf-type-meta';

interface PendingMetricsPanelProps {
  items: PendingMetric[];
}

export function PendingMetricsPanel({ items }: PendingMetricsPanelProps) {
  if (items.length === 0) return null;
  return (
    <div className="pending-metrics">
      <div className="pending-metrics-title">Not yet available</div>
      {items.map((item) => (
        <div className="pending-metric-row" key={item.label}>
          <span className="pending-metric-label">{item.label}</span>
          <span className="pending-metric-reason">{item.reason}</span>
        </div>
      ))}
    </div>
  );
}
