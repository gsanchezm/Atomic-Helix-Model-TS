#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
PROFILE="${1:?Usage: collect-artifacts.sh <profile>}"
DEST="artifacts/$PROFILE"
mkdir -p "$DEST/logs"
cp -f reports/"$PROFILE"*.json "$DEST/" 2>/dev/null || true
cp -rf "logs/$PROFILE"/* "$DEST/logs/" 2>/dev/null || true

# Raw scanner report (e.g. reports/security/zap/{api-scan,baseline-scan}/zap-report.json)
# — not the already-summarized reports/<profile>*.json above. Only the summary
# used to be uploaded, which loses per-alert url/param/evidence detail that a
# summary-only artifact can't recover from after the run ends.
if [ -d "reports/security/$PROFILE" ]; then
    mkdir -p "$DEST/raw"
    cp -rf "reports/security/$PROFILE"/* "$DEST/raw/" 2>/dev/null || true
fi

if [ "${ARCHITECTURE_TYPE:-standard}" = "TOM" ]; then
    pnpm run metrics:manifest || { echo "metrics:manifest failed" >&2; exit 1; }
    pnpm run metrics:all || { echo "metrics:all failed" >&2; exit 1; }
    mkdir -p "$DEST/metrics"
    cp -rf metrics/* "$DEST/metrics/" 2>/dev/null || true
else
    RESULTS_DIR=$(ls -d results/* 2>/dev/null | head -n 1) || true
    if [ -n "$RESULTS_DIR" ]; then
        npx ts-node -r tsconfig-paths/register src/telemetry/parse-telemetry.ts "$RESULTS_DIR" || { echo "parse-telemetry failed" >&2; exit 1; }
        mkdir -p "$DEST/telemetry"
        cp -rf results/* "$DEST/telemetry/" 2>/dev/null || true
    elif [ "$PROFILE" = "gatling" ]; then
        # Gatling never starts the chaos-proxy — start-stack.sh's `gatling`
        # arm is a documented no-op (Gatling simulations run standalone, no
        # proxy/plugin involved) — so results/ is never populated for this
        # profile, unlike every other one. Collect the simulation output
        # (HTML report + stats + simulation.log) from target/gatling instead,
        # so the uniform ahm-artifacts upload isn't empty for perf jobs. In
        # CI each perf job runs exactly one profile, so exactly one
        # jssimulation-* dir lands here.
        if [ -d target/gatling ]; then
            cp -rf target/gatling/* "$DEST/" 2>/dev/null || true
            echo "collected Gatling simulation output from target/gatling"
        else
            echo "no target/gatling output — simulation produced nothing to collect"
        fi
    else
        echo "No results directory found. Telemetry is required for AHM runs." >&2
        exit 1
    fi
fi
echo "artifacts collected under $DEST"
