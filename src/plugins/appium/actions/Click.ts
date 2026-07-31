import { ActionHandler } from '@plugins/shared/ActionHandler';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';

type DebugLogger = (phase: string) => void;
type MobileElement = ReturnType<AppiumActionContext['driver']['$']>;

async function dismissKeyboardBlockingTarget(
    context: Pick<AppiumActionContext, 'driver' | 'helpers' | 'target'>,
    dbg: DebugLogger,
): Promise<void> {
    const { driver, helpers, target } = context;
    if (!target.includes('btn-place-order')) return;
    if (!(await helpers.isKeyboardShown(driver))) return;

    const dismissed = await helpers.dismissNumericKeyboardRobust(driver);
    process.stderr.write(`[Appium-DBG] CLICK ${target} robust-dismiss dismissed=${dismissed}\n`);
    dbg('post-robust-dismiss');
}

async function clickIos(
    context: Pick<AppiumActionContext, 'driver' | 'helpers' | 'target'>,
    element: MobileElement,
    dbg: DebugLogger,
): Promise<string | undefined> {
    const { driver, helpers, target } = context;

    try {
        const loc = await (element.getLocation() as Promise<{ x: number; y: number }>);
        const size = await (element.getSize() as Promise<{ width: number; height: number }>);
        const centerX = loc.x + size.width / 2;
        const centerY = loc.y + size.height / 2;
        process.stderr.write(
            `[Appium-DBG] CLICK ${target} frame=(${loc.x},${loc.y},${size.width}x${size.height}) center=(${centerX},${centerY})\n`,
        );
        const windowSize = await driver.getWindowSize();
        const viewportBottom = Math.min(windowSize.height - 90, 780);
        const needsClampedTap = target.includes('btn-place-order') || centerY > viewportBottom;

        if (!needsClampedTap) {
            await helpers.tapElementCenter(driver, element);
            dbg('post-click(coords)');
            return `Tapped on mobile element by coordinates: ${target}`;
        }

        // The JP credit-card form can keep its numeric keypad over the submit
        // button. Dismiss it before calculating a safe coordinate.
        await dismissKeyboardBlockingTarget(context, dbg);

        const clampedY = Math.min(Math.max(65, centerY), viewportBottom - 10);
        // When the clamp lands above the element, let WDA select the element's
        // own hittable midpoint instead of issuing a coordinate tap that misses.
        if (clampedY < loc.y) {
            process.stderr.write(`[Appium-DBG] CLICK ${target} clamp(${clampedY})<elemTop(${loc.y}) -> native element.click()\n`);
            await (element.click() as Promise<void>);
            dbg('post-click(native-fallback)');
            return `Tapped (native; clamp would miss) on mobile element: ${target}`;
        }

        process.stderr.write(`[Appium-DBG] CLICK ${target} tap-clamped at (${centerX},${clampedY})\n`);
        await driver.executeScript('mobile: tap', [{ x: centerX, y: clampedY }]);
        dbg('post-click(clamped)');
        return `Tapped (clamped) on mobile element: ${target}`;
    } catch (err) {
        process.stderr.write(`[Appium-DBG] CLICK ${target} frame lookup failed: ${(err as Error).message}\n`);
        return undefined;
    }
}

export const ClickAction: ActionHandler<AppiumActionContext> = {
    name: 'CLICK',
    async execute({ driver, target, platform, helpers }) {
        const t0 = Date.now();
        const dbg = (phase: string) =>
            process.stderr.write(`[Appium-DBG] CLICK ${target} ${phase} t+${Date.now() - t0}ms\n`);
        dbg('enter');
        const element = driver.$(target);
        // On iOS, skip the whole preamble when the target is ALREADY tappable.
        // The preamble is not free: `blurActiveTextInput` issues a blind
        // `mobile: tap` at (width/2, 150), and on a modal that coordinate lands
        // on the full-screen press-to-dismiss scrim — closing the very dialog we
        // are about to click. That cost all 10 iOS checkout scenarios in run
        // 30649723752: the wait on `~btn-confirm-order-yes` resolved in under a
        // second, the blur tap fired, and 1.5 s later the element was gone from
        // the hierarchy entirely ("because element wasn't found" — a failed find,
        // not a stale handle). Android passed the same 10 scenarios in the same
        // run for one reason only: both dismiss helpers early-return on non-iOS,
        // so the tap never happens there.
        //
        // This is not a new heuristic — `scrollIntoViewSafe` already opens with
        // exactly this predicate. We only ask it BEFORE the preamble can
        // invalidate the element the predicate is about to be asked about.
        // `isFrameInTapZone` accounts for the keyboard (`safeBottom = kbTop - 16`),
        // so a control genuinely trapped under the keypad still gets the full
        // treatment below.
        const alreadyTappable = platform === 'ios'
            && await helpers.isFrameInTapZone(driver, element).catch(() => false);

        if (alreadyTappable) {
            dbg('preamble-skipped');
        } else {
            // Dismiss first so the click can't land on a keyboard key. On the
            // checkout page XCUI's isDisplayed returns true for buttons that
            // sit under the keyboard, so a tap at the button's hit-point would
            // land on a keyboard key.
            await helpers.dismissKeyboard(driver);
            await helpers.blurActiveTextInput(driver);
            dbg('post-dismiss');
            await helpers.scrollIntoViewSafe(driver, element, target);
            dbg('post-scroll');
            // The scroll loop uses touch-based `mobile: swipe` which can graze
            // a TextInput and reopen the keyboard. Dismiss again before the tap.
            await helpers.dismissKeyboard(driver);
            dbg('post-dismiss2');
        }

        if (platform === 'ios') {
            const result = await clickIos({ driver, helpers, target }, element, dbg);
            if (result) return result;
        }

        await (element.click() as Promise<void>);
        dbg('post-click');
        return `Tapped on mobile element: ${target}`;
    },
};
