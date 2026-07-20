import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PerfTypeTabs } from '../../src/client/components/PerfTypeTabs';
import { PERF_TEST_TYPES } from '../../src/shared/perf-types';
import type { PerfBlock, PerfTypeBlock } from '../../src/shared/types';

function emptyPerf(): PerfBlock {
  return {
    rps: 10, avgMs: 10, p75Ms: 10, p95Ms: 10, p99Ms: 10, maxMs: 10,
    errorRate: 0, requests: 10, maxRps: 20, distribution: [],
    scenarios: [{ name: 'checkout-load', rps: 10, p95: 10, errors: 0 }],
  };
}

const byType: PerfTypeBlock[] = PERF_TEST_TYPES.map((type) => ({
  type,
  perf: type === 'load' ? emptyPerf() : null,
}));

describe('PerfTypeTabs', () => {
  it('renders one button per PerfTestType in fixed order', () => {
    render(<PerfTypeTabs byType={byType} active="load" onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(6);
    expect(buttons[0]).toHaveTextContent('Load');
    expect(buttons[5]).toHaveTextContent('Volume');
  });

  it('shows a "N runs" badge from the scenario count, 0 when perf is null', () => {
    render(<PerfTypeTabs byType={byType} active="load" onSelect={() => {}} />);
    expect(screen.getByText('Load').closest('button')).toHaveTextContent('1 runs');
    expect(screen.getByText('Stress').closest('button')).toHaveTextContent('0 runs');
  });

  it('marks the active tab', () => {
    render(<PerfTypeTabs byType={byType} active="stress" onSelect={() => {}} />);
    expect(screen.getByText('Stress').closest('button')).toHaveClass('active');
    expect(screen.getByText('Load').closest('button')).not.toHaveClass('active');
  });

  it('calls onSelect with the clicked type', () => {
    const onSelect = vi.fn();
    render(<PerfTypeTabs byType={byType} active="load" onSelect={onSelect} />);
    screen.getByText('Stress').closest('button')!.click();
    expect(onSelect).toHaveBeenCalledWith('stress');
  });
});
