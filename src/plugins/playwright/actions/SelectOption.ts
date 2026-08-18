import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const SelectOptionAction: ActionHandler<PlaywrightActionContext> = {
    name: 'SELECT_OPTION',
    async execute({ page, target }) {
        const { selector, value } = parseSelectorValue(target, 'SELECT_OPTION action');
        await locate(page, parseLocator(selector)).selectOption(value);
        return `Selected option ${value} in element: ${selector}`;
    },
};
