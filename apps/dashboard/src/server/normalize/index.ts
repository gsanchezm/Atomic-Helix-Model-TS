import type { Tool } from '../../shared/types.js';
import type { ToolKind } from '../../shared/kinds.js';
import { apiAdapter } from './api.js';
import { appiumAdapter } from './appium.js';
import { axeAdapter } from './axe.js';
import { gatlingAdapter } from './gatling.js';
import { mobsfAdapter } from './mobsf.js';
import { pixelmatchAdapter } from './pixelmatch.js';
import { playwrightAdapter } from './playwright.js';
import { zapAdapter } from './zap.js';
import type { Adapter, AdapterContext } from './shared.js';

export type { Adapter, AdapterContext };

export interface AdapterEntry {
  id: string;
  kind: ToolKind;
  adapter: Adapter;
}

export const ADAPTERS: Record<string, AdapterEntry> = {
  playwright: { id: 'playwright', kind: 'web_ui',      adapter: playwrightAdapter },
  appium:     { id: 'appium',     kind: 'mobile_ui',   adapter: appiumAdapter     },
  api:        { id: 'api',        kind: 'api',         adapter: apiAdapter        },
  gatling:    { id: 'gatling',    kind: 'performance', adapter: gatlingAdapter    },
  pixelmatch: { id: 'pixelmatch', kind: 'visual',      adapter: pixelmatchAdapter },
  axe:        { id: 'axe',        kind: 'accessibility', adapter: axeAdapter      },
  zap:        { id: 'zap',        kind: 'security',    adapter: zapAdapter        },
  mobsf:      { id: 'mobsf',      kind: 'security',    adapter: mobsfAdapter      },
};

/**
 * Default display metadata for each tool. Used to build placeholder
 * `Tool`s when a run has no JSON for that tool (so the Overview still
 * shows the card with a "No data" state instead of dropping the tile).
 */
export const TOOL_META: Record<string, { name: string; description: string }> = {
  playwright: {
    name: 'Playwright',
    description: 'End-to-end browser tests across Chromium, Firefox and WebKit.',
  },
  appium: {
    name: 'Appium',
    description: 'Native mobile flows on iOS simulators and Android emulators.',
  },
  api: {
    name: 'API Suite',
    description: 'REST and GraphQL contract tests, schema validation and auth flows.',
  },
  gatling: {
    name: 'Gatling',
    description: 'Sustained load + spike scenarios against staging services.',
  },
  pixelmatch: {
    name: 'PixelMatch',
    description: 'Pixel-by-pixel comparison of UI screens vs baselines.',
  },
  axe: {
    name: 'axe-core',
    description: 'WCAG 2.x accessibility audit',
  },
  zap: {
    name: 'OWASP ZAP',
    description: 'Web application security scan',
  },
  mobsf: {
    name: 'MobSF',
    description: 'Mobile app static security analysis',
  },
};

/**
 * Produce a "missing" Tool placeholder for the overview / detail endpoints
 * to return when a run is in the manifest but the tool's JSON wasn't
 * written. The discriminated union stays valid (kind-specific arrays are
 * empty); `missing: true` lets the UI render a muted card / panel.
 */
export function makeMissingTool(toolId: string): Tool {
  const meta = TOOL_META[toolId] ?? { name: toolId, description: 'No metadata registered.' };
  const entry = ADAPTERS[toolId];
  const base = {
    id: toolId,
    name: meta.name,
    description: meta.description,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: '—',
    missing: true,
  } as const;
  const factories: Readonly<Record<ToolKind, () => Tool>> = {
    web_ui: () => ({ ...base, kind: 'web_ui', tests: [] }),
    api: () => ({ ...base, kind: 'api', tests: [] }),
    mobile_ui: () => ({
      ...base,
      kind: 'mobile_ui',
      platforms: {
        android: { passed: 0, failed: 0, skipped: 0, duration: '—', device: '—', suites: [], tests: [] },
        ios:     { passed: 0, failed: 0, skipped: 0, duration: '—', device: '—', suites: [], tests: [] },
      },
    }),
    performance: () => ({
      ...base,
      kind: 'performance',
      perf: { rps: 0, avgMs: 0, p95Ms: 0, p99Ms: 0, errorRate: 0, requests: 0, maxRps: 0, distribution: [], scenarios: [] },
    }),
    visual: () => ({ ...base, kind: 'visual', diffs: [] }),
    accessibility: () => ({ ...base, kind: 'accessibility', audits: [] }),
    // Two tools share the 'security' kind; the id picks the concrete shape.
    security: () =>
      toolId === 'mobsf'
        ? { ...base, kind: 'security', scope: 'mobile', platforms: { android: null, ios: null } }
        : { ...base, kind: 'security', scope: 'web', targetUrl: '—', baseline: null, apiScan: null, tls: null, schemaFuzz: null },
  };
  return factories[entry?.kind ?? 'web_ui']();
}

export class UnknownToolError extends Error {
  constructor(public readonly toolId: string) {
    super(`Unknown toolId: ${toolId}`);
  }
}

export function knownToolIds(): string[] {
  return Object.keys(ADAPTERS);
}

export async function normalizeTool(
  toolId: string,
  raw: unknown,
  ctx: AdapterContext,
): Promise<Tool> {
  const entry = ADAPTERS[toolId];
  if (!entry) {
    throw new UnknownToolError(toolId);
  }
  const tool = await entry.adapter(raw, ctx);
  if (tool.kind !== entry.kind) {
    throw new Error(
      `Adapter ${toolId} returned kind=${tool.kind}, expected ${entry.kind}`,
    );
  }
  // Ensure the tool's id matches its registry slot. Adapters may set their
  // own id but we override defensively so the registry stays authoritative.
  return { ...tool, id: toolId };
}
