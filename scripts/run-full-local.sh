#!/usr/bin/env bash
# Local macOS full-suite orchestrator (resume path for the 2026-07-16 session).
# Phased: each phase brings up a clean stack (proxy + the plugins it needs),
# runs its tagged cucumber suite best-effort, then tears down. The security
# phase patiently retries Docker; ZAP + MobSF need Docker + a MobSF server on
# :8000 (PLUGIN_ZAP/PLUGIN_MOBSF=true, MOBSF_API_KEY set in .env). Finally
# ingests everything into one dashboard runId. Run AFTER a reboot / Docker reset
# so the daemon is healthy and system load is normal.
#
#   bash scripts/run-full-local.sh
#   pnpm dashboard          # then view the populated dashboard
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
# Put node 22 on PATH directly — `nvm use` is too slow/subprocess-heavy under load.
NODE22="$HOME/.nvm/versions/node/v22.22.2/bin"
[ -d "$NODE22" ] && export PATH="$NODE22:$PATH"
SP="$REPO/.ahm-full"; LOG="$SP/logs"; mkdir -p "$LOG"
CUKE="./node_modules/.bin/cucumber-js"
RUN_ID="full-$(date +%Y%m%d-%H%M)"
: > "$SP/full.log"; echo "$RUN_ID" > "$SP/full.runid"
say(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$SP/full.log"; }
phase(){ echo "PHASE=$1" > "$SP/full.status"; say "===== $1 ====="; }
port(){ nc -z 127.0.0.1 "$1" 2>/dev/null; }
wait_port(){ local p="$1" n="${2:-60}"; for i in $(seq 1 "$n"); do port "$p" && return 0; sleep 1; done; return 1; }
teardown(){ for p in 50051 50052 50053 50055 50056 50057 50058 50059; do lsof -ti tcp:$p 2>/dev/null | xargs -r kill -9 2>/dev/null; done; pkill -f 'chaos-proxy.ts' 2>/dev/null; pkill -f 'src/plugins/.*/server.ts' 2>/dev/null; sleep 3; }
bound(){ local secs="$1"; shift; ( "$@" ) & local bp=$!; ( sleep "$secs"; kill -9 "$bp" 2>/dev/null; pkill -9 -f cucumber-js 2>/dev/null ) & local kp=$!; wait "$bp" 2>/dev/null; local rc=$?; kill "$kp" 2>/dev/null; return $rc; }
srv(){ local log="$1"; shift; local envs="$1"; shift; local script="$1"; env $envs node -r ts-node/register -r tsconfig-paths/register -r dotenv/config "$script" > "$LOG/$log" 2>&1 & }
runcuke(){ local envs="$1" tags="$2" out="$3" log="$4"; env $envs "$CUKE" --tags "$tags" --retry 1 --format "json:$out" --format progress > "$LOG/$log" 2>&1; local rc=$?; say "  cucumber exit=$rc — $(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/$log" | tail -1)"; }

rm -f reports/playwright*.json reports/api.json reports/android.json reports/ios.json reports/axe.json reports/zap.json reports/mobsf-*.json 2>/dev/null
teardown

# PHASE 1: WEB desktop functional + accessibility (axe)
phase "web-desktop+a11y"
srv proxy.log "PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true" src/kernel/chaos-proxy.ts
wait_port 50051 60 && say "proxy up" || say "proxy FAILED"
srv playwright.log "PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_AXE=true PLAYWRIGHT_PLUGIN_PORT=50052" src/plugins/playwright/server.ts
srv api.log "PLUGIN_API=true API_PLUGIN_PORT=50055" src/plugins/api/server.ts
wait_port 50052 90 && wait_port 50055 60 && say "web stack up" || say "web stack partial"
runcuke "DRIVER=playwright PLATFORM=web VIEWPORT=desktop HEADLESS=true PLUGIN_AXE=true" "@desktop" "reports/playwright-desktop.json" "phase-web.log"
cp -f reports/playwright-desktop.json reports/playwright.json 2>/dev/null
teardown

# PHASE 2: API
phase "api"
srv proxy.log "PLATFORM=api DRIVER=api" src/kernel/chaos-proxy.ts
wait_port 50051 60 || say "proxy FAILED"
srv api.log "PLUGIN_API=true API_PLUGIN_PORT=50055" src/plugins/api/server.ts
wait_port 50055 60 || say "api stack FAILED"
runcuke "DRIVER=api PLATFORM=api" "@api" "reports/api.json" "phase-api.log"
teardown

# PHASE 3: VISUAL desktop (regen — green baselines)
phase "visual-desktop"
srv proxy.log "PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true" src/kernel/chaos-proxy.ts
wait_port 50051 60 || say "proxy FAILED"
srv playwright.log "PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_PIXELMATCH=true VISUAL_UPDATE_BASELINE=true PLAYWRIGHT_PLUGIN_PORT=50052 PIXELMATCH_PLUGIN_PORT=50056" src/plugins/playwright/server.ts
srv api.log "PLUGIN_API=true API_PLUGIN_PORT=50055" src/plugins/api/server.ts
wait_port 50052 90 && wait_port 50055 60 || say "visual stack partial"
env DRIVER=playwright PLATFORM=web VIEWPORT=desktop HEADLESS=true node scripts/visual-regen.js desktop > "$LOG/phase-visual.log" 2>&1; say "  visual-regen exit=$?"
teardown

# PHASE 4: SECURITY (needs Docker healthy + MobSF on :8000)
phase "security"
DOCK=down
for i in $(seq 1 60); do ( docker info >/dev/null 2>&1 & dp=$!; ( sleep 6; kill -9 $dp 2>/dev/null ) & wait $dp 2>/dev/null ) && { DOCK=up; break; }; sleep 4; done
say "docker: $DOCK"
ZM=""; KEY=""
if [ "$DOCK" = up ] && docker run --rm hello-world >/dev/null 2>&1; then
  docker start mobsf >/dev/null 2>&1 || true
  for i in $(seq 1 40); do curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/ --max-time 5 2>/dev/null | grep -qE '200|302' && break; sleep 3; done
  KEY=$(docker logs mobsf 2>&1 | grep -iaE 'REST API Key' | grep -oiE '[a-f0-9]{64}' | tail -1)
  ZM="PLUGIN_ZAP=true PLUGIN_MOBSF=true ZAP_PLUGIN_PORT=50058 MOBSF_PLUGIN_PORT=50059"
  say "security: full mode"
else
  say "security: PARTIAL (Docker down) — only TLS + schema-fuzz will produce data"
fi
srv proxy.log "PLATFORM=api DRIVER=api" src/kernel/chaos-proxy.ts
wait_port 50051 60 || say "proxy FAILED"
srv api.log "PLUGIN_API=true API_PLUGIN_PORT=50055" src/plugins/api/server.ts
if [ -n "$ZM" ]; then
  srv zap.log "$ZM MOBSF_URL=http://127.0.0.1:8000 $([ -n "$KEY" ] && echo MOBSF_API_KEY=$KEY)" src/plugins/zap/server.ts
  srv mobsf.log "$ZM MOBSF_URL=http://127.0.0.1:8000 $([ -n "$KEY" ] && echo MOBSF_API_KEY=$KEY)" src/plugins/mobsf/server.ts
  wait_port 50058 60; wait_port 50059 60
fi
wait_port 50055 60 || say "security stack partial"
SECENV="DRIVER=api PLATFORM=api"; [ -n "$ZM" ] && SECENV="$SECENV $ZM MOBSF_URL=http://127.0.0.1:8000 $([ -n "$KEY" ] && echo MOBSF_API_KEY=$KEY)"
env $SECENV "$CUKE" --tags "@security-infra" --retry 0 --format json:reports/security-infra.json --format progress > "$LOG/phase-sec-infra.log" 2>&1; say "  sec-infra exit=$?"
env $SECENV "$CUKE" --tags "@security" --retry 0 --format json:reports/security-web.json --format progress > "$LOG/phase-sec-web.log" 2>&1; say "  sec-web exit=$?"
teardown

# PHASE 5: MOBILE Android (Appium + Z Flip 6, SM-F741B)
phase "mobile-android"
port 4723 || { nohup appium --address 127.0.0.1 --port 4723 --relaxed-security > "$LOG/appium.log" 2>&1 & sleep 1; wait_port 4723 60 || say "appium FAILED"; }
srv proxy.log "PLATFORM=android DRIVER=appium" src/kernel/chaos-proxy.ts
wait_port 50051 60 || say "proxy FAILED"
srv appium.log "PLATFORM=android DRIVER=appium PLUGIN_APPIUM=true APPIUM_PLUGIN_PORT=50053 DEVICE_PROFILE=z_flip_6" src/plugins/appium/server.ts
srv api.log "PLUGIN_API=true API_PLUGIN_PORT=50055" src/plugins/api/server.ts
wait_port 50053 90 && wait_port 50055 60 || say "android stack partial"
bound 1500 runcuke "DRIVER=appium PLATFORM=android DEVICE_PROFILE=z_flip_6" "@android" "reports/android.json" "phase-android.log" || say "  android hit 25min bound"
teardown

# PHASE 6: MOBILE iOS (Appium + iPhone 16 Pro simulator)
phase "mobile-ios"
xcrun simctl boot 3DB4C74A-F64D-4997-B873-ECE31867AC37 2>/dev/null || true; sleep 5
port 4723 || { nohup appium --address 127.0.0.1 --port 4723 --relaxed-security > "$LOG/appium.log" 2>&1 & sleep 1; wait_port 4723 60; }
srv proxy.log "PLATFORM=ios DRIVER=appium" src/kernel/chaos-proxy.ts
wait_port 50051 60 || say "proxy FAILED"
srv appium.log "PLATFORM=ios DRIVER=appium PLUGIN_APPIUM=true APPIUM_PLUGIN_PORT=50053 DEVICE_PROFILE=iphone_16_pro IOS_UDID_0=3DB4C74A-F64D-4997-B873-ECE31867AC37" src/plugins/appium/server.ts
srv api.log "PLUGIN_API=true API_PLUGIN_PORT=50055" src/plugins/api/server.ts
wait_port 50053 120 && wait_port 50055 60 || say "ios stack partial"
bound 1800 runcuke "DRIVER=appium PLATFORM=ios DEVICE_PROFILE=iphone_16_pro IOS_UDID_0=3DB4C74A-F64D-4997-B873-ECE31867AC37" "@ios" "reports/ios.json" "phase-ios.log" || say "  ios hit 30min bound"
teardown

# PHASE 7: PERF (Gatling smoke)
phase "perf"
bound 1200 pnpm perf:smoke > "$LOG/phase-perf.log" 2>&1; say "  perf exit=$? (or bounded)"

# PHASE 8: INGEST into the dashboard
phase "ingest"
pnpm dashboard:ingest --run-id "$RUN_ID" > "$LOG/phase-ingest.log" 2>&1; say "  ingest exit=$? (runId=$RUN_ID)"
echo "DONE" > "$SP/full.status"
say "FULL RUN COMPLETE — runId=$RUN_ID · view with: pnpm dashboard"
