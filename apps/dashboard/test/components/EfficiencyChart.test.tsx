import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { EfficiencyChart } from '../../src/client/components/EfficiencyChart';

const oneSeries = [{ tool: 'gatling', points: [{ runId: 'r1', durationMs: 90000 }] }];
const twoSeries = [
  { tool: 'playwright', points: [{ runId: 'r1', durationMs: 200000 }, { runId: 'r2', durationMs: 210000 }] },
  { tool: 'webdriverio', points: [{ runId: 'r1', durationMs: 300000 }, { runId: 'r2', durationMs: 290000 }] },
];

describe('EfficiencyChart', () => {
  it('renders the title', () => {
    render(<EfficiencyChart series={oneSeries} title="Performance: Gatling" />);
    expect(screen.getByText('Performance: Gatling')).toBeInTheDocument();
  });

  it('renders a single marker with no line for a lone data point', () => {
    const { container } = render(<EfficiencyChart series={oneSeries} title="t" />);
    expect(container.querySelectorAll('circle').length).toBe(1);
    expect(container.querySelectorAll('polyline').length).toBe(0);
  });

  it('renders one polyline per series for multi-point data', () => {
    const { container } = render(<EfficiencyChart series={twoSeries} title="t" />);
    expect(container.querySelectorAll('polyline').length).toBe(2);
    expect(container.querySelectorAll('circle').length).toBe(4);
  });

  it('renders an empty state for an empty series list', () => {
    render(<EfficiencyChart series={[]} title="t" />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it('renders an empty state when every series has zero points', () => {
    render(<EfficiencyChart series={[{ tool: 'zap', points: [] }]} title="t" />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});
