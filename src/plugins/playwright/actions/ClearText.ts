import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const ClearTextAction: ActionHandler<PlaywrightActionContext> = {
    name: 'CLEAR_TEXT',
    async execute({ page, target }) {
        await locate(page, parseLocator(target)).fill('');
        return `Cleared text in element: ${target}`;
    },
};
