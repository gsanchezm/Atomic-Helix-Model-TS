/**
 * mobilewright's own `Locator.getByTestId()` takes the bare testID (see
 * `MobilewrightActionContext.parseLocator` — a `~` doesn't match any
 * recognized locator-kind prefix, so it's swallowed into the testId value
 * verbatim and never matches the real element). Molecules that hand-build a
 * raw mobile selector — because the value has an id interpolated into it
 * that the static `*.wright.locators.json` / `*.webdriver.locators.json`
 * contracts can't hold — must route the testID through here instead of
 * hardcoding a driver-specific prefix, or mobilewright silently fails to
 * locate the element.
 *
 * Appium's Android path does NOT use `~` (accessibility id / content-desc):
 * OmniPizza's RN Android build only mirrors `testID` into `content-desc`
 * when the element has no explicit `accessibilityLabel` — most interactive
 * elements (buttons, inputs) and any element with visible text DO set one,
 * so their content-desc is a human-readable label ("Add Margherita to
 * cart", "$12.99"), not the testID, and `~testId` silently finds nothing.
 * `resource-id` carries the literal testID unconditionally (confirmed via a
 * live on-device uiautomator dump), so Android selects by `resourceId()`
 * instead. iOS's `accessibilityIdentifier` does map testID correctly, so it
 * keeps the `~` accessibility-id form.
 */
export function mobileTestId(testId: string): string {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    if (driver !== 'appium') return testId;
    const platform = (process.env.PLATFORM ?? 'android').toLowerCase();
    return platform === 'ios' ? `~${testId}` : `android=new UiSelector().resourceId("${testId}")`;
}
