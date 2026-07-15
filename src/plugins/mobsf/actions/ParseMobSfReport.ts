import { ActionHandler } from '@plugins/shared/ActionHandler';
import { MobSfActionContext } from '@plugins/mobsf/actions/MobSfActionContext';
import { getMobSfReport } from '@plugins/mobsf/mobsf-state';

export const ParseMobSfReportAction: ActionHandler<MobSfActionContext> = {
    name: 'PARSE_MOBSF_REPORT',
    async execute({ sessionId }) {
        const report = getMobSfReport(sessionId) as Record<string, unknown>;
        const securityScore = report.security_score ?? report.securityScore ?? null;
        const high = Number((report.high as number | undefined) ?? 0);
        const warning = Number((report.warning as number | undefined) ?? 0);
        return JSON.stringify({ securityScore, high, warning, report });
    },
};
