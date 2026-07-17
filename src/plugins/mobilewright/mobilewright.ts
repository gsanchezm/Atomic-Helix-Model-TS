// Mobilewright plugin — thin orchestrator. Mirrors the shape of the
// mobile-ui (Appium) plugin but delegates to the `mobilewright` npm
// package instead. New actions live under `actions/` and register
// themselves via `registerMobilewrightActions.ts` (Open/Closed).

import { getMobilewrightActionRegistry } from '@plugins/mobilewright/actions/registerMobilewrightActions';
import { ensureSession, teardown, MobilewrightPlatform } from '@plugins/mobilewright/mobilewright-lifecycle';
import { hasLocatorKey, resolveMobileSelector } from '@kernel/locator-resolver';

const registry = getMobilewrightActionRegistry();

// chaos-proxy passes mobilewright targets through unresolved (its own
// comment: "the plugin sees the logical key ... plus the payload"), on the
// assumption the logical key doubles as the real testId. It doesn't — app
// testIDs (`text-welcome-title`) differ from the shared registry's logical
// key names (`welcomeTitleText`). Resolve the same *.locators.json registry
// Appium benefits from (via its `~foo` WebdriverIO convention) here, keyed
// off this session's actual device platform, and strip the accessibility-id
// `~` prefix so MobilewrightActionContext.parseLocator's default testId kind
// matches the real element. Selector forms other plugins need (Android
// UiSelector strings, iOS class chains) aren't expressible via mobilewright's
// testId/label/text/role/placeholder/type kinds and pass through unresolved.
function resolveMobilewrightTarget(rawTarget: string, platform: MobilewrightPlatform): string {
    const sepIndex = rawTarget.indexOf('||');
    const key = sepIndex === -1 ? rawTarget : rawTarget.slice(0, sepIndex);
    const rest = sepIndex === -1 ? '' : rawTarget.slice(sepIndex);

    if (!hasLocatorKey(key)) return rawTarget;
    const resolved = resolveMobileSelector(key, platform);
    if (!resolved) return rawTarget;

    const stripped = resolved.startsWith('~') ? resolved.slice(1) : resolved;
    return `${stripped}${rest}`;
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
