import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import { latestAudit } from '@plugins/axe/accessibility-audit';

interface Thresholds {
    impacts?: string[];
    maxViolations?: number;
}

export const ValidateAccessibilityThresholdsAction: ActionHandler<PlaywrightActionContext> = {
    name: 'VALIDATE_ACCESSIBILITY_THRESHOLDS',
    async execute({ target, sessionId }) {
        const thresholds = target ? JSON.parse(target) as Thresholds : {};
        const impacts = thresholds.impacts ?? ['critical', 'serious'];
        const maxViolations = thresholds.maxViolations ?? 0;
        const audit = latestAudit(sessionId);
        const blocking = audit.violations.filter((violation) => (
            typeof violation.impact === 'string' && impacts.includes(violation.impact)
        ));
        if (blocking.length > maxViolations) {
            const summary = blocking.map((violation) => ({
                id: violation.id,
                impact: violation.impact,
                nodes: violation.nodes.length,
                help: violation.help,
            }));
            throw new Error(
                `[axe] ${blocking.length} blocking violation(s) exceed maxViolations=${maxViolations}: `
                + JSON.stringify(summary),
            );
        }
        return JSON.stringify({ passed: true, blockingViolations: blocking.length, impacts, maxViolations });
    },
};
