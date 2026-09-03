#!/usr/bin/env bash
# Record application-artifact provenance for a research dispatch (hardening
# decision (f) — record-only). Never fails the job: until the OmniPizza-side
# version endpoint is deployed, these probes legitimately 404 and the manifest
# records null. Exports single-line values via GITHUB_ENV so
# generate-run-manifest.ts (and write-experiment-manifest.sh) can stamp them.
#
# Retries + structured status (2026-09-03, post-Campaign-A adjudication —
# docs/research/2026-09-03-campaign-a-provenance-adjudication.md §6): Campaign
# A's ~9.65-hour, 60-dispatch run saw 13/60 dispatches where the single
# --max-time 15 probe (with a single non-retried fallback) never got a
# git_commit-bearing response — a reliability property of THIS SCRIPT under
# sustained real traffic, not of the SUT. Scoped to future campaigns only —
# does not and cannot retroactively change Campaign A's already-collected,
# gitignored raw manifests. OMNIPIZZA_BACKEND_PROVENANCE_STATUS is one of:
#   verified                 — a git_commit-bearing response was read
#   fallback_without_commit  — the primary probe never succeeded across all
#                               retries, but the debug fallback responded
#   timeout_error             — neither the primary probe (any retry) nor the
#                               fallback produced a usable response
# "mismatch" (the 4th category the adjudication doc's classification scheme
# names) is deliberately NOT computed here — this script has no notion of
# which commit a given campaign expects; that comparison is analysis-side
# (compare a `verified` status's recorded git_commit against the campaign's
# own frozen expectation), exactly how it was done for Campaign A.
#
# Usage: record-app-provenance.sh <web|android|ios>
set -uo pipefail
PLATFORM_ARG="${1:?Usage: record-app-provenance.sh <web|android|ios>}"
BACKEND_PROBE_RETRIES="${OMNIPIZZA_PROVENANCE_RETRIES:-2}" # total attempts = 1 + this many retries
BACKEND_PROBE_RETRY_DELAY_SECONDS=3

compact_json() {
  # Compacts stdin JSON to one line; empty output if not valid JSON.
  node -e '
    let d = "";
    process.stdin.on("data", (c) => (d += c));
    process.stdin.on("end", () => {
      try { process.stdout.write(JSON.stringify(JSON.parse(d))); } catch { /* not JSON */ }
    });
  ' 2>/dev/null
}

has_git_commit() {
  # True iff stdin is compact JSON with a non-empty git_commit field.
  node -e '
    let d = "";
    process.stdin.on("data", (c) => (d += c));
    process.stdin.on("end", () => {
      try {
        const v = JSON.parse(d);
        process.exit(v && typeof v.git_commit === "string" && v.git_commit.length > 0 ? 0 : 1);
      } catch { process.exit(1); }
    });
  ' <<< "$1" 2>/dev/null
}

BACKEND_VERSION=""
BACKEND_PROVENANCE_STATUS="timeout_error"
if [ -n "${API_BASE_URL:-}" ]; then
  attempt=0
  while [ "$attempt" -le "$BACKEND_PROBE_RETRIES" ]; do
    candidate=$(curl -fsS --max-time 15 "${API_BASE_URL%/}/api/version" 2>/dev/null | compact_json)
    if [ -n "$candidate" ] && has_git_commit "$candidate"; then
      BACKEND_VERSION="$candidate"
      BACKEND_PROVENANCE_STATUS="verified"
      break
    fi
    attempt=$((attempt + 1))
    [ "$attempt" -le "$BACKEND_PROBE_RETRIES" ] && sleep "$BACKEND_PROBE_RETRY_DELAY_SECONDS"
  done
  if [ "$BACKEND_PROVENANCE_STATUS" != "verified" ]; then
    # Fallback: the pre-existing unauthenticated debug endpoint also carries
    # app_name/version/environment (no commit sha) — one attempt, not retried,
    # since it's already a degraded-mode read.
    fallback=$(curl -fsS --max-time 15 "${API_BASE_URL%/}/api/debug/info" 2>/dev/null | compact_json)
    if [ -n "$fallback" ]; then
      BACKEND_VERSION="$fallback"
      BACKEND_PROVENANCE_STATUS="fallback_without_commit"
    fi
  fi
fi

FRONTEND_VERSION=""
if [ "$PLATFORM_ARG" = "web" ] && [ -n "${BASE_URL:-}" ]; then
  FRONTEND_VERSION=$(curl -fsS --max-time 15 "${BASE_URL%/}/version.json" 2>/dev/null | compact_json)
fi

echo "Backend version info: ${BACKEND_VERSION:-<unavailable>} (status: $BACKEND_PROVENANCE_STATUS)"
echo "Frontend version info: ${FRONTEND_VERSION:-<unavailable / not web>}"

if [ -n "${GITHUB_ENV:-}" ]; then
  [ -n "$BACKEND_VERSION" ] && echo "OMNIPIZZA_BACKEND_VERSION=$BACKEND_VERSION" >> "$GITHUB_ENV"
  echo "OMNIPIZZA_BACKEND_PROVENANCE_STATUS=$BACKEND_PROVENANCE_STATUS" >> "$GITHUB_ENV"
  [ -n "$FRONTEND_VERSION" ] && echo "OMNIPIZZA_FRONTEND_VERSION=$FRONTEND_VERSION" >> "$GITHUB_ENV"
fi
exit 0
