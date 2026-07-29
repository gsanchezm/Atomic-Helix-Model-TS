// Builds the `||{json}` options suffix every @visual After hook appends to its
// COMPARE_SNAPSHOT target.
//
// Beyond deduplicating the bucketing suffix, this is where the bootstrap flag
// is injected. VISUAL_UPDATE_BASELINE is read by the *pixelmatch* process
// (visual-baseline-policy.ts's isUpdateBaselineEnv), which under the normal
// topology is a separate gRPC plugin started from .env — so setting the var on
// the cucumber runner alone (what scripts/visual-regen.js does) never reached
// the code that acts on it, and regeneration silently produced FAIL/"missing
// baseline" for every snapshot. Threading it through the intent target makes
// the runner's intent self-describing, so regen works regardless of whether
// pixelmatch runs in-process or behind gRPC. The plugin-side env var stays
// supported as a fallback.

export interface VisualBucket {
    market?: string;
    language?: string;
    scenario?: string;
}

export function isUpdateBaselineRun(): boolean {
    return (process.env.VISUAL_UPDATE_BASELINE ?? '').toLowerCase() === 'true';
}

export function buildVisualOptions(bucket: VisualBucket): string {
    const options: Record<string, unknown> = { ...bucket };
    for (const key of Object.keys(options)) {
        if (options[key] === undefined) delete options[key];
    }
    if (isUpdateBaselineRun()) options.updateBaseline = true;
    return Object.keys(options).length > 0 ? `||${JSON.stringify(options)}` : '';
}
