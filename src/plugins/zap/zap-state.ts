export interface ZapRunState {
    reportPath: string;
    htmlReportPath: string;
}

const runs = new Map<string, ZapRunState>();

export function setZapRun(sessionId: string, state: ZapRunState): void {
    runs.set(sessionId, state);
}

export function getZapRun(sessionId: string): ZapRunState {
    const state = runs.get(sessionId);
    if (!state) throw new Error('[ZAP] No scan state found. Run a ZAP scan first.');
    return state;
}
