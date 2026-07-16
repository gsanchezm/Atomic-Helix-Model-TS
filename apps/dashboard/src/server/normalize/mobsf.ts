import type { MobileSecurityTool } from '../../shared/types.js';
import { type AdapterContext, assertObject } from './shared.js';

export function mobsfAdapter(raw: unknown, _ctx: AdapterContext): MobileSecurityTool {
  const data = assertObject(raw, 'mobsf') as Omit<MobileSecurityTool, 'kind' | 'scope'>;
  return { ...data, kind: 'security', scope: 'mobile' };
}
