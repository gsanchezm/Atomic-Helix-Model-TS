import type { Tone } from '../categories';

interface HealthDotProps {
  tone: Tone;
}

export function HealthDot({ tone }: HealthDotProps) {
  return <span className={`cat-dot ${tone}`} />;
}
