import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { AccessibilityContract, AccessibilityAuditEntry } from '@core/contracts/accessibility-contract.types';

const REPO_ROOT = resolve(__dirname, '../../..');
const cache = new Map<string, AccessibilityContract>();

function contractPath(feature: string): string {
  return resolve(REPO_ROOT, 'src/core/tests', feature, 'contracts', `${feature}.a11y.json`);
}

function fail(msg: string): never {
  throw new Error(`[a11y-contract] ${msg}`);
}

function validate(feature: string, raw: unknown): AccessibilityContract {
  if (!raw || typeof raw !== 'object') fail(`contract for '${feature}' is not an object`);
  const c = raw as Partial<AccessibilityContract>;
  if (!c.feature || typeof c.feature !== 'string') fail(`'${feature}': missing 'feature'`);
  if (!c.version || typeof c.version !== 'string') fail(`'${feature}': missing 'version'`);
  if (!Array.isArray(c.audits) || c.audits.length === 0) {
    fail(`'${feature}': 'audits' must be a non-empty array`);
  }

  const ids = new Set<string>();
  for (const audit of c.audits) {
    if (!audit || typeof audit !== 'object') fail(`'${feature}': invalid audit entry`);
    if (!audit.id) fail(`'${feature}': audit is missing 'id'`);
    if (ids.has(audit.id)) fail(`'${feature}': duplicate audit id '${audit.id}'`);
    ids.add(audit.id);
  }
  return c as AccessibilityContract;
}

export const AccessibilityContractLoader = {
  load(feature: string): AccessibilityContract {
    const cached = cache.get(feature);
    if (cached) return cached;
    const file = contractPath(feature);
    if (!existsSync(file)) fail(`contract file not found: ${file}`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf-8'));
    } catch (e) {
      fail(`'${feature}': invalid JSON — ${(e as Error).message}`);
    }
    const valid = validate(feature, parsed);
    cache.set(feature, valid);
    return valid;
  },

  getAudit(feature: string, auditId: string): AccessibilityAuditEntry {
    const contract = AccessibilityContractLoader.load(feature);
    const audit = contract.audits.find((a) => a.id === auditId);
    if (!audit) fail(`'${feature}': audit '${auditId}' not found`);
    return audit;
  },

  reset(): void {
    cache.clear();
  },
};
