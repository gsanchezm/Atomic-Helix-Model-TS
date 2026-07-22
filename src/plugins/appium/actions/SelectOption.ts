import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { AppiumActionContext } from '@plugins/appium/actions/AppiumActionContext';

export const SelectOptionAction: ActionHandler<AppiumActionContext> = {
    name: 'SELECT_OPTION',
    async execute({ driver, target, helpers, platform }) {
        const { selector, value } = parseSelectorValue(target, 'SELECT_OPTION action');
        const trigger = driver.$(selector);
        await helpers.scrollIntoViewSafe(driver, trigger, selector, 5);
        await (trigger.click() as Promise<void>);

        // OmniPizza's RN Dropdown exposes every option as btn-option-{value}.
        // Android's content-desc only mirrors testID when no explicit
        // accessibilityLabel is set — dropdown options set one, so `~` (which
        // looks up by content-desc) never matches; resourceId does. See
        // mobile-selector.ts for the same fix applied to mobileTestId().
        const optionSelector = platform === 'ios'
            ? `~btn-option-${value}`
            : `android=new UiSelector().resourceId("btn-option-${value}")`;
        const option = driver.$(optionSelector);
        try {
            // The dropdown's option list is a scrollable RadioButton list —
            // early options (e.g. month "01") render inside the initial
            // viewport, but later ones (e.g. month "12") sit below the
            // modal's visible bound and never mount without a scroll first.
            await helpers.scrollIntoViewSafe(driver, option, optionSelector);
            await option.waitForDisplayed({ timeout: 10_000 });
        } catch (err) {
            try {
                const src = await driver.getPageSource();
                process.stderr.write(
                    `[Appium-DBG] SELECT_OPTION ${optionSelector} timeout — pageSource head:\n${src.slice(0, 60000)}\n[Appium-DBG] end pageSource\n`,
                );
            } catch (dumpErr) {
                process.stderr.write(
                    `[Appium-DBG] SELECT_OPTION ${optionSelector} timeout — pageSource dump failed: ${(dumpErr as Error).message}\n`,
                );
            }
            throw err;
        }
        await (option.click() as Promise<void>);
        return `Selected mobile option ${value} from element: ${selector}`;
    },
};
