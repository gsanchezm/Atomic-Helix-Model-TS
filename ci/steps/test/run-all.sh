#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
fail=0
for f in ci/steps/test/*.smoke.sh; do
    echo "=== $f ==="
    bash "$f" || fail=1
done
exit $fail
