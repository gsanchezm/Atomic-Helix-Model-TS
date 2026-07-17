// Mobilewright plugin — thin orchestrator. Mirrors the shape of the
// mobile-ui (Appium) plugin but delegates to the `mobilewright` npm
// package instead. New actions live under `actions/` and register
// themselves via `registerMobilewrightActions.ts` (Open/Closed).

import { getMobilewrightActionRegistry } from '@plugins/mobilewright/actions/registerMobilewrightActions';
import { ensureSession, teardown, MobilewrightPlatform } from '@plugins/mobilewright/mobilewright-lifecycle';
import { hasLocatorKey, resolveMobileSelector } from '@kernel/locator-resolver';

const registry = getMobilewrightActionRegistry();

// WebdriverIO/Appium-only selector prefixes that mobilewright's own
// testId/label/text/role/placeholder/type engine cannot interpret. A value
// carrying one of these reaching here (via the legacy node.mobile.* borrow)
// means the logical key needs an explicit `mobilewright` override in its
// *.wright.locators.json entry — fail loudly instead of using the raw
// string as a broken literal testId.
const APPIUM_ONLY_PREFIXES = ['android=', '-ios ', 'id=', 'xpath='];

// chaos-proxy passes mobilewright targets through unresolved (its own
// comment: "the plugin sees the logical key ... plus the payload"), on the
// assumption the logical key doubles as the real testId. It doesn't — app
// testIDs (`text-welcome-title`) differ from the shared registry's logical
// key names (`welcomeTitleText`). Resolve the same *.locators.json registry
// other mobile drivers use here, keyed off this session's actual device
// platform. An explicit `node.mobilewright` entry (locator-resolver.ts)
// resolves to a JSON {kind,...} string and is passed straight through for
// parseLocator to parse; a legacy `~foo` accessibility-id borrow has its
// `~` stripped so parseLocator's default testId kind matches; any other
// borrowed shape (Android UiSelector, iOS class chain / predicate) is not
// expressible via mobilewright's testId/label/text/role/placeholder/type
// kinds and throws instead of silently mis-resolving.
export function resolveMobilewrightTarget(rawTarget: string, platform: MobilewrightPlatform): string {
    const sepIndex = rawTarget.indexOf('||');
    const key = sepIndex === -1 ? rawTarget : rawTarget.slice(0, sepIndex);
    const rest = sepIndex === -1 ? '' : rawTarget.slice(sepIndex);

    if (!hasLocatorKey(key)) return rawTarget;
    const resolved = resolveMobileSelector(key, platform);
    if (!resolved) return rawTarget;

    if (resolved.startsWith('{')) return `${resolved}${rest}`;

    if (resolved.startsWith('~')) return `${resolved.slice(1)}${rest}`;

    if (APPIUM_ONLY_PREFIXES.some((prefix) => resolved.startsWith(prefix))) {
        throw new Error(
            `[Mobilewright] Locator '${key}' resolved to an Appium-only selector ` +
            `("${resolved}") that mobilewright cannot interpret. Add an explicit ` +
            `"mobilewright" entry for '${key}' in its *.wright.locators.json file.`,
        );
    }

    return `${resolved}${rest}`;
}

export async function execute(
    actionId: string,
    targetSelector: string,
    sessionId: string = '0',
): Promise<string> {
    const normalizedAction = actionId.toUpperCase();

    // TEARDOWN is session-scoped — never boot a device just to close it.
    if (normalizedAction === 'TEARDOWN') {
        await teardown(sessionId);
        return 'Mobilewright execution environment terminated securely.';
    }

    const session = await ensureSession(sessionId);

    return registry.execute(normalizedAction, {
        driver: session.device,
        target: resolveMobilewrightTarget(targetSelector, session.platform),
        actionId: normalizedAction,
        sessionId,
        platform: session.platform,
        metadata: { plugin: 'mobilewright', profileId: session.profileId },
    });
}
