import { useMemo, useState, useEffect } from 'react';

import type { TestCase, TestCaseIteration } from '@shared/types';
import { isTestCaseGroup } from '@shared/types';
import { StepList } from './StepList';
import { FailureScreenshot } from './FailureScreenshot';
import type { TestFilter } from './FilterBar';

interface TestListProps {
  tests: TestCase[];
  filter: TestFilter;
  query: string;
  /** When set, the row whose `name` matches starts expanded in addition to the auto-expanded failed rows. */
  expandScenarioName?: string | null;
}

const keyOf = (t: TestCase, i: number) => `${t.file}:${t.name}:${i}`;
const iterationKeyOf = (groupKey: string, iterIndex: number) => `${groupKey}:${iterIndex}`;

function iterationMatches(iteration: TestCaseIteration, expandScenarioName?: string | null): boolean {
  return !!expandScenarioName && iteration.name === expandScenarioName;
}

export function TestList({ tests, filter, query, expandScenarioName }: TestListProps) {
  const q = query.toLowerCase();
  const filtered = tests
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => {
      if (filter !== 'all' && t.status !== filter) return false;
      if (q && !`${t.name} ${t.suite} ${t.file}`.toLowerCase().includes(q)) return false;
      return true;
    });

  const initial = useMemo(() => {
    const set = new Set<string>();
    tests.forEach((t, i) => {
      const k = keyOf(t, i);
      if (t.status === 'failed') set.add(k);
      if (expandScenarioName && t.name === expandScenarioName) set.add(k);
      if (isTestCaseGroup(t)) {
        t.iterations.forEach((iteration, iterIndex) => {
          if (iteration.status === 'failed' || iterationMatches(iteration, expandScenarioName)) {
            set.add(k); // a failed/deep-linked iteration implies the group row must be open too
            set.add(iterationKeyOf(k, iterIndex));
          }
        });
      }
    });
    return set;
  }, [tests, expandScenarioName]);

  const [expanded, setExpanded] = useState<Set<string>>(initial);

  // Reseed when the test set or the deep-link target changes.
  useEffect(() => { setExpanded(initial); }, [initial]);

  if (!filtered.length) {
    return <div className="empty">No tests match this filter.</div>;
  }

  const toggle = (k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  return (
    <div className="tests">
      {filtered.map(({ t, i }) => {
        const k = keyOf(t, i);
        const isOpen = expanded.has(k);
        return (
          <div className="test-row-group" key={k}>
            <button
              type="button"
              className={`test-row test-row-toggle${isOpen ? ' is-open' : ''}`}
              aria-expanded={isOpen}
              onClick={() => toggle(k)}
            >
              <span className={'icon-dot ' + t.status} />
              <div>
                <div className="name">{t.name}</div>
                <div className="file">{t.file}</div>
              </div>
              <div className="suite">{t.suite}</div>
              <div className="dur">{t.dur}</div>
              <div>
                <span className={'test-status ' + t.status}>{t.status}</span>
                {isTestCaseGroup(t) && (
                  <span className="pill outline-count">{t.iterations.length} iterations</span>
                )}
              </div>
              <span className="chev">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="test-row-body">
                {isTestCaseGroup(t) ? (
                  <div className="outline-iterations">
                    {t.iterations.map((iteration, iterIndex) => {
                      const ik = iterationKeyOf(k, iterIndex);
                      const iterOpen = expanded.has(ik);
                      return (
                        <div className="test-row-group" key={ik}>
                          <button
                            type="button"
                            className={`test-row test-row-toggle iteration-row${iterOpen ? ' is-open' : ''}`}
                            aria-expanded={iterOpen}
                            onClick={() => toggle(ik)}
                          >
                            <span className={'icon-dot ' + iteration.status} />
                            <div>
                              <div className="name">
                                {Object.entries(iteration.example).map(([key, value]) => `${key}: ${value}`).join(' · ')}
                              </div>
                            </div>
                            <div className="dur">{iteration.status}</div>
                            <span className="chev">{iterOpen ? '▾' : '▸'}</span>
                          </button>
                          {iterOpen && (
                            <div className="test-row-body">
                              {iteration.steps && iteration.steps.length > 0
                                ? <StepList steps={iteration.steps} failedStepIndex={iteration.failedStepIndex} />
                                : iteration.error
                                  ? <pre className="failure">{iteration.error}</pre>
                                  : <div className="empty">No step data captured for this run.</div>}
                              {iteration.screenshot && <FailureScreenshot src={iteration.screenshot} />}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    {t.steps && t.steps.length > 0
                      ? <StepList steps={t.steps} failedStepIndex={t.failedStepIndex} />
                      : t.error
                        ? <pre className="failure">{t.error}</pre>
                        : <div className="empty">No step data captured for this run.</div>}
                    {t.screenshot && <FailureScreenshot src={t.screenshot} />}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
