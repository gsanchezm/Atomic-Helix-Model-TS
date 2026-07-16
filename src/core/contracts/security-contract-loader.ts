import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { SecurityContract } from '@core/contracts/security-contract.types';

// Parallel to accessibility-contract-loader: load + validate a domain's
// `*.security.json`, resolving `${ENV}` placeholders in every string so the
// deployed target URLs live in .env, not in the checked-in contract.

const REPO_ROOT = resolve(__dirname, '../../..');
const cache = new Map<string, SecurityContract>();

function contractPath(feature: string): string {
  return resolve(REPO_ROOT, 'src/core/tests', feature, 'contracts', `${feature}.security.json`);
}

function fail(msg: string): never {
  throw new Error(`[security-contract] ${msg}`);
}

/** Recursively replace `${VAR}` with process.env.VAR in every string leaf. */
function interpolate<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name: string) => {
      const env = process.env[name];
      if (env === undefined) fail(`env var '${name}' referenced by contract is not set`);
      return env.replace(/\/+$/, '');
    }) as unknown as T;
  }
  if (Array.isArray(value)) return value.map(interpolate) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = interpolate(v);
    return out as T;
  }
  return value;
}

function validate(feature: string, raw: unknown): SecurityContract {
  if (!raw || typeof raw !== 'object') fail(`contract for '${feature}' is not an object`);
  const c = raw as Partial<SecurityContract>;
  if (!c.feature || typeof c.feature !== 'string') fail(`'${feature}': missing 'feature'`);
  if (!c.version || typeof c.version !== 'string') fail(`'${feature}': missing 'version'`);
  if (!c.web && !c.mobile) fail(`'${feature}': contract must declare a 'web' and/or 'mobile' scope`);
  for (const m of c.mobile?.mobsf ?? []) {
    if (m.platform !== 'android' && m.platform !== 'ios') {
      fail(`'${feature}': mobsf.platform must be 'android' or 'ios', got '${m.platform}'`);
    }
    if (!m.filePath) fail(`'${feature}': mobsf entry for '${m.platform}' is missing 'filePath'`);
  }
  return c as SecurityContract;
}

export const SecurityContractLoader = {
  /**
   * Load a domain's security contract. `${ENV}` placeholders are resolved at
   * load time, so the cache key folds in the interpolation — we cache the
   * resolved contract per feature (env is stable within a process).
   */
  load(feature: string): SecurityContract {
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
    const valid = validate(feature, interpolate(parsed));
    cache.set(feature, valid);
    return valid;
  },

  reset(): void {
    cache.clear();
  },
};
