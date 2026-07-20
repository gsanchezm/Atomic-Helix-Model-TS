#!/usr/bin/env bash
# One-shot local orchestration across all 7 categories, in order:
# Web (Playwright, WebdriverIO) -> Mobile (Mobilewright, Appium) ->
# Performance (Gatling smoke/load/stress) -> API -> Visual -> Accessibility -> Security (ZAP, MobSF).
# Every tool invocation is wrapped by run_timed(), which records wall-clock
# duration to reports/<runId>/timing/<tool>-<subtype>.json for the dashboard's
# Tool Efficiency section. Continues through test failures (we want results
# captured even if some scenarios fail; retry:1 in cucumber.js absorbs cold-start flakes).
#
# Fully sequential by design: ci/steps/start-stack.sh's every profile (api,
# web, android, ios, mobilewright, zap, mobsf, webdriverio) independently
# starts its own chaos-proxy on the hardcoded port 50051 -- there is no
# shared-stack mechanism, so two profiles cannot run at once on one machine
# (CI's apparent parallelism relies on separate runners, not a shared proxy).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
source ci/steps/lib/common.sh
LOG=".ahm-orch-logs"
mkdir -p "$LOG"
SUMMARY="$LOG/summary.log"
: > "$SUMMARY"

CUKE="./node_modules/.bin/cucumber-js"
TS="$(date +%Y-%m-%dT%H-%M)"
RUN_ID="real-$TS"

say(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$SUMMARY"; }

# run_timed <tool> <category> <subtype> <command...>
# Wraps a tool invocation with wall-clock start/end capture, written via
# scripts/write-timing.js. Never affects the wrapped command's exit status.
run_timed() {
  local tool="$1" category="$2" subtype="$3"; shift 3
  local started ended status
  started="$(node -e 'console.log(new Date().toISOString())')"
  "$@"
  status=$?
  ended="$(node -e 'console.log(new Date().toISOString())')"
  node scripts/write-timing.js --tool "$tool" --category "$category" --subtype "$subtype" \
    --started "$started" --ended "$ended" --run-id "$RUN_ID" --reports-dir reports \
    || say "WARN — failed to write timing sidecar for $tool/$subtype"
  return $status
}

# Stale mobile scratch from a PRIOR run must not leak into THIS run's ingest: one
# run = one ingest. The per-run ingested copies (reports/<runId>/appium.json) are the
# durable record and are untouched; only the top-level scratch is cleared.
rm -f reports/android.json reports/ios.json

# ==================== 1. WEB (desktop + responsive Playwright, then WebdriverIO) ====================
say "PHASE 1a — web desktop: starting stack"
if PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_PIXELMATCH=false bash ci/steps/start-stack.sh web; then
  say "PHASE 1a — stack up; running cucumber @desktop"
  PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PIXELMATCH=false \
    run_timed playwright web_ui desktop bash ci/steps/run-suite.sh "@desktop" playwright-desktop \
    > "$LOG/phase1a.log" 2>&1
  say "PHASE 1a — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase1a.log" | tail -1))"
else
  say "PHASE 1a — STACK FAILED to come up (see proxy/playwright/api logs)"
fi
bash ci/steps/teardown.sh

say "PHASE 1b — web responsive: starting stack"
if PLATFORM=web VIEWPORT=responsive DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_PIXELMATCH=false bash ci/steps/start-stack.sh web; then
  say "PHASE 1b — stack up; running cucumber @responsive"
  PLATFORM=web VIEWPORT=responsive DRIVER=playwright HEADLESS=true PLUGIN_PIXELMATCH=false \
    run_timed playwright web_ui responsive bash ci/steps/run-suite.sh "@responsive" playwright-responsive \
    > "$LOG/phase1b.log" 2>&1
  say "PHASE 1b — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase1b.log" | tail -1))"
else
  say "PHASE 1b — STACK FAILED to come up"
fi
bash ci/steps/teardown.sh

say "PHASE 1c — webdriverio: starting stack (brings up its own selenium-standalone container)"
if PLATFORM=web DRIVER=webdriverio bash ci/steps/start-stack.sh webdriverio; then
  say "PHASE 1c — stack up; running cucumber @desktop"
  PLATFORM=web DRIVER=webdriverio \
    run_timed webdriverio web_ui web bash ci/steps/run-suite.sh "@desktop" webdriverio \
    > "$LOG/phase1c.log" 2>&1
  say "PHASE 1c — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase1c.log" | tail -1))"
else
  say "PHASE 1c — STACK FAILED to come up (needs Docker for selenium-standalone)"
fi
bash ci/steps/teardown.sh

# ==================== 2. MOBILE (Mobilewright, then Appium — sequential, distinct start-stack profiles) ====================
say "PHASE 2a — mobilewright: starting stack"
if PLATFORM=android DRIVER=mobilewright bash ci/steps/start-stack.sh mobilewright; then
  say "PHASE 2a — stack up; running cucumber @android"
  PLATFORM=android DRIVER=mobilewright \
    run_timed mobilewright mobile_ui android bash ci/steps/run-suite.sh "@android" mobilewright \
    > "$LOG/phase2a.log" 2>&1
  say "PHASE 2a — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase2a.log" | tail -1))"
else
  say "PHASE 2a — STACK FAILED to come up (see proxy/mobilewright-plugin logs)"
fi
bash ci/steps/teardown.sh

say "PHASE 2b — appium: pre-flight (adb device + Appium daemon :4723)"
if ! command -v adb >/dev/null 2>&1; then
  say "PHASE 2b — SKIP: adb not on PATH"
elif [ -z "$(adb devices | awk 'NR>1 && $2=="device"{print $1}')" ]; then
  say "PHASE 2b — SKIP: no adb device in 'device' state (connect a phone or start an emulator)"
elif ! node -e "require('net').connect(4723,'127.0.0.1').on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)})" 2>/dev/null; then
  say "PHASE 2b — SKIP: Appium daemon not reachable on :4723 (start it with \`appium\`)"
else
  ANDROID_DEV="$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')"
  say "PHASE 2b — device $ANDROID_DEV + daemon up; starting android stack"
  if PLATFORM=android DRIVER=appium bash ci/steps/start-stack.sh android; then
    say "PHASE 2b — stack up; running cucumber @android (single Appium session, ~60min)"
    PLATFORM=android DRIVER=appium PLUGIN_APPIUM=true PLUGIN_API=true \
      run_timed appium mobile_ui android bash ci/steps/run-suite.sh "@android" android \
      > "$LOG/phase2b.log" 2>&1
    say "PHASE 2b — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase2b.log" | tail -1))"
  else
    say "PHASE 2b — STACK FAILED to come up (see proxy/appium-plugin logs)"
  fi
  bash ci/steps/teardown.sh
fi

# ==================== 3. PERFORMANCE (Gatling smoke, load, stress — strictly sequential, exclusive of everything else) ====================
say "PHASE 3 — gatling smoke: checkout-load"
run_timed gatling performance smoke bash -c 'PERF_PROFILE=smoke pnpm perf:smoke' > "$LOG/phase3-smoke.log" 2>&1
say "PHASE 3 — smoke exit=$?"
say "PHASE 3 — gatling load: checkout-load"
run_timed gatling performance load bash -c 'PERF_PROFILE=load pnpm perf:load' > "$LOG/phase3-load.log" 2>&1
say "PHASE 3 — load exit=$?"
say "PHASE 3 — gatling stress: checkout-load"
run_timed gatling performance stress bash -c 'PERF_PROFILE=stress pnpm perf:stress' > "$LOG/phase3-stress.log" 2>&1
say "PHASE 3 — stress exit=$?"

# ==================== 4. API ====================
say "PHASE 4 — API: starting stack"
if PLATFORM=api DRIVER=api bash ci/steps/start-stack.sh api; then
  say "PHASE 4 — stack up; running cucumber @api"
  PLATFORM=api DRIVER=api \
    run_timed api api standalone bash ci/steps/run-suite.sh "@api" api > "$LOG/phase4.log" 2>&1
  say "PHASE 4 — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase4.log" | tail -1))"
else
  say "PHASE 4 — STACK FAILED to come up"
fi
bash ci/steps/teardown.sh

# ==================== 5. VISUAL (desktop + responsive) ====================
say "PHASE 5a — visual desktop: starting stack (pixelmatch on)"
if PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_PIXELMATCH=true bash ci/steps/start-stack.sh web; then
  say "PHASE 5a — stack up; running visual-regen desktop"
  run_timed pixelmatch visual desktop bash -c 'PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true node scripts/visual-regen.js desktop' \
    > "$LOG/phase5a.log" 2>&1
  say "PHASE 5a — visual-regen exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase5a.log" | tail -1))"
else
  say "PHASE 5a — STACK FAILED to come up"
fi
bash ci/steps/teardown.sh

say "PHASE 5b — visual responsive: starting stack (pixelmatch on)"
if PLATFORM=web VIEWPORT=responsive DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_PIXELMATCH=true bash ci/steps/start-stack.sh web; then
  say "PHASE 5b — stack up; running visual-regen responsive"
  run_timed pixelmatch visual responsive bash -c 'PLATFORM=web VIEWPORT=responsive DRIVER=playwright HEADLESS=true node scripts/visual-regen.js responsive' \
    > "$LOG/phase5b.log" 2>&1
  say "PHASE 5b — visual-regen exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase5b.log" | tail -1))"
else
  say "PHASE 5b — STACK FAILED to come up"
fi
bash ci/steps/teardown.sh

# ==================== 6. ACCESSIBILITY (dedicated @a11y pass, PLUGIN_AXE on) ====================
say "PHASE 6 — accessibility: starting stack (axe on)"
if PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PLAYWRIGHT=true PLUGIN_AXE=true bash ci/steps/start-stack.sh web; then
  say "PHASE 6 — stack up; running cucumber @a11y"
  PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_AXE=true \
    run_timed axe accessibility a11y bash ci/steps/run-suite.sh "@a11y" a11y \
    > "$LOG/phase6.log" 2>&1
  say "PHASE 6 — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phase6.log" | tail -1))"
else
  say "PHASE 6 — STACK FAILED to come up"
fi
bash ci/steps/teardown.sh

# ==================== 7. SECURITY (ZAP, then MobSF — sequential, distinct start-stack profiles) ====================
# Exact commands mirrored from .github/workflows/ahm-execution-helix.yml's
# security-zap and security-mobsf jobs (found during implementation — there
# is no ci/steps/run-security.sh; both tools go through the same generic
# run-suite.sh every other profile uses).
say "PHASE 7a — zap: starting stack"
if PLATFORM=api DRIVER=api PLUGIN_ZAP=true PLUGIN_API=true bash ci/steps/start-stack.sh zap; then
  say "PHASE 7a — stack up; running @security (hard-gating active scan + schema fuzz)"
  PLATFORM=api DRIVER=api PLUGIN_ZAP=true \
    run_timed zap security web bash ci/steps/run-suite.sh "@security" zap security \
    > "$LOG/phase7a-security.log" 2>&1
  say "PHASE 7a — @security exit=$?"
  say "PHASE 7a — running @security-infra (ZAP baseline + TLS; MobSF self-skips, PLUGIN_MOBSF unset)"
  PLATFORM=api DRIVER=api PLUGIN_ZAP=true \
    bash ci/steps/run-suite.sh "@security-infra" zap security-infra \
    > "$LOG/phase7a-security-infra.log" 2>&1
  say "PHASE 7a — @security-infra exit=$?"
else
  say "PHASE 7a — STACK FAILED to come up (see proxy/zap-plugin logs; needs Docker)"
fi
bash ci/steps/teardown.sh

say "PHASE 7b — mobsf: starting stack (brings up its own long-lived mobsf container)"
if PLATFORM=api DRIVER=api PLUGIN_MOBSF=true PLUGIN_API=true MOBSF_URL="http://127.0.0.1:8000" \
    bash ci/steps/start-stack.sh mobsf; then
  say "PHASE 7b — stack up; running @security-infra (MobSF static scan; ZAP self-skips, PLUGIN_ZAP unset)"
  PLATFORM=api DRIVER=api PLUGIN_MOBSF=true MOBSF_URL="http://127.0.0.1:8000" \
    run_timed mobsf security android bash ci/steps/run-suite.sh "@security-infra" mobsf security-infra \
    > "$LOG/phase7b.log" 2>&1
  say "PHASE 7b — @security-infra exit=$?"
else
  say "PHASE 7b — STACK FAILED to come up (see proxy/mobsf-plugin logs; needs Docker)"
fi
bash ci/steps/teardown.sh

# ---------------- Ingest ----------------
rm -f reports/playwright.json

say "INGEST — dashboard ingest as run-id $RUN_ID"
PROJECT="AHM" pnpm dashboard:ingest --run-id "$RUN_ID" > "$LOG/ingest.log" 2>&1
say "INGEST — exit=$?"
tail -12 "$LOG/ingest.log" | tee -a "$SUMMARY"

say "DONE — run-id: $RUN_ID"
