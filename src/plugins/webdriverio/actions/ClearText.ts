import { ActionHandler } from '@plugins/shared/ActionHandler';
import { WebdriverioActionContext } from '@plugins/webdriverio/actions/WebdriverioActionContext';
import { locate, parseLocator } from '@plugins/webdriverio/actions/WebDriverIOLocator';

export const ClearTextAction: ActionHandler<WebdriverioActionContext> = {
    name: 'CLEAR_TEXT',
    async execute({ driver, target }) {
        await locate(driver, parseLocator(target)).clearValue();
        return `Cleared text in element: ${target}`;
    },
};
