#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# Deliberately does NOT touch dependency caching — see design doc §3.3.
# Each CI tool's adapter owns its own cache action/directive.
pnpm install --frozen-lockfile
