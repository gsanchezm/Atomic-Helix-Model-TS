#!/usr/bin/env bash
# Writes the per-dispatch experiment manifest (research hardening decisions
# (e)/(f)): the full experimental identity of this run — inputs, resolved
# commit SHA, pinned OmniPizza release tag, app-artifact checksum, and the
# backend/frontend version info captured by record-app-provenance.sh.
# Lands inside the run's own artifact directory so it travels with the data.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PROFILE="${EXPERIMENT_PROFILE:?EXPERIMENT_PROFILE must be set}"
DEST="artifacts/$PROFILE"
mkdir -p "$DEST"

node -e '
  const fs = require("fs");
  const e = process.env;
  const nullable = (v) => (v && v.trim() !== "" ? v : null);
  const jsonOrNull = (v) => {
    if (!v || v.trim() === "") return null;
    try { return JSON.parse(v); } catch { return v; }
  };
  const manifest = {
    schemaVersion: "1.0.0",
    kind: "atomic-testing-experiment-manifest",
    testStrategy: nullable(e.TEST_STRATEGY),
    platform: nullable(e.PLATFORM),
    evaluationSlice: nullable(e.EVALUATION_SLICE),
    experimentBatchId: nullable(e.EXPERIMENT_BATCH_ID),
    runIndex: nullable(e.RUN_INDEX),
    cucumberParallel: nullable(e.EXPERIMENT_CUCUMBER_PARALLEL),
    tomRunId: nullable(e.TOM_RUN_ID),
    toolName: nullable(e.TOOL_NAME),
    workflowRunId: nullable(e.WORKFLOW_RUN_ID),
    workflowAttempt: nullable(e.WORKFLOW_ATTEMPT),
    // Decision (e): the RESOLVED commit SHA of the dispatched ref, not just
    // the ref name.
    commitSha: nullable(e.COMMIT_SHA),
    branch: nullable(e.BRANCH_NAME),
    // Decision (f): app-artifact provenance (record-only).
    omnipizzaReleaseTag: nullable(e.OMNIPIZZA_RELEASE_TAG),
    omnipizzaAppSha256: nullable(e.OMNIPIZZA_APP_SHA256),
    omnipizzaBackendVersion: jsonOrNull(e.OMNIPIZZA_BACKEND_VERSION),
    omnipizzaFrontendVersion: jsonOrNull(e.OMNIPIZZA_FRONTEND_VERSION),
    faultInjection: {
      diagnosabilityChaosUser: nullable(e.DIAGNOSABILITY_CHAOS_USER_INPUT),
      tomInjectFault: nullable(e.TOM_INJECT_FAULT_INPUT),
      tomInjectFaultAction: nullable(e.TOM_INJECT_FAULT_ACTION_INPUT),
      tomInjectFaultTarget: nullable(e.TOM_INJECT_FAULT_TARGET_INPUT),
      tomInjectFaultMaxFires: nullable(e.TOM_INJECT_FAULT_MAX_FIRES_INPUT),
      tomInfraBreakPort: nullable(e.TOM_INFRA_BREAK_PORT_INPUT),
    },
    startedAt: nullable(e.RUN_STARTED_AT),
    endedAt: nullable(e.RUN_ENDED_AT),
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(process.argv[1], JSON.stringify(manifest, null, 2) + "\n");
  console.log("wrote " + process.argv[1]);
' "$DEST/experiment-manifest.json"
