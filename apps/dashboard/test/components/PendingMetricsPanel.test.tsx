import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PendingMetricsPanel } from '../../src/client/components/PendingMetricsPanel';

describe('PendingMetricsPanel', () => {
  it('renders one row per item with label and reason', () => {
    render(
      <PendingMetricsPanel
        items={[
          { label: 'Breaking point', reason: 'needs time-series' },
          { label: 'Recovery time', reason: 'needs time-series' },
        ]}
      />,
    );
    expect(screen.getByText('Breaking point')).toBeInTheDocument();
    expect(screen.getAllByText('needs time-series')).toHaveLength(2);
  });

  it('renders nothing when items is empty', () => {
    const { container } = render(<PendingMetricsPanel items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
