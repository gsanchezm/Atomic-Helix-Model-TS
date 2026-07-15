import { ActionRegistry } from '@plugins/shared/ActionRegistry';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { NavigateAction } from '@plugins/playwright/actions/Navigate';
import { ClickAction } from '@plugins/playwright/actions/Click';
import { TypeAction } from '@plugins/playwright/actions/Type';
import { SelectOptionAction } from '@plugins/playwright/actions/SelectOption';
import { ClearTextAction } from '@plugins/playwright/actions/ClearText';
import { ReadTextAction } from '@plugins/playwright/actions/ReadText';
import { WaitForElementAction } from '@plugins/playwright/actions/WaitForElement';
import { AssertTextAction } from '@plugins/playwright/actions/AssertText';
import { ScrollToAction } from '@plugins/playwright/actions/ScrollTo';
import { BrowserCommandAction } from '@plugins/playwright/actions/BrowserCommand';
import { ScreenshotAction } from '@plugins/playwright/actions/Screenshot';
import { RunAccessibilityAuditAction } from '@plugins/axe/actions/RunAccessibilityAudit';
import { ValidateAccessibilityThresholdsAction } from '@plugins/axe/actions/ValidateAccessibilityThresholds';

let cachedRegistry: ActionRegistry<PlaywrightActionContext> | null = null;

export function getPlaywrightActionRegistry(): ActionRegistry<PlaywrightActionContext> {
    if (cachedRegistry) return cachedRegistry;

    const registry = new ActionRegistry<PlaywrightActionContext>({ plugin: 'playwright' });
    registry
        .register(NavigateAction)
        .register(ClickAction)
        .register(TypeAction)
        .register(SelectOptionAction)
        .register(ClearTextAction)
        .register(ReadTextAction)
        .register(WaitForElementAction)
        .register(AssertTextAction)
        .register(ScrollToAction)
        .register(BrowserCommandAction)
        .register(ScreenshotAction);

    if ((process.env.PLUGIN_AXE ?? 'false').toLowerCase() === 'true') {
        registry
            .register(RunAccessibilityAuditAction)
            .register(ValidateAccessibilityThresholdsAction);
    }

    cachedRegistry = registry;
    return registry;
}

export function resetPlaywrightActionRegistry(): void {
    cachedRegistry = null;
}
