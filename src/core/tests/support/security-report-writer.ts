import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Bridges the plugin oracles to the dashboard. Security/a11y actions run in
// their plugin processes and return their native summary as a string; the
// route/step receives it and calls these writers to persist stable scratch
// files under reports/. The dashboard ingest (apps/dashboard/scripts/
// ingest-run.ts) reads exactly these shapes and normalizes them into
// reports/<runId>/{axe,zap,mobsf}.json. Keeping the writer here (test layer,
// not the plugin) means no plugin needs filesystem knowledge of the report
// layout, matching how gatling/pixelmatch feed the dashboard.

const REPORTS_DIR = resolve(__dirname, '../../../../reports');

function reportPath(name: string): string {
  mkdirSync(REPORTS_DIR, { recursive: true });
  return resolve(REPORTS_DIR, name);
}

function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

// --- ZAP / web security (reports/zap.json) ---------------------------------
// Written by two owners: the infra route (baseline, tls) and the login
// contract route (apiScan, schemaFuzz). Merge by section so neither clobbers
// the other within one run.

export interface ZapScanSection {
  byRisk: Record<string, number>;
  findings: Array<{ name: string; risk: string; confidence: string; instances: number }>;
}

export interface WebSecurityReport {
  targetUrl?: string;
  baseline?: ZapScanSection | null;
  apiScan?: ZapScanSection | null;
  tls?: { pass: boolean; reportPath: string } | null;
  schemaFuzz?: { pass: boolean; reportPath: string } | null;
}

export function writeWebSecuritySection(section: Partial<WebSecurityReport>): void {
  const file = reportPath('zap.json');
  const current = readJson<WebSecurityReport>(file, {});
  writeFileSync(file, JSON.stringify({ ...current, ...section }, null, 2), 'utf-8');
}

// --- MobSF / mobile security (reports/mobsf-<platform>.json) ---------------

export interface MobsfFinding {
  severity: 'high' | 'warning' | 'info' | 'secure';
  title: string;
  description?: string;
}

export interface MobsfPlatformReport {
  platform: 'android' | 'ios';
  appFile: string;
  securityScore: number | null;
  high: number;
  warning: number;
  info: number;
  findings: MobsfFinding[];
  raw?: unknown;
}

export function writeMobsfReport(report: MobsfPlatformReport): void {
  const file = reportPath(`mobsf-${report.platform}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2), 'utf-8');
}

// --- Accessibility (reports/axe.json) --------------------------------------
// Appended per audit so one run can carry multiple audited screens.

export interface AxeRecord {
  feature: string;
  auditId: string;
  url: string;
  timestamp: string;
  violations: unknown[];
  passes: number;
  incomplete: number;
}

export function appendAxeRecord(record: AxeRecord): void {
  const file = reportPath('axe.json');
  const current = readJson<{ records: AxeRecord[] }>(file, { records: [] });
  current.records.push(record);
  writeFileSync(file, JSON.stringify(current, null, 2), 'utf-8');
}
