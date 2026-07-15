import { ACTION_TYPE_SEPARATOR } from '@plugins/shared/parseCompositeTarget';

export interface AccessibilityAuditOptions {
    tags?: string[];
    include?: string[];
    exclude?: string[];
}

export interface AccessibilityAuditTarget {
    feature: string;
    auditId: string;
    options: AccessibilityAuditOptions;
}

export function parseAccessibilityAuditTarget(target: string): AccessibilityAuditTarget {
    const [feature, auditId, ...tail] = target.split(ACTION_TYPE_SEPARATOR);
    if (!feature || !auditId) {
        throw new Error('[axe] Target must use feature||auditId[||{options}] format.');
    }
    let options: AccessibilityAuditOptions = {};
    if (tail.length > 0) {
        const parsed = JSON.parse(tail.join(ACTION_TYPE_SEPARATOR)) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('[axe] Audit options must be a JSON object.');
        }
        options = parsed as AccessibilityAuditOptions;
    }
    return { feature, auditId, options };
}
