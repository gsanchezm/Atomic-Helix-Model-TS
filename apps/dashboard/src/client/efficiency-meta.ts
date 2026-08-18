import type { ToolKind } from '@shared/kinds';

export interface EfficiencyGroup {
  title: string;
  category: ToolKind;
  tools: readonly string[];
}

// Paired groups compare genuinely equivalent tools only (e.g. Playwright vs
// WebdriverIO, never vs Appium). Solo groups get their own run-over-run
// trend. Security is deliberately split into two solo groups — ZAP (web)
// and MobSF (mobile) scan different targets and aren't a fair comparison.
export const EFFICIENCY_GROUPS: readonly EfficiencyGroup[] = [
  { title: 'Web', category: 'web_ui', tools: ['playwright', 'webdriverio'] },
  { title: 'Mobile', category: 'mobile_ui', tools: ['mobilewright', 'appium'] },
  { title: 'Performance', category: 'performance', tools: ['gatling'] },
  { title: 'API', category: 'api', tools: ['api'] },
  { title: 'Visual', category: 'visual', tools: ['pixelmatch'] },
  { title: 'Accessibility', category: 'accessibility', tools: ['axe'] },
  { title: 'Security — Web', category: 'security', tools: ['zap'] },
  { title: 'Security — Mobile', category: 'security', tools: ['mobsf'] },
] as const;
