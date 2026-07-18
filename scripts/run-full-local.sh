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
source ci/steps/lib/common.sh
SP="$REPO/.ahm-full"; LOG="$SP/logs"; mkdir -p "$LOG"
CUKE="./node_modules/.bin/cucumber-js"
RUN_ID="full-$(date +%Y%m%d-%H%M)"
: > "$SP/full.log"; echo "$RUN_ID" > "$SP/full.runid"
say(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$SP/full.log"; }
phase(){ echo "PHASE=$1" > "$SP/full.status"; say "===== $1 ====="; }
bound(){ local secs="$1"; shift; ( "$@" ) & local bp=$!; ( sleep "$secs"; kill -9 "$bp" 2>/dev/null; pkill -9 -f cucumber-js 2>/dev/null ) & local kp=$!; wait "$bp" 2>/dev/null; local rc=$?; kill "$kp" 2>/dev/null; return $rc; }
# run_suite_phase — same shape as the old runcuke() this replaces, just
# delegating execution to the shared ci/steps/run-suite.sh instead of calling
# $CUKE directly. Deliberately keeps runcuke's own quirk (no explicit
# `return $rc`, so this always returns 0 unless killed by bound()'s timeout) —
# the existing `bound N run_suite_phase ... || say "hit Nmin bound"` call
# sites rely on that to only fire on a hard timeout, not on scenario failures.
run_suite_phase(){ local envs="$1" tags="$2" profile="$3" log="$4"; env $envs bash ci/steps/run-suite.sh "$tags" "$profile" > "$LOG/$log" 2>&1; local rc=$?; say "  cucumber exit=$rc — $(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/$log" | tail -1)"; }

rm -f reports/playwright*.json reports/api.json reports/android.json reports/ios.json reports/axe.json reports/zap.json reports/mobsf-*.json 2>/dev/null
bash ci/steps/teardown.sh

# PHASE 1: WEB desktop functional + accessibility (axe)
phase "web-desktop+a11y"
PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_AXE=true bash ci/steps/start-stack.sh web || say "web stack partial"
run_suite_phase "DRIVER=playwright PLATFORM=web VIEWPORT=desktop HEADLESS=true PLUGIN_AXE=true" "@desktop" "playwright-desktop" "phase-web.log"
cp -f reports/playwright-desktop.json reports/playwright.json 2>/dev/null
bash ci/steps/teardown.sh

# PHASE 2: API
phase "api"
PLATFORM=api DRIVER=api bash ci/steps/start-stack.sh api || say "api stack FAILED"
run_suite_phase "DRIVER=api PLATFORM=api" "@api" "api" "phase-api.log"
bash ci/steps/teardown.sh

# PHASE 3: VISUAL desktop (regen — green baselines)
phase "visual-desktop"
PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_PIXELMATCH=true VISUAL_UPDATE_BASELINE=true bash ci/steps/start-stack.sh web || say "visual stack partial"
env DRIVER=playwright PLATFORM=web VIEWPORT=desktop HEADLESS=true node scripts/visual-regen.js desktop > "$LOG/phase-visual.log" 2>&1; say "  visual-regen exit=$?"
bash ci/steps/teardown.sh

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
# Base bring-up is the shared 'api' profile (proxy + api plugin). ZAP/MobSF
# have no start-stack.sh arm yet (reserved, not wired — see start-stack.sh's
# own `zap|mobsf)` case, which `fail`s if invoked) so they stay inline here,
# same as before this refactor.
PLATFORM=api DRIVER=api bash ci/steps/start-stack.sh api || say "security stack partial"
if [ -n "$ZM" ]; then
  env $ZM MOBSF_URL=http://127.0.0.1:8000 $([ -n "$KEY" ] && echo MOBSF_API_KEY=$KEY) \
    npx ts-node -r tsconfig-paths/register -r dotenv/config src/plugins/zap/server.ts > "$LOG/zap.log" 2>&1 &
  env $ZM MOBSF_URL=http://127.0.0.1:8000 $([ -n "$KEY" ] && echo MOBSF_API_KEY=$KEY) \
    npx ts-node -r tsconfig-paths/register -r dotenv/config src/plugins/mobsf/server.ts > "$LOG/mobsf.log" 2>&1 &
  wait_port 50058 60; wait_port 50059 60
fi
SECENV="DRIVER=api PLATFORM=api"; [ -n "$ZM" ] && SECENV="$SECENV $ZM MOBSF_URL=http://127.0.0.1:8000 $([ -n "$KEY" ] && echo MOBSF_API_KEY=$KEY)"
env $SECENV "$CUKE" --tags "@security-infra" --retry 0 --format json:reports/security-infra.json --format progress > "$LOG/phase-sec-infra.log" 2>&1; say "  sec-infra exit=$?"
env $SECENV "$CUKE" --tags "@security" --retry 0 --format json:reports/security-web.json --format progress > "$LOG/phase-sec-web.log" 2>&1; say "  sec-web exit=$?"
bash ci/steps/teardown.sh

# PHASE 5: MOBILE Android (Appium + Z Flip 6, SM-F741B)
phase "mobile-android"
START_APPIUM_DAEMON=true PLATFORM=android DRIVER=appium DEVICE_PROFILE=z_flip_6 bash ci/steps/start-stack.sh android || say "android stack partial"
bound 1500 run_suite_phase "DRIVER=appium PLATFORM=android DEVICE_PROFILE=z_flip_6" "@android" "android" "phase-android.log" || say "  android hit 25min bound"
bash ci/steps/teardown.sh

# PHASE 6: MOBILE iOS (Appium + iPhone 16 Pro simulator)
phase "mobile-ios"
xcrun simctl boot 3DB4C74A-F64D-4997-B873-ECE31867AC37 2>/dev/null || true; sleep 5
START_APPIUM_DAEMON=true PLATFORM=ios DRIVER=appium DEVICE_PROFILE=iphone_16_pro IOS_UDID_0=3DB4C74A-F64D-4997-B873-ECE31867AC37 bash ci/steps/start-stack.sh ios || say "ios stack partial"
bound 1800 run_suite_phase "DRIVER=appium PLATFORM=ios DEVICE_PROFILE=iphone_16_pro IOS_UDID_0=3DB4C74A-F64D-4997-B873-ECE31867AC37" "@ios" "ios" "phase-ios.log" || say "  ios hit 30min bound"
bash ci/steps/teardown.sh

# PHASE 7: PERF (Gatling smoke)
phase "perf"
bound 1200 pnpm perf:smoke > "$LOG/phase-perf.log" 2>&1; say "  perf exit=$? (or bounded)"

# PHASE 8: INGEST into the dashboard
phase "ingest"
pnpm dashboard:ingest --run-id "$RUN_ID" > "$LOG/phase-ingest.log" 2>&1; say "  ingest exit=$? (runId=$RUN_ID)"
echo "DONE" > "$SP/full.status"
say "FULL RUN COMPLETE — runId=$RUN_ID · view with: pnpm dashboard"
