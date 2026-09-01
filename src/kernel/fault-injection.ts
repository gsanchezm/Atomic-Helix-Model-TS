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

// Fires at most TOM_INJECT_FAULT_MAX_FIRES times per proxy process (default 1). Without a cap, every
// ExecuteIntent call whose actionId matches TOM_INJECT_FAULT_ACTION fails — e.g. a live
// TOM_INJECT_FAULT=UI_ACTION_FAILURE run against place-delivery-order.feature produced 44 real
// failures (every CLICK in the dispatch), not the one scenario/blast-radius the §9.2 measurement
// needs (design doc §6: "for the atomic suite this should be exactly the one scenario that owns the
// faulted behavior"). A single-fire latch bounds blast radius to one scenario — but a SECOND real bug
// surfaced live-testing that fix (2026-08-31, CI run 33463608498, 0/97 failures instead of the
// expected 1): cucumber.js's `default` profile runs with `retry: 1` (cucumber.js's own comment — a
// bounded retry to self-heal Render cold-start flakes). A single-fire latch means attempt 1 of the
// targeted scenario gets the injected failure, cucumber silently retries, attempt 2 finds the latch
// already spent and the REAL action succeeds — the scenario's FINAL recorded status is PASS, and the
// injected failure leaves no trace in scenario_outcome_history.csv at all. Confirmed by local
// reproduction (`node --version` v22.22.2, real backend): "Catalog renders in US/en (attempt 1,
// retried)" showed the injected error, then passed clean on attempt 2 — "80 scenarios (80 passed)",
// matching the CI run's misleadingly-clean result exactly. `nonAtomicTwin`'s profile runs `retry: 0`
// (deliberately, so a retry can't mask its own determinism signal — cucumber.js's own comment), so the
// twin arm was never affected by this. Fix: TOM_INJECT_FAULT_MAX_FIRES lets the dispatcher set the fire
// budget to survive retries — the atomic arm's campaign-matrix.ts entry sets it to 2 (covers both
// cucumber attempts), the twin arm's to 1 (retry:0, only one attempt ever happens). Diagnosability
// dispatches also force cucumber_parallel=1 (campaign-matrix.ts) so "the Nth matching call" is
// unambiguous — with concurrent workers, the 2 fire slots could land on two DIFFERENT scenarios' first
// attempts instead of one scenario's two attempts, reintroducing the same masking bug in a subtler form.
let firedCount = 0;

/**
 * Returns a synthetic FAIL outcome when this dispatch's env targets the given actionId for injection
 * AND the fire budget (TOM_INJECT_FAULT_MAX_FIRES, default 1) isn't yet exhausted this process, or
 * null for normal routing. TOM_INJECT_FAULT/TOM_INJECT_FAULT_ACTION are set once for the dispatch,
 * matching how PLATFORM/DRIVER are already configured per process.
 */
export function injectedFaultFor(actionId: string): InjectedFaultOutcome | null {
    // GitHub Actions sets an unset optional workflow_dispatch input to its declared default — '' here,
    // not absent — so `process.env.TOM_INJECT_FAULT_MAX_FIRES ?? '1'` would NOT fall back to '1' (`??`
    // only catches null/undefined) and `Number('')` is 0, not NaN: maxFires would silently become 0 and
    // the fault would never fire at all, for every non-diagnosability dispatch AND any diagnosability
    // dispatch that forgot to pass this field explicitly. Falsy-check the raw string first.
    const maxFiresRaw = process.env.TOM_INJECT_FAULT_MAX_FIRES;
    const maxFires = maxFiresRaw ? Number(maxFiresRaw) : 1;
    if (firedCount >= maxFires) return null;

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

    firedCount += 1;
    return { status: 'FAIL', error: FAULT_MESSAGES[bucket] };
}
