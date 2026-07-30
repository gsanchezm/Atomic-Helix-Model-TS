# CI Perf Isolation — Gatling load/stress exclusive of the functional suite

**Date:** 2026-07-29
**Scope:** make the `load` and `stress` Gatling legs of `.github/workflows/ahm-execution-helix.yml` run only after every backend-hitting job has finished, so their latency percentiles and error rates measure the OmniPizza backend instead of contention from the functional suites. `smoke` keeps overlapping freely. GitHub Actions only.

## 1. Problem

The design constraint (`docs/superpowers/plans/2026-07-20-full-suite-execution-and-tool-efficiency.md:16`, verbatim):

> "Gatling load/stress must run exclusive of every other category (shared backend under test); Gatling smoke may overlap freely."

The local orchestrator honors it — `scripts/orchestrate-full-run.sh` PHASE 3 runs the three profiles strictly sequentially after web/mobile and before API/visual/a11y/security, with nothing else running. CI does not: the profile matrix added in `2404826` starts `perf-gatling` as soon as `gate-gatling` completes, concurrently with the ~40 web/mobile/API job instances that all hit the same OmniPizza backend on Render's free tier. `max-parallel: 1` only serializes the three perf legs against each other. Any number a `load` or `stress` leg reports from a `platform=all` run is contaminated.

## 2. Goals

- `load`/`stress` legs start only after all backend-traffic-generating jobs in the same run have finished (pass, fail, or skip — see §5).
- `smoke` keeps its current behavior: starts as soon as `gate-gatling` allows, overlaps freely, gives the fast early signal. Additionally, `load`/`stress` wait for `smoke` too, restoring the smoke→load→stress serialization the old matrix's `max-parallel: 1` provided (final-review addition, 2026-07-30 — see §4 Fence membership).
- Single dispatch, single run: artifact naming, the `consolidate` job, and the dashboard ingest story stay intact.
- The dispatch interface does not change — the documented `gh workflow run ... -f perf_profiles='["smoke","load","stress"]'` command keeps working as-is.

## 3. Non-goals

- **Other CI configs.** `.gitlab-ci.yml`, `Jenkinsfile`, `azure-pipelines.yml` and both AWS buildspecs have the same conceptual flaw but have never executed; they are recorded debt, untouched here.
- **Runner-side noise.** GitHub-hosted 2-core runners are themselves a noisy load-generator host. Out of scope; this task removes only the self-inflicted backend contention.
- **The load/stress report-naming conflation** (`checkout-load` simulation id reused across profiles) — already handled by directory tagging locally and per-profile artifact names in CI; see `2026-07-19-performance-test-type-tabs-design.md` §1.
- **Cross-workflow contention.** `update-visual-baselines.yml` writes through the shared `standard-user-writes` group but is dispatched manually and rarely; a fence cannot see other workflows anyway.

## 4. Decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Isolation mechanism | New no-op fence job (`perf-fence`) that `needs:` every backend-hitting job; `load`/`stress` depend on it. | User-selected over (b) a second chained workflow (splits artifacts across two runs, `workflow_run` cannot carry inputs) and (c) a shared concurrency group (a job may declare only one group — collides with `standard-user-writes` — and would serialize the whole suite including today's parallel `reads` legs). |
| Fence membership | The 12 backend-traffic jobs: `api-smoke`, `e2e-web`, `e2e-web-responsive`, `visual-web`, `visual-web-responsive`, `a11y-web`, `e2e-android`, `e2e-ios`, `e2e-mobilewright`, `security-zap`, `e2e-webdriverio`, `e2e-cypress`; plus a 13th member, `perf-gatling-smoke`, added at final review. | Membership criterion for the 12 is "generates traffic against the shared backend". Excluded: `security-mobsf` (static APK analysis, zero backend traffic; if it ever hangs it would pointlessly block perf for up to 6 h), `resolve-omnipizza-release` (GitHub API only), all `gate-*` jobs (no-ops). `perf-gatling-smoke` joins for a different reason — not backend contention with the functional suite, but so `load`/`stress` never overlap the smoke probe itself, restoring `load`/`stress`'s isolation from smoke that the old matrix's `max-parallel: 1` gave for free. User-selected at final review, 2026-07-30. |
| Smoke handling | Split into its own job (`perf-gatling-smoke`), no matrix, `needs: gate-gatling` only. | Preserves the constraint's explicit asymmetry; keeps the cheap early signal instead of delaying a 3-request probe behind a multi-hour suite. User-approved. |
| Failure semantics | Perf runs even when functional jobs are red. | Perf measures the backend, not the suite; matches the local orchestrator, which runs every phase regardless of earlier exits. User-approved. |
| Scope | GitHub Actions workflow only. | Only pipeline that executes; replicating an unvalidated design into 5 dormant configs is waste. |

## 5. Job graph changes

```
gate-gatling ──> perf-gatling-smoke ──────┐          (free overlap, early)
                                           │
12 backend jobs ───────────────────────────┴──> perf-fence (no-op, if: !cancelled())
                        │
gate-gatling ───────────┴──> perf-gatling  [load ─> stress]   (exclusive)
```

**`perf-fence` (new).** `runs-on: ubuntu-latest`, single `echo` step. `needs:` the 13 jobs — the 12 listed in §4 plus `perf-gatling-smoke` (final-review addition). `if: ${{ !cancelled() }}` so it completes whether its dependencies passed, failed, or were skipped (e.g. `platform=gatling` skips the 12 functional gates → fence still waits on `perf-gatling-smoke` before completing → perf `load`/`stress` wait for smoke to finish). Deliberately not `always()`: an `always()` condition resists run cancellation, so cancelling a run would still start the perf legs; `!cancelled()` keeps the pass/fail/skip tolerance without that.

**`perf-gatling-smoke` (new).** Copy of today's `perf-gatling` body with no `strategy:` block and `smoke` hardcoded where `matrix.profile` appeared. `needs: gate-gatling`. Job-level `if:` additionally requires `smoke` to be among the requested profiles (`contains()` over the same profiles expression). Artifact names must stay byte-identical to today's matrix output: `ahm-artifacts-perf-gatling-smoke-${{ github.run_id }}` and `gatling-report-smoke-${{ github.run_id }}` — the `-smoke` suffix is written literally. `TOM_RUN_ID` keeps today's exact format with `gatling-smoke`.

**`perf-gatling` (modified).** Keeps the matrix expression over `inputs.perf_profiles` and adds `exclude: [{profile: smoke}]`. `needs: [gate-gatling, perf-fence]`. Job-level `if` (where `PROFILES` stands for the existing matrix expression already in the workflow, repeated verbatim — `fromJSON(inputs.perf_profiles != '' && inputs.perf_profiles || format('["{0}"]', inputs.perf_profile || 'smoke'))`):

```
!cancelled()
&& needs.gate-gatling.result == 'success'
&& needs.perf-fence.result == 'success'
&& (contains(PROFILES, 'load') || contains(PROFILES, 'stress'))
```

`!cancelled()` is required because without it a failed/skipped fence dependency auto-skips the job (and `always()` would additionally resist run cancellation — see §5 fence note); the explicit gate check is required because overriding the auto-skip also overrides it for a skipped `gate-gatling`. The `contains()` guard prevents the empty-matrix case when only `["smoke"]` was requested. Keeps `fail-fast: false` and `max-parallel: 1` (matrix order `load` before `stress` follows the input array order).

**`consolidate` (modified).** Adds `perf-gatling-smoke` to its `needs:` list (it already lists `perf-gatling`; its `if: always()` tolerates skipped entries).

## 6. Needs-list rot mitigation

The fence's 12-name `needs:` list silently rots if a member job is renamed (GitHub Actions fails the workflow on *unknown* `needs:` targets, so deletions and renames of the *referenced* name are caught at parse time — the silent case is a **new** backend-hitting job that nobody adds to the fence). Mitigation, same pattern `consolidate` already uses: a header comment on `perf-fence` stating the membership criterion ("every job that generates traffic against the shared backend under test — if you add one, add it here"), and a one-line pointer comment on each member job.

## 7. Verification plan

1. `actionlint` on the edited workflow (expression syntax, `needs:` target existence).
2. Shakedown dispatch #1 — `platform=gatling`, `perf_profiles='["smoke","load"]'`: asserts the smoke job fires early, the fence completes instantly on 12 skipped deps, the exclusive job runs `load` only, artifact names match today's byte-for-byte.
3. Shakedown dispatch #2 — `platform=gatling`, `perf_profiles='["smoke"]'`: asserts the exclusive job skips cleanly (empty-matrix guard) instead of erroring.
4. First `platform=all` run: confirm via the run's Gantt/timeline that `perf-gatling[load]` started only after the last fence member finished.

**Runtime behavior to confirm at step 3 (not trusted from docs):** whether a dynamic `fromJSON` matrix that evaluates empty is even reached when the job-level `if` is false. The `contains()` guard is designed to make the question moot; step 3 proves it.

## 8. Risks

- **Status-check-function chains are easy to get subtly wrong** (a stray `always()`/`!cancelled()` on the wrong job can resurrect a job that `platform` filtering meant to skip; bare `always()` additionally resists run cancellation, which is why this design uses `!cancelled()`). Covered by shakedown #1's skip assertions.
- **Wall-clock:** `load`+`stress` now run after the multi-hour functional suite instead of alongside it, lengthening total run duration by their combined runtime (~2× `perf_duration` plus JRE spin-up). Accepted — uncontaminated numbers are the entire point.
- **`cancel-in-progress: true`** at workflow level is unchanged. A second dispatch on the same ref does cancel a running one, killing any in-flight perf leg along with the rest of that run — but because everything happens inside a single workflow, isolation stays intact (the numbers die with the run that produced them; there is no half-finished logical run left dangling). This is the property the two-workflow chain rejected in §4 would have lacked: a cancellation there could strand the second workflow mid-run with no first-workflow context to resume from.
