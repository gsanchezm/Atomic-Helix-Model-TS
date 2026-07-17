import { ActionRegistry } from '@plugins/shared/ActionRegistry';
import { WebdriverioActionContext } from '@plugins/webdriverio/actions/WebdriverioActionContext';
import { NavigateAction } from '@plugins/webdriverio/actions/Navigate';
import { ClickAction } from '@plugins/webdriverio/actions/Click';
import { TypeAction } from '@plugins/webdriverio/actions/Type';
import { ClearTextAction } from '@plugins/webdriverio/actions/ClearText';
import { ReadTextAction } from '@plugins/webdriverio/actions/ReadText';
import { ScrollToAction } from '@plugins/webdriverio/actions/ScrollTo';
import { WaitForElementAction } from '@plugins/webdriverio/actions/WaitForElement';
import { AssertTextAction } from '@plugins/webdriverio/actions/AssertText';
import { SelectOptionAction } from '@plugins/webdriverio/actions/SelectOption';

let cachedRegistry: ActionRegistry<WebdriverioActionContext> | null = null;

export function getWebdriverioActionRegistry(): ActionRegistry<WebdriverioActionContext> {
    if (cachedRegistry) return cachedRegistry;

    cachedRegistry = new ActionRegistry<WebdriverioActionContext>({ plugin: 'webdriverio' });
    cachedRegistry
        .register(NavigateAction)
        .register(ClickAction)
        .register(TypeAction)
        .register(ClearTextAction)
        .register(ReadTextAction)
        .register(ScrollToAction)
        .register(WaitForElementAction)
        .register(AssertTextAction)
        .register(SelectOptionAction);

    return cachedRegistry;
}

export function resetWebdriverioActionRegistry(): void {
    cachedRegistry = null;
}
