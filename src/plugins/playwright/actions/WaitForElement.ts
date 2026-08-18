import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorTimeout } from '@plugins/shared/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const WaitForElementAction: ActionHandler<PlaywrightActionContext> = {
    name: 'WAIT_FOR_ELEMENT',
    async execute({ page, target }) {
        const { selector, timeoutMs } = parseSelectorTimeout(target, 5000);
        // .first() so list locators (e.g. `[data-testid^='size-']`) don't
        // trip Playwright's strict-mode 1-element constraint.
        await locate(page, parseLocator(selector)).first().waitFor({ state: 'visible', timeout: timeoutMs });
        return `Element visible: ${selector}`;
    },
};
