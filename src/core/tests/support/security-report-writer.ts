import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { COMMAND_NOT_EXECUTABLE } from '@plugins/shared/command-runner';

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
  findings: Array<{
    name: string;
    risk: string;
    confidence: string;
    instances: number;
    description?: string;
    solution?: string;
    cweId?: string;
    wascId?: string;
    instanceDetails?: Array<{
      uri?: string;
      method?: string;
      param?: string;
      attack?: string;
      evidence?: string;
      otherInfo?: string;
    }>;
  }>;
}

/**
 * A gate carries THREE outcomes, not two. "The scanner ran and the target
 * failed" and "the scanner isn't installed on this machine" are different
 * facts, and collapsing them into `pass: false` reports a clean target as
 * vulnerable — testssl.sh and schemathesis are not on PATH here, so both
 * gates read FAIL on the dashboard without either tool ever having run.
 * `unavailable` keeps that distinction so the dashboard can say "not
 * installed" and stop counting a missing binary as a security failure.
 */
export interface SecurityGateResult {
  pass: boolean;
  reportPath: string;
  /** True when the scanner binary could not be executed (missing/not on PATH). */
  unavailable?: boolean;
}

export interface WebSecurityReport {
  targetUrl?: string;
  baseline?: ZapScanSection | null;
  apiScan?: ZapScanSection | null;
  tls?: SecurityGateResult | null;
  schemaFuzz?: SecurityGateResult | null;
}

/**
 * Distinguishes "could not execute the scanner" from "scanner ran, found
 * problems".
 *
 * Matches ONLY the marker that `runCommand` attaches on a spawn failure — NOT
 * ENOENT-shaped prose. A scanner that ran splices its stdout/stderr (which
 * echoes the target's responses) into the thrown message, so a target replying
 * `ENOENT: no such file or directory, open '/etc/passwd'` — the payload of a
 * path-disclosure finding, i.e. exactly the finding you least want to lose —
 * would otherwise be reclassified as "tool not installed" and dropped from the
 * failure count. The marker only exists on the path where nothing was scanned.
 */
export function isScannerUnavailable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return message.includes(COMMAND_NOT_EXECUTABLE);
}

export function writeWebSecuritySection(section: Partial<WebSecurityReport>): void {
  const file = reportPath('zap.json');
  const current = readJson<WebSecurityReport>(file, {});
  writeFileSync(file, JSON.stringify({ ...current, ...section }, null, 2), 'utf-8');
}

// --- MobSF / mobile security (reports/mobsf-<platform>.json) ---------------

export interface MobsfFinding {
  severity: 'high' | 'warning' | 'info' | 'secure' | 'hotspot';
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
