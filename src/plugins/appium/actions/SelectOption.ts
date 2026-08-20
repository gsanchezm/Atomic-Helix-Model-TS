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
        await helpers.scrollIntoViewSafe(driver, trigger, selector, 5);
        const pkgAfterScroll = await currentPackageOrNA(driver, platform);
        await (trigger.click() as Promise<void>);
        const pkgAfterClick = await currentPackageOrNA(driver, platform);
        if (platform === 'android' && (pkgAfterScroll !== 'com.omnipizza.app' || pkgAfterClick !== 'com.omnipizza.app')) {
            logger.warn(
                { trigger: selector, pkgBeforeClick, pkgAfterScroll, pkgAfterClick },
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
