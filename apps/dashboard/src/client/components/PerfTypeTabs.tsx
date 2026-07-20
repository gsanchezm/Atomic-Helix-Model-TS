import { PERF_TEST_TYPES, type PerfTestType } from '@shared/perf-types';
import type { PerfTypeBlock } from '@shared/types';
import { PERF_TYPE_META } from '../perf-type-meta';
import { PerfTypeIcon } from './PerfTypeIcon';

interface PerfTypeTabsProps {
  byType: PerfTypeBlock[];
  active: PerfTestType;
  onSelect: (type: PerfTestType) => void;
}

export function PerfTypeTabs({ byType, active, onSelect }: PerfTypeTabsProps) {
  return (
    <div className="platform-tabs">
      {PERF_TEST_TYPES.map((type) => {
        const block = byType.find((b) => b.type === type);
        const runs = block?.perf ? block.perf.scenarios.length : 0;
        return (
          <button
            key={type}
            type="button"
            className={type === active ? 'active' : ''}
            onClick={() => onSelect(type)}
          >
            <PerfTypeIcon type={type} />
            {PERF_TYPE_META[type].label}
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--text-mute)',
                marginLeft: 4,
              }}
            >
              {runs} runs
            </span>
          </button>
        );
      })}
    </div>
  );
}
