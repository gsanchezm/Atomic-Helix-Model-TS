import AxeBuilder from '@axe-core/playwright';
import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { parseAccessibilityAuditTarget } from '@plugins/axe/audit-target';
import { storeAudit } from '@plugins/axe/accessibility-audit';

const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export const RunAccessibilityAuditAction: ActionHandler<PlaywrightActionContext> = {
    name: 'RUN_ACCESSIBILITY_AUDIT',
    async execute({ page, target, sessionId }) {
        const { feature, auditId, options } = parseAccessibilityAuditTarget(target);
        const tags = options.tags?.length ? options.tags : DEFAULT_TAGS;
        let builder = new AxeBuilder({ page })
            .withTags(tags)
            // target-size is the only axe-core WCAG 2.2 rule and is disabled
            // by default; make the opt-in explicit when wcag22aa is requested.
            .options({ rules: { 'target-size': { enabled: tags.includes('wcag22aa') } } });

        for (const selector of options.include ?? []) builder = builder.include(selector);
        for (const selector of options.exclude ?? []) builder = builder.exclude(selector);

        const results = await builder.analyze();
        return JSON.stringify(storeAudit(sessionId, feature, auditId, results));
    },
};
