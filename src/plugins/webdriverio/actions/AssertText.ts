import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { WebdriverioActionContext } from '@plugins/webdriverio/actions/WebdriverioActionContext';
import { locate, parseLocator } from '@plugins/webdriverio/actions/WebDriverIOLocator';

export const AssertTextAction: ActionHandler<WebdriverioActionContext> = {
    name: 'ASSERT_TEXT',
    // Same polling shape as Playwright's AssertText, same shared env var
    // (TOM_ASSERT_TIMEOUT_MS) for consistent tuning across both web engines.
    async execute({ driver, target }) {
        const { selector, value: expected } = parseSelectorValue(target, 'ASSERT_TEXT action');
        const el = locate(driver, parseLocator(selector));
        const configuredTimeout = Number(process.env.TOM_ASSERT_TIMEOUT_MS ?? '5000');
        const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 5000;
        const deadline = performance.now() + timeoutMs;
        const normalizedExpected = expected.trim().toLowerCase();
        let actual = '';

        while (performance.now() < deadline) {
            actual = await el.getText();
            if (actual.trim().toLowerCase() === normalizedExpected) return actual;
            await new Promise((resolve) => setTimeout(resolve, Math.min(100, Math.max(1, deadline - performance.now()))));
        }

        throw new Error(
            `[ASSERT_TEXT] Mismatch on "${selector}" after ${timeoutMs}ms: expected "${expected}", got "${actual}"`,
        );
    },
};
