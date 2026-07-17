import { ActionHandler } from '@plugins/shared/ActionHandler';
import { WebdriverioActionContext } from '@plugins/webdriverio/actions/WebdriverioActionContext';
import { locate, parseLocator } from '@plugins/webdriverio/actions/WebDriverIOLocator';

export const ClickAction: ActionHandler<WebdriverioActionContext> = {
    name: 'CLICK',
    async execute({ driver, target }) {
        await locate(driver, parseLocator(target)).click();
        return `Click executed on element: ${target}`;
    },
};
