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
    pnpm run metrics:manifest
    pnpm run metrics:all
    mkdir -p "$DEST/metrics"
    cp -rf metrics/* "$DEST/metrics/" 2>/dev/null || true
else
    RESULTS_DIR=$(ls -d results/* 2>/dev/null | head -n 1)
    if [ -n "$RESULTS_DIR" ]; then
        npx ts-node -r tsconfig-paths/register src/telemetry/parse-telemetry.ts "$RESULTS_DIR"
        mkdir -p "$DEST/telemetry"
        cp -rf results/* "$DEST/telemetry/" 2>/dev/null || true
    fi
fi
echo "artifacts collected under $DEST"
