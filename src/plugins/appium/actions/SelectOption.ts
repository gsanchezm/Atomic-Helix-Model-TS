import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';
import { androidizeAccessibilitySelector } from '@plugins/appium/appium-helpers';

export const SelectOptionAction: ActionHandler<AppiumActionContext> = {
    name: 'SELECT_OPTION',
    async execute({ driver, target, helpers }) {
        const { selector, value } = parseSelectorValue(target, 'SELECT_OPTION action');
        const trigger = driver.$(selector);
        // iOS: a still-open keyboard from a preceding TYPE (e.g. card number)
        // can occlude/absorb the scroll gesture before it reaches this
        // trigger — same class of issue Click.ts already guards against.
        // TYPE's own dismissKeyboard() is best-effort and not guaranteed to
        // have succeeded by the time this action runs.
        await helpers.dismissKeyboard(driver);
        await helpers.blurActiveTextInput(driver);
        await helpers.scrollIntoViewSafe(driver, trigger, selector, 5);
        await (trigger.click() as Promise<void>);

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
            await helpers.scrollIntoViewSafe(driver, option, optionSelector, 5);
            await option.waitForDisplayed({ timeout: 10_000 });
        } catch (err) {
            try {
                const src = await driver.getPageSource();
                process.stderr.write(
                    `[Appium-DBG] SELECT_OPTION ${optionSelector} timeout — pageSource head:\n${src.slice(0, 60000)}\n[Appium-DBG] end pageSource\n`,
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
