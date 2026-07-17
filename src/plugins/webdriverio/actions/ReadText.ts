import { ActionHandler } from '@plugins/shared/ActionHandler';
import { WebdriverioActionContext } from '@plugins/webdriverio/actions/WebdriverioActionContext';
import { parseLocator, toSelector } from '@plugins/webdriverio/actions/WebDriverIOLocator';

export const ReadTextAction: ActionHandler<WebdriverioActionContext> = {
    name: 'READ_TEXT',
    // Unlike every other WebdriverIO action handler, this one does NOT use
    // `locate()` — a locator that resolves to a prefix-style/list-widget
    // selector (e.g. `[data-testid^='market-']`) can match several elements,
    // and `locate()`'s single-match `driver.$()` would silently drop the
    // rest. Fan out over every match via `driver.$$()` instead (mirroring
    // Appium's ReadText, which does the same over the same underlying
    // `webdriverio` client), joining with "\n" like Appium/Playwright both
    // do. Form controls' user-visible text is their `value`, not their
    // rendered text node — WebdriverIO's own getTagName() already returns a
    // lower-cased tag name, unlike Playwright's evaluate()-based lookup —
    // so that branch (mirrored from Playwright's ReadText) is applied per
    // matched element.
    async execute({ driver, target }) {
        const elements = await driver.$$(toSelector(parseLocator(target))).getElements();
        const parts: string[] = [];
        for (const el of elements) {
            const tag = await el.getTagName().catch(() => '');
            if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                parts.push(await el.getValue());
            } else {
                parts.push(await el.getText());
            }
        }
        return parts.join('\n');
    },
};
