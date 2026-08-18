import { ActionHandler } from '@plugins/shared/ActionHandler';
import { WebdriverioActionContext } from '@plugins/webdriverio/actions/WebdriverioActionContext';
import { locate, parseLocator } from '@plugins/webdriverio/actions/WebDriverIOLocator';

export const ScrollToAction: ActionHandler<WebdriverioActionContext> = {
    name: 'SCROLL_TO',
    async execute({ driver, target }) {
        await locate(driver, parseLocator(target)).scrollIntoView();
        return `Scrolled to: ${target}`;
    },
};
