import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';
import { androidizeAccessibilitySelector } from '@plugins/appium/appium-helpers';
import { logger } from '@utils/logger';

// Diagnostic only — Android's foreground package, or 'n/a' off-Android / on
// failure. Motivated by CI run 32339966832: page-source dumps taken at the
// SELECT_OPTION option timeout showed `package="com.google.android.apps.
// nexuslauncher"` — the app under test was not in the foreground at all, on
// every one of that run's 5 failures (and 7 times in run 32278988523's
// "clean" 3/17 baseline too). Not a scroll/locator bug: no in-app fix can
// find an element in a hierarchy that isn't the app's. Cheap (one gRPC-free
// device call) and safe to leave in — it only ever logs.
async function currentPackageOrNA(driver: any, platform: string): Promise<string> {
    if (platform !== 'android') return 'n/a';
    return (await driver.getCurrentPackage?.().catch(() => 'error')) ?? 'error';
}

// Diagnostic only — round 3. Rounds 1 (df4521f, UiScrollable containment) and
// 2 (cab78be, a safe keyboard dismiss) both left the pkgAfterScroll=app ->
// pkgAfterClick=launcher transition byte-for-byte unchanged across every
// occurrence in their respective CI runs, which rules out both the "wrong
// scrollable" and "keyboard still open" theories — dismissing the keyboard
// before the click had literally zero effect on the outcome. This captures
// what those rounds could not: the trigger's exact on-screen bounds, the
// window size, an explicit isKeyboardShown() read (not just acted on), and a
// screenshot — all taken immediately BEFORE the click, so nothing here can
// itself perturb the very click it is trying to explain. Written to
// logs/android/diag-shots/, which ci/steps/collect-artifacts.sh already
// copies wholesale into the ahm-artifacts-e2e-android-writes-* artifact
// alongside appium-plugin.log — no workflow change needed to retrieve it.
async function captureClickDiagnostics(
    driver: any,
    trigger: any,
    selector: string,
    platform: string,
): Promise<Record<string, unknown>> {
    if (platform !== 'android') return {};
    const info: Record<string, unknown> = {};
    try {
        const loc = await trigger.getLocation();
        const size = await trigger.getSize();
        const win = await driver.getWindowSize();
        info.triggerBounds = { x: loc.x, y: loc.y, w: size.width, h: size.height };
        info.tapPoint = { x: loc.x + size.width / 2, y: loc.y + size.height / 2 };
        info.windowSize = win;
        info.distanceFromBottom = win.height - (loc.y + size.height / 2);
    } catch (err) {
        info.boundsError = (err as Error).message;
    }
    try {
        info.keyboardShown = await driver.isKeyboardShown?.();
    } catch (err) {
        info.keyboardShownError = (err as Error).message;
    }
    // The webdriver-level isKeyboardShown() above is backed by appium-adb's
    // isSoftKeyboardPresent(), which greps `dumpsys input_method` for exactly
    // ONE of its two flags: mInputShown (an input CONNECTION is active —
    // stays true after any EditText has ever had focus, independent of
    // whether an IME view is actually drawn) vs mIsInputViewShown (the
    // visual on-screen keyboard is genuinely rendered). Two straight fix
    // rounds targeting "the keyboard" (cab78be, 2de8e69) changed the outcome
    // not at all — same numbers, byte for byte, both times — which is the
    // signature of chasing a flag that was never the true obstruction.
    // `mobile: shell` (needs --relaxed-security, already set in CI) reads
    // both directly, settling whether there's a real visual keyboard here
    // or just a stale input connection.
    try {
        const raw = await driver.executeScript('mobile: shell', [{ command: 'dumpsys', args: ['input_method'] }]);
        const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
        info.mInputShown = /mInputShown=(\w+)/.exec(text)?.[1] ?? 'unknown';
        info.mIsInputViewShown = /mIsInputViewShown=(\w+)/.exec(text)?.[1] ?? 'unknown';
    } catch (err) {
        info.dumpsysError = (err as Error).message;
    }
    try {
        const dir = join(process.cwd(), 'logs', 'android', 'diag-shots');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const safeName = selector.replace(/[^a-z0-9]+/gi, '-').slice(0, 80);
        const file = join(dir, `pretap-${Date.now()}-${safeName}.png`);
        const png = await driver.takeScreenshot();
        writeFileSync(file, Buffer.from(png, 'base64'));
        info.screenshot = file;
    } catch (err) {
        info.screenshotError = (err as Error).message;
    }
    try {
        const dir = join(process.cwd(), 'logs', 'android', 'diag-shots');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const safeName = selector.replace(/[^a-z0-9]+/gi, '-').slice(0, 80);
        const src = await driver.getPageSource();
        const file = join(dir, `pretap-${Date.now()}-${safeName}.xml`);
        writeFileSync(file, src);
        info.pageSource = file;
    } catch (err) {
        info.pageSourceError = (err as Error).message;
    }
    return info;
}

// Diagnostic-confirmed (CI run 32363838578's page-source dumps): the trigger's
// own accessibility-tree bounds come back INVERTED (bottom < top) on 6 of 9
// captures — always when it sits just past its ScrollView's clipped viewport
// edge. E.g. ScrollView content bounds [0,210][1080,1684] vs a trigger bounds
// of [109,1786][348,1684]: Android clips the reported bottom to the viewport
// edge but keeps the true (off-screen) top, producing a negative height. The
// keyboard theories from three prior rounds (cab78be, 2de8e69, and this
// round's mIsInputViewShown check) are refuted by this same data —
// mIsInputViewShown is false throughout (no visual keyboard ever renders on
// this emulator), so no dismissal of any kind could have changed the
// outcome, which is exactly why they didn't. WebdriverIO/UiAutomator2 computes
// a tap center from whatever rect it's given; from a garbage rect that center
// lands on real content elsewhere — every failing capture's page-source shows
// it landing squarely inside the app's own bottom-nav "Katalog" tab
// ([0,1703][270,1841] in that same run), which is what backgrounds the app.
// Refuse to click on an invalid rect; a short settle-and-recheck loop first,
// in case this is the ScrollView's smooth-scroll animation still in flight
// when scrollIntoViewSafe returned (3 of 9 captures were already valid with
// no extra wait, so the animation does resolve on its own some of the time).
async function settleValidBounds(
    trigger: any,
    maxAttempts = 5,
    delayMs = 200,
): Promise<{ x: number; y: number; w: number; h: number } | null> {
    let last: { x: number; y: number; w: number; h: number } | null = null;
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const loc = await trigger.getLocation();
            const size = await trigger.getSize();
            last = { x: loc.x, y: loc.y, w: size.width, h: size.height };
            if (last.h > 0) return last;
        } catch {
            // Element handle stale mid-scroll; next attempt re-resolves it.
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return last && last.h > 0 ? last : null;
}

export const SelectOptionAction: ActionHandler<AppiumActionContext> = {
    name: 'SELECT_OPTION',
    async execute({ driver, target, helpers, platform }) {
        const { selector, value } = parseSelectorValue(target, 'SELECT_OPTION action');
        const trigger = driver.$(selector);
        const pkgBeforeClick = await currentPackageOrNA(driver, platform);
        // iOS: a still-open keyboard from a preceding TYPE (e.g. card number)
        // can occlude/absorb the scroll gesture before it reaches this
        // trigger — same class of issue Click.ts already guards against.
        // TYPE's own dismissKeyboard() is best-effort and not guaranteed to
        // have succeeded by the time this action runs.
        await helpers.dismissKeyboard(driver);
        await helpers.blurActiveTextInput(driver);
        // strictAndroidBounds=true: this trigger's invalid rect is the one proven
        // persistent (byte-for-byte unchanged across every scroll attempt in every
        // run) rather than a transient pre-layout state — see isFrameInTapZone's
        // Android branch for why every other caller leaves this false. No-op on
        // iOS regardless.
        await helpers.scrollIntoViewSafe(driver, trigger, selector, 5, undefined, undefined, true);
        // Android: kept as a harmless defensive pass (a still-open keyboard from
        // a preceding TYPE can still shift layout even though it wasn't the
        // driver of the CI failures — see settleValidBounds() below for that).
        if (platform === 'android') {
            await helpers.dismissKeyboard(driver);
            await helpers.scrollIntoViewSafe(driver, trigger, selector, 5, undefined, undefined, true);
        }
        const pkgAfterScroll = await currentPackageOrNA(driver, platform);
        const clickDiag = await captureClickDiagnostics(driver, trigger, selector, platform);
        if (platform === 'android') {
            logger.info({ trigger: selector, pkgAfterScroll, ...clickDiag }, '[Appium] SELECT_OPTION: pre-tap state');
        }
        if (platform === 'android') {
            const settled = await settleValidBounds(trigger);
            if (!settled) {
                throw new Error(
                    `[Appium] SELECT_OPTION: refusing to tap ${selector} — its bounds never stabilized to a ` +
                    'valid (positive-height) rect after scrolling, which would tap outside the element ' +
                    '(see the pre-tap state log line above for the last-known geometry).',
                );
            }
        }
        await (trigger.click() as Promise<void>);
        const pkgAfterClick = await currentPackageOrNA(driver, platform);
        if (platform === 'android' && (pkgAfterScroll !== 'com.omnipizza.app' || pkgAfterClick !== 'com.omnipizza.app')) {
            logger.warn(
                { trigger: selector, pkgBeforeClick, pkgAfterScroll, pkgAfterClick, ...clickDiag },
                '[Appium] SELECT_OPTION: app was not foregrounded around the trigger tap',
            );
        }

        // Dropdown.tsx names its option ScrollView `scroll-<triggerTestId>`, so we
        // can address the sheet's own list rather than guessing at the container.
        const triggerKey = selector.startsWith('~')
            ? selector.slice(1)
            : selector.match(/resourceId\("([^"]+)"\)/)?.[1] ?? '';
        const listSelector = triggerKey
            ? androidizeAccessibilitySelector(`~scroll-${triggerKey}`)
            : undefined;
        const list = listSelector ? driver.$(listSelector) : null;

        // Readiness probe. Without it, "the sheet never opened" and "the option is
        // off-screen" both surface as the same 10s "still not displayed" on the
        // OPTION, which is precisely what made CI run 32183695855 ambiguous.
        //
        // DIAGNOSTIC ONLY — it must not decide the outcome. Making it throw was a
        // mistake: it turns a probe into a second, independent way for the action
        // to fail, and if `scroll-<key>` is ever absent for a benign reason (a
        // platform that doesn't mirror that testID, a renamed container) it would
        // fail a path that otherwise works. The option probe below stays the sole
        // assertion; this just labels WHICH failure it is when one happens.
        let sheetOpen = false;
        if (list) {
            sheetOpen = await list.waitForExist({ timeout: 5_000 }).then(() => true).catch(() => false);
            if (!sheetOpen) {
                logger.warn(
                    {
                        trigger: selector,
                        expected: `scroll-${triggerKey}`,
                        pkgBeforeClick,
                        pkgAfterScroll,
                        pkgAfterClick,
                        pkgAfterSheetWait: await currentPackageOrNA(driver, platform),
                    },
                    '[Appium] SELECT_OPTION: dropdown sheet not in the hierarchy after the trigger tap '
                    + '— the tap likely did not land; any option timeout below is a symptom, not the cause',
                );
            }
        }

        // OmniPizza's RN Dropdown exposes every option as btn-option-{value},
        // with its own accessibilityLabel (the option's display text) distinct
        // from the testID — same content-desc/resource-id split as any other
        // ~key selector, but built here rather than passed through execute()'s
        // dispatch rewrite, so it needs the same androidization explicitly.
        const optionSelector = androidizeAccessibilitySelector(`~btn-option-${value}`);
        const option = driver.$(optionSelector);
        try {
            // Options render inside a ScrollView sheet (Dropdown.tsx) capped at
            // 70% screen height — a late option (e.g. month "12" in a 1-12 list)
            // sits off-screen until scrolled into view, confirmed on-device
            // 2026-08-13 (all 5 credit-card scenarios timed out identically on
            // btn-option-12 even after the selector itself was fixed).
            // On iOS, passing `list` as the clipping container is what lets the
            // scroll measure against the sheet instead of the window — a 31-item
            // day list and a 66-item year list both put their target inside a
            // dead band the window-relative predicate called "already visible".
            // On Android, `listSelector` scopes UiScrollable to the sheet's own
            // list by resource-id instead of `instance(0)`'s "first scrollable
            // in the tree" guess, in case the sheet is open but instance(0)
            // finds a different scrollable. Left in as a real, if unconfirmed,
            // improvement — but it is NOT the fix for the CI failures this was
            // originally built to address: the plugin-process log (not the
            // cucumber job log, which never sees it) shows the sheet-readiness
            // probe above DOES fire on those failures, and the app package
            // diagnostic above shows why — the app isn't foregrounded at all.
            await helpers.scrollIntoViewSafe(driver, option, optionSelector, 6, list ?? undefined, listSelector);
            await option.waitForDisplayed({ timeout: 10_000 });
        } catch (err) {
            try {
                const src = await driver.getPageSource();
                process.stderr.write(
                    `[Appium-DBG] SELECT_OPTION ${optionSelector} timeout — pageSource head:\n${src.slice(0, 200000)}\n[Appium-DBG] end pageSource\n`,
                );
            } catch (dumpErr) {
                process.stderr.write(
                    `[Appium-DBG] SELECT_OPTION ${optionSelector} timeout — pageSource dump failed: ${(dumpErr as Error).message}\n`,
                );
            }
            throw err;
        }
        await (option.click() as Promise<void>);
        return `Selected mobile option ${value} from element: ${selector}`;
    },
};
