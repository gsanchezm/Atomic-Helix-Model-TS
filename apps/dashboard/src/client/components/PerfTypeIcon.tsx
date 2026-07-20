import type { PerfTestType } from '@shared/perf-types';

interface PerfTypeIconProps {
  type: PerfTestType;
}

const COMMON_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function LoadIcon() {
  return (
    <svg {...COMMON_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12 L16 8" />
      <path d="M8 12a4 4 0 0 1 4-4" strokeOpacity="0.4" />
    </svg>
  );
}

function StressIcon() {
  return (
    <svg {...COMMON_PROPS} aria-hidden="true">
      <path d="M12 3c-1.5 3-5 5-5 9a5 5 0 0 0 10 0c0-1.7-.8-2.7-1.5-3.6.1 1.3-.6 2-1.3 2 .6-2.4-.7-4.9-2.2-7.4Z" />
    </svg>
  );
}

function EnduranceIcon() {
  return (
    <svg {...COMMON_PROPS} aria-hidden="true">
      <path d="M7 3h10M7 21h10" />
      <path d="M7 3c0 4 3 5 5 6-2 1-5 2-5 6h10c0-4-3-5-5-6 2-1 5-2 5-6H7Z" />
    </svg>
  );
}

function SpikeIcon() {
  return (
    <svg {...COMMON_PROPS} aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}

function ScalabilityIcon() {
  return (
    <svg {...COMMON_PROPS} aria-hidden="true">
      <path d="M4 20h16" />
      <rect x="5" y="14" width="3" height="6" />
      <rect x="10.5" y="10" width="3" height="10" />
      <rect x="16" y="5" width="3" height="15" />
      <path d="M5 9l5-4 4 3 6-6" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg {...COMMON_PROPS} aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

export function PerfTypeIcon({ type }: PerfTypeIconProps) {
  switch (type) {
    case 'load': return <LoadIcon />;
    case 'stress': return <StressIcon />;
    case 'endurance': return <EnduranceIcon />;
    case 'spike': return <SpikeIcon />;
    case 'scalability': return <ScalabilityIcon />;
    case 'volume': return <VolumeIcon />;
  }
}
