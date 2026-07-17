import { ActionHandler } from '@plugins/shared/ActionHandler';
import { WebdriverioActionContext } from '@plugins/webdriverio/actions/WebdriverioActionContext';
import { locate, parseLocator } from '@plugins/webdriverio/actions/WebDriverIOLocator';

export const ReadTextAction: ActionHandler<WebdriverioActionContext> = {
    name: 'READ_TEXT',
    // Mirrors Playwright's ReadText: form controls' user-visible text is
    // their `value`, not their rendered text node. WebdriverIO's own
    // getTagName() already returns a lower-cased tag name, unlike
    // Playwright's evaluate()-based lookup.
    async execute({ driver, target }) {
        const el = locate(driver, parseLocator(target));
        const tag = await el.getTagName().catch(() => '');
        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
            return await el.getValue();
        }
        return await el.getText();
    },
};
