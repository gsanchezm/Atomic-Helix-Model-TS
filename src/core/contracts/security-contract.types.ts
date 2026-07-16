// Security contract shapes. A domain's `*.security.json` declares WHAT to
// probe (targets + thresholds); the route/step decides WHEN, mirroring the
// accessibility-as-contract precedent. Two scopes:
//   - web:    ZAP (baseline crawl / active API scan), schema-fuzz, TLS check
//   - mobile: MobSF static analysis, one entry per platform binary
// String fields support `${ENV_VAR}` placeholders, resolved by the loader
// from process.env at load time (keeps deployed URLs out of the contract).

/** Per-risk ceilings for a ZAP scan. Keys match ZAP's risk words. */
export interface SecurityThresholds {
  High?: number;
  Medium?: number;
  Low?: number;
  Informational?: number;
}

export interface ZapScanSpec {
  /** Defaults to true — set false to declare-but-skip. */
  enabled?: boolean;
  /** Target under test. For the API scan this is the backend origin. */
  targetUrl: string;
  /** OpenAPI document — when present ZAP imports it instead of spidering. */
  openApiUrl?: string;
  /** Per-risk failure ceilings. Defaults to `{ High: 0 }` at validate time. */
  thresholds?: SecurityThresholds;
  timeoutMs?: number;
}

export interface SchemaFuzzSpec {
  enabled?: boolean;
  /** OpenAPI spec to fuzz. Falls back to `${API_BASE_URL}/api/openapi.json`. */
  specUrl?: string;
  timeoutMs?: number;
}

export interface TlsSpec {
  enabled?: boolean;
  /** HTTPS deployment URL whose certificate/config is inspected. */
  targetUrl: string;
  timeoutMs?: number;
}

export interface MobsfSpec {
  enabled?: boolean;
  platform: 'android' | 'ios';
  /** Path to the APK / IPA / zipped .app to statically analyze. */
  filePath: string;
  timeoutMs?: number;
}

export interface SecurityWebScope {
  /** Passive crawl of the running app (infra-shaped, whole-app). */
  zapBaselineScan?: ZapScanSpec;
  /** Active attack of the API surface (contract-shaped, per-domain). */
  zapApiScan?: ZapScanSpec;
  schemaFuzz?: SchemaFuzzSpec;
  tls?: TlsSpec;
}

export interface SecurityMobileScope {
  mobsf?: MobsfSpec[];
}

export interface SecurityContract {
  feature: string;
  version: string;
  web?: SecurityWebScope;
  mobile?: SecurityMobileScope;
}
