// Defensive helpers extracted from the original appium.ts so the action
// handlers can reuse them without bloating the main plugin file. Behavior
// is intentionally preserved verbatim — keyboard occlusion checks, iOS
// truly-displayed heuristics, masked-input typing, Android UiScrollable,
// system-dialog dismissal etc. are all platform-tuned and changing them
// reintroduces bugs we already paid for.

import type { Browser } from 'webdriverio';
import { logger } from '@utils/logger';

export const PLATFORM = (process.env.PLATFORM || 'android').toLowerCase();

// --- App identifier (resolved from capabilities; used by DEEP_LINK) ---

let cachedAppId: string | undefined;

export function setCachedAppId(value: string | undefined): void {
    if (value && !cachedAppId) cachedAppId = value;
}

export function getAppId(): string {
    if (cachedAppId) return cachedAppId;
    cachedAppId = PLATFORM === 'ios'
        ? (process.env.APP_BUNDLE_ID ?? 'com.omnipizza.app')
        : (process.env.APP_PACKAGE ?? 'com.omnipizza.app');
    return cachedAppId;
}

// --- Android accessibility-id -> resource-id rewrite ---
//
// RN mirrors `testID` into both `content-desc` and `resource-id` by default,
// but a node with an explicit `accessibilityLabel` (screen-reader text like
// "Add Pepperoni" on a button whose testID is `btn-add-pizza-p02`) overrides
// content-desc while resource-id keeps the raw testID. UiAutomator2's `~`
// accessibility-id strategy matches content-desc, so any `~key` selector
// whose element carries a distinct label never resolves — confirmed
// on-device 2026-08-13 via WaitForElement's page-source dump (content-desc
// "Add to Cart" / resource-id "btn-add-to-cart"), which manifested as a
// silent scroll-to-end-of-list followed by "element wasn't found"/timeout.
// resource-id has been reliable for every inspected element (including ones
// where content-desc does equal the testID), so on Android prefer it
// unconditionally rather than only as a fallback. iOS's XCUITest
// accessibility-id resolution doesn't have this split.
//
// The proxy dispatch path (appium.ts execute()) rewrites its `target`
// automatically, but any action that builds a NEW `~key` selector of its own
// mid-execution (e.g. SelectOption's dropdown-option selector) bypasses that
// single choke point — call this directly in those cases.
export function androidizeAccessibilitySelector(target: string): string {
    if (PLATFORM !== 'android') return target;
    const sepIndex = target.indexOf('||');
    const selector = sepIndex === -1 ? target : target.slice(0, sepIndex);
    const rest = sepIndex === -1 ? '' : target.slice(sepIndex);
    if (!selector.startsWith('~')) return target;
    const key = selector.slice(1);
    return `android=new UiSelector().resourceId("${key}")${rest}`;
}

// --- Android system dialog dismissal ---

export async function dismissAndroidSystemDialog(driver: Browser): Promise<void> {
    if (PLATFORM !== 'android') return;

    const waitSelectors = [
        'id=android:id/aerr_wait',
        'android=new UiSelector().text("Wait")',
        'android=new UiSelector().text("Esperar")',
    ];

    for (const selector of waitSelectors) {
        try {
            const button = driver.$(selector);
            if (await (button.isDisplayed() as Promise<boolean>).catch(() => false)) {
                await (button.click() as Promise<void>);
                await new Promise((r) => setTimeout(r, 500));
                logger.warn({ selector }, '[Appium] Dismissed Android ANR dialog with Wait');
                return;
            }
        } catch { /* try next selector */ }
    }
}

// --- Scroll helpers ---

async function findScrollableAncestor(driver: Browser): Promise<string | null> {
    if (PLATFORM !== 'ios') return null;
    try {
        const scrollViews = await driver.$$('XCUIElementTypeScrollView').getElements();
        for (const sv of scrollViews) {
            const displayed = await (sv.isDisplayed() as Promise<boolean>).catch(() => false);
            if (displayed) return sv.elementId;
        }
    } catch { /* no scrollable ancestor available */ }
    return null;
}

// The scrollable ancestor as an ELEMENT (not just its id), so callers can measure
// its rect and drive a container-anchored drag. Picks the innermost displayed
// ScrollView that actually contains `target`'s center when one is supplied —
// `findScrollableAncestor`'s "first displayed" rule is fine for a bulk swipe but
// wrong when a modal sheet's list and the page behind it are both on screen.
export async function scrollContainerFor(driver: Browser, target?: any): Promise<any | null> {
    if (PLATFORM !== 'ios') return null;
    try {
        const scrollViews = await driver.$$('XCUIElementTypeScrollView').getElements();
        const displayed: any[] = [];
        for (const sv of scrollViews) {
            if (await (sv.isDisplayed() as Promise<boolean>).catch(() => false)) displayed.push(sv);
        }
        if (!displayed.length) return null;
        if (!target) return displayed[0];

        const rect = await rectOf(target);
        if (!rect) return displayed[0];
        const cx = rect.x + rect.width / 2;

        // Prefer a container whose x-range brackets the target, and among those
        // the smallest — i.e. the innermost list rather than the page scroller.
        let best: any = null;
        let bestArea = Infinity;
        for (const sv of displayed) {
            const r = await rectOf(sv);
            if (!r) continue;
            if (cx < r.x || cx > r.x + r.width) continue;
            const area = r.width * r.height;
            if (area < bestArea) { bestArea = area; best = sv; }
        }
        return best ?? displayed[0];
    } catch {
        return null;
    }
}

async function swipeUpBulk(driver: Browser): Promise<void> {
    const scrollEl = await findScrollableAncestor(driver);
    const args: Record<string, unknown> = { direction: 'up' };
    if (scrollEl) args.element = scrollEl;
    try {
        await driver.executeScript('mobile: swipe', [args]);
    } catch {
        await driver.executeScript('mobile: scroll', [args]);
    }
}

// Android-only. `mobile: scrollGesture` constrains its gesture to the given
// rect — UiAutomator2's native gesture generator (GestureController.scroll(),
// confirmed by reading appium-uiautomator2-server's source) can never place a
// touch point outside it. Confirmed via CI run 32379928951's package-tracing
// diagnostics (this file, scrollIntoViewSafe below): swipeUpW3C's raw W3C
// pointer actions — even at coordinates that look safely mid-screen by hand
// calculation (~78%/12% of window height) — backgrounded the app to the
// launcher on their very first call for the profile birthday-day trigger.
// Exactly why a raw touch sequence at those coordinates does that on this
// emulator is still unconfirmed; a rect-bounded native gesture sidesteps the
// question rather than chasing a sixth coordinate theory, since it
// structurally cannot reach whatever it was hitting. Inset comfortably clear
// of the observed danger zone (scroll-profile's own clip edge sat at 87.7%
// of window height in the run that surfaced this).
// `direction: 'down'` reveals content further down the page: GestureController
// .scroll() reverses the given direction to compute the physical swipe, so
// 'down' means the finger swipes up — the same visual effect as swipeUpW3C.
async function scrollGestureAndroidSafe(driver: Browser, percent = 0.66): Promise<void> {
    const size = await driver.getWindowSize();
    const top = Math.round(size.height * 0.15);
    // CI run 32399737088: even with this rect-bounded gesture, the birthday-day
    // trigger's invalid bounds stayed byte-for-byte frozen across every retry —
    // and so did a KNOWN in-flow sibling (`input-profile-notes`, a multi-line
    // TextInput sitting at [_,1474][_,1684] in that frozen state). Both freezing
    // together, not just the trigger, means scrolling wasn't merely insufficient
    // — it was producing zero net progress. At 0.8 this rect's bottom (1536)
    // overlapped notes' top (1474) by ~62px: a touch-down landing inside a
    // TextInput is plausibly captured by its own gesture responder (selection/
    // cursor drag) instead of bubbling to the parent ScrollView, which would
    // explain a swipe that repeatedly does nothing past this exact point.
    // 0.75 clears that overlap with margin while keeping most of the rect.
    const bottom = Math.round(size.height * 0.75);
    await driver.executeScript('mobile: scrollGesture', [{
        left: 0,
        top,
        width: size.width,
        height: bottom - top,
        direction: 'down',
        percent,
    }]);
}

// The default Android AND iOS fallback swipe (see scrollIntoViewSafe below) —
// scrollGestureAndroidSafe only replaces this on Android when the caller opts
// in via strictAndroidBounds (currently just SelectOption.ts's birthday-picker
// trigger, the one path proven to need it).
async function swipeUpW3C(driver: Browser, percent = 0.55): Promise<void> {
    const size = await driver.getWindowSize();
    const centerX = Math.round(size.width / 2);
    const startY = Math.round(size.height * 0.78);
    const endY = Math.round(size.height * Math.max(0.12, 0.78 - percent));

    await driver.performActions([{
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
            { type: 'pointerMove', duration: 0, x: centerX, y: startY },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 60 },
            { type: 'pointerMove', duration: 280, x: centerX, y: endY },
            { type: 'pointerUp', button: 0 },
        ],
    }]);
    await driver.releaseActions();
}

// --- Keyboard handling ---

export async function isKeyboardShown(driver: Browser): Promise<boolean> {
    if (PLATFORM === 'android') {
        // Native Android session command (appium-android-driver's
        // isKeyboardShown, backed by `dumpsys input_method`'s mInputShown) — not
        // an accessibility-tree check like the iOS branch below, since Android's
        // soft keyboard isn't exposed as an element in the app's own hierarchy.
        try {
            return await (driver as any).isKeyboardShown?.() ?? false;
        } catch {
            return false;
        }
    }
    if (PLATFORM !== 'ios') return false;
    try {
        const kb = driver.$('XCUIElementTypeKeyboard');
        return await (kb.isDisplayed() as Promise<boolean>).catch(() => false);
    } catch {
        return false;
    }
}

async function keyboardTopY(driver: Browser): Promise<number | null> {
    try {
        const kb = driver.$('XCUIElementTypeKeyboard');
        if (!(await (kb.isDisplayed() as Promise<boolean>).catch(() => false))) return null;
        const loc = await kb.getLocation();
        return loc.y;
    } catch {
        return null;
    }
}

async function waitForKeyboardState(driver: Browser, shown: boolean, timeoutMs = 900): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if ((await isKeyboardShown(driver)) === shown) return true;
        await new Promise((r) => setTimeout(r, 50));
    }
    return (await isKeyboardShown(driver)) === shown;
}

async function tapOutsideKeyboard(driver: Browser): Promise<void> {
    const size = await driver.getWindowSize();
    const kbTop = await keyboardTopY(driver);
    const safeY = kbTop === null ? 120 : Math.min(120, Math.max(80, kbTop - 40));
    await driver.executeScript('mobile: tap', [{
        x: Math.floor(size.width / 2),
        y: safeY,
    }]);
}

export async function blurActiveTextInput(driver: Browser): Promise<void> {
    if (PLATFORM !== 'ios') return;
    // Same guard `dismissKeyboard` has had all along, and its absence here was
    // plain inconsistency: with no keyboard up there is no focused input to blur,
    // so the tap below is pure side effect. It is not a harmless one — a blind tap
    // at (width/2, 150) lands on a modal's full-screen dismiss scrim and closes it.
    // Across run 30649723752 no keyboard was up at any CLICK preamble, so every one
    // of those taps was gratuitous.
    if (!(await isKeyboardShown(driver))) return;
    try {
        const size = await driver.getWindowSize();
        await driver.executeScript('mobile: tap', [{
            x: Math.floor(size.width / 2),
            y: 150,
        }]);
        await new Promise((r) => setTimeout(r, 80));
    } catch { /* best effort */ }
}

// A first Android branch here (calling `mobile: hideKeyboard` with no
// strategy) was tried as the validation experiment for the "IME parks the
// trigger against the window edge" theory behind the Android btn-option-09
// failures (CI run 32183695855). It REFUTED itself: run 32264080427 took
// Android writes from 3 failures to 15, with a failure class that had never
// appeared before — ten `Can't call click on element` on input-address /
// input-zipcode / input-fullname / input-card-holder / btn-place-order, i.e.
// the whole checkout form going missing rather than any scroll misbehaving.
// Reading appium-android-driver's own hideKeyboard (node_modules/appium-adb's
// keyboard-commands.js) afterward showed why it's the wrong instrument even
// though it DOES correctly no-op when no keyboard is shown: when a keyboard
// IS shown, it tries `KEYCODE_ESC` then falls back to the literal system
// `KEYCODE_BACK` — exactly the kind of navigation event that would explain a
// form vanishing.
//
// Separately (CI runs 32339966832/32344190004), a getCurrentPackage()
// diagnostic pinpointed a DIFFERENT, confirmed mechanism: with dismissKeyboard
// a no-op here, `pkgAfterScroll` still reads the app but `pkgAfterClick` reads
// the launcher, 9/9 times — the plain trigger tap in SelectOption.ts is itself
// what backgrounds the app, immediately after a TYPE into a text field
// (notes) left the keyboard plausibly still up. This branch dismisses via a
// plain coordinate tap at a safe, neutral point near the TOP of the screen —
// the same primitive every other Android action already uses successfully,
// nowhere near the bottom gesture-navigation zone, and NOT a hideKeyboard/
// back-press command of any kind. It only acts when isKeyboardShown() (the
// native Android check above, not an accessibility-tree query) confirms a
// keyboard is actually up.
export async function dismissKeyboard(driver: Browser): Promise<void> {
    if (PLATFORM === 'android') {
        if (!(await isKeyboardShown(driver))) return;
        try {
            const size = await driver.getWindowSize();
            await driver.executeScript('mobile: tap', [{ x: Math.floor(size.width / 2), y: 120 }]);
            await new Promise((r) => setTimeout(r, 200));
        } catch { /* best effort — never fail an action over the keyboard */ }
        return;
    }
    if (PLATFORM !== 'ios') return;
    if (!(await isKeyboardShown(driver))) return;

    try {
        await tapOutsideKeyboard(driver);
        if (await waitForKeyboardState(driver, false, 250)) return;
    } catch { /* try next */ }

    try {
        const maybeDriver = driver as unknown as { hideKeyboard?: () => Promise<void> };
        if (typeof maybeDriver.hideKeyboard === 'function') {
            await maybeDriver.hideKeyboard();
            if (await waitForKeyboardState(driver, false, 250)) return;
        }
    } catch { /* try next */ }

    try {
        await driver.executeScript('mobile: hideKeyboard', [{ strategy: 'tapOutside' }]);
        if (await waitForKeyboardState(driver, false, 250)) return;
    } catch { /* try next */ }
}

// Robust dismissal of the iOS numeric keypad on a SCROLLED form. The generic
// dismissKeyboard above taps at y≈120/150 to "tap outside", but on the JP
// credit-card form those coordinates land ON `input-card-number` (y≈103–151),
// re-focusing it so the pad never closes — and then btn-place-order renders
// UNDER the pad, so a tap at its center hits a keyboard key ('8'). These
// strategies instead target genuinely neutral, non-input scroll content ABOVE
// the keyboard, verifying isKeyboardShown after each. Each step logs its effect
// so a single run reveals which gesture works (or that none does — i.e. the app
// traps the keyboard over its own submit button, which would be an app UX bug).
export async function dismissNumericKeyboardRobust(driver: Browser): Promise<boolean> {
    if (PLATFORM !== 'ios') return true;
    if (!(await isKeyboardShown(driver))) return true;

    const kbTop = await keyboardTopY(driver);
    const size = await driver.getWindowSize();
    const check = async (label: string): Promise<boolean> => {
        const dismissed = await waitForKeyboardState(driver, false, 600);
        process.stderr.write(`[Appium-DBG] KBDISMISS ${label} -> kbShown=${!dismissed}\n`);
        return dismissed;
    };

    // Strategy 1: tap a non-input StaticText above the keyboard. RN ScrollViews
    // default to keyboardShouldPersistTaps='never', so a tap on inert content
    // blurs the focused input. The totals labels sit above kbTop and are NOT the
    // tip controls (tapping a tip % would change the total and fail assertions).
    for (const sel of ['~text-subtotal-label', '~text-delivery-label', '~text-section-summary']) {
        try {
            const el = driver.$(sel);
            if (!(await (el.isExisting() as Promise<boolean>).catch(() => false))) continue;
            const loc = await (el.getLocation() as Promise<{ x: number; y: number }>);
            const sz = await (el.getSize() as Promise<{ width: number; height: number }>);
            const cy = loc.y + sz.height / 2;
            if (kbTop !== null && cy >= kbTop - 8) continue; // must be above the keyboard
            await driver.executeScript('mobile: tap', [{ x: Math.floor(loc.x + sz.width / 2), y: Math.floor(cy) }]);
            if (await check(`tap-static(${sel})`)) return true;
        } catch { /* try next */ }
    }

    // Strategy 2: swipe down on the content (catches keyboardDismissMode='on-drag').
    try {
        const top = kbTop ?? size.height;
        await driver.executeScript('mobile: dragFromToForDuration', [{
            duration: 0.4,
            fromX: Math.floor(size.width / 2), fromY: Math.floor(top * 0.45),
            toX: Math.floor(size.width / 2), toY: Math.floor(top - 6),
        }]);
        if (await check('swipe-down')) return true;
    } catch { /* try next */ }

    // Strategy 3: tap the scrollview background in the left margin (x≈6), above
    // the keyboard and clear of the content's ~24px padding (so not on an input).
    try {
        const top = kbTop ?? size.height;
        const y = Math.max(110, Math.floor((100 + top) / 2));
        await driver.executeScript('mobile: tap', [{ x: 6, y }]);
        if (await check(`margin-tap(6,${y})`)) return true;
    } catch { /* try next */ }

    return !(await isKeyboardShown(driver));
}

// --- Tap-zone safety ---

async function isTrulyDisplayed(driver: Browser, target: any): Promise<boolean> {
    const displayed = await (target.isDisplayed() as Promise<boolean>).catch(() => false);
    if (PLATFORM !== 'ios') return displayed;
    const kbTop = await keyboardTopY(driver);
    try {
        const loc = await (target.getLocation() as Promise<{ x: number; y: number }>);
        const size = await (target.getSize() as Promise<{ width: number; height: number }>);
        const windowSize = await driver.getWindowSize();
        const safeBottom = (kbTop ?? windowSize.height) - 12;
        const centerX = loc.x + size.width / 2;
        const centerY = loc.y + size.height / 2;
        return centerX > 0 && centerX < windowSize.width && centerY > 64 && centerY < safeBottom;
    } catch {
        return displayed;
    }
}

export async function isFrameInTapZone(
    driver: Browser,
    target: any,
    strictAndroidBounds = false,
): Promise<boolean> {
    if (PLATFORM !== 'ios') {
        const displayed = await (target.isDisplayed() as Promise<boolean>).catch(() => false);
        if (!displayed || PLATFORM !== 'android' || !strictAndroidBounds) return displayed;
        // Android's own `displayed` accessibility flag can be true even when the
        // reported bounds are clipped/inverted — confirmed via CI run 32368723226's
        // page-source dumps: `displayed="true"` on a node whose bounds were
        // `[109,1786][348,1684]` (top past its ScrollView's real viewport edge,
        // bottom pinned to the clip line, net negative height). Trusting
        // `isDisplayed()` alone made this "already reachable", so
        // `scrollIntoViewSafe` skipped scrolling entirely and the bad rect never
        // got the chance to be fixed by the very UiScrollable call meant to fix it.
        //
        // Regression (CI run 32399737088, catalog `btn-topping-*` in the reads
        // suite, which had been green in every prior run this session): a global
        // positive-size check here forces scrollIntoViewSafe to scroll before
        // EVERY Android tap action (Click.ts's Android preamble is unconditional,
        // unlike its iOS `alreadyTappable` fast path), and on a virtualized
        // catalog list that scroll can unmount the target entirely — "element
        // wasn't found" ~15s later. A settle-retry window (tried first) didn't
        // help: CI run 32409399175 still failed at the same ~15s cost, proving
        // this isn't a transient pre-layout case for these elements. The real
        // fix is scope, not more tolerance: `strictAndroidBounds` defaults to
        // false so every other caller (Click.ts, Type.ts, ClearText.ts,
        // ScrollTo.ts, and SelectOption.ts's own option-list scroll) keeps the
        // exact pre-session `isDisplayed()`-only behavior. Only SelectOption.ts's
        // birthday-picker TRIGGER scroll opts in, since that element's invalid
        // rect is the one proven persistent (byte-for-byte unchanged across
        // every scroll attempt in every run) rather than transient.
        try {
            const size = await (target.getSize() as Promise<{ width: number; height: number }>);
            return size.height > 0 && size.width > 0;
        } catch {
            return false;
        }
    }
    try {
        const loc = await (target.getLocation() as Promise<{ x: number; y: number }>);
        const size = await (target.getSize() as Promise<{ width: number; height: number }>);
        const windowSize = await driver.getWindowSize();
        const kbTop = await keyboardTopY(driver);
        const safeBottom = (kbTop ?? windowSize.height) - 16;
        const centerX = loc.x + size.width / 2;
        const centerY = loc.y + size.height / 2;
        return centerX > 0 && centerX < windowSize.width && centerY > 64 && centerY < safeBottom;
    } catch {
        return false;
    }
}

interface ClipRect { x: number; y: number; width: number; height: number }

export async function rectOf(el: any): Promise<ClipRect | null> {
    try {
        const loc = await (el.getLocation() as Promise<{ x: number; y: number }>);
        const size = await (el.getSize() as Promise<{ width: number; height: number }>);
        if (!size.width || !size.height) return null;
        return { x: loc.x, y: loc.y, width: size.width, height: size.height };
    } catch {
        return null;
    }
}

// Reachability for SCROLLING, which is a stricter question than `isFrameInTapZone`'s.
//
// `isFrameInTapZone` exists to answer "would a tap at this element's center land
// on it, or on the keyboard?" — so it measures against the WINDOW. A dropdown
// option clipped by its own ScrollView is still inside the window, so that
// predicate calls it reachable and `scrollIntoViewSafe` skips the scroll
// entirely. On a 402x874 iOS window the sheet's list clips at y=718 while
// `safeBottom` is 858, leaving a ~3-row dead band (718 < centerY < 858) where a
// `visible="false"` option reads as "already in view". Confirmed in CI run
// 32183695855: `btn-option-15` sat at centerY 843.5 and got ZERO swipes on both
// attempts — a deterministic failure, not a timing race.
//
// Geometry may only NARROW the answer, never widen it: we still require
// `isFrameInTapZone` first, so keyboard-occluded controls stay excluded.
async function isReachableForScroll(
    driver: Browser,
    target: any,
    clip?: ClipRect | null,
    strictAndroidBounds = false,
): Promise<boolean> {
    if (!(await isFrameInTapZone(driver, target, strictAndroidBounds))) return false;
    if (PLATFORM !== 'ios' || !clip) return true;

    const rect = await rectOf(target);
    if (!rect) return true;
    const centerY = rect.y + rect.height / 2;
    const centerX = rect.x + rect.width / 2;

    // Inside the clip rect → authoritative. Deliberately does NOT consult
    // `isDisplayed()`: RN renders these options as XCUIElementTypeOther, the
    // element type known to under-report `visible` even when drawn.
    if (centerY >= clip.y && centerY <= clip.y + clip.height) return true;

    // Center outside the container vertically. Only treat that as unreachable
    // when the element really is this container's content (horizontally inside
    // it too) — a fixed footer or nav bar that merely overlaps the container's
    // x-range must still pass, so fall back to the driver's own answer.
    const insideX = centerX >= clip.x && centerX <= clip.x + clip.width;
    if (!insideX) return true;
    return await (target.isDisplayed() as Promise<boolean>).catch(() => false);
}

// A momentum-free drag confined to `clip`, so the gesture lands on the intended
// scroll container instead of whatever the window-anchored swipe helpers hit.
// The trailing pause before lift-off is what kills the flick momentum: without
// it the list keeps coasting and the resulting delta is unpredictable, which is
// what made the previous fixed-swipe loop overshoot past its target.
async function dragWithinRect(driver: Browser, clip: ClipRect, dy: number): Promise<void> {
    const x = Math.round(clip.x + clip.width / 2);
    const top = clip.y + 8;
    const bottom = clip.y + clip.height - 8;
    const startY = dy > 0 ? bottom : top;
    const endY = Math.max(top, Math.min(bottom, Math.round(startY - dy)));
    await driver.performActions([{
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
            { type: 'pointerMove', duration: 0, x, y: startY },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 60 },
            { type: 'pointerMove', duration: 400, x, y: endY },
            { type: 'pause', duration: 150 },
            { type: 'pointerUp', button: 0 },
        ],
    }]);
    await driver.releaseActions();
}

export async function tapElementCenter(driver: Browser, target: any): Promise<void> {
    const loc = await (target.getLocation() as Promise<{ x: number; y: number }>);
    const size = await (target.getSize() as Promise<{ width: number; height: number }>);
    const windowSize = await driver.getWindowSize();
    const centerX = Math.max(1, Math.min(windowSize.width - 1, loc.x + size.width / 2));
    const centerY = Math.max(65, Math.min(windowSize.height - 24, loc.y + size.height / 2));
    await driver.executeScript('mobile: tap', [{ x: centerX, y: centerY }]);
}

// --- Android UiScrollable ---

// Diagnostic only — CI run 32373405257: once isFrameInTapZone's positive-size
// fix (this file, earlier) stopped short-circuiting the scroll for an invalid
// rect, scrollIntoViewSafe started ACTUALLY scrolling for the first time in
// this whole investigation — and the app ended up backgrounded to the
// launcher by the time SELECT_OPTION captured its diagnostics, with no
// webdriver-level log entry in the 88s gap to say which of the two scroll
// mechanisms (this UiScrollable call, or the swipeUpW3C loop below) did it.
// Neither call's own computed coordinates land near the gesture-nav zone by
// hand calculation, so this traces it directly instead of guessing again.
async function androidPkgOrNA(driver: Browser): Promise<string> {
    if (PLATFORM !== 'android') return 'n/a';
    return ((await (driver as any).getCurrentPackage?.().catch(() => 'error')) ?? 'error') as string;
}

async function scrollIntoViewAndroid(
    driver: Browser,
    selector: string,
    containerSelector?: string,
): Promise<boolean> {
    if (PLATFORM !== 'android') return false;

    // Accessibility-id targets (`~key`) must scroll by resource-id, not
    // content-desc: RN mirrors testID into both attributes by default, but a
    // node with an explicit accessibilityLabel (e.g. catalog's add-pizza
    // buttons carry a screen-reader label like "Add Prosciutto") overrides
    // content-desc while resource-id still holds the raw testID — confirmed
    // on-device 2026-08-13 via a page-source dump: description("btn-add-
    // pizza-p02") never matches, so UiScrollable silently scrolls to the end
    // of the list looking for a description that was never there.
    let innerSelector: string | undefined;
    if (selector.startsWith('~')) {
        innerSelector = `new UiSelector().resourceId("${selector.slice(1)}")`;
    } else if (selector.startsWith('android=')) {
        innerSelector = selector.slice('android='.length);
    }
    if (!innerSelector) return false;

    // `scrollable(true).instance(0)` picks the FIRST scrollable in the tree.
    // With a dropdown sheet open that is very likely the form BEHIND the
    // sheet, not the sheet's own option list — CI evidence (run 32278988523,
    // headSha 6de4063, the current clean Android baseline): the sheet-
    // readiness probe in SelectOption.ts never fires (the sheet IS open,
    // confirmed present in the hierarchy), yet btn-option-09/-21/-04 still
    // time out. Not the keyboard (that theory, from an OLDER run predating
    // this probe, never reproduced once the probe could actually rule it in
    // or out) — instance(0) most likely resolves to the form behind the
    // sheet, not the sheet's own list, so it scrolls the wrong container.
    // When the caller knows the real scrollable (Dropdown.tsx names its
    // option list `scroll-<triggerTestId>`), scope to it by resource-id.
    let scrollableSelector = 'new UiSelector().scrollable(true).instance(0)';
    const containerId = containerSelector?.startsWith('~')
        ? containerSelector.slice(1)
        : containerSelector?.match(/resourceId\("([^"]+)"\)/)?.[1];
    if (containerId) {
        scrollableSelector = `new UiSelector().resourceId("${containerId}")`;
    }

    const uiScrollable = `new UiScrollable(${scrollableSelector}).scrollIntoView(${innerSelector})`;
    const pkgBefore = await androidPkgOrNA(driver);
    try {
        await driver.$(`android=${uiScrollable}`);
        const pkgAfter = await androidPkgOrNA(driver);
        if (pkgAfter !== pkgBefore) {
            logger.warn({ selector, scrollableSelector, pkgBefore, pkgAfter }, '[Appium] scrollIntoViewAndroid: foreground package changed across the UiScrollable call');
        }
        return true;
    } catch (err) {
        const pkgAfter = await androidPkgOrNA(driver);
        if (pkgAfter !== pkgBefore) {
            logger.warn({ selector, scrollableSelector, pkgBefore, pkgAfter, error: (err as Error).message }, '[Appium] scrollIntoViewAndroid: foreground package changed across a failing UiScrollable call');
        }
        return false;
    }
}

// `container`, when supplied, is the element that actually CLIPS `target` (e.g. a
// dropdown sheet's own `~scroll-<testId>` list). Passing it switches this helper
// from window-relative guessing to container-relative measurement — see
// `isReachableForScroll`. Callers that don't know the container keep the old
// behaviour verbatim.
//
// iOS ONLY. The dead band `isReachableForScroll` corrects is an XCUI artifact —
// that helper already early-returns `true` for every other platform, so on
// Android the container buys no predicate accuracy while the measured drag costs
// something real: it needs `rectOf(target)` to resolve, and an off-screen option
// that is not yet in the UiAutomator hierarchy has no coordinates, so `rectOf`
// returns null and the loop breaks having scrolled NOTHING. UiScrollable, which
// this used before, searches by SELECTOR and scrolls fine without the node being
// present. Honouring `container` on Android therefore disabled the one mechanism
// that worked: CI run 32235723842 took Android writes from 3 failures to 11, with
// 10 of them on `btn-option-12` — the checkout expiry-month path that had been
// green. Scoping the container to iOS restores Android verbatim.
// `container` is an ELEMENT, used only on iOS to measure a clipping rect (see
// `isReachableForScroll`/`dragWithinRect` above) — unrelated to Android.
// `androidContainerSelector` is a separate, Android-only STRING (a `~key` or
// already-androidized `android=...` selector for the actual scrollable, e.g.
// a dropdown sheet's own `scroll-<testId>` list) that scopes
// `scrollIntoViewAndroid`'s UiScrollable query instead of its `instance(0)`
// guess. The two are independent: passing one does not imply or require the
// other, and each is a no-op on the platform it doesn't apply to.
export async function scrollIntoViewSafe(
    driver: Browser,
    target: any,
    selector: string,
    maxAttempts = 3,
    container?: any,
    androidContainerSelector?: string,
    // Opt-in only — see isFrameInTapZone's Android branch for why this must
    // default to false. Only SelectOption.ts's birthday-picker trigger scroll
    // passes true.
    strictAndroidBounds = false,
): Promise<void> {
    const clip = (PLATFORM === 'ios' && container) ? await rectOf(container) : null;

    if (await isReachableForScroll(driver, target, clip, strictAndroidBounds)) return;

    if (
        PLATFORM === 'android' &&
        await scrollIntoViewAndroid(driver, selector, androidContainerSelector) &&
        await isReachableForScroll(driver, target, clip, strictAndroidBounds)
    ) {
        return;
    }

    let attempts = 0;
    while (attempts < maxAttempts) {
        if (clip) {
            // Measured drag: aim the element's center at the container's center.
            // Clamped to just under one viewport per step so a long list converges
            // monotonically instead of overshooting — the old blind swipe moved
            // 651-673pt through a 561pt viewport, which could jump a target clean
            // past the top and then keep scrolling away from it forever.
            const rect = await rectOf(target);
            if (!rect) break;
            const dy = (rect.y + rect.height / 2) - (clip.y + clip.height / 2);
            const limit = clip.height - 16;
            const step = Math.max(-limit, Math.min(limit, dy));
            if (Math.abs(step) < 1) break;
            await dragWithinRect(driver, clip, step);
        } else if (PLATFORM === 'android') {
            // On UiAutomator2 `mobile: swipe` is unsupported and `mobile: scroll`
            // with a bare direction silently no-ops — so swipeUpBulk never threw
            // and a raw touch swipe was needed to actually scroll RN ScrollViews
            // (verified on-device 2026-05-28).
            //
            // Regression (CI runs 32399737088/32409399175/32418886330): scoping
            // isFrameInTapZone's strict check (previous commit) did NOT restore
            // `reads` to green — the catalog's `btn-topping-*` CLICK still spent
            // ~13-18s scrolling before "element wasn't found", proving the cause
            // was never isFrameInTapZone. Commit timeline settles it: `reads` was
            // still green on 88f75d5 (isFrameInTapZone's blanket change already
            // live) and only broke on 5fc6173, the commit that made
            // scrollGestureAndroidSafe (mobile: scrollGesture) the DEFAULT Android
            // fallback for every scrollIntoViewSafe caller, not just the
            // birthday-picker. Its package-tracer logged 0 backgrounding
            // occurrences on the catalog grid — scrollGestureAndroidSafe isn't
            // backgrounding the app there, it's just less effective than the old
            // swipeUpW3C at scrolling that widget (its rect-bounded throw is
            // shorter, and/or the catalog uses a different scrollable than
            // scroll-profile). scrollGestureAndroidSafe exists to solve ONE proven
            // problem — swipeUpW3C backgrounding the birthday-picker trigger — so
            // scope it there via the same strictAndroidBounds flag rather than
            // making every Android scroll pay for a fix only one path needed.
            const pkgBefore = await androidPkgOrNA(driver);
            if (strictAndroidBounds) {
                await scrollGestureAndroidSafe(driver, 0.66);
            } else {
                await swipeUpW3C(driver, 0.66);
            }
            const pkgAfter = await androidPkgOrNA(driver);
            if (pkgAfter !== pkgBefore) {
                logger.warn({ selector, attempt: attempts, pkgBefore, pkgAfter }, '[Appium] scrollIntoViewSafe: foreground package changed across an Android scroll');
            }
        } else {
            try {
                await swipeUpBulk(driver);
            } catch {
                await swipeUpW3C(driver, 0.66);
            }
        }
        attempts++;
        if (await isReachableForScroll(driver, target, clip, strictAndroidBounds)) return;
        if (!clip && await isTrulyDisplayed(driver, target)) return;
    }
}

// --- Text extraction ---

export async function readVisibleText(el: any): Promise<string> {
    const text = (await el.getText().catch(() => '')) as string;
    if (PLATFORM !== 'ios') return text;

    const id = (await el.getAttribute('name').catch(() => '')) as string;
    const labelShadowsId = text && id && text === id;
    if (!labelShadowsId) return text;

    const value = (await el.getAttribute('value').catch(() => '')) as string;
    if (value) return value;

    const childStatics = await el.$$('XCUIElementTypeStaticText').getElements().catch(() => []);
    for (const child of childStatics) {
        const childText = (await child.getText().catch(() => '')) as string;
        if (childText && childText !== id) return childText;
    }
    return text;
}

async function readEditableValue(el: any): Promise<string> {
    const value = (await el.getAttribute('value').catch(() => '')) as string;
    if (value) return value;
    return (await el.getText().catch(() => '')) as string;
}

function normalizeTypedValue(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function digitsOnly(value: string): string {
    return value.replace(/\D/g, '');
}

function isCardNumberSelector(selector: string): boolean {
    return selector.includes('input-card-number');
}

function isMaskedValue(value: string): boolean {
    return /^[•●*]+$/.test(value);
}

function typedValuesMatch(expected: string, actual: string, selector = ''): boolean {
    if (actual === expected) return true;
    if (isMaskedValue(actual)) {
        return actual.length === expected.length;
    }

    const expectedDigits = digitsOnly(expected);
    const actualDigits = digitsOnly(actual);
    if (isCardNumberSelector(selector) && expectedDigits.length >= 12) {
        return actualDigits === expectedDigits || actualDigits === expectedDigits.slice(-4);
    }

    return expectedDigits.length > 0 &&
        expectedDigits === actualDigits &&
        expectedDigits.length >= Math.min(4, expected.length);
}

function shouldVerifyTypedText(text: string, selector = ''): boolean {
    if (PLATFORM !== 'ios') return false;
    if (/[A-Za-z]/.test(text)) return true;
    if (isCardNumberSelector(selector)) return true;
    return /^\d{3,}$/.test(text);
}

async function clearAndFocus(target: any): Promise<void> {
    await (target.clearValue() as Promise<void>).catch(() => undefined);
    await (target.click() as Promise<void>);
}

export async function typeTextIntoTarget(
    driver: Browser,
    target: any,
    text: string,
    selector = '',
): Promise<void> {
    await (target.setValue(text) as Promise<void>);
    if (!shouldVerifyTypedText(text, selector)) return;

    const expected = normalizeTypedValue(text);
    let actual = normalizeTypedValue(await readEditableValue(target));
    if (typedValuesMatch(expected, actual, selector)) return;

    try {
        await clearAndFocus(target);
        await driver.executeScript('mobile: type', [{ text }]);
        actual = normalizeTypedValue(await readEditableValue(target));
        if (typedValuesMatch(expected, actual, selector)) return;
    } catch { /* fall through to W3C keys */ }

    try {
        await clearAndFocus(target);
        await driver.keys(text.split('') as any);
        actual = normalizeTypedValue(await readEditableValue(target));
        if (typedValuesMatch(expected, actual, selector)) return;
    } catch { /* fall through to chunked addValue */ }

    await clearAndFocus(target);
    for (const chunk of text.match(/\S+|\s+/g) ?? [text]) {
        await (target.addValue(chunk) as Promise<void>);
        await new Promise((r) => setTimeout(r, 50));
    }

    actual = normalizeTypedValue(await readEditableValue(target));
    if (!typedValuesMatch(expected, actual, selector)) {
        throw new Error(`[TYPE] iOS text entry mismatch: expected "${text}", got "${actual}"`);
    }
}

// Bundled helper object used as ActionContext.helpers in handlers.
export const appiumHelpers = {
    dismissKeyboard,
    isKeyboardShown,
    dismissNumericKeyboardRobust,
    dismissAndroidSystemDialog,
    scrollIntoViewSafe,
    scrollContainerFor,
    isFrameInTapZone,
    tapElementCenter,
    typeTextIntoTarget,
    readVisibleText,
    getAppId,
    blurActiveTextInput,
};

export type AppiumHelpers = typeof appiumHelpers;
