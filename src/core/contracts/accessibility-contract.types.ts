export interface AccessibilityThresholds {
  impacts?: string[];
  maxViolations?: number;
}

export interface AccessibilityAuditEntry {
  id: string;
  description?: string;
  /** axe-core rule tags (e.g. wcag2a, wcag21aa). Falls back to contract defaults, then the plugin's own default set. */
  ruleTags?: string[];
  include?: string[];
  exclude?: string[];
  thresholds?: AccessibilityThresholds;
}

export interface AccessibilityContract {
  feature: string;
  version: string;
  audits: AccessibilityAuditEntry[];
  defaults?: {
    ruleTags?: string[];
    thresholds?: AccessibilityThresholds;
  };
}
