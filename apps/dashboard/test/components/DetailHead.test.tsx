import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';

import { DetailHead } from '../../src/client/components/DetailHead';
import type { Tool } from '../../src/shared/types';

const tool: Tool = {
  id: 'playwright', kind: 'web_ui', name: 'Playwright', description: 'End-to-end tests',
  passed: 10, failed: 0, skipped: 0, duration: '1m', tests: [],
};

function OverviewMarker() {
  const [params] = useSearchParams();
  return <div>Overview marker cat={params.get('cat') ?? 'none'}</div>;
}

function renderAt(entries: string[], initialIndex: number) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
      <Routes>
        <Route path="/runs/:runId" element={<OverviewMarker />} />
        <Route path="/runs/:runId/:toolId" element={<DetailHead runId="r1" tool={tool} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DetailHead Back navigation', () => {
  it('goes back in browser history, restoring the category that was selected on Overview', () => {
    renderAt(['/runs/r1?cat=web_ui', '/runs/r1/playwright'], 1);
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Overview marker cat=web_ui')).toBeInTheDocument();
  });

  it('falls back to the plain run overview when there is no in-app history (direct link)', () => {
    renderAt(['/runs/r1/playwright'], 0);
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Overview marker cat=none')).toBeInTheDocument();
  });
});
