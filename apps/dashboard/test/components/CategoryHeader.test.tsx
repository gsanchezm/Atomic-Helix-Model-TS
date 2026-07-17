import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { CategoryHeader } from '../../src/client/components/CategoryHeader';
import type { ToolSummary } from '../../src/shared/types';

function tool(id: string, passed: number, failed: number, skipped: number): ToolSummary {
  return { id, kind: 'web_ui', name: id, description: '', passed, failed, skipped, duration: '1m' };
}

describe('CategoryHeader', () => {
  it('renders the category name and description', () => {
    render(<CategoryHeader kind="web_ui" tools={[tool('playwright', 10, 0, 0)]} />);
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('Browser end-to-end suites')).toBeInTheDocument();
  });

  it('shows a singular tool count for one tool', () => {
    render(<CategoryHeader kind="web_ui" tools={[tool('playwright', 10, 0, 0)]} />);
    expect(screen.getByText('1 tool')).toBeInTheDocument();
  });

  it('pluralizes the tool count for multiple tools', () => {
    render(<CategoryHeader kind="web_ui" tools={[tool('playwright', 10, 0, 0), tool('cypress', 5, 0, 0)]} />);
    expect(screen.getByText('2 tools')).toBeInTheDocument();
  });

  it('shows total tests, pass percentage, and failed count', () => {
    render(<CategoryHeader kind="web_ui" tools={[tool('playwright', 7, 2, 1)]} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('70.0%')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('applies fail class to failed-count element when failed > 0', () => {
    const { container } = render(<CategoryHeader kind="web_ui" tools={[tool('playwright', 7, 2, 1)]} />);
    const failedElement = container.querySelector('.cat-stats b.fail');
    expect(failedElement).not.toBeNull();
    expect(failedElement?.textContent).toBe('2');
  });

  it('does not apply fail class when failed is 0', () => {
    const { container } = render(<CategoryHeader kind="web_ui" tools={[tool('playwright', 10, 0, 0)]} />);
    const failedElement = container.querySelector('.cat-stats b.fail');
    expect(failedElement).toBeNull();
  });

  it('formats percentage with correct rounding for non-terminating values', () => {
    render(<CategoryHeader kind="web_ui" tools={[tool('test1', 1, 2, 0)]} />);
    expect(screen.getByText('33.3%')).toBeInTheDocument();
  });
});
