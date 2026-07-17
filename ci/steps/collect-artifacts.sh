#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
PROFILE="${1:?Usage: collect-artifacts.sh <profile>}"
DEST="artifacts/$PROFILE"
mkdir -p "$DEST/logs"
cp -f reports/"$PROFILE"*.json "$DEST/" 2>/dev/null || true
cp -rf "logs/$PROFILE"/* "$DEST/logs/" 2>/dev/null || true

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
    else
        echo "No results directory found. Telemetry is required for AHM runs." >&2
        exit 1
    fi
fi
echo "artifacts collected under $DEST"
