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
# 99999 is out of the valid 0-65535 port range: net.Server.listen() throws a
# synchronous RangeError, which port-guard.ts's ensurePortFree()/isPortFree()
# propagates as a rejected promise, caught by plugin-server.factory.ts's outer
# try/catch, which logs and process.exit(1)s almost immediately — the plugin
# never binds anything, deterministically, on any OS. (An arbitrary-but-valid
# high port like 59999 doesn't work here: nothing stops the plugin from
# actually binding it, which races start-stack.sh's timeout instead of
# reliably failing.)
STACK_TIMEOUT_SECS=5 API_PLUGIN_PORT=99999 PLATFORM=api DRIVER=api bash ci/steps/start-stack.sh api
rc=$?
[ "$rc" -ne 0 ] || { echo "FAIL: start-stack.sh api should have failed when API_PLUGIN_PORT never answers"; exit 1; }
bash ci/steps/teardown.sh

echo "[smoke] all start-stack.sh assertions passed"
