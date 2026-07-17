import { ActionHandler } from '@plugins/shared/ActionHandler';
import {
    MobilewrightActionContext,
    parseLocator,
    locate,
} from '@plugins/mobilewright/actions/MobilewrightActionContext';

export const ClearTextAction: ActionHandler<MobilewrightActionContext> = {
    name: 'CLEAR_TEXT',
    async execute({ driver, target }) {
        const strategy = parseLocator(target);
        const locator = await locate(driver, strategy);
        await locator.scrollIntoViewIfNeeded();
        // .clear() taps + selects-all + backspaces without a trailing
        // typeText(''), which the mobilecli backend rejects ("text is
        // required"). fill('') hit that exact rejection on every call.
        await locator.clear();
        return `Cleared text in mobilewright element: ${strategy.kind}=${strategy.value}`;
    },
};
