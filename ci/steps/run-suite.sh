#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
TAG_EXPRESSION="${1:?Usage: run-suite.sh <tag-expression> <profile> [<suite-suffix>]}"
PROFILE="${2:?Usage: run-suite.sh <tag-expression> <profile> [<suite-suffix>]}"
SUFFIX="${3:-}"
REPORT="reports/${PROFILE}${SUFFIX:+-$SUFFIX}.json"

case "$PROFILE" in
  mobilewright|zap|mobsf|webdriverio)
    echo "profile '$PROFILE' has no run-suite.sh arm yet — see docs/plans/2026-07-17-cicd-pipelines-update.md" >&2
    exit 1
    ;;
  cypress)
    echo "profile 'cypress' has no run-suite.sh arm and may never need one — see docs/plans/2026-07-17-cypress-webdriverio-plugins.md §4 (Option A runs via Cypress's own runner, not cucumber-js; only Option B would route through here, implemented in docs/plans/2026-07-17-cicd-pipelines-update.md)" >&2
    exit 1
    ;;
  *)
    ./node_modules/.bin/cucumber-js --tags "$TAG_EXPRESSION" --format "json:$REPORT" --format progress
    ;;
esac
