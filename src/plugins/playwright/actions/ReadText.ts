import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { locate, parseLocator } from '@plugins/playwright/actions/PlaywrightLocator';

export const ReadTextAction: ActionHandler<PlaywrightActionContext> = {
    name: 'READ_TEXT',
    // Reads the "user-visible text" of the matched element(s). For inputs /
    // textareas / selects the user-visible text is the `value` property, not
    // `textContent` (which is empty on void/form elements). The branch is
    // keyed off the DOM node's tagName so non-form elements continue to
    // behave exactly as before.
    async execute({ page, target }) {
        const locator = locate(page, parseLocator(target));
        const count = await locator.count();
        if (count === 0) return '';
        const parts: string[] = [];
        for (let i = 0; i < count; i++) {
            const el = locator.nth(i);
            const tag = await el.evaluate((node) => node.nodeName.toUpperCase()).catch(() => '');
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                parts.push(await el.inputValue().catch(() => ''));
            } else {
                parts.push((await el.textContent()) ?? '');
            }
        }
        return parts.join('\n');
    },
};
