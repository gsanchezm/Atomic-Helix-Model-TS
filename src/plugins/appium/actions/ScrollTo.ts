import { ActionHandler } from '@plugins/shared/ActionHandler';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';
import { logger } from '@utils/logger';

export const ScrollToAction: ActionHandler<AppiumActionContext> = {
    name: 'SCROLL_TO',
    async execute({ driver, target, platform, helpers }) {
        try {
            await driver.$(target).scrollIntoView();
            // Diagnostic only — see docs/bugs/android-birthday-picker-scroll-2026-08-20.md's
            // 2026-08-21 updates. This branch returns unconditionally on
            // Android with zero bounds verification, so there was no way to
            // tell whether it actually scrolled or no-op'd over an
            // already-valid state. Logging (not gating) height/displayed here
            // settles that without changing behavior.
            if (platform === 'android') {
                const size = await driver.$(target).getSize().catch(() => null);
                const displayed = await driver.$(target).isDisplayed().catch(() => 'error');
                logger.info(
                    { target, branch: 'scrollIntoView', height: size?.height ?? 'error', displayed },
                    '[Appium] SCROLL_TO: first branch returning (Android, unverified by design)',
                );
            }
            // On iOS `scrollIntoView()` assumes a vertical container and
            // silently no-ops on HORIZONTAL lists, so confirm the target is
            // actually on-screen; if not, fall through to the native
            // scroll-to-element idiom below. On Android a clean call is enough.
            if (platform !== 'ios' || (await driver.$(target).isDisplayed().catch(() => false))) {
                return `Scrolled to: ${target}`;
            }
        } catch (err) {
            const msg = (err as Error)?.message ?? '';
            logger.info({ target, branch: 'scrollIntoView', error: msg }, '[Appium] SCROLL_TO: first branch threw');
            // WDIO's scrollIntoView assumes a default `//android.widget.ScrollView`.
            // Some React Native screens (e.g. the profile form) don't expose that
            // container, so it throws "Default scrollable element ... was not
            // found". Fall back to a platform-appropriate scroll below.
            // Re-throw any other (genuine) failure.
            if (!/scrollable element|ScrollView|not found/i.test(msg)) throw err;
        }

        // iOS: use the native scroll-to-element idiom. It infers the scroll
        // axis/direction (so it also handles HORIZONTAL lists like the catalog
        // category pills, where wide localized labels — es: "Vegetariana",
        // "Carnes" — push later pills past the right edge) and needs no tuned
        // coordinates. The element exposes `name == "<testID>"` on iOS because
        // getTestProps maps testID -> accessibilityIdentifier -> XCUI `name`.
        // (Root cause of BUG-OMNI-001's MX/meat false positive: the off-screen
        // pill was never scrolled in, so CLICK's coordinate tap — X clamped to
        // the screen edge — missed and the category filter never engaged.)
        if (platform === 'ios') {
            const name = target.startsWith('~') ? target.slice(1) : target;

            // Container-anchored drag FIRST. WDIO's scrollIntoView() anchors its
            // swipe to XCUIElementTypeApplication — on a 402x874 window that drags
            // from y=852, which on the profile screen is BELOW `scroll-profile`
            // (it ends at y=780), so the gesture never touches the ScrollView at
            // all. In CI run 32183695855 that produced `SCROLL_TO ok (120713ms)`:
            // ten 1.5s swipes accomplishing nothing, reported as success, and the
            // `~input-birthday-day` failure 8s later. Measuring against the
            // element's real container fixes the anchor and the direction at once.
            try {
                const el = driver.$(target);
                if (await el.isExisting()) {
                    const container = await helpers.scrollContainerFor(driver, el);
                    if (container) {
                        await helpers.scrollIntoViewSafe(driver, el, target, 6, container);
                        if (await el.isDisplayed().catch(() => false)) {
                            return `Scrolled to (ios container drag): ${target}`;
                        }
                    }
                }
            } catch { /* fall through to the native idiom below */ }

            try {
                await driver.execute('mobile: scroll', { predicateString: `name == "${name}"` });
                return `Scrolled to (ios mobile:scroll): ${target}`;
            } catch (err) {
                // Best-effort: leave final visibility to the caller's
                // WAIT_FOR_ELEMENT / CLICK rather than failing the scroll itself.
                return `Scroll attempted (ios mobile:scroll failed: ${(err as Error)?.message ?? ''}): ${target}`;
            }
        }

        // Android: try UiScrollable first. It searches BOTH directions from the
        // current offset, which the gesture fallback below cannot do — that one
        // only scrolls downward, so it can never reach a target the view is
        // already scrolled past. This matters after a CLICK near the bottom of a
        // long form: `scrollIntoViewSafe` drives the ScrollView to its maximum
        // offset, and a later SCROLL_TO back up to a top-of-form field would
        // otherwise swipe further away from it. Same idiom as
        // `appium-helpers.scrollIntoViewAndroid`, which is proven on this app.
        const inner = target.startsWith('~')
            ? `new UiSelector().description("${target.slice(1)}")`
            : target.startsWith('android=')
                ? target.slice('android='.length)
                : undefined;
        if (inner) {
            try {
                await driver.$(
                    `android=new UiScrollable(new UiSelector().scrollable(true).instance(0)).scrollIntoView(${inner})`,
                );
                // Diagnostic only — height alongside the existing isDisplayed()
                // gate, unchanged, so a bimodal pass/fail like the birthday-day
                // one (isDisplayed=true, height still invalid) is visible.
                const size = await driver.$(target).getSize().catch(() => null);
                const displayed = await driver.$(target).isDisplayed().catch(() => false);
                logger.info(
                    { target, branch: 'UiScrollable', height: size?.height ?? 'error', displayed },
                    '[Appium] SCROLL_TO: UiScrollable branch resolved',
                );
                if (displayed) {
                    return `Scrolled to (UiScrollable): ${target}`;
                }
            } catch (err) {
                logger.info({ target, branch: 'UiScrollable', error: (err as Error)?.message ?? '' }, '[Appium] SCROLL_TO: UiScrollable branch threw');
                /* fall through to the gesture fallback */
            }
        }

        // Android (UiAutomator2) gesture fallback — a screen-level scroll that
        // doesn't depend on the ScrollView class, re-checking visibility
        // between swipes.
        const { width, height } = await driver.getWindowSize();
        const region = {
            left: Math.round(width * 0.1),
            top: Math.round(height * 0.25),
            width: Math.round(width * 0.8),
            height: Math.round(height * 0.5),
        };
        // Try BOTH directions. `direction: 'down'` alone can only ever scroll
        // away from a target the view is already scrolled past — the state a
        // long form is in right after the birthday dropdowns drive it to max
        // offset, which is how `input-profile-fullname` went missing in CI run
        // 32183695855 (it failed here, silently, and surfaced 10s later as an
        // unrelated-looking WAIT_FOR_ELEMENT timeout).
        for (const direction of ['down', 'up'] as const) {
            for (let i = 0; i < 4; i++) {
                // Diagnostic only — height alongside the existing isDisplayed()
                // gate, unchanged. Settles whether this loop's down-then-up
                // structure is cancelling its own progress (docs/bugs/
                // android-birthday-picker-scroll-2026-08-20.md's 2026-08-21
                // update): a tight, consistent SCROLL_TO duration across
                // failures (8581-8716ms in CI run 32497645866) means this loop
                // ran to completion every time with no early exit.
                const displayed = await driver.$(target).isDisplayed().catch(() => false);
                const size = await driver.$(target).getSize().catch(() => null);
                logger.info(
                    { target, direction, i, displayed, height: size?.height ?? 'error' },
                    '[Appium] SCROLL_TO: gesture-fallback pre-check',
                );
                if (displayed) {
                    return `Scrolled to (gesture fallback, ${direction}): ${target}`;
                }
                await driver.execute('mobile: scrollGesture', {
                    ...region,
                    direction,
                    percent: 0.85,
                });
            }
        }

        // Deliberately NOT throwing yet. Several SCROLL_TO calls across the
        // currently-green reads suites are suspected to be no-opping while the
        // assertion that follows passes anyway; throwing here would turn those
        // into new failures in the same change that fixes the scroll itself,
        // making the two indistinguishable. Warn for one full CI run, read the
        // warnings, then promote to a throw.
        if (!(await driver.$(target).isDisplayed().catch(() => false))) {
            logger.warn(
                { target },
                '[Appium] SCROLL_TO exhausted both gesture directions without revealing the target',
            );
        }
        return `Scrolled to (gesture fallback): ${target}`;
    },
};
