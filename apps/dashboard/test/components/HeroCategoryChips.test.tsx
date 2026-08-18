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

  it('renders chips in TOOL_KINDS order regardless of input array order', () => {
    // Pass tools in reverse order: api before web_ui
    const tools = [
      tool('api-client', 'api', 5, 0, 0),
      tool('playwright', 'web_ui', 10, 0, 0),
    ];
    const { container } = render(<HeroCategoryChips tools={tools} onPick={() => {}} />);

    // Get all chips in DOM order
    const chips = container.querySelectorAll('.hero-chip');
    expect(chips.length).toBe(2);

    // First chip should be Web (from TOOL_KINDS order), not API (from input order)
    expect(chips[0]?.textContent).toMatch(/^Web/);
    // Second chip should be API
    expect(chips[1]?.textContent).toMatch(/^API/);
  });
});
