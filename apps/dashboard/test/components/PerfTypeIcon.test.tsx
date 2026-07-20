import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { PerfTypeIcon } from '../../src/client/components/PerfTypeIcon';
import { PERF_TEST_TYPES } from '../../src/shared/perf-types';

describe('PerfTypeIcon', () => {
  it('renders an svg for every PerfTestType', () => {
    for (const type of PERF_TEST_TYPES) {
      const { container } = render(<PerfTypeIcon type={type} />);
      expect(container.querySelector('svg')).not.toBeNull();
    }
  });
});
