import type { AccessibilityTool } from '../../shared/types.js';
import { type AdapterContext, assertObject } from './shared.js';

export function axeAdapter(raw: unknown, _ctx: AdapterContext): AccessibilityTool {
  const data = assertObject(raw, 'axe') as Omit<AccessibilityTool, 'kind'>;
  return { ...data, kind: 'accessibility' };
}
