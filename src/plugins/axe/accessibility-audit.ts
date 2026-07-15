import type { AxeResults, Result } from 'axe-core';

export interface AccessibilityAuditRecord {
    feature: string;
    auditId: string;
    url: string;
    timestamp: string;
    violations: Result[];
    passes: number;
    incomplete: number;
}

const auditBySession = new Map<string, AccessibilityAuditRecord>();

export function storeAudit(
    sessionId: string,
    feature: string,
    auditId: string,
    results: AxeResults,
): AccessibilityAuditRecord {
    const record: AccessibilityAuditRecord = {
        feature,
        auditId,
        url: results.url,
        timestamp: results.timestamp,
        violations: results.violations,
        passes: results.passes.length,
        incomplete: results.incomplete.length,
    };
    auditBySession.set(sessionId, record);
    return record;
}

export function latestAudit(sessionId: string): AccessibilityAuditRecord {
    const audit = auditBySession.get(sessionId);
    if (!audit) {
        throw new Error('[axe] No audit result exists for this Playwright session. Run RUN_ACCESSIBILITY_AUDIT first.');
    }
    return audit;
}

export function clearAudit(sessionId: string): void {
    auditBySession.delete(sessionId);
}
