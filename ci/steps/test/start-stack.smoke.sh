#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

echo "[smoke] api profile comes up within timeout"
PLATFORM=api DRIVER=api bash ci/steps/start-stack.sh api
rc=$?
[ "$rc" -eq 0 ] || { echo "FAIL: start-stack.sh api exited $rc, expected 0"; exit 1; }
bash ci/steps/teardown.sh

echo "[smoke] an unreachable port fails fast, not silently"
STACK_TIMEOUT_SECS=5 API_PLUGIN_PORT=59999 PLATFORM=api DRIVER=api bash ci/steps/start-stack.sh api
rc=$?
[ "$rc" -ne 0 ] || { echo "FAIL: start-stack.sh api should have failed when API_PLUGIN_PORT never answers"; exit 1; }
bash ci/steps/teardown.sh

echo "[smoke] all start-stack.sh assertions passed"
