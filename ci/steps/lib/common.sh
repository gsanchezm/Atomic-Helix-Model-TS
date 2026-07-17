#!/usr/bin/env bash
# Shared primitives for ci/steps/*.sh. Sourced, never executed directly.

log() { echo "[$(date +%H:%M:%S)] $*"; }

# is_windows_bash — true under Git Bash/MSYS/Cygwin (this repo's own primary
# dev environment, per its Windows working context), false on the ubuntu-latest
# / macos-latest runners CI actually uses.
is_windows_bash() {
    case "$(uname -s)" in
        MINGW*|MSYS*|CYGWIN*) return 0 ;;
        *) return 1 ;;
    esac
}

# port_open <port> — OS-branched: `nc` (used by both existing local
# orchestrators' non-Windows checks and available on the ubuntu-latest/
# macos-latest CI runners) is not reliably present under Git Bash on Windows —
# confirmed empirically on this repo's own Windows dev box (`nc` → command not
# found, exit 127), which is exactly why scripts/orchestrate-full-run.sh (the
# Windows local orchestrator) already avoided nc and used this same Node
# one-liner for its own wait_port. Branching here is the "OS-branching"
# extraction this file's header promises — reusing that proven Windows check
# rather than letting wait_port silently always time out on Windows.
port_open() {
    if is_windows_bash; then
        node -e "require('net').connect($1,'127.0.0.1').on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)})" 2>/dev/null
    else
        nc -z 127.0.0.1 "$1" 2>/dev/null
    fi
}

# wait_port <port> [<timeoutSecs>] — polls until the port answers or the
# timeout elapses. Returns non-zero on timeout — callers MUST check the
# return value (the bug both existing inline loops share: they never do).
wait_port() {
    local p="$1" n="${2:-${STACK_TIMEOUT_SECS:-90}}"
    for _ in $(seq 1 "$n"); do
        port_open "$p" && return 0
        sleep 1
    done
    return 1
}

# kill_port <port> — POSIX branch mirrors scripts/run-full-local.sh's
# existing teardown(); Windows branch mirrors scripts/orchestrate-full-run.sh's
# existing teardown(). Neither is deleted from those scripts speculatively —
# this is the canonical copy both are refactored to call (Step 6/7 below).
kill_port() {
    local p="$1"
    if is_windows_bash; then
        powershell.exe -NoProfile -Command "\$c=Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue; foreach(\$x in \$c){ try{ Stop-Process -Id \$x.OwningProcess -Force -ErrorAction Stop }catch{} }" >/dev/null 2>&1
    else
        lsof -ti "tcp:$p" 2>/dev/null | xargs -r kill -9 2>/dev/null
    fi
}
