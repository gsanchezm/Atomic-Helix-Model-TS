const reports = new Map<string, unknown>();

export function setMobSfReport(sessionId: string, report: unknown): void {
    reports.set(sessionId, report);
}

export function getMobSfReport(sessionId: string): unknown {
    if (!reports.has(sessionId)) throw new Error('[MobSF] No report available. Run RUN_MOBSF_APK_SCAN first.');
    return reports.get(sessionId);
}
