// Single source of truth for action IDs that flow through the chaos-proxy.
//
// We use `as const` + a derived union type instead of a TypeScript `enum`:
//   - no runtime overhead (enum compiles to a JS object; this stays as string literals)
//   - the type IS the literal value, so handler keys (case-insensitive 'TYPE') still match
//   - no enum heterogeneity / reverse-mapping foot-guns
//
// Consumers should import `INTENT` and use `INTENT.CLICK` etc. instead of raw strings.

export const INTENT = {
    // UI primitives (web-ui + mobile-ui)
    CLICK: 'CLICK',
    SELECT_OPTION: 'SELECT_OPTION',
    TYPE: 'TYPE',
    CLEAR_TEXT: 'CLEAR_TEXT',
    NAVIGATE: 'NAVIGATE',
    BROWSER_COMMAND: 'BROWSER_COMMAND',
    READ_TEXT: 'READ_TEXT',
    ASSERT_TEXT: 'ASSERT_TEXT',
    WAIT_FOR_ELEMENT: 'WAIT_FOR_ELEMENT',
    SCROLL_TO: 'SCROLL_TO',

    // Mobile-only
    DEEP_LINK: 'DEEP_LINK',
    HIDE_KEYBOARD: 'HIDE_KEYBOARD',
    SWITCH_CONTEXT: 'SWITCH_CONTEXT',

    // Lifecycle
    TEARDOWN: 'TEARDOWN',
    SCREENSHOT: 'SCREENSHOT',
    ACQUIRE_WRITE_LOCK: 'ACQUIRE_WRITE_LOCK',
    RELEASE_WRITE_LOCK: 'RELEASE_WRITE_LOCK',

    // Visual oracle
    CAPTURE_SNAPSHOT: 'CAPTURE_SNAPSHOT',
    COMPARE_SNAPSHOT: 'COMPARE_SNAPSHOT',
    UPDATE_BASELINE: 'UPDATE_BASELINE',
    VALIDATE_VISUAL_CONTRACT: 'VALIDATE_VISUAL_CONTRACT',

    // Web accessibility oracle (co-located with Playwright)
    RUN_ACCESSIBILITY_AUDIT: 'RUN_ACCESSIBILITY_AUDIT',
    VALIDATE_ACCESSIBILITY_THRESHOLDS: 'VALIDATE_ACCESSIBILITY_THRESHOLDS',

    // Security oracles
    RUN_ZAP_BASELINE_SCAN: 'RUN_ZAP_BASELINE_SCAN',
    RUN_ZAP_API_SCAN: 'RUN_ZAP_API_SCAN',
    PARSE_ZAP_REPORT: 'PARSE_ZAP_REPORT',
    VALIDATE_ZAP_THRESHOLDS: 'VALIDATE_ZAP_THRESHOLDS',
    RUN_MOBSF_APK_SCAN: 'RUN_MOBSF_APK_SCAN',
    PARSE_MOBSF_REPORT: 'PARSE_MOBSF_REPORT',
    RUN_SCHEMA_FUZZ: 'RUN_SCHEMA_FUZZ',
    RUN_TLS_CHECK: 'RUN_TLS_CHECK',

    // API contracts
    EXECUTE_CONTRACT_ENDPOINT: 'EXECUTE_CONTRACT_ENDPOINT',
    VALIDATE_CONTRACT_ENDPOINT: 'VALIDATE_CONTRACT_ENDPOINT',

    // Performance / load
    RUN_SIMULATION: 'RUN_SIMULATION',
    RUN_CHECKOUT_LOAD: 'RUN_CHECKOUT_LOAD',
    PARSE_GATLING_STATS: 'PARSE_GATLING_STATS',
    VALIDATE_THRESHOLDS: 'VALIDATE_THRESHOLDS',
} as const;

export type IntentAction = typeof INTENT[keyof typeof INTENT];

// Legacy aliases the chaos-proxy still recognizes for external compatibility.
// Don't introduce new callers using these names — prefer the INTENT.* canonical IDs.
export const LEGACY_INTENT_ALIASES = [
    'VISUAL_CAPTURE',
    'VISUAL_COMPARE',
    'VISUAL_VALIDATE',
    'EXECUTE_API_CONTRACT',
    'HTTP_GET',
    'HTTP_POST',
    'HTTP_PUT',
    'HTTP_PATCH',
    'HTTP_DELETE',
] as const;
