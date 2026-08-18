import { ActionHandler } from '@plugins/shared/ActionHandler';
import {
    MobilewrightActionContext,
    parseLocator,
    locate,
    scrollIntoViewSafe,
} from '@plugins/mobilewright/actions/MobilewrightActionContext';

export const ScrollToAction: ActionHandler<MobilewrightActionContext> = {
    name: 'SCROLL_TO',
    async execute({ driver, target }) {
        const strategy = parseLocator(target);
        const locator = await locate(driver, strategy);
        await scrollIntoViewSafe(driver, locator);
        return `Scrolled to mobilewright element: ${strategy.kind}=${strategy.value}`;
    },
};
