import { ActionRegistry } from '@plugins/shared/ActionRegistry';
import { WebdriverioActionContext } from '@plugins/webdriverio/actions/WebdriverioActionContext';

let cachedRegistry: ActionRegistry<WebdriverioActionContext> | null = null;

export function getWebdriverioActionRegistry(): ActionRegistry<WebdriverioActionContext> {
    if (cachedRegistry) return cachedRegistry;
    cachedRegistry = new ActionRegistry<WebdriverioActionContext>({ plugin: 'webdriverio' });
    return cachedRegistry;
}

export function resetWebdriverioActionRegistry(): void {
    cachedRegistry = null;
}
