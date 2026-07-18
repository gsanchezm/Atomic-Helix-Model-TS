#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
source ci/steps/lib/common.sh

for p in 50051 50052 50053 50054 50055 50056 50057 50058 50059 50060; do
    kill_port "$p"
done
if ! is_windows_bash; then
    pkill -f 'chaos-proxy.ts' 2>/dev/null || true
    pkill -f 'src/plugins/.*/server.ts' 2>/dev/null || true
fi
sleep 2
log "teardown complete"
