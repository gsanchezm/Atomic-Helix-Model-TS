import { ActionHandler } from '@plugins/shared/ActionHandler';
import { WebdriverioActionContext } from '@plugins/webdriverio/actions/WebdriverioActionContext';

export const NavigateAction: ActionHandler<WebdriverioActionContext> = {
    name: 'NAVIGATE',
    async execute({ driver, target }) {
        await driver.url(target);
        return `Navigated successfully to ${target}`;
    },
};
