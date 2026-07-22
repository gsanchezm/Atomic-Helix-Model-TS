import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import {
    MobilewrightActionContext,
    locate,
    parseLocator,
    scrollIntoViewSafe,
} from '@plugins/mobilewright/actions/MobilewrightActionContext';

export const SelectOptionAction: ActionHandler<MobilewrightActionContext> = {
    name: 'SELECT_OPTION',
    async execute({ driver, target }) {
        const { selector, value } = parseSelectorValue(target, 'SELECT_OPTION action');
        const trigger = await locate(driver, parseLocator(selector));
        await scrollIntoViewSafe(driver, trigger);
        await trigger.tap();
        const option = await locate(driver, { kind: 'testId', value: `btn-option-${value}` });
        // The option list is a scrollable RadioButton list inside the picker
        // modal — early options (e.g. month "01") render inside the initial
        // viewport, but later ones (e.g. month "12") sit below the modal's
        // visible bound and never mount without a scroll first. Mirrors
        // Appium's scrollIntoViewSafe-on-the-option fix for the same widget.
        await scrollIntoViewSafe(driver, option);
        await option.waitFor({ state: 'visible', timeout: 10_000 });
        await option.tap();
        return `Selected mobilewright option ${value} from element: ${selector}`;
    },
};
