import { ActionHandler } from '@plugins/shared/ActionHandler';
import { logger } from '@utils/logger';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';
import { runCommand } from '@plugins/shared/command-runner';

// Wraps a value in single quotes for the DEVICE's POSIX shell, escaping any
// literal single quotes it might contain (`'` -> `'\''`).
function posixQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * DEEP_LINK — navigate directly to a screen via the omnipizza:// URI scheme.
 * Target may be a full URI or a path-only value (scheme is prepended).
 */
export const DeepLinkAction: ActionHandler<AppiumActionContext> = {
    name: 'DEEP_LINK',
    async execute({ driver, target, platform, helpers }) {
        const url = target.startsWith('omnipizza://') ? target : `omnipizza://${target}`;
        const appId = helpers.getAppId();

        if (platform === 'ios') {
            await driver.executeScript('mobile: deepLink', [{ url, bundleId: appId }]);
        } else {
            // NOT `mobile: deepLink` — it bottoms out in appium-adb's `startUri`,
            // whose Windows-branch `escapeShellArg` quotes the URL for the LOCAL
            // spawn call but that quoting doesn't survive the adb-shell hop to
            // the device's own shell. An unprotected `&` there splits `am start`
            // into two device-shell statements, silently dropping every query
            // param after the first `&` (verified on-device: the resulting
            // "Starting: Intent" line had no `pkg=` field at all — the package
            // name got shell-split into a bogus separate command — and the
            // catalog rendered "no pizzas found" for BOTH a valid and an
            // obviously-invalid accessToken, because neither ever reached the
            // app). Shelling out to `am start` ourselves with the URL
            // single-quoted for the device's POSIX shell survives the hop
            // intact — confirmed on-device: `pkg=` present and the catalog
            // hydrates with real pizza cards.
            const caps = driver.capabilities as Record<string, unknown> | undefined;
            const deviceId = (caps?.udid ?? caps?.['appium:udid']) as string | undefined;
            const args = [
                ...(deviceId ? ['-s', deviceId] : []),
                'shell',
                `am start -W -a android.intent.action.VIEW -d ${posixQuote(url)} ${appId}`,
            ];
            const result = await runCommand('adb', args, { timeoutMs: 15_000 });
            if (result.exitCode !== 0 || /unable to resolve intent/i.test(result.stdout)) {
                throw new Error(
                    `[Appium] DEEP_LINK am start failed (exit ${result.exitCode}): ${result.stdout || result.stderr}`,
                );
            }
        }

        logger.debug({ url, appId, platform }, '[Appium] Deep link processed');
        return `Deep linked to: ${url}`;
    },
};
