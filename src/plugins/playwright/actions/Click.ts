import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const ClickAction: ActionHandler<PlaywrightActionContext> = {
    name: 'CLICK',
    async execute({ page, target }) {
        await locate(page, parseLocator(target)).click();
        return `Click executed on element: ${target}`;
    },
};
