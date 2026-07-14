import { ActionHandler } from '@plugins/shared/ActionHandler';
import { parseSelectorValue } from '@plugins/shared/parseCompositeTarget';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';

export const AssertTextAction: ActionHandler<PlaywrightActionContext> = {
    name: 'ASSERT_TEXT',
    async execute({ page, target }) {
        const { selector, value: expected } = parseSelectorValue(target, 'ASSERT_TEXT action');
        const locator = page.locator(selector);
        const configuredTimeout = Number(process.env.TOM_ASSERT_TIMEOUT_MS ?? '5000');
        const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
            ? configuredTimeout
            : 5000;
        const deadline = performance.now() + timeoutMs;
        const normalizedExpected = expected.trim().toLowerCase();
        let actual = '';

        while (performance.now() < deadline) {
            const remainingMs = Math.max(1, deadline - performance.now());
            actual = await locator.innerText({ timeout: remainingMs });

            // Label casing is presentation, not semantics (web CSS
            // text-transform uppercases while native renders as-is).
            if (actual.trim().toLowerCase() === normalizedExpected) return actual;

            await new Promise((resolve) => setTimeout(resolve, Math.min(100, remainingMs)));
        }

        throw new Error(
            `[ASSERT_TEXT] Mismatch on "${selector}" after ${timeoutMs}ms: ` +
            `expected "${expected}", got "${actual}"`,
        );
    },
};
