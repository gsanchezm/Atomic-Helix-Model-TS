# Atomic Testing Paper — Diagnosability Fault-Injection Harness — Design

**Date:** 2026-08-23
**Status:** Approved (design); implementation pending
**Scope:** Build-order step 3 (`docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md`
§4/§6) — designs the internals that document deliberately deferred: what fault to inject per bucket,
how injection is triggered without touching the app under test, how blast radius is captured
mechanically. Does not touch the portability tooling (step 4) or the campaign orchestrator (step 5).

## 1. Purpose

`docs/paper/atomic-testing-formal-definition.md` §8.4's diagnosability row requires "systematic fault
injection at a layer both arms genuinely share — backend/network, not UI vs. API setup, since the
twin's setup is now all-UI while the atomic arm's is API and a setup-layer fault wouldn't be the 'same'
fault in both." One representative fault per entry in the existing 14-bucket taxonomy
(`scripts/metrics/lib/failure-buckets.ts`), measuring blast radius (# scenarios/oracles failing) and
localization accuracy (does the reported bucket name the true cause, or the symptom where it happened
to surface) — 1 dispatch per fault × 14 buckets × 2 arms = 28 dispatches (already fixed by the campaign
design's §3 decision 5).

## 2. Current-state findings

- **OmniPizza's backend already ships 7 deterministic "chaos users"** — `TEST_USERS` in
  `~/Documents/Repos/OmniPizza/backend/constants.py:21-61`, each keyed to a JWT `behavior` claim minted
  at login (`backend/routers/auth.py:62`, `data={"sub": ..., "behavior": user["behavior"], "sid": sid}`):
  `standard_user` (clean), `locked_out_user` (403 at login — `backend/auth.py:26`),
  `problem_user` ($0 prices + broken images), `performance_glitch_user` (3s delay on every call —
  `backend/middleware.py:57`), `error_user` (random 500 on checkout,
  `backend/database.py:361 should_trigger_error`), plus `a11y_glitch_user`/`security_glitch_user`
  (already wired to the project's `@a11y`/`@security` contracts, not this harness — see
  `~/Documents/Repos/OmniPizza/docs/superpowers/specs/2026-07-19-a11y-security-chaos-users-design.md`).
- **Both arms already select the login account by a plain string alias, not a fixed constant.**
  `src/core/tests/login/organisms/login.route.ts:91` — `loginAs(userAlias: string)` — is called
  identically by the atomic suites' API `$S_0$` DAO and (per the twin's own login reuse, see
  `evaluation/non-atomic-twin/README.md`) the twin's UI login. Swapping which chaos user a given
  dispatch authenticates as requires **zero new route/organism code** — only a way to parameterize
  which alias a dispatch uses (§4 below).
- **Backend chaos users have no global-toggle poisoning risk.** Behavior is a property of the JWT
  minted for that one session (`sid = uuid.uuid4().hex`, `backend/routers/auth.py:60`), not a
  process-wide flag — confirmed by reading the full `InMemoryDB` (`backend/database.py:89-91`): its
  three mutable stores (`orders`, `sessions`, `user_profiles`) are keyed by UUID/`session_id`, never by
  username. Concurrent dispatches using different (or the same) chaos user do not interfere with each
  other. (This same fact is why the parallel-safety instrument returned a null result this session —
  see `project_parallel_safety_null_result_2026-08-23` memory — unrelated finding, noted here only
  because it was discovered while confirming this harness's scoping safety.)
- **`debug_chaos.py`** (`~/Documents/Repos/OmniPizza/backend/routers/debug_chaos.py`) exposes 2
  directly-callable, side-effect-free endpoints (`/api/debug/latency-spike`, `/api/debug/cpu-load`) —
  usable as a secondary latency/perf source, but the chaos users above already cover those buckets more
  naturally (tied to the actual journey, not a side-channel ping), so this harness does not depend on
  them.
- **`chaos-proxy.ts`'s `handleExecuteIntent`** (`src/kernel/chaos-proxy.ts:249-299`) is the single
  choke point every intent from both arms, both platforms, passes through — genuinely shared by
  construction. It has no fault-injection hook today; `resolveSelector` (line 267) maps the logical key
  to a concrete selector, then `routeToPlugin` (line 271-273) calls the real plugin inside
  `suppressChaos`. This is the natural insertion point for the tool/UI-layer buckets the backend cannot
  reach.

## 3. Approved decisions

1. **Two-site harness**, not one. Backend-layer injection (reusing existing chaos users, zero backend
   code) for buckets that are genuinely about API/data behavior; `chaos-proxy`-layer injection (one
   small, disclosed new hook) for buckets that are genuinely about the tool/UI layer. Forcing every
   bucket through a single layer would either be impossible (a locator-resolution fault has no backend
   analogue) or dishonest (faking a UI-layer symptom from the backend wouldn't be the actual failure
   mode named by that bucket).
2. **Per-dispatch fault selection reuses the existing env-var pattern**, not a new mechanism. Just as
   `PLATFORM`/`DRIVER` are set once per proxy/test-runner process and require a restart to change (see
   `feedback_proxy_platform_viewport_restart` memory), a diagnosability dispatch sets:
   - `DIAGNOSABILITY_CHAOS_USER` — which seeded account both arms' login step authenticates as for this
     dispatch (defaults to `standard_user`, i.e. off).
   - `TOM_INJECT_FAULT` / `TOM_INJECT_FAULT_ACTION` — which bucket-representative synthetic failure
     `chaos-proxy` should return, and for which `actionId`, for this dispatch (unset = off, normal
     routing).
   Each of the 28 dispatches is already a separate CI job (§3 decision 1 of the campaign design, all
   via `workflow_dispatch`), so "one fault active per process" is not a limitation — it matches how the
   campaign already runs.
3. **Honest exclusion over forced fit.** A bucket with no injectable representative at either layer is
   reported as **not injected** in §9.2, with the reason stated, rather than inventing a strained
   mechanism. See §5.

## 4. Mechanism details

### 4.1 Backend-layer injection (chaos users)

For a diagnosability dispatch targeting a backend/data bucket, both arms' login step calls
`loginAs(process.env.DIAGNOSABILITY_CHAOS_USER ?? 'standard_user')` instead of the hardcoded
`'standard_user'`. This is the only code change on this side: threading one env-driven alias through
wherever `loginAs('standard_user')` is currently called by the atomic checkout suite's Background and
the twin's login reuse. No DAO, route, or backend change.

### 4.2 `chaos-proxy`-layer injection (new)

Add a check in `handleExecuteIntent` (`src/kernel/chaos-proxy.ts`), before the call to
`suppressChaos(() => routeToPlugin(...))` at line 271: if `process.env.TOM_INJECT_FAULT` is set and
`actionId` (or the resolved logical key) matches `process.env.TOM_INJECT_FAULT_ACTION`, skip
`routeToPlugin` entirely and return a synthetic `IntentOutcome` of `{ status: 'FAIL', error: <message
engineered to match the target bucket's regex in failure-buckets.ts> }`. This still flows through the
existing `emitTelemetry` call unchanged, so the injected failure is reported exactly like a real one —
required for the blast-radius/localization measurement in §6 to be meaningful. `INFRASTRUCTURE_FAILURE`
needs no new code at all: pointing e.g. `PLAYWRIGHT_ADDRESS` at a closed port for one dispatch already
produces a real `ECONNREFUSED`, which `suppressChaos`'s own transient-jitter classification
(`chaos-proxy.ts:162-178`) already treats as retriable jitter, not deterministic — worth flagging as a
design tension (§7).

## 5. Per-bucket table

| Bucket | Site | Representative fault | Notes |
|---|---|---|---|
| `DATA_SETUP_FAILURE` | Backend (chaos user) | `DIAGNOSABILITY_CHAOS_USER=locked_out_user` — 403 at login | See `project_locked_out_user_contract_mismatch` memory before using this one — OmniPizza's own tests assert non-standard behavior here; verify current behavior first. |
| `ASSERTION_FAILURE` | Backend (chaos user) | `problem_user` — $0 prices break the atomic suite's price assertion | |
| `TIMEOUT_FAILURE` / `PERFORMANCE_THRESHOLD_FAILURE` | Backend (chaos user) | `performance_glitch_user` — 3s delay on every call (`middleware.py:57`) | One representative fault covers both buckets' *cause*; which bucket the classifier reports for each arm is itself part of what's measured. |
| `API_RESPONSE_FAILURE` | Backend (chaos user) | `error_user` — random 500 on checkout (`database.py:361`) | 50% trigger rate — may need >1 attempt per dispatch to guarantee it fires; disclose this if so. |
| `LOCATOR_RESOLUTION_FAILURE` | `chaos-proxy` (new hook) | Synthetic error matching `locator|selector|element not found` for a chosen `actionId` | |
| `UI_ACTION_FAILURE` | `chaos-proxy` (new hook) | Synthetic error matching `click|type|tap|fill|navigate|scroll|interact` | |
| `WEB_SESSION_FAILURE` | `chaos-proxy` (new hook) | Synthetic error matching `browser|page crash|playwright|target closed` | Only meaningful on the web arm. |
| `MOBILE_SESSION_FAILURE` | `chaos-proxy` (new hook) | Synthetic error matching `session not created|appium|emulator|device` | Only meaningful on the mobile arm — diagnosability campaign may need to run this bucket's 2 dispatches on Appium/Android instead of web. |
| `INFRASTRUCTURE_FAILURE` | `chaos-proxy` (existing env, zero new code) | Point `PLAYWRIGHT_ADDRESS`/`APPIUM_ADDRESS` at a closed port for the dispatch | See §7's retry-classification tension. |
| `API_CONTRACT_FAILURE` | Unconfirmed — plausibly backend (`security_glitch_user`'s checkout leak) | Not yet verified whether the atomic suite's response-schema assertion actually reports a message matching `schema\|contract violation\|invalid (response )?body` for this payload shape | **Verify at implementation time before claiming coverage; report as not-yet-confirmed rather than assumed.** |
| `VISUAL_DIFF_FAILURE` | **Not injectable — honestly excluded** | — | The twin does not run pixelmatch/visual contracts today; no shared visual-comparison surface exists to inject into. |
| `VISUAL_BASELINE_MISSING` | **Not injectable — honestly excluded** | — | Same reason. |
| `UNKNOWN_FAILURE` | `chaos-proxy` (new hook) | Synthetic error message that matches **none** of `failure-buckets.ts`'s ordered rules | This is the one bucket where "correct" behavior is degrading to `UNKNOWN_FAILURE`, not avoiding it — the test is that the classifier doesn't mis-bucket it as something else. |

Result: 11 of 14 buckets have a concrete, grounded mechanism (8 solid, 1 needing a scoping fix, 1 needing
implementation-time confirmation, 1 by-design-degrades-correctly); 2 are honestly excluded with reasons
stated, matching §8.5's evidence policy (no fabricated coverage).

## 6. Blast-radius / localization measurement

For a given injected fault, run both arms in the same dispatch shape the campaign already uses (one
`workflow_dispatch` per arm), collect each arm's JSON report, and for every scenario/step recorded:

1. Feed its `status`/`errorMessage` through the existing `classifyFailure()` (`scripts/metrics/lib/failure-buckets.ts`) — unchanged, no new classification logic.
2. **Blast radius** = count of scenarios/oracles that failed as a result of the one injected fault. For
   the atomic suite this should be exactly the one scenario that owns the faulted behavior; for the twin,
   potentially the whole journey (login → catalog → pizzaBuilder → checkout) if the fault occurs early.
3. **Localization accuracy** = does the bucket `classifyFailure()` reports match the bucket that was
   *actually* injected, or does it report the bucket of wherever the fault happened to surface (e.g. a
   backend `error_user` 500 injected at checkout, but the twin's failure surfaces as an
   `ASSERTION_FAILURE` on the order-confirmation screen three steps later)? Both the reported bucket and
   the true injected bucket get recorded — a mismatch here is itself the diagnosability signal §8.4
   predicts, not a harness bug.

No new aggregation script is needed beyond wiring these two numbers into §9.2's existing skeleton table
in `docs/paper/atomic-testing-formal-definition.md`.

## 7. Open design tensions (not resolved by this document)

- **`INFRASTRUCTURE_FAILURE` via a closed port is classified as transient jitter and retried** by
  `suppressChaos`'s existing `TRANSIENT_SIGNATURE_REGEX` (`chaos-proxy.ts:162-173`, `econnrefused` is
  explicitly matched). At `maxRetries=3` this either eventually fails deterministically (still usable,
  just slower and noisier in the telemetry) or, if the retry masks it entirely, this bucket needs a
  different mechanism (e.g. a synthetic proxy-level error carrying an infra-shaped message instead of a
  real closed-port `ECONNREFUSED`, so it never enters the retry path). Decide at implementation time by
  running it once and checking the actual outcome, not by assuming either way.
- **`DATA_SETUP_FAILURE` via `locked_out_user`** needs the `project_locked_out_user_contract_mismatch`
  finding re-checked before use — that memory documents OmniPizza's own tests asserting behavior that
  doesn't match a naive "403 at login" expectation, and a prior AHM false-pass on Android/mobilewright
  for exactly this account.
- **`API_CONTRACT_FAILURE`** has no confirmed mechanism yet (§5) — flagged, not assumed.

## 8. Explicitly deferred

- Actual code (the `chaos-proxy.ts` hook, the `loginAs` env threading) — this document is the design,
  not the patch.
- Wiring these 28 dispatches into the campaign orchestrator (build-order step 5) — out of scope per this
  document's stated scope in §0.
