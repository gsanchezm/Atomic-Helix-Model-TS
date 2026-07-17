import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const ScrollToAction: ActionHandler<PlaywrightActionContext> = {
    name: 'SCROLL_TO',
    async execute({ page, target }) {
        await locate(page, parseLocator(target)).scrollIntoViewIfNeeded();
        return `Scrolled to: ${target}`;
    },
};
