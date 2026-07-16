import type { WebSecurityTool } from '../../shared/types.js';
import { type AdapterContext, assertObject } from './shared.js';

export function zapAdapter(raw: unknown, _ctx: AdapterContext): WebSecurityTool {
  const data = assertObject(raw, 'zap') as Omit<WebSecurityTool, 'kind' | 'scope'>;
  return { ...data, kind: 'security', scope: 'web' };
}
