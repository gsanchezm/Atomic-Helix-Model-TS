#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
source ci/steps/lib/common.sh

PROFILE="${1:?Usage: start-stack.sh <profile>}"
mkdir -p "logs/$PROFILE"

run_bg() { # <logfile> <script>
    local log="$1"; shift
    npx ts-node -r tsconfig-paths/register -r dotenv/config "$1" > "logs/$PROFILE/$log" 2>&1 &
}

fail() { log "FAIL: $*"; exit 1; }

case "$PROFILE" in
  api)
    run_bg proxy.log src/kernel/chaos-proxy.ts
    PLUGIN_API=true run_bg api-plugin.log src/plugins/api/server.ts
    wait_port 50051 || fail "chaos-proxy did not open :50051"
    wait_port "${API_PLUGIN_PORT:-50055}" || fail "api plugin did not open :${API_PLUGIN_PORT:-50055}"
    ;;
  web)
    # Pixelmatch/Axe are co-located in the Playwright plugin process, NOT
    # separate profiles or ports (plugins.config.ts) — they're flags this
    # arm forwards, mirroring scripts/orchestrate-full-run.sh's start_web_stack().
    run_bg proxy.log src/kernel/chaos-proxy.ts
    run_bg playwright-plugin.log src/plugins/playwright/server.ts
    PLUGIN_API=true run_bg api-plugin.log src/plugins/api/server.ts
    wait_port 50051 || fail "chaos-proxy did not open :50051"
    wait_port "${PLAYWRIGHT_PLUGIN_PORT:-50052}" || fail "playwright plugin did not open :${PLAYWRIGHT_PLUGIN_PORT:-50052}"
    wait_port "${API_PLUGIN_PORT:-50055}" || fail "api plugin did not open :${API_PLUGIN_PORT:-50055}"
    if [ "${PLUGIN_PIXELMATCH:-false}" = "true" ]; then
        wait_port "${PIXELMATCH_PLUGIN_PORT:-50056}" || fail "pixelmatch (in playwright process) did not open :${PIXELMATCH_PLUGIN_PORT:-50056}"
    fi
    ;;
  android)
    # START_APPIUM_DAEMON=true on a bare dev box (run-full-local.sh's own
    # pattern: `port 4723 || nohup appium ...`); false in CI, where the
    # docker-compose `appium-server` service already provides it.
    if [ "${START_APPIUM_DAEMON:-false}" = "true" ] && ! port_open 4723; then
        nohup appium --address 127.0.0.1 --port 4723 --relaxed-security > "logs/$PROFILE/appium-daemon.log" 2>&1 &
    fi
    wait_port 4723 || fail "Appium daemon did not open :4723"
    run_bg proxy.log src/kernel/chaos-proxy.ts
    run_bg appium-plugin.log src/plugins/appium/server.ts
    PLUGIN_API=true run_bg api-plugin.log src/plugins/api/server.ts
    wait_port 50051 || fail "chaos-proxy did not open :50051"
    wait_port "${APPIUM_PLUGIN_PORT:-50053}" || fail "appium plugin did not open :${APPIUM_PLUGIN_PORT:-50053}"
    wait_port "${API_PLUGIN_PORT:-50055}" || fail "api plugin did not open :${API_PLUGIN_PORT:-50055}"
    ;;
  ios)
    is_windows_bash && fail "ios profile requires macOS (xcrun simctl) — not runnable under Git Bash/Windows"
    uname -s | grep -q Darwin || fail "ios profile requires macOS (xcrun simctl)"
    [ -n "${IOS_UDID_0:-}" ] && xcrun simctl boot "$IOS_UDID_0" 2>/dev/null || true
    if [ "${START_APPIUM_DAEMON:-false}" = "true" ] && ! port_open 4723; then
        nohup appium --address 127.0.0.1 --port 4723 --relaxed-security > "logs/$PROFILE/appium-daemon.log" 2>&1 &
    fi
    wait_port 4723 || fail "Appium daemon did not open :4723"
    run_bg proxy.log src/kernel/chaos-proxy.ts
    run_bg appium-plugin.log src/plugins/appium/server.ts
    PLUGIN_API=true run_bg api-plugin.log src/plugins/api/server.ts
    wait_port 50051 || fail "chaos-proxy did not open :50051"
    wait_port "${APPIUM_PLUGIN_PORT:-50053}" || fail "appium plugin did not open :${APPIUM_PLUGIN_PORT:-50053}"
    wait_port "${API_PLUGIN_PORT:-50055}" || fail "api plugin did not open :${API_PLUGIN_PORT:-50055}"
    ;;
  gatling)
    # Gatling is standalone (scripts/run-full-local.sh PHASE 7, scripts/
    # orchestrate-full-run.sh PHASE F both invoke `pnpm perf:smoke` with no
    # proxy/plugin) — kept as a named profile for Template Method symmetry
    # (run-suite.sh's gatling arm still needs *a* start-stack.sh call).
    log "gatling runs standalone — no stack to start"
    ;;
  mobilewright|zap|mobsf|webdriverio)
    fail "profile '$PROFILE' is reserved (see docs/plans/2026-07-17-cicd-pipelines-update.md) but not yet wired — implement this arm there, not here"
    ;;
  cypress)
    fail "profile '$PROFILE' is reserved (see docs/plans/2026-07-17-cicd-pipelines-update.md), and may never need an arm at all — its Option A default (docs/plans/2026-07-17-cypress-webdriverio-plugins.md §4) runs entirely outside this script; only Option B would require filling this arm in"
    ;;
  # 'axe' is deliberately absent from this case statement — it is not a
  # standalone profile. It rides the 'web' arm above via PLUGIN_AXE=true
  # (see §2.3/§3.2), so start-stack.sh web is what a11y jobs actually call.
  *)
    fail "unknown profile '$PROFILE'"
    ;;
esac
log "stack up for profile '$PROFILE'"
