import { ActionHandler } from '@plugins/shared/ActionHandler';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';

// Dumps the current accessibility-tree/page-source XML from the active
// Appium session — a debugging primitive, same shape as SCREENSHOT (no
// locator target consumed, called ad hoc rather than as part of normal
// scenario assertions).
export const GetPageSourceAction: ActionHandler<AppiumActionContext> = {
    name: 'GET_PAGE_SOURCE',
    async execute({ driver }) {
        return await driver.getPageSource();
    },
};
