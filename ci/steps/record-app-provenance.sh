#!/usr/bin/env bash
# Record application-artifact provenance for a research dispatch (hardening
# decision (f) — record-only). Never fails the job: until the OmniPizza-side
# version endpoint is deployed, these probes legitimately 404 and the manifest
# records null. Exports single-line values via GITHUB_ENV so
# generate-run-manifest.ts (and write-experiment-manifest.sh) can stamp them.
#
# Usage: record-app-provenance.sh <web|android|ios>
set -uo pipefail
PLATFORM_ARG="${1:?Usage: record-app-provenance.sh <web|android|ios>}"

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

BACKEND_VERSION=""
if [ -n "${API_BASE_URL:-}" ]; then
  BACKEND_VERSION=$(curl -fsS --max-time 15 "${API_BASE_URL%/}/api/version" 2>/dev/null | compact_json)
  if [ -z "$BACKEND_VERSION" ]; then
    # Fallback: the pre-existing unauthenticated debug endpoint also carries
    # app_name/version/environment (no commit sha).
    BACKEND_VERSION=$(curl -fsS --max-time 15 "${API_BASE_URL%/}/api/debug/info" 2>/dev/null | compact_json)
  fi
fi

FRONTEND_VERSION=""
if [ "$PLATFORM_ARG" = "web" ] && [ -n "${BASE_URL:-}" ]; then
  FRONTEND_VERSION=$(curl -fsS --max-time 15 "${BASE_URL%/}/version.json" 2>/dev/null | compact_json)
fi

echo "Backend version info: ${BACKEND_VERSION:-<unavailable>}"
echo "Frontend version info: ${FRONTEND_VERSION:-<unavailable / not web>}"

if [ -n "${GITHUB_ENV:-}" ]; then
  [ -n "$BACKEND_VERSION" ] && echo "OMNIPIZZA_BACKEND_VERSION=$BACKEND_VERSION" >> "$GITHUB_ENV"
  [ -n "$FRONTEND_VERSION" ] && echo "OMNIPIZZA_FRONTEND_VERSION=$FRONTEND_VERSION" >> "$GITHUB_ENV"
fi
exit 0
