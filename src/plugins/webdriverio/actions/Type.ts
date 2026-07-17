import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { WebdriverioActionContext } from '@plugins/webdriverio/actions/WebdriverioActionContext';
import { locate, parseLocator } from '@plugins/webdriverio/actions/WebDriverIOLocator';

export const TypeAction: ActionHandler<WebdriverioActionContext> = {
    name: 'TYPE',
    async execute({ driver, target }) {
        const { selector, value } = parseSelectorValue(target, 'TYPE action');
        // setValue clears the field before typing — matches Playwright's
        // .fill() semantics, not an additive keystroke append.
        await locate(driver, parseLocator(selector)).setValue(value);
        return `Typed text into element: ${selector}`;
    },
};
