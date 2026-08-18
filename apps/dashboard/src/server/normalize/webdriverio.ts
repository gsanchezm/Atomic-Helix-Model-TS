import type { WebUiTool } from '../../shared/types.js';
import { type AdapterContext, assertObject } from './shared.js';

export function webdriverioAdapter(raw: unknown, _ctx: AdapterContext): WebUiTool {
  const data = assertObject(raw, 'webdriverio') as Omit<WebUiTool, 'kind'>;
  return { ...data, kind: 'web_ui' };
}
