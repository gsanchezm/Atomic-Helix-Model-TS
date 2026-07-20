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
  mobilewright)
    # Device bring-up (docker-android emulator / iOS simulator boot) happens
    # in the workflow JOB itself, exactly like the android/ios arms above —
    # this arm only waits on the gRPC ports it starts, not on any device.
    #
    # mobilewrightNeedsAppiumServer: false (recorded in
    # ci/pipeline.config.json) — the mobilewright npm package drives devices
    # via `mobilecli`, not an Appium server/WebDriverIO remote() session
    # (confirmed: neither src/plugins/mobilewright/mobilewright-lifecycle.ts
    # nor src/devices/adapters/mobilewright-adapter.ts reference Appium, a
    # host/port pair, or webdriverio's remote() — contrast with
    # src/plugins/appium/appium.ts, which very much does). So, unlike the
    # android/ios arms, this arm never starts or waits on an Appium daemon.
    run_bg proxy.log src/kernel/chaos-proxy.ts
    PLUGIN_MOBILEWRIGHT=true run_bg mobilewright-plugin.log src/plugins/mobilewright/server.ts
    PLUGIN_API=true run_bg api-plugin.log src/plugins/api/server.ts
    wait_port 50051 || fail "chaos-proxy did not open :50051"
    wait_port "${MOBILEWRIGHT_PLUGIN_PORT:-50057}" || fail "mobilewright plugin did not open :${MOBILEWRIGHT_PLUGIN_PORT:-50057}"
    wait_port "${API_PLUGIN_PORT:-50055}" || fail "api plugin did not open :${API_PLUGIN_PORT:-50055}"
    ;;
  zap)
    # RunZapScan.ts shells out to `docker run --rm ghcr.io/zaproxy/zaproxy:stable`
    # itself, per-scan — this arm only needs Docker to be *available* on the
    # runner, not a long-lived ZAP container started up front (contrast with
    # the `mobsf` arm below, which IS long-lived).
    run_bg proxy.log src/kernel/chaos-proxy.ts
    PLUGIN_ZAP=true run_bg zap-plugin.log src/plugins/zap/server.ts
    PLUGIN_API=true run_bg api-plugin.log src/plugins/api/server.ts
    wait_port 50051 || fail "chaos-proxy did not open :50051"
    wait_port "${ZAP_PLUGIN_PORT:-50058}" || fail "zap plugin did not open :${ZAP_PLUGIN_PORT:-50058}"
    wait_port "${API_PLUGIN_PORT:-50055}" || fail "api plugin did not open :${API_PLUGIN_PORT:-50055}"
    ;;
  mobsf)
    # MobSF is a long-lived REST server (unlike ZAP's per-scan container) —
    # start it, health-poll :8000 for 200|302, scrape its auto-generated API
    # key from its own startup logs (same pattern as
    # scripts/run-full-local.sh's local-dev security phase), then start the
    # mobsf plugin with that key in its env. `docker rm -f` first makes the
    # arm idempotent/re-runnable.
    #
    # NOTE: this file runs under `set -euo pipefail`, unlike
    # run-full-local.sh (`set -uo pipefail`, no -e) — the grep pipeline
    # below is guarded with `|| true` so an empty match (key not printed
    # yet) doesn't abort the whole script under -e/pipefail.
    docker rm -f mobsf >/dev/null 2>&1 || true
    docker run -d --name mobsf -p 8000:8000 opensecurity/mobile-security-framework-mobsf:v3.9.7 \
        || fail "failed to start mobsf container"
    MOBSF_READY=false
    for _ in $(seq 1 "${STACK_TIMEOUT_SECS:-90}"); do
        CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/ --max-time 5 2>/dev/null || true)
        case "$CODE" in
            200|302) MOBSF_READY=true; break ;;
        esac
        sleep 1
    done
    [ "$MOBSF_READY" = "true" ] || fail "mobsf did not answer 200|302 on :8000"
    # MobSF's own startup does a few Django autoreload cycles after the HTTP
    # port first answers 200|302, so the "REST API Key" line can still be a
    # beat behind `docker logs` at the instant health-polling succeeds —
    # retry the scrape instead of taking a single snapshot.
    MOBSF_API_KEY=""
    for _ in $(seq 1 10); do
        MOBSF_API_KEY="$(docker logs mobsf 2>&1 | grep -iaE 'REST API Key' | grep -oiE '[a-f0-9]{64}' | tail -1 || true)"
        [ -n "$MOBSF_API_KEY" ] && break
        sleep 1
    done
    [ -n "$MOBSF_API_KEY" ] || fail "could not scrape MOBSF_API_KEY from 'docker logs mobsf'"
    export MOBSF_API_KEY
    run_bg proxy.log src/kernel/chaos-proxy.ts
    PLUGIN_MOBSF=true MOBSF_URL="${MOBSF_URL:-http://127.0.0.1:8000}" MOBSF_API_KEY="$MOBSF_API_KEY" \
        run_bg mobsf-plugin.log src/plugins/mobsf/server.ts
    PLUGIN_API=true run_bg api-plugin.log src/plugins/api/server.ts
    wait_port 50051 || fail "chaos-proxy did not open :50051"
    wait_port "${MOBSF_PLUGIN_PORT:-50059}" || fail "mobsf plugin did not open :${MOBSF_PLUGIN_PORT:-50059}"
    wait_port "${API_PLUGIN_PORT:-50055}" || fail "api plugin did not open :${API_PLUGIN_PORT:-50055}"
    ;;
  webdriverio)
    # Selenium standalone container (docker-compose.yml's `webdriverio`
    # profile shows the reference service: selenium/standalone-chrome,
    # shm_size 2gb, port 4444) — brought up here directly rather than via
    # docker-compose, since ci/steps/*.sh scripts run plugins as bare
    # ts-node processes, not through docker-compose. `docker rm -f` first
    # makes the arm idempotent/re-runnable.
    docker rm -f selenium-standalone >/dev/null 2>&1 || true
    docker run -d --name selenium-standalone --shm-size=2g -p 4444:4444 selenium/standalone-chrome:latest \
        || fail "failed to start selenium-standalone container"
    wait_port "${SELENIUM_PORT:-4444}" || fail "selenium-standalone did not open :${SELENIUM_PORT:-4444}"
    run_bg proxy.log src/kernel/chaos-proxy.ts
    PLUGIN_WEBDRIVERIO=true run_bg webdriverio-plugin.log src/plugins/webdriverio/server.ts
    PLUGIN_API=true run_bg api-plugin.log src/plugins/api/server.ts
    wait_port 50051 || fail "chaos-proxy did not open :50051"
    wait_port "${WEBDRIVERIO_PLUGIN_PORT:-51000}" || fail "webdriverio plugin did not open :${WEBDRIVERIO_PLUGIN_PORT:-51000}"
    wait_port "${API_PLUGIN_PORT:-50055}" || fail "api plugin did not open :${API_PLUGIN_PORT:-50055}"
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
