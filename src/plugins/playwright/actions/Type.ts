import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const TypeAction: ActionHandler<PlaywrightActionContext> = {
    name: 'TYPE',
    async execute({ page, target }) {
        const { selector, value } = parseSelectorValue(target, 'TYPE action');
        await locate(page, parseLocator(selector)).fill(value);
        return `Typed text into element: ${selector}`;
    },
};
