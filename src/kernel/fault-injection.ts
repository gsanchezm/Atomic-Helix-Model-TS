// Diagnosability fault-injection harness (build-order step 3) — see
// docs/superpowers/specs/2026-08-23-diagnosability-fault-injection-harness-design.md.
//
// Synthesizes one representative failure for the tool/UI-layer buckets of
// scripts/metrics/lib/failure-buckets.ts's 14-bucket taxonomy that a real
// backend fault cannot reach (locator resolution, UI interaction, session
// loss, unclassifiable). API/data buckets are injected at the backend layer
// instead (DIAGNOSABILITY_CHAOS_USER, threaded through the shared login
// step) — see the design doc's per-bucket table for the full split.
//
// The error strings below are hand-matched against failure-buckets.ts's
// ordered regex rules so the classifier reports the intended bucket, not a
// symptom. If those rules change, re-check these still land correctly.

export interface InjectedFaultOutcome {
    status: 'FAIL';
    error: string;
}

export const INJECTABLE_FAULT_BUCKETS = [
    'LOCATOR_RESOLUTION_FAILURE',
    'UI_ACTION_FAILURE',
    'WEB_SESSION_FAILURE',
    'MOBILE_SESSION_FAILURE',
    'UNKNOWN_FAILURE',
] as const;

export type InjectableFaultBucket = (typeof INJECTABLE_FAULT_BUCKETS)[number];

const FAULT_MESSAGES: Readonly<Record<InjectableFaultBucket, string>> = {
    LOCATOR_RESOLUTION_FAILURE: 'Injected fault: unable to find element for the configured locator',
    UI_ACTION_FAILURE: 'Injected fault: click interaction rejected by the target element',
    WEB_SESSION_FAILURE: 'Injected fault: Playwright browser session crashed, target closed unexpectedly',
    MOBILE_SESSION_FAILURE: 'Injected fault: Appium session not created, device unavailable',
    UNKNOWN_FAILURE: 'Injected fault: unclassified synthetic marker (diagnosability harness)',
};

function isInjectableBucket(value: string): value is InjectableFaultBucket {
    return (INJECTABLE_FAULT_BUCKETS as readonly string[]).includes(value);
}

// Fires at most once per proxy process. Without this, every ExecuteIntent call whose actionId
// matches TOM_INJECT_FAULT_ACTION fails — e.g. a live TOM_INJECT_FAULT=UI_ACTION_FAILURE run against
// place-delivery-order.feature produced 44 real failures (every CLICK in the dispatch), not the one
// scenario/blast-radius the §9.2 measurement needs (design doc §6: "for the atomic suite this should
// be exactly the one scenario that owns the faulted behavior"). Latching to the first match bounds
// blast radius to exactly one scenario (atomic) / one Outline row (twin), matching that requirement —
// at the cost of being order-dependent (whichever scenario/row happens to call the targeted actionId
// first is the one that's hit, not a specifically-named one). Caught by advisor review before this
// harness's first real campaign dispatch, 2026-08-31 — not caught by the 2026-08-23 live verification,
// which only checked that injection fired at all, not how many times.
let fired = false;

/**
 * Returns a synthetic FAIL outcome when this dispatch's env targets the
 * given actionId for injection AND no fault has fired yet this process, or
 * null for normal routing. TOM_INJECT_FAULT/TOM_INJECT_FAULT_ACTION are set
 * once for the dispatch, matching how PLATFORM/DRIVER are already
 * configured per process.
 */
export function injectedFaultFor(actionId: string): InjectedFaultOutcome | null {
    if (fired) return null;

    const bucket = process.env.TOM_INJECT_FAULT;
    const targetAction = process.env.TOM_INJECT_FAULT_ACTION;
    if (!bucket || !targetAction) return null;
    if (actionId.toUpperCase() !== targetAction.toUpperCase()) return null;

    if (!isInjectableBucket(bucket)) {
        throw new Error(
            `TOM_INJECT_FAULT="${bucket}" is not injectable at the chaos-proxy layer ` +
            `(only ${INJECTABLE_FAULT_BUCKETS.join(', ')} are). API/data buckets inject via ` +
            `DIAGNOSABILITY_CHAOS_USER instead — see the diagnosability harness design doc.`,
        );
    }

    fired = true;
    return { status: 'FAIL', error: FAULT_MESSAGES[bucket] };
}
