import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TestList } from '../../src/client/components/TestList';
import type { TestCase } from '../../src/shared/types';

const tests: TestCase[] = [
  {
    name: 'happy path', suite: 'Auth', file: 'auth.feature', dur: '500ms', status: 'passed',
    steps: [{ keyword: 'Given ', name: 'preconditions', status: 'passed', dur: '200ms' }],
  },
  {
    name: 'broken path', suite: 'Auth', file: 'auth.feature', dur: '900ms', status: 'failed', error: 'boom',
    steps: [
      { keyword: 'Given ', name: 'preconditions', status: 'passed', dur: '200ms' },
      { keyword: 'When ',  name: 'broken action', status: 'failed', dur: '700ms', error: 'boom' },
    ],
    failedStepIndex: 1,
  },
];

describe('TestList accordion', () => {
  it('auto-expands failed scenarios on first render', () => {
    render(<TestList tests={tests} filter="all" query="" />);
    expect(screen.getByText(/broken action/)).toBeInTheDocument();
  });

  it('keeps passed scenarios collapsed by default', () => {
    render(<TestList tests={[tests[0]]} filter="all" query="" />);
    expect(screen.queryByText(/preconditions/)).toBeNull();
  });

  it('toggles expansion on click', () => {
    render(<TestList tests={[tests[0]]} filter="all" query="" />);
    fireEvent.click(screen.getByText(/happy path/));
    expect(screen.getByText(/preconditions/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/happy path/));
    expect(screen.queryByText(/preconditions/)).toBeNull();
  });

  it('seeds expansion from the expandScenarioName prop', () => {
    render(<TestList tests={tests} filter="all" query="" expandScenarioName="happy path" />);
    // Both the auto-expanded failed AND the deep-linked passed scenario render their step content.
    // Both scenarios share a step named "preconditions", so getAllByText finds 2 instances when both are open.
    expect(screen.getAllByText(/preconditions/)).toHaveLength(2);
    expect(screen.getByText(/broken action/)).toBeInTheDocument();
  });

  it('falls back to scenario-level error when steps[] is absent', () => {
    const legacy: TestCase[] = [
      { name: 'old test', suite: 'Auth', file: 'auth.feature', dur: '100ms', status: 'failed', error: 'legacy boom' },
    ];
    render(<TestList tests={legacy} filter="all" query="" />);
    expect(screen.getByText(/legacy boom/)).toBeInTheDocument();
  });

  it('renders a Scenario Outline group as one row with an iteration count badge', () => {
    const grouped: TestCase = {
      kind: 'group',
      name: 'Logout label is translated to <language> after market <market>',
      suite: 'Login',
      file: 'login.feature',
      dur: '2.0s',
      status: 'failed',
      iterations: [
        {
          name: 'Logout label is translated to English after market US',
          example: { market: 'US', language: 'English' },
          status: 'passed',
        },
        {
          name: 'Logout label is translated to Spanish after market MX',
          example: { market: 'MX', language: 'Spanish' },
          status: 'failed',
          error: 'boom',
        },
      ],
    };
    render(<TestList tests={[grouped]} filter="all" query="" />);
    expect(screen.getByText(/2 iterations/)).toBeInTheDocument();
    // The group auto-expands because one iteration failed, revealing the iteration rows.
    expect(screen.getByText(/market: MX/)).toBeInTheDocument();
  });

  it('deep-links into a specific iteration inside a group via expandScenarioName', () => {
    const grouped: TestCase = {
      kind: 'group',
      name: 'Logout label is translated to <language> after market <market>',
      suite: 'Login',
      file: 'login.feature',
      dur: '2.0s',
      status: 'passed',
      iterations: [
        {
          name: 'Logout label is translated to English after market US',
          example: { market: 'US', language: 'English' },
          status: 'passed',
          steps: [{ keyword: 'Given ', name: 'the login screen is open', status: 'passed', dur: '10ms' }],
        },
      ],
    };
    render(
      <TestList
        tests={[grouped]}
        filter="all"
        query=""
        expandScenarioName="Logout label is translated to English after market US"
      />,
    );
    expect(screen.getByText(/market: US/)).toBeInTheDocument();
    expect(screen.getByText(/the login screen is open/)).toBeInTheDocument();
  });
});
