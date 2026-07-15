import { ActionHandler } from '@plugins/shared/ActionHandler';
import { ZapActionContext } from '@plugins/zap/actions/ZapActionContext';
import { getZapRun } from '@plugins/zap/zap-state';
import { parseZapReport } from '@plugins/zap/zap-report';

export const ParseZapReportAction: ActionHandler<ZapActionContext> = {
    name: 'PARSE_ZAP_REPORT',
    async execute({ target, sessionId }) {
        const path = target || getZapRun(sessionId).reportPath;
        return JSON.stringify(parseZapReport(path));
    },
};
