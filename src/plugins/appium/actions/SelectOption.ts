import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';
import { androidizeAccessibilitySelector } from '@plugins/appium/appium-helpers';

export const SelectOptionAction: ActionHandler<AppiumActionContext> = {
    name: 'SELECT_OPTION',
    async execute({ driver, target, helpers }) {
        const { selector, value } = parseSelectorValue(target, 'SELECT_OPTION action');
        const trigger = driver.$(selector);
        await helpers.scrollIntoViewSafe(driver, trigger, selector, 5);
        await (trigger.click() as Promise<void>);

        // OmniPizza's RN Dropdown exposes every option as btn-option-{value},
        // with its own accessibilityLabel (the option's display text) distinct
        // from the testID — same content-desc/resource-id split as any other
        // ~key selector, but built here rather than passed through execute()'s
        // dispatch rewrite, so it needs the same androidization explicitly.
        const optionSelector = androidizeAccessibilitySelector(`~btn-option-${value}`);
        const option = driver.$(optionSelector);
        // Options render inside a ScrollView sheet (Dropdown.tsx) capped at
        // 70% screen height — a late option (e.g. month "12" in a 1-12 list)
        // sits off-screen until scrolled into view, confirmed on-device
        // 2026-08-13 (all 5 credit-card scenarios timed out identically on
        // btn-option-12 even after the selector itself was fixed).
        await helpers.scrollIntoViewSafe(driver, option, optionSelector, 5);
        await option.waitForDisplayed({ timeout: 10_000 });
        await (option.click() as Promise<void>);
        return `Selected mobile option ${value} from element: ${selector}`;
    },
};
