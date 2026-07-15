import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import {
    MobilewrightActionContext,
    locate,
    parseLocator,
} from '@plugins/mobilewright/actions/MobilewrightActionContext';

export const SelectOptionAction: ActionHandler<MobilewrightActionContext> = {
    name: 'SELECT_OPTION',
    async execute({ driver, target }) {
        const { selector, value } = parseSelectorValue(target, 'SELECT_OPTION action');
        const trigger = await locate(driver, parseLocator(selector));
        await trigger.scrollIntoViewIfNeeded();
        await trigger.tap();
        const option = await locate(driver, { kind: 'testId', value: `btn-option-${value}` });
        await option.waitFor({ state: 'visible', timeout: 10_000 });
        await option.tap();
        return `Selected mobilewright option ${value} from element: ${selector}`;
    },
};
