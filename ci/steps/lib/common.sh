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

# port_open <port> — pure Node, on every platform. Deliberately depends on no
# external binary: `nc` is absent from Git Bash on Windows AND from
# mcr.microsoft.com/playwright:*-jammy, the image every containerized CI job
# runs in. A missing binary makes bash return 127, which is indistinguishable
# from "connection refused", so the old POSIX branch could never report a
# healthy port inside that image — every container job burned the full
# wait_port timeout and died with a message blaming the service
# ("chaos-proxy did not open :50051") that was listening the whole time. Bare
# runners only escaped it because the ubuntu-24.04 image happens to provision
# netcat. node is a strictly weaker dependency than what start-stack.sh
# already requires (it launches every service with `npx ts-node`), so this
# removes the last thing the environment can silently fail to provide.
# The port goes through argv rather than string interpolation, and the socket
# gets a timeout so a filtered port cannot stall the poll loop.
# Covered by ci/steps/test/port-open.smoke.sh.
port_open() {
    node -e 'const s=require("net").connect(Number(process.argv[1]),"127.0.0.1");s.setTimeout(1000);s.on("connect",function(){s.destroy();process.exit(0)});s.on("timeout",function(){s.destroy();process.exit(1)});s.on("error",function(){process.exit(1)})' "$1" 2>/dev/null
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
