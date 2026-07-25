import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import {
    MobilewrightActionContext,
    parseLocator,
    locate,
    scrollIntoViewSafe,
} from '@plugins/mobilewright/actions/MobilewrightActionContext';

export const TypeAction: ActionHandler<MobilewrightActionContext> = {
    name: 'TYPE',
    async execute({ driver, target, platform }) {
        const { selector, value } = parseSelectorValue(target, 'TYPE action');
        const strategy = parseLocator(selector);
        const locator = await locate(driver, strategy);
        await scrollIntoViewSafe(driver, locator);
        await locator.tap(); // focus the field
        await locator.fill(value);
        // Filling a field leaves the soft keyboard open. Locator.tap() is a raw
        // coordinate tap (see MobilewrightActionContext.locate), so a later CLICK
        // on a target the keyboard now overlaps (e.g. a login/submit button below
        // the field) would land on a keyboard key instead — confirmed on-device via
        // screencap during the OmniPizza login flow. Android's BACK key dismisses
        // an open IME without navigating (the InputMethodService consumes it before
        // the Activity sees it), so this is safe to send unconditionally here since
        // fill() guarantees the keyboard is up. No iOS equivalent yet — same class
        // of issue is possible there but unverified without a device.
        if (platform === 'android') {
            await driver.driver.pressButton('BACK');
        }
        return `Typed into mobilewright element: ${strategy.kind}=${strategy.value}`;
    },
};
