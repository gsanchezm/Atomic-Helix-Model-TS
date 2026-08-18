import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorTimeout } from '@plugins/shared/parseCompositeTarget';
import { WebdriverioActionContext } from '@plugins/webdriverio/actions/WebdriverioActionContext';
import { locate, parseLocator } from '@plugins/webdriverio/actions/WebDriverIOLocator';

export const WaitForElementAction: ActionHandler<WebdriverioActionContext> = {
    name: 'WAIT_FOR_ELEMENT',
    async execute({ driver, target }) {
        const { selector, timeoutMs } = parseSelectorTimeout(target, 5000);
        await locate(driver, parseLocator(selector)).waitForDisplayed({ timeout: timeoutMs });
        return `Element visible: ${selector}`;
    },
};
