import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SideNav } from '../../src/client/components/SideNav';
import type { ToolSummary } from '../../src/shared/types';

function tool(id: string, kind: ToolSummary['kind'], passed: number, failed: number, skipped: number): ToolSummary {
  return { id, kind, name: id, description: '', passed, failed, skipped, duration: '1m' } as ToolSummary;
}

const tools = [
  tool('playwright', 'web_ui', 10, 1, 0),
  tool('appium', 'mobile_ui', 5, 0, 0),
];

describe('SideNav', () => {
  it('renders "All tools" first with the total tool count', () => {
    render(<SideNav tools={tools} active="all" onPick={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('All tools');
    expect(buttons[0]).toHaveTextContent('2');
  });

  it('renders one row per populated category, skipping empty ones', () => {
    render(<SideNav tools={tools} active="all" onPick={() => {}} />);
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();
    expect(screen.queryByText('API')).toBeNull();
  });

  it('shows a failed-count badge only when a category has failures', () => {
    render(<SideNav tools={tools} active="all" onPick={() => {}} />);
    const webRow = screen.getByText('Web').closest('button')!;
    expect(webRow.querySelector('.fl')).not.toBeNull();
    expect(webRow.querySelector('.fl')!.textContent).toBe('1');
    const mobileRow = screen.getByText('Mobile').closest('button')!;
    expect(mobileRow.querySelector('.fl')).toBeNull();
  });

  it('marks the active category row', () => {
    render(<SideNav tools={tools} active="mobile_ui" onPick={() => {}} />);
    expect(screen.getByText('Mobile').closest('button')).toHaveClass('active');
    expect(screen.getByText('Web').closest('button')).not.toHaveClass('active');
  });

  it('calls onPick with the clicked category id', () => {
    const onPick = vi.fn();
    render(<SideNav tools={tools} active="all" onPick={onPick} />);
    screen.getByText('Web').closest('button')!.click();
    expect(onPick).toHaveBeenCalledWith('web_ui');
  });

  it('renders category rows in TOOL_KINDS order regardless of input array order', () => {
    // Pass tools in reverse order: api before web_ui
    const toolsReversed = [
      tool('api-client', 'api', 5, 0, 0),
      tool('playwright', 'web_ui', 10, 1, 0),
    ];
    const { container } = render(<SideNav tools={toolsReversed} active="all" onPick={() => {}} />);

    // Get all buttons in DOM order (skip the first "All tools" button)
    const buttons = container.querySelectorAll('.side-nav button');
    expect(buttons.length).toBe(3); // All tools + Web + API

    // First button is "All tools"
    expect(buttons[0]?.textContent).toContain('All tools');

    // Second button should be Web (from TOOL_KINDS order), not API (from input order)
    expect(buttons[1]?.textContent).toContain('Web');

    // Third button should be API
    expect(buttons[2]?.textContent).toContain('API');
  });
});
