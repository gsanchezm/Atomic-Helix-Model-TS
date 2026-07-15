import { readFileSync } from 'fs';

export interface ZapFinding {
    name: string;
    risk: string;
    confidence: string;
    instances: number;
}

export interface ZapSummary {
    findings: ZapFinding[];
    byRisk: Record<string, number>;
}

export function parseZapReport(reportPath: string): ZapSummary {
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        site?: Array<{ alerts?: Array<Record<string, unknown>> }>;
    };
    const findings = (report.site ?? []).flatMap((site) => (site.alerts ?? []).map((alert) => ({
        name: String(alert.name ?? alert.alert ?? 'Unknown alert'),
        risk: String(alert.riskdesc ?? alert.risk ?? 'Unknown').split(' ')[0],
        confidence: String(alert.confidence ?? 'Unknown'),
        instances: Array.isArray(alert.instances) ? alert.instances.length : Number(alert.count ?? 0),
    })));
    const byRisk: Record<string, number> = {};
    for (const finding of findings) byRisk[finding.risk] = (byRisk[finding.risk] ?? 0) + 1;
    return { findings, byRisk };
}
