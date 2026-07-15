import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';

export const SelectOptionAction: ActionHandler<AppiumActionContext> = {
    name: 'SELECT_OPTION',
    async execute({ driver, target, helpers }) {
        const { selector, value } = parseSelectorValue(target, 'SELECT_OPTION action');
        const trigger = driver.$(selector);
        await helpers.scrollIntoViewSafe(driver, trigger, selector, 5);
        await (trigger.click() as Promise<void>);

        // OmniPizza's RN Dropdown exposes every option as btn-option-{value}.
        const optionSelector = `~btn-option-${value}`;
        const option = driver.$(optionSelector);
        await option.waitForDisplayed({ timeout: 10_000 });
        await (option.click() as Promise<void>);
        return `Selected mobile option ${value} from element: ${selector}`;
    },
};
