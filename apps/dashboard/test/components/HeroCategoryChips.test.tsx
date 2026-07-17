import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { HeroCategoryChips } from '../../src/client/components/HeroCategoryChips';
import type { ToolSummary } from '../../src/shared/types';

function tool(id: string, kind: ToolSummary['kind'], passed: number, failed: number, skipped: number): ToolSummary {
  return { id, kind, name: id, description: '', passed, failed, skipped, duration: '1m' } as ToolSummary;
}

describe('HeroCategoryChips', () => {
  it('renders one chip per populated category, skipping empty ones', () => {
    const tools = [tool('playwright', 'web_ui', 10, 0, 0), tool('api', 'api', 5, 0, 0)];
    render(<HeroCategoryChips tools={tools} onPick={() => {}} />);
    expect(screen.getByRole('button', { name: /^Web/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^API/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Mobile/ })).toBeNull();
  });

  it("calls onPick with the chip's kind when clicked", () => {
    const onPick = vi.fn();
    const tools = [tool('playwright', 'web_ui', 10, 0, 0)];
    render(<HeroCategoryChips tools={tools} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /^Web/ }));
    expect(onPick).toHaveBeenCalledWith('web_ui');
  });
});
