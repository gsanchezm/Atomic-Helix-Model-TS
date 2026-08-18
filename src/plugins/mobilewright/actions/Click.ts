import { ActionHandler } from '@plugins/shared/ActionHandler';
import {
    MobilewrightActionContext,
    parseLocator,
    locate,
    scrollIntoViewSafe,
} from '@plugins/mobilewright/actions/MobilewrightActionContext';

export const ClickAction: ActionHandler<MobilewrightActionContext> = {
    name: 'CLICK',
    async execute({ driver, target }) {
        const strategy = parseLocator(target);
        const locator = await locate(driver, strategy);
        await scrollIntoViewSafe(driver, locator);
        await locator.tap();
        return `Tapped on mobilewright element: ${strategy.kind}=${strategy.value}`;
    },
};
