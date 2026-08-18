import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { WebdriverioActionContext } from '@plugins/webdriverio/actions/WebdriverioActionContext';
import { locate, parseLocator } from '@plugins/webdriverio/actions/WebDriverIOLocator';

export const SelectOptionAction: ActionHandler<WebdriverioActionContext> = {
    name: 'SELECT_OPTION',
    // selectByAttribute('value', ...) matches Playwright's selectOption(string)
    // default behavior: match by the <option value="..."> attribute.
    async execute({ driver, target }) {
        const { selector, value } = parseSelectorValue(target, 'SELECT_OPTION action');
        await locate(driver, parseLocator(selector)).selectByAttribute('value', value);
        return `Selected option ${value} in element: ${selector}`;
    },
};
