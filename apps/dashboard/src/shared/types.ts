import type { ToolKind } from './kinds.js';
import type { PerfTestType } from './perf-types.js';

export type Status = 'passed' | 'failed' | 'skipped';

export interface RunInfo {
  project: string;
  buildId: string;
  branch: string;
  commit: string;
  triggeredBy: string;
  startedAt: string;
  duration: string;
  env: string;
}

export interface ManifestEntry {
  runId: string;
  project: string;
  buildId: string;
  branch: string;
  startedAt: string;
}

export interface TestCase {
  name: string;
  suite: string;
  file: string;
  dur: string;
  status: Status;
  error?: string;
  steps?: TestStep[];
  failedStepIndex?: number;
  /** URL of a failure screenshot PNG, served from /reports/<runId>/screenshots/. Present only when the scenario failed and an image/png attachment was captured in the After hook. */
  screenshot?: string;
}

export interface TestStep {
  keyword: string;       // "Given ", "When ", "Then ", "And ", "But ", "After", "Before"
  name: string;          // text post-substitution (cucumber-js already expands Examples)
  status: Status;        // 'passed' | 'failed' | 'skipped'
  dur: string;           // human duration ("280ms" / "1.2s")
  location?: string;     // step definition source location (cucumber match.location)
  error?: string;        // set only when status === 'failed'
  hidden?: boolean;      // hidden cucumber hook — only emitted when failed
}

export interface Counts {
  passed: number;
  failed: number;
  skipped: number;
  duration: string;
}

interface BaseTool extends Counts {
  id: string;
  name: string;
  description: string;
  suites?: string[];
  /**
   * True when the dashboard server is aware of this tool (it's in the
   * adapter registry) but did not find a `<toolId>.json` for this run.
   * The kind-specific arrays are present but empty so the discriminated
   * union is still valid. UI components render a muted "No data" state.
   */
  missing?: boolean;
}

export interface BrowserBlock extends Counts {
  /** Normalized browser id: chrome | chromium | firefox | edge | webkit | safari. */
  browser: string;
  suites: string[];
  tests: TestCase[];
}

export interface ViewportBlock extends Counts {
  /** Normalized viewport id: 'desktop' | 'responsive'. */
  viewport: string;
  /** Browsers executed in this viewport. Always at least one. */
  browsers: BrowserBlock[];
}

export interface WebUiTool extends BaseTool {
  kind: 'web_ui';
  tests: TestCase[];
  /**
   * Optional per-browser breakdown. Present when the run was executed across
   * multiple browsers (one cucumber JSON per browser). When set, the detail
   * view renders browser sub-tabs (mirroring the mobile Android/iOS tabs);
   * when absent, it shows a single flat test list.
   */
  browsers?: BrowserBlock[];
  /**
   * Optional viewport breakdown (desktop / responsive), each carrying its own
   * per-browser breakdown. When set, the detail view renders an outer viewport
   * tab strip with an inner browser tab strip. Takes precedence over
   * `browsers` / flat `tests`.
   */
  viewports?: ViewportBlock[];
}

export interface ApiTool extends BaseTool {
  kind: 'api';
  tests: TestCase[];
}

export interface PlatformBlock extends Counts {
  device: string;
  suites: string[];
  tests: TestCase[];
}

export interface MobileUiTool extends BaseTool {
  kind: 'mobile_ui';
  platforms: {
    android: PlatformBlock;
    ios: PlatformBlock;
  };
}

export interface PerfDistributionBucket {
  label: string;
  pct: number;
  count: number;
}

export interface PerfStep {
  name: string;
  rps: number;
  p95: number;
  errors: number;
}

export interface PerfScenario {
  name: string;
  rps: number;
  p95: number;
  errors: number;
  steps?: PerfStep[];
}

export interface PerfBlock {
  rps: number;
  avgMs: number;
  p75Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  errorRate: number;
  requests: number;
  maxRps: number;
  distribution: PerfDistributionBucket[];
  scenarios: PerfScenario[];
}

export interface PerfTypeBlock {
  type: PerfTestType;
  perf: PerfBlock | null;
}

export interface PerformanceTool extends BaseTool {
  kind: 'performance';
  perf: PerfBlock;
  byType: PerfTypeBlock[];
  unclassified?: PerfBlock;
}

export interface VisualDiffImages {
  /** Omitted when no baseline PNG exists on disk (e.g. first-run bootstrap). */
  baseline?: string;
  actual: string;
  /** Omitted when no diff PNG was produced (snapshot identical / within tolerance). */
  diff?: string;
}

export interface VisualDiff {
  name: string;
  baseline: string;
  diffPct: number;
  status: 'passed' | 'failed';
  images: VisualDiffImages;
  bucketing?: {
    feature?: string;
    snapshot?: string;
    platform?: string;
    viewport?: string;
    market?: string;
    language?: string;
  };
  triggeredBy?: {
    feature: string;
    scenario: string;
    runId?: string;
  };
}

export interface VisualTool extends BaseTool {
  kind: 'visual';
  diffs: VisualDiff[];
}

// ---------- Accessibility (axe-core) --------------------------------------

export type A11yImpact = 'critical' | 'serious' | 'moderate' | 'minor';

export interface A11yNode {
  /** CSS selector path(s) identifying the offending element. */
  target: string[];
  /** Outer HTML snippet of the offending element. */
  html: string;
  /** axe's human-readable explanation of why the node failed. */
  failureSummary: string;
}

export interface A11yViolation {
  /** axe rule id, e.g. "color-contrast". */
  id: string;
  impact: A11yImpact | null;
  help: string;
  description: string;
  helpUrl?: string;
  tags?: string[];
  nodes: A11yNode[];
}

/** One axe audit of one page state (one record in the scratch axe.json). */
export interface A11yAudit {
  feature: string;
  auditId: string;
  url: string;
  timestamp: string;
  violations: A11yViolation[];
  /** Number of rules that passed (axe reports a count, not an array). */
  passes: number;
  /** Number of rules axe could not conclusively evaluate. */
  incomplete: number;
}

export interface AccessibilityTool extends BaseTool {
  kind: 'accessibility';
  audits: A11yAudit[];
}

// ---------- Security — web (OWASP ZAP) ------------------------------------

/** Canonical ZAP risk buckets, highest first. */
export type ZapRisk = 'High' | 'Medium' | 'Low' | 'Informational';

export interface ZapFinding {
  name: string;
  /** One of the ZapRisk words (kept as string to survive unknown inputs). */
  risk: string;
  confidence: string;
  instances: number;
}

export interface ZapScanBlock {
  /** Alert counts keyed by risk word (High/Medium/Low/Informational). */
  byRisk: Record<string, number>;
  findings: ZapFinding[];
}

/** A boolean infra gate (TLS config check, schema fuzz) with its report artifact. */
export interface SecurityGate {
  pass: boolean;
  reportPath: string;
  findingsCount?: number;
}

export interface WebSecurityTool extends BaseTool {
  kind: 'security';
  scope: 'web';
  targetUrl: string;
  baseline: ZapScanBlock | null;
  apiScan: ZapScanBlock | null;
  tls: SecurityGate | null;
  schemaFuzz: SecurityGate | null;
}

// ---------- Security — mobile (MobSF) -------------------------------------

export type MobsfSeverity = 'high' | 'warning' | 'info' | 'secure';

export interface MobsfFinding {
  severity: MobsfSeverity;
  title: string;
  description?: string;
}

export interface MobsfPlatformBlock {
  /** Scanned binary, e.g. "app-release.apk" / "OmniPizza.ipa". */
  appFile: string;
  /** MobSF security score 0–100, or null when the scan didn't produce one. */
  securityScore: number | null;
  high: number;
  warning: number;
  info: number;
  findings: MobsfFinding[];
}

export interface MobileSecurityTool extends BaseTool {
  kind: 'security';
  scope: 'mobile';
  /** Either platform may be null when that binary wasn't scanned this run. */
  platforms: {
    android: MobsfPlatformBlock | null;
    ios: MobsfPlatformBlock | null;
  };
}

/** Both security scopes share kind 'security'; discriminate on `scope`. */
export type SecurityTool = WebSecurityTool | MobileSecurityTool;

export type Tool =
  | WebUiTool
  | ApiTool
  | MobileUiTool
  | PerformanceTool
  | VisualTool
  | AccessibilityTool
  | SecurityTool;

/**
 * Summary shape returned by GET /api/runs/:runId. Drops the heavy detail arrays
 * — overview cards only need counts, duration, and (for mobile) per-platform
 * counts. The detail endpoint returns the full Tool.
 */
export type ToolSummary =
  | Omit<WebUiTool, 'tests' | 'browsers' | 'viewports'>
  | Omit<ApiTool, 'tests'>
  | (Omit<MobileUiTool, 'platforms'> & {
      platforms: {
        android: Omit<PlatformBlock, 'tests'>;
        ios: Omit<PlatformBlock, 'tests'>;
      };
    })
  | (Omit<PerformanceTool, 'perf' | 'byType' | 'unclassified'> & {
      perf: Omit<PerfBlock, 'distribution' | 'scenarios'>;
      byType: Array<{
        type: PerfTestType;
        perf: Omit<PerfBlock, 'distribution' | 'scenarios'> | null;
      }>;
      unclassified?: Omit<PerfBlock, 'distribution' | 'scenarios'>;
    })
  | Omit<VisualTool, 'diffs'>
  | Omit<AccessibilityTool, 'audits'>
  | (Omit<WebSecurityTool, 'baseline' | 'apiScan'> & {
      baseline: Omit<ZapScanBlock, 'findings'> | null;
      apiScan: Omit<ZapScanBlock, 'findings'> | null;
    })
  | (Omit<MobileSecurityTool, 'platforms'> & {
      platforms: {
        android: Omit<MobsfPlatformBlock, 'findings'> | null;
        ios: Omit<MobsfPlatformBlock, 'findings'> | null;
      };
    });

export interface RunPayload {
  run: RunInfo;
  tools: ToolSummary[];
}

export function toolKindOf(tool: Tool | ToolSummary): ToolKind {
  return tool.kind;
}

// ---------- Tool Efficiency (per-tool wall-clock execution timing) --------

export interface ToolTiming {
  tool: string;
  category: ToolKind;
  subtype: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

/** One entry per run that has a timing.json, used by the Efficiency charts. */
export interface EfficiencyRunPoint {
  runId: string;
  startedAt: string;
  timings: ToolTiming[];
}
