import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { CategorySection } from '../../src/client/components/CategorySection';
import type { WebUiTool, ApiTool, ToolSummary } from '../../src/shared/types';

function toolWebUi(id: string, passed: number, failed: number, skipped: number): Omit<WebUiTool, 'tests' | 'browsers' | 'viewports'> {
  return { id, kind: 'web_ui', name: id, description: '', passed, failed, skipped, duration: '3m 0s' };
}

function toolApi(id: string, passed: number, failed: number, skipped: number): Omit<ApiTool, 'tests'> {
  return { id, kind: 'api', name: id, description: '', passed, failed, skipped, duration: '3m 0s' };
}

describe('CategorySection', () => {
  it('renders a CategoryHeader and only the tools of the given kind, in a two-column grid', () => {
    const tools: ToolSummary[] = [
      toolWebUi('playwright', 10, 0, 0),
      toolWebUi('cypress', 5, 0, 0),
      toolApi('api', 3, 0, 0),
    ];
    const { container } = render(
      <MemoryRouter>
        <CategorySection kind="web_ui" tools={tools} runId="r1" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('playwright')).toBeInTheDocument();
    expect(screen.getByText('cypress')).toBeInTheDocument();
    expect(screen.queryByText('api')).toBeNull();
    expect(container.querySelector('.tool-grid.two')).not.toBeNull();
  });
});
