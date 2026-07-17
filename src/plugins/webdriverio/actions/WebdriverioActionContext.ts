import type { Browser } from 'webdriverio';
import {
    ActionInvocationContext,
    DriverContext,
    MetadataContext,
    PlatformContext,
    ViewportContext,
} from '@plugins/shared/ActionHandler';

// Mirrors AppiumActionContext's shape (both plugins share the same
// webdriverio `Browser` client type) rather than PlaywrightActionContext's
// `page: Page` shape — WebdriverIO's `$()`/element API hangs off `Browser`
// directly, there is no separate page/context object.
export interface WebdriverioActionContext
    extends ActionInvocationContext, DriverContext<Browser>, PlatformContext, ViewportContext, MetadataContext {
    driver: Browser;
}
