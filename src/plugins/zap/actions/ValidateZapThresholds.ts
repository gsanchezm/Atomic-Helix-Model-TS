import { ActionHandler } from '@plugins/shared/ActionHandler';
import { ZapActionContext } from '@plugins/zap/actions/ZapActionContext';
import { getZapRun } from '@plugins/zap/zap-state';
import { parseZapReport } from '@plugins/zap/zap-report';

export const ValidateZapThresholdsAction: ActionHandler<ZapActionContext> = {
    name: 'VALIDATE_ZAP_THRESHOLDS',
    async execute({ target, sessionId }) {
        const thresholds = target ? JSON.parse(target) as Record<string, number> : { High: 0 };
        const summary = parseZapReport(getZapRun(sessionId).reportPath);
        const exceeded = Object.entries(thresholds).filter(([risk, max]) => (summary.byRisk[risk] ?? 0) > max);
        if (exceeded.length) {
            throw new Error(`[ZAP] Thresholds exceeded: ${JSON.stringify({ exceeded, byRisk: summary.byRisk })}`);
        }
        return JSON.stringify({ passed: true, thresholds, byRisk: summary.byRisk });
    },
};
