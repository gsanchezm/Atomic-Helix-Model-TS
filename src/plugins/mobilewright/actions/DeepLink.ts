import { ActionHandler } from '@plugins/shared/ActionHandler';
import { MobilewrightActionContext } from '@plugins/mobilewright/actions/MobilewrightActionContext';
import { posixQuote, runCommand } from '@plugins/shared/command-runner';

function resolveDeviceId(sessionId: string): string | undefined {
    return process.env[`ANDROID_UDID_${sessionId}`] ?? process.env.ANDROID_UDID ?? undefined;
}

export const DeepLinkAction: ActionHandler<MobilewrightActionContext> = {
    name: 'DEEP_LINK',
    async execute({ driver, target, platform, sessionId }) {
        if (platform !== 'android') {
            // iOS: mobilecli's openUrl RPC doesn't route through an adb-shell
            // hop, so the bug below doesn't apply here — keep the package's
            // own path (identical to NAVIGATE, mobilewright's Device.openUrl
            // handles deep links and http(s) URLs uniformly).
            await driver.openUrl(target);
            return `Deep linked mobilewright session to: ${target}`;
        }

        // Android: driver.openUrl() bottoms out in mobilecli's `device.url`
        // RPC, which shells the URL into `adb shell am start ... -d <url>`
        // completely UNQUOTED — confirmed on-device via the raw command
        // logcat records: `adbd service requested 'shell,v2,...,raw:am start
        // -a android.intent.action.VIEW -d omnipizza://catalog?market=CH&
        // accessToken=...&lang=fr'`, no surrounding quotes at all. The
        // device's own shell re-tokenizes that raw string and treats the
        // unescaped `&` as a statement separator, splitting `am start` into
        // multiple device-shell statements and dropping every query param
        // after the first `&`. Verified on-device: with this bug, the CH/fr
        // catalog deep link came back on an empty "Keine passenden Pizzen
        // gefunden" grid in the WRONG language (German, not French — neither
        // `accessToken` nor `lang` ever reached the app); re-issuing the
        // identical URL with `am start`'s `-d` value POSIX-single-quoted
        // hydrated real pizza cards in French. Same root cause and fix as
        // the Appium plugin's DeepLink.ts — shell out to `am start` directly
        // instead of going through mobilecli's unquoted path.
        const deviceId = resolveDeviceId(sessionId);
        const appId = process.env.APP_PACKAGE ?? 'com.omnipizza.app';
        const args = [
            ...(deviceId ? ['-s', deviceId] : []),
            'shell',
            `am start -W -a android.intent.action.VIEW -d ${posixQuote(target)} ${appId}`,
        ];
        const result = await runCommand('adb', args, { timeoutMs: 15_000 });
        if (result.exitCode !== 0 || /unable to resolve intent/i.test(result.stdout)) {
            throw new Error(
                `[Mobilewright] DEEP_LINK am start failed (exit ${result.exitCode}): ${result.stdout || result.stderr}`,
            );
        }
        return `Deep linked mobilewright session to: ${target}`;
    },
};
