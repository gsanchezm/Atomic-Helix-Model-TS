import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { HealthDot } from '../../src/client/components/HealthDot';

describe('HealthDot', () => {
  it.each(['ok', 'warn', 'fail'] as const)('renders the %s tone as a cat-dot class', (tone) => {
    const { container } = render(<HealthDot tone={tone} />);
    const dot = container.querySelector('span');
    expect(dot).not.toBeNull();
    expect(dot!.className).toBe(`cat-dot ${tone}`);
  });
});
