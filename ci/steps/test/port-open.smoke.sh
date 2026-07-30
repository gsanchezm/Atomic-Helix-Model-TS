#!/usr/bin/env bash
# port_open must answer "is this port listening?" using nothing but node.
#
# Regression test for the CI failure where every job running inside
# `container: mcr.microsoft.com/playwright:v1.61.1-jammy` died with
# "FAIL: chaos-proxy did not open :50051" after exactly 90s. The proxy was
# healthy every time; `port_open`'s POSIX branch shelled out to `nc`, which
# that image does not ship, so bash returned 127 — indistinguishable from a
# refused connection — on every poll, and wait_port could never succeed.
# Bare-runner jobs passed only because the ubuntu-24.04 runner image happens
# to provision netcat.
#
# The invariant under test is therefore NOT "nc works" but "port_open needs no
# external binary at all". It is enforced by running the probe with a PATH
# containing exactly one executable: a wrapper around node (which start-stack.sh
# already hard-requires — it launches every service with `npx ts-node`).
#
# Scope note: only port_open is held to that bar. wait_port's loop uses seq and
# sleep, and those assertions run with the normal PATH — coreutils ship in every
# image this repo targets, including the Playwright one; netcat does not. The
# point is not "zero binaries anywhere", it is "the thing that decides whether a
# service is up must not be able to silently lose its dependency".
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
source ci/steps/lib/common.sh

# Force the POSIX code path. Without this the test is vacuous on the Windows
# dev box (is_windows_bash() there selects a branch CI never executes), so the
# container failure would stay invisible until the next CI run. With it, the
# assertions below hold the same meaning on every platform, and a reintroduced
# external-binary dependency on the POSIX side fails here rather than in CI.
is_windows_bash() { return 1; }

NODE_BIN="$(command -v node)" || { echo "FAIL: node not on PATH — cannot run this test"; exit 1; }
TMP="$(mktemp -d)"
cleanup() { [ -n "${LISTENER_PID:-}" ] && kill "$LISTENER_PID" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

# A PATH with node and nothing else. Any reintroduced dependency on nc, lsof,
# curl or friends makes the probe fail here the way it failed in CI.
# The shebang must name bash by absolute path: `#!/usr/bin/env bash` would
# make env search the stripped PATH for bash, fail, and return the very 127
# this test uses to detect a missing dependency — a false RED.
BASH_BIN="$(command -v bash)" || { echo "FAIL: bash not on PATH"; exit 1; }
printf '#!%s\nexec "%s" "$@"\n' "$BASH_BIN" "$NODE_BIN" > "$TMP/node"
chmod +x "$TMP/node"
PATH="$TMP" node -e 'process.exit(0)' 2>/dev/null || { echo "FAIL: the test harness's own node wrapper is broken — every assertion below would report a false 127"; exit 1; }
BARE_PATH="$TMP"

# Bind an ephemeral port, then report it, so this test never collides with a
# real stack (50051-51000) or with a parallel copy of itself.
LIVE_PORT="$("$NODE_BIN" -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
[ -n "$LIVE_PORT" ] || { echo "FAIL: could not allocate an ephemeral port"; exit 1; }

"$NODE_BIN" -e 'require("net").createServer().listen(Number(process.argv[1]),"127.0.0.1")' "$LIVE_PORT" &
LISTENER_PID=$!

# Poll for the listener with the same probe under test would be circular, so
# wait on node itself, out-of-band.
for _ in $(seq 1 30); do
    "$NODE_BIN" -e 'const s=require("net").connect(Number(process.argv[1]),"127.0.0.1");s.on("connect",()=>{s.destroy();process.exit(0)});s.on("error",()=>process.exit(1))' "$LIVE_PORT" 2>/dev/null && break
    sleep 1
done

echo "[smoke] port_open finds a listening port with node as the only binary on PATH"
PATH="$BARE_PATH" port_open "$LIVE_PORT"
rc=$?
[ "$rc" -eq 0 ] || { echo "FAIL: port_open returned $rc for the live port $LIVE_PORT (expected 0). Exit 127 means it shelled out to a binary this environment does not have — the CI container failure."; exit 1; }

echo "[smoke] port_open still reports a closed port as closed"
DEAD_PORT="$("$NODE_BIN" -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
PATH="$BARE_PATH" port_open "$DEAD_PORT"
rc=$?
[ "$rc" -ne 0 ] || { echo "FAIL: port_open returned 0 for the closed port $DEAD_PORT — a probe that always succeeds is as useless as one that always fails"; exit 1; }

echo "[smoke] port_open rejects an out-of-range port instead of hanging"
PATH="$BARE_PATH" port_open 99999
rc=$?
[ "$rc" -ne 0 ] || { echo "FAIL: port_open returned 0 for out-of-range port 99999 (start-stack.smoke.sh relies on this failing)"; exit 1; }

echo "[smoke] wait_port succeeds promptly against a live port"
START="$(date +%s)"
wait_port "$LIVE_PORT" 5
rc=$?
ELAPSED=$(( $(date +%s) - START ))
[ "$rc" -eq 0 ] || { echo "FAIL: wait_port returned $rc after ${ELAPSED}s for the live port (expected 0). Burning the full timeout on a healthy port is exactly the CI symptom."; exit 1; }
[ "$ELAPSED" -le 3 ] || { echo "FAIL: wait_port took ${ELAPSED}s to notice a port that was already listening"; exit 1; }

echo "[smoke] wait_port still times out on a dead port"
START="$(date +%s)"
wait_port "$DEAD_PORT" 2
rc=$?
ELAPSED=$(( $(date +%s) - START ))
[ "$rc" -ne 0 ] || { echo "FAIL: wait_port returned 0 for a dead port"; exit 1; }
[ "$ELAPSED" -ge 2 ] || { echo "FAIL: wait_port gave up after ${ELAPSED}s, less than the 2s timeout it was given"; exit 1; }

echo "[smoke] all port_open assertions passed"
