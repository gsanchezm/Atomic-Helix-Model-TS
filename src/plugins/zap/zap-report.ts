import { readFileSync } from 'fs';

// Per-instance detail straight from ZAP's traditional-json `alert.instances[]`.
// Kept optional/best-effort since ZAP's own instance shape isn't guaranteed
// stable across scan types — a missing field here should never break parsing.
export interface ZapFindingInstance {
    uri?: string;
    method?: string;
    param?: string;
    attack?: string;
    evidence?: string;
    otherInfo?: string;
}

export interface ZapFinding {
    name: string;
    risk: string;
    confidence: string;
    instances: number;
    // Added 2026-08-22: a High-risk "Path Traversal" finding (run 32547382300)
    // could not be triaged because only {name, risk, confidence, instances}
    // survived — no url/param/evidence to tell a real hit from a heuristic
    // false positive. These fields retain that detail going forward.
    description?: string;
    solution?: string;
    cweId?: string;
    wascId?: string;
    instanceDetails: ZapFindingInstance[];
}

export interface ZapSummary {
    findings: ZapFinding[];
    byRisk: Record<string, number>;
}

export function parseZapReport(reportPath: string): ZapSummary {
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        site?: Array<{ alerts?: Array<Record<string, unknown>> }>;
    };
    const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
    const findings = (report.site ?? []).flatMap((site) => (site.alerts ?? []).map((alert) => {
        const rawInstances = Array.isArray(alert.instances)
            ? (alert.instances as Array<Record<string, unknown>>)
            : [];
        return {
            name: String(alert.name ?? alert.alert ?? 'Unknown alert'),
            risk: String(alert.riskdesc ?? alert.risk ?? 'Unknown').split(' ')[0],
            confidence: String(alert.confidence ?? 'Unknown'),
            instances: rawInstances.length || Number(alert.count ?? 0),
            description: asString(alert.desc),
            solution: asString(alert.solution),
            cweId: alert.cweid !== undefined ? String(alert.cweid) : undefined,
            wascId: alert.wascid !== undefined ? String(alert.wascid) : undefined,
            instanceDetails: rawInstances.map((instance) => ({
                uri: asString(instance.uri),
                method: asString(instance.method),
                param: asString(instance.param),
                attack: asString(instance.attack),
                evidence: asString(instance.evidence),
                otherInfo: asString(instance.otherinfo),
            })),
        };
    }));
    const byRisk: Record<string, number> = {};
    for (const finding of findings) byRisk[finding.risk] = (byRisk[finding.risk] ?? 0) + 1;
    return { findings, byRisk };
}
