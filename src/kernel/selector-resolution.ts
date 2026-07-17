import { resolveLocator } from '@kernel/locator-resolver';
import { INTENT, LEGACY_INTENT_ALIASES } from '@kernel/intents';

export const ACTION_TYPE_SEPARATOR = '||';

// Actions that carry no logical target, or that resolve their own targets
// internally (visual/API/security/performance contracts) — see each
// entry's origin comment in the original chaos-proxy.ts if history is needed.
export const PASSTHROUGH_ACTIONS = new Set<string>([
    INTENT.NAVIGATE, INTENT.TEARDOWN, INTENT.BROWSER_COMMAND, INTENT.HIDE_KEYBOARD,
    INTENT.ACQUIRE_WRITE_LOCK, INTENT.RELEASE_WRITE_LOCK,
    INTENT.SCREENSHOT,
    INTENT.CAPTURE_SNAPSHOT, INTENT.COMPARE_SNAPSHOT, INTENT.VALIDATE_VISUAL_CONTRACT, INTENT.UPDATE_BASELINE,
    INTENT.RUN_ACCESSIBILITY_AUDIT, INTENT.VALIDATE_ACCESSIBILITY_THRESHOLDS,
    INTENT.RUN_ZAP_BASELINE_SCAN, INTENT.RUN_ZAP_API_SCAN, INTENT.PARSE_ZAP_REPORT,
    INTENT.VALIDATE_ZAP_THRESHOLDS, INTENT.RUN_MOBSF_APK_SCAN, INTENT.PARSE_MOBSF_REPORT,
    INTENT.RUN_SCHEMA_FUZZ, INTENT.RUN_TLS_CHECK,
    INTENT.EXECUTE_CONTRACT_ENDPOINT, INTENT.VALIDATE_CONTRACT_ENDPOINT,
    INTENT.RUN_SIMULATION, INTENT.RUN_CHECKOUT_LOAD, INTENT.PARSE_GATLING_STATS, INTENT.VALIDATE_THRESHOLDS,
    ...LEGACY_INTENT_ALIASES,
]);

// Actions that use the "logicalKey||payload" format.
// TYPE:             logicalKey||text
// WAIT_FOR_ELEMENT: logicalKey||timeoutMs
// ASSERT_TEXT:      logicalKey||expectedText
export const COMPOSITE_ACTIONS = new Set<string>([
    INTENT.TYPE,
    INTENT.SELECT_OPTION,
    INTENT.WAIT_FOR_ELEMENT,
    INTENT.ASSERT_TEXT,
]);

export function driverOf(platform: string): string {
    return platform.split(':')[0].toLowerCase();
}

export function isMobilewrightPlatform(platform: string): boolean {
    return driverOf(platform) === 'mobilewright';
}

export function resolveSelector(actionId: string, rawSelector: string, platform: string): string {
    const normalized = actionId.toUpperCase();

    // NAVIGATE, TEARDOWN and BROWSER_COMMAND pass structured/raw values without locator resolution.
    if (PASSTHROUGH_ACTIONS.has(normalized)) {
        return rawSelector;
    }

    // Mobilewright resolves locators inside its own plugin (parseLocator +
    // Locator.root().getByTestId()/getByLabel()/...). The proxy must pass
    // through both halves of composite targets unchanged so the plugin sees
    // the logical key (treated as testId by default) plus the payload.
    if (isMobilewrightPlatform(platform)) {
        return rawSelector;
    }

    const driver = driverOf(platform);

    // Composite actions: resolve solely the key portion; preserve the payload succeeding the || separator.
    if (COMPOSITE_ACTIONS.has(normalized) && rawSelector.includes(ACTION_TYPE_SEPARATOR)) {
        const sepIndex = rawSelector.indexOf(ACTION_TYPE_SEPARATOR);
        const logicalKey = rawSelector.slice(0, sepIndex);
        const textPayload = rawSelector.slice(sepIndex);
        return resolveLocator(logicalKey, driver) + textPayload;
    }

    return resolveLocator(rawSelector, driver);
}
