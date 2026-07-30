# Gatling CI Perf Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Gatling `load`/`stress` legs of `.github/workflows/ahm-execution-helix.yml` run only after every backend-hitting job has finished (via a no-op `perf-fence` job), while `smoke` keeps overlapping freely in its own job — so load/stress percentiles measure the OmniPizza backend, not suite contention.

**Architecture:** Three job-graph changes inside the single existing workflow: (1) new `perf-fence` no-op job that `needs:` the 12 backend-traffic jobs with `if: ${{ !cancelled() }}`; (2) new `perf-gatling-smoke` job (no matrix, depends only on `gate-gatling`); (3) existing `perf-gatling` matrix job excludes `smoke` and gains `needs: [gate-gatling, perf-fence]` plus a guarded `if`. `consolidate` adds the smoke job to its `needs:`. Spec: `docs/superpowers/specs/2026-07-29-gatling-ci-perf-isolation-design.md`.

**Tech Stack:** GitHub Actions workflow YAML; `actionlint` (via Docker image `rhysd/actionlint`, since actionlint is not on PATH but Docker is); `gh` CLI for shakedown dispatches; PowerShell 7 shell.

## Global Constraints

- Only `.github/workflows/ahm-execution-helix.yml` changes (plus this plan's own doc). GitLab/Jenkins/Azure/AWS configs are recorded debt — do NOT touch them (spec §3).
- The dispatch interface must not change: same inputs, and the documented launch command keeps working as-is: `gh workflow run ahm-execution-helix.yml --ref main -f platform=all -f architecture_type=standard -f perf_profiles='["smoke","load","stress"]' ...`
- Artifact names must stay byte-identical to today's output (spec §5): `ahm-artifacts-perf-gatling-smoke-<run_id>`, `ahm-artifacts-perf-gatling-<profile>-<run_id>`, `gatling-report-<profile>-<run_id>`.
- Use `!cancelled()`, never bare `always()`, in the new/modified job-level `if:` conditions (spec §5: `always()` resists run cancellation).
- Fence membership criterion (verbatim in the fence's header comment): every job that generates traffic against the shared backend. The 12 members: `api-smoke`, `e2e-web`, `e2e-web-responsive`, `visual-web`, `visual-web-responsive`, `a11y-web`, `e2e-android`, `e2e-ios`, `e2e-mobilewright`, `security-zap`, `e2e-webdriverio`, `e2e-cypress`. Excluded: `security-mobsf`, `resolve-omnipizza-release`, all `gate-*` jobs.
- Commit messages use this repo's conventional style: `ci(helix): ...`. Commit directly on `main` (this repo has no PR workflow). Do NOT push until Task 5 says so.
- This is YAML + live-infrastructure work, so the TDD cycle adapts to: capture actionlint baseline (red) → edit → actionlint again with no new findings + structural grep asserts (green) → live shakedown dispatches as the integration tests (Tasks 5–7).
- The line numbers cited below were measured before any edits; re-locate by the quoted anchor strings, not by number.

---

### Task 1: `perf-fence` job + membership pointer comments

**Files:**
- Modify: `.github/workflows/ahm-execution-helix.yml` (insert new job before the `# Job 6: Perf — Gatling Simulation` header at ~line 2012; add 12 one-line comments)

**Interfaces:**
- Consumes: the 12 existing job keys listed in Global Constraints.
- Produces: job key `perf-fence` (Task 3 adds it to `perf-gatling`'s `needs:`). Its display name is `Perf — exclusivity fence` (Tasks 5–7 assert on that name).

- [ ] **Step 1: Capture the actionlint baseline (the "failing test" equivalent)**

Run (PowerShell, repo root):

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/ahm-execution-helix.yml 2>&1 | Tee-Object -FilePath "$env:TEMP\actionlint-baseline.txt"
```

Expected: whatever pre-existing findings exist (possibly none). Save the output; later steps must introduce ZERO new findings relative to this baseline. If Docker cannot pull the image, fall back to `winget install actionlint` (or download the release binary) and run `actionlint -color .github/workflows/ahm-execution-helix.yml` — record which variant you used and reuse it for every later actionlint step.

- [ ] **Step 2: Insert the fence job**

In `.github/workflows/ahm-execution-helix.yml`, find this unique anchor (currently ~line 2012):

```yaml
  # ---------------------------------------------------------------------------
  # Job 6: Perf — Gatling Simulation
```

Insert immediately BEFORE it:

```yaml
  # ---------------------------------------------------------------------------
  # Perf exclusivity fence — no-op barrier.
  # Membership criterion: EVERY job that generates traffic against the shared
  # OmniPizza backend under test must appear in this needs: list, so the
  # Gatling load/stress legs (perf-gatling below) measure the backend rather
  # than contention from the rest of the suite. If you add a backend-hitting
  # job, add it here. Deliberately absent: security-mobsf (static APK
  # analysis, zero backend traffic — a hung MobSF would pointlessly block
  # perf), resolve-omnipizza-release (GitHub API only), gate-* (no-ops).
  # `!cancelled()` (not `always()`) so the fence completes when members fail
  # or skip, but does not resurrect on a cancelled run.
  # Spec: docs/superpowers/specs/2026-07-29-gatling-ci-perf-isolation-design.md
  # ---------------------------------------------------------------------------
  perf-fence:
    name: Perf — exclusivity fence
    needs:
      - api-smoke
      - e2e-web
      - e2e-web-responsive
      - visual-web
      - visual-web-responsive
      - a11y-web
      - e2e-android
      - e2e-ios
      - e2e-mobilewright
      - security-zap
      - e2e-webdriverio
      - e2e-cypress
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      - run: echo "All backend-traffic jobs finished — Gatling load/stress may start."

```

(Keep the trailing blank line so the Job 6 header stays separated.)

- [ ] **Step 3: Add the 12 pointer comments**

For each job key below, find the line with EXACTLY two spaces of indent (`  api-smoke:` — the job definition; `needs:` list entries use `      - api-smoke` and won't match) and insert this single line immediately above it, same two-space indent:

```yaml
  # Backend-traffic job — member of perf-fence's needs: list (see that job).
```

Job keys (pre-edit line numbers for orientation only): `api-smoke` (~307), `e2e-web` (~419), `e2e-web-responsive` (~558), `visual-web` (~698), `visual-web-responsive` (~848), `a11y-web` (~996), `e2e-android` (~1098), `e2e-ios` (~1294), `e2e-mobilewright` (~1486), `security-zap` (~1778), `e2e-webdriverio` (~2116), `e2e-cypress` (~2228). Note most of these already have a `# ---` header comment block above them — the pointer line goes BETWEEN that block and the job key line.

- [ ] **Step 4: Verify (lint + structure)**

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/ahm-execution-helix.yml
(Select-String -Path .github/workflows/ahm-execution-helix.yml -Pattern "^  perf-fence:$").Count
(Select-String -Path .github/workflows/ahm-execution-helix.yml -Pattern "member of perf-fence").Count
```

Expected: actionlint output identical to the Step 1 baseline (no new findings — actionlint validates that every `needs:` target exists, so a typo in a member name fails here); `perf-fence:` count = 1; pointer-comment count = 12.

- [ ] **Step 5: Commit**

```powershell
git add .github/workflows/ahm-execution-helix.yml
git commit -m @'
ci(helix): add perf-fence no-op barrier over the 12 backend-traffic jobs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HTbQvKsCadJP3c9DmE551J
'@
```

---

### Task 2: `perf-gatling-smoke` job (free-overlap leg)

**Files:**
- Modify: `.github/workflows/ahm-execution-helix.yml` (insert new job before the `perf-fence` header comment added in Task 1)

**Interfaces:**
- Consumes: `gate-gatling` (existing). Uses the same profiles expression as `perf-gatling`'s matrix (verbatim below).
- Produces: job key `perf-gatling-smoke` (Task 4 adds it to `consolidate`'s `needs:`). Display name `Perf — Gatling smoke` — identical to what the old matrix smoke leg rendered, so dashboards/checks read the same.

- [ ] **Step 1: Insert the job**

Find this unique anchor (added by Task 1):

```yaml
  # ---------------------------------------------------------------------------
  # Perf exclusivity fence — no-op barrier.
```

Insert immediately BEFORE it (the body is a copy of today's `perf-gatling` job with the matrix removed and `smoke` hardcoded — every step, action version, cache key, and env var deliberately identical):

```yaml
  # ---------------------------------------------------------------------------
  # Perf — Gatling smoke (free-overlap leg). The isolation constraint is
  # asymmetric (spec §2): only load/stress need exclusivity; smoke is a
  # 3-request probe that may overlap the functional suite freely and doubles
  # as the fast early perf signal. Own job precisely so it does NOT wait for
  # perf-fence. Body is a clone of perf-gatling below with smoke hardcoded.
  # Artifact names stay byte-identical to the old matrix leg's output:
  # github.job here is "perf-gatling-smoke", so
  # ahm-artifacts-${{ github.job }}-<run_id> equals the old
  # ahm-artifacts-perf-gatling-<matrix.profile>-<run_id> string for smoke.
  # Spec: docs/superpowers/specs/2026-07-29-gatling-ci-perf-isolation-design.md
  # ---------------------------------------------------------------------------
  perf-gatling-smoke:
    name: Perf — Gatling smoke
    needs: gate-gatling
    # Run only when 'smoke' is among the requested profiles. Same expression
    # as perf-gatling's matrix. No !cancelled() here: if gate-gatling is
    # skipped (platform filtering), the default auto-skip is exactly right.
    if: >-
      ${{ contains(fromJSON(inputs.perf_profiles != '' && inputs.perf_profiles || format('["{0}"]', inputs.perf_profile || 'smoke')), 'smoke') }}
    runs-on: ubuntu-latest
    env:
      TOOL_NAME: gatling
      PLATFORM: performance
      DRIVER: gatling
      TOM_RUN_ID: >-
        ${{ inputs.architecture_type == 'TOM'
            && format('tom-{0}-{1}-{2}-gatling-smoke', github.run_id, github.run_attempt, inputs.run_index || github.run_attempt)
            || format('gh-{0}-{1}-gatling-smoke', github.run_id, github.run_attempt) }}

    steps:
      - uses: actions/checkout@v6
      - name: Set up Node
        uses: actions/setup-node@v6
        with:
          node-version: ${{ env.NODE_VERSION }}
      - name: Install pnpm
        uses: pnpm/action-setup@v5
      - name: Cache pnpm store
        uses: actions/cache@v5
        with:
          path: ~/.pnpm-store
          key: pnpm-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: pnpm-${{ runner.os }}-
      - name: Cache Gatling JRE bundle
        uses: actions/cache@v5
        with:
          path: node_modules/@gatling.io/cli/.gatling
          key: gatling-jre-${{ runner.os }}-${{ hashFiles('node_modules/@gatling.io/cli/package.json') }}
      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Capture run start time
        if: always()
        run: echo "RUN_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_ENV"

      - name: Start stack
        # Gatling has no proxy/plugin stack of its own — start-stack.sh's
        # `gatling)` arm is a documented no-op, kept only for Template Method
        # symmetry with the other jobs (see ci/steps/start-stack.sh).
        run: bash ci/steps/start-stack.sh gatling

      - name: Run simulation
        run: pnpm perf:smoke
        env:
          API_BASE_URL: ${{ secrets.API_BASE_URL }}
          PERF_USERS: ${{ inputs.perf_users || '20' }}
          PERF_DURATION: ${{ inputs.perf_duration || '120' }}
          LANGUAGE: en

      - name: Capture run end time
        if: always()
        run: echo "RUN_ENDED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_ENV"

      - name: Collect artifacts
        if: always()
        run: bash ci/steps/collect-artifacts.sh gatling

      - name: Upload artifacts
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: ahm-artifacts-${{ github.job }}-${{ github.run_id }}
          path: artifacts/gatling/
          if-no-files-found: ignore
          retention-days: 30

      - name: Upload Gatling HTML report (standard)
        if: ${{ always() && inputs.architecture_type != 'TOM' }}
        uses: actions/upload-artifact@v7
        with:
          name: gatling-report-smoke-${{ github.run_id }}
          path: target/gatling/
          if-no-files-found: ignore
          retention-days: 30

      - name: Teardown
        if: always()
        run: bash ci/steps/teardown.sh

```

Note: the step-level `if: always()` occurrences inside the body are copied as-is from the existing job on purpose — the Global Constraint about `!cancelled()` applies to JOB-level conditions of the new graph edges, not to the pre-existing step-level cleanup conditions.

- [ ] **Step 2: Verify (lint + structure)**

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/ahm-execution-helix.yml
(Select-String -Path .github/workflows/ahm-execution-helix.yml -Pattern "^  perf-gatling-smoke:$").Count
(Select-String -Path .github/workflows/ahm-execution-helix.yml -Pattern "gatling-report-smoke-").Count
```

Expected: no new actionlint findings vs baseline; both counts = 1.

- [ ] **Step 3: Commit**

```powershell
git add .github/workflows/ahm-execution-helix.yml
git commit -m @'
ci(helix): split Gatling smoke into its own free-overlap job

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HTbQvKsCadJP3c9DmE551J
'@
```

---

### Task 3: Make `perf-gatling` exclusive (load/stress only, behind the fence)

**Files:**
- Modify: `.github/workflows/ahm-execution-helix.yml` — the `perf-gatling:` job (header comment, `needs:`, new `if:`, matrix `exclude:`)

**Interfaces:**
- Consumes: `perf-fence` (Task 1), `gate-gatling` (existing).
- Produces: `perf-gatling` keeps its key (consolidate already needs it) and its display name pattern `Perf — Gatling ${{ matrix.profile }}`, now only ever rendering `load`/`stress`.

- [ ] **Step 1: Update the job header comment**

Replace:

```yaml
  # ---------------------------------------------------------------------------
  # Job 6: Perf — Gatling Simulation
  # ---------------------------------------------------------------------------
```

with:

```yaml
  # ---------------------------------------------------------------------------
  # Job 6: Perf — Gatling Simulation (load/stress — EXCLUSIVE legs).
  # smoke runs in perf-gatling-smoke above and never here (matrix exclude).
  # These legs measure the shared backend, so they start only after
  # perf-fence confirms every backend-traffic job finished; numbers taken
  # while the functional suite runs are contention artifacts, not backend
  # behavior. Runs even when functional jobs are red (perf measures the
  # backend, not the suite) — hence !cancelled() + explicit gate check.
  # Spec: docs/superpowers/specs/2026-07-29-gatling-ci-perf-isolation-design.md
  # ---------------------------------------------------------------------------
```

- [ ] **Step 2: Rewrite the job's graph edges and matrix**

Replace:

```yaml
  perf-gatling:
    name: Perf — Gatling ${{ matrix.profile }}
    needs: gate-gatling
    runs-on: ubuntu-latest
    strategy:
      # fail-fast off so a red `load` leg does not cancel `stress`; max-parallel 1
      # so three load generators never hit the same backend at once (which would
      # make every leg's numbers meaningless).
      fail-fast: false
      max-parallel: 1
      matrix:
        profile: ${{ fromJSON(inputs.perf_profiles != '' && inputs.perf_profiles || format('["{0}"]', inputs.perf_profile || 'smoke')) }}
```

with:

```yaml
  perf-gatling:
    name: Perf — Gatling ${{ matrix.profile }}
    needs: [gate-gatling, perf-fence]
    # !cancelled(): run even when fence members failed or skipped, but not on
    # a cancelled run. The explicit gate check is required because overriding
    # the auto-skip also overrides it for a skipped gate-gatling. The
    # contains() guard skips the job (instead of expanding an empty matrix)
    # when only ["smoke"] was requested.
    if: >-
      ${{ !cancelled()
          && needs.gate-gatling.result == 'success'
          && needs.perf-fence.result == 'success'
          && (contains(fromJSON(inputs.perf_profiles != '' && inputs.perf_profiles || format('["{0}"]', inputs.perf_profile || 'smoke')), 'load')
              || contains(fromJSON(inputs.perf_profiles != '' && inputs.perf_profiles || format('["{0}"]', inputs.perf_profile || 'smoke')), 'stress')) }}
    runs-on: ubuntu-latest
    strategy:
      # fail-fast off so a red `load` leg does not cancel `stress`; max-parallel 1
      # so two load generators never hit the same backend at once (which would
      # make every leg's numbers meaningless). smoke is excluded — it runs in
      # perf-gatling-smoke, without waiting for the fence.
      fail-fast: false
      max-parallel: 1
      matrix:
        profile: ${{ fromJSON(inputs.perf_profiles != '' && inputs.perf_profiles || format('["{0}"]', inputs.perf_profile || 'smoke')) }}
        exclude:
          - profile: smoke
```

Everything from `env:` down (TOM_RUN_ID, steps, artifact names with `matrix.profile`) stays untouched.

- [ ] **Step 3: Verify (lint + structure)**

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/ahm-execution-helix.yml
Select-String -Path .github/workflows/ahm-execution-helix.yml -Pattern "needs: \[gate-gatling, perf-fence\]"
Select-String -Path .github/workflows/ahm-execution-helix.yml -Pattern "- profile: smoke"
```

Expected: no new actionlint findings vs baseline (actionlint type-checks the `if:` expression and the matrix/exclude shape); both Select-Strings return exactly one match.

- [ ] **Step 4: Commit**

```powershell
git add .github/workflows/ahm-execution-helix.yml
git commit -m @'
ci(helix): gate Gatling load/stress behind perf-fence, exclude smoke from the matrix

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HTbQvKsCadJP3c9DmE551J
'@
```

---

### Task 4: Add the smoke job to `consolidate`

**Files:**
- Modify: `.github/workflows/ahm-execution-helix.yml` — `consolidate:` job's `needs:` list (~line 2310 pre-edit)

**Interfaces:**
- Consumes: `perf-gatling-smoke` (Task 2).
- Produces: nothing new — `consolidate`'s `if: ${{ always() && inputs.architecture_type == 'TOM' }}` already tolerates skipped/failed needs entries (pre-existing condition; NOT rewritten to `!cancelled()` — out of scope, spec §3).

- [ ] **Step 1: Extend the needs list**

Replace (inside the `consolidate:` job):

```yaml
      - e2e-ios
      - perf-gatling
```

with:

```yaml
      - e2e-ios
      - perf-gatling
      - perf-gatling-smoke
```

- [ ] **Step 2: Verify (lint + structure)**

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/ahm-execution-helix.yml
Select-String -Path .github/workflows/ahm-execution-helix.yml -Pattern "- perf-gatling-smoke"
```

Expected: no new actionlint findings; exactly one match.

- [ ] **Step 3: Commit**

```powershell
git add .github/workflows/ahm-execution-helix.yml
git commit -m @'
ci(helix): consolidate also waits on perf-gatling-smoke

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HTbQvKsCadJP3c9DmE551J
'@
```

---

### Task 5: Push + shakedown #1 — smoke overlaps, load waits, artifacts byte-identical

**Files:** none (live verification; spec §7 steps 2 and 4-lite)

**Interfaces:**
- Consumes: the pushed workflow on `main`; `gh` CLI (already authenticated — it dispatched this workflow before).
- Produces: evidence for spec §7.2. Also the real-world answer to "does `exclude` on a dynamic matrix behave" when the excluded value IS present.

- [ ] **Step 1: Push main (per this repo's no-PR workflow: fetch and check divergence first)**

```powershell
git fetch origin
git status -sb   # expect "ahead N", NOT diverged; if diverged, STOP and report
git push origin main
```

- [ ] **Step 2: Dispatch shakedown #1 (cheap: 5 users, 60 s)**

```powershell
gh workflow run ahm-execution-helix.yml --ref main -f platform=gatling -f architecture_type=standard -f perf_profiles='["smoke","load"]' -f perf_users=5 -f perf_duration=60
Start-Sleep -Seconds 15
$RUN = gh run list --workflow=ahm-execution-helix.yml --limit 1 --json databaseId --jq '.[0].databaseId'
$RUN   # print it for the log
```

IMPORTANT: the workflow-level concurrency group (`helix-<ref>`, `cancel-in-progress: true`) means a second dispatch on main CANCELS a running one — never dispatch the next shakedown until the previous run completed.

- [ ] **Step 3: Wait for completion**

```powershell
gh run watch $RUN --exit-status
```

Expected: exit 0 (with `platform=gatling` only the gatling gate, both perf jobs, and the fence run; everything else skips). If red, read the failed job's log via `gh run view $RUN --log-failed` before touching anything — diagnose, don't re-dispatch blindly.

- [ ] **Step 4: Assert the job graph behaved**

```powershell
gh run view $RUN --json jobs --jq '.jobs[] | select(.conclusion != "skipped") | "\(.name) | \(.conclusion) | started=\(.startedAt) | done=\(.completedAt)"'
```

Assert ALL of:
1. `Perf — exclusivity fence` → `success`, and its `started`→`done` span is seconds (all 12 members skipped ⇒ fence ran immediately — proves a `platform=gatling` dispatch is not delayed by the fence).
2. `Perf — Gatling smoke` → `success`, started within ~1 min of the run start (proves smoke does not wait for the fence).
3. Exactly ONE `Perf — Gatling load` job → `success`, and NO `Perf — Gatling smoke` duplicate coming from the matrix (proves `exclude` removed the smoke combination from a dynamic matrix).
4. `Perf — Gatling load`.startedAt ≥ fence.completedAt.

- [ ] **Step 5: Assert artifact names are byte-identical to the old scheme**

```powershell
gh api "repos/{owner}/{repo}/actions/runs/$RUN/artifacts" --jq '.artifacts[].name'
```

Expected names (exactly; `<RUN>` = the run id): `ahm-artifacts-perf-gatling-smoke-<RUN>`, `ahm-artifacts-perf-gatling-load-<RUN>`, `gatling-report-smoke-<RUN>`, `gatling-report-load-<RUN>`. Any deviation (double profile segment, missing segment) fails this task — fix the `name:` fields, do not renumber assertions.

---

### Task 6: Shakedown #2 — smoke-only request must skip (not fail) the exclusive job

**Files:** none (live verification; spec §7 step 3 — the empty-matrix question)

**Interfaces:**
- Consumes: completed Task 5 (run must be finished — concurrency cancellation, see Task 5 Step 2).
- Produces: the runtime answer to whether a false job-`if` prevents empty-matrix expansion errors. Contingency below if it does not.

- [ ] **Step 1: Dispatch and wait**

```powershell
gh workflow run ahm-execution-helix.yml --ref main -f platform=gatling -f architecture_type=standard -f perf_profiles='["smoke"]' -f perf_users=5 -f perf_duration=60
Start-Sleep -Seconds 15
$RUN = gh run list --workflow=ahm-execution-helix.yml --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $RUN --exit-status
```

Expected: exit 0.

- [ ] **Step 2: Assert skip semantics**

```powershell
gh run view $RUN --json jobs --jq '.jobs[] | "\(.name) | \(.conclusion)"'
```

Assert: `Perf — Gatling smoke` → `success`; fence → `success`; there is either NO `Perf — Gatling *` matrix job at all or its conclusion is `skipped` — anything `failure`-colored means the empty-matrix guard did not hold.

- [ ] **Step 3 (CONTINGENCY — only if Step 1/2 failed on empty-matrix expansion):**

If the run errors with a matrix-expansion failure despite the `if:` guard, replace the `exclude:`-based filtering with a filtered-array expression on the SAME matrix line of `perf-gatling` (drop the `exclude:` block; job `if:` stays):

```yaml
      matrix:
        profile: ${{ fromJSON(format('[{0}{1}{2}]',
            contains(fromJSON(inputs.perf_profiles != '' && inputs.perf_profiles || format('["{0}"]', inputs.perf_profile || 'smoke')), 'load') && '"load"' || '',
            (contains(fromJSON(inputs.perf_profiles != '' && inputs.perf_profiles || format('["{0}"]', inputs.perf_profile || 'smoke')), 'load') && contains(fromJSON(inputs.perf_profiles != '' && inputs.perf_profiles || format('["{0}"]', inputs.perf_profile || 'smoke')), 'stress')) && ',' || '',
            contains(fromJSON(inputs.perf_profiles != '' && inputs.perf_profiles || format('["{0}"]', inputs.perf_profile || 'smoke')), 'stress') && '"stress"' || '')) }}
```

(Builds `["load"]`, `["stress"]`, or `["load","stress"]` directly, so smoke never enters the matrix and the array is only empty when the job `if:` already skipped it.) Re-run actionlint, commit as `ci(helix): build load/stress matrix by inclusion (empty-matrix contingency)`, push, and repeat shakedowns #1 and #2 from their Step 1 (re-record run ids).

---

### Task 7: Shakedown #3 — load-only request (exclude matches nothing; smoke skips)

**Files:** none (live verification)

**Interfaces:**
- Consumes: completed Task 6 run.
- Produces: proof that `exclude` matching zero combinations of a dynamic matrix is not an error, and that the smoke job's `contains()` gate skips it when smoke was not requested. Closes the plan.

- [ ] **Step 1: Dispatch and wait**

```powershell
gh workflow run ahm-execution-helix.yml --ref main -f platform=gatling -f architecture_type=standard -f perf_profiles='["load"]' -f perf_users=5 -f perf_duration=60
Start-Sleep -Seconds 15
$RUN = gh run list --workflow=ahm-execution-helix.yml --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $RUN --exit-status
```

Expected: exit 0. A workflow-level failure BEFORE jobs start (run shows startup_failure / no jobs) would mean `exclude` with zero matches errors on dynamic matrices — in that case apply Task 6 Step 3's contingency (which removes `exclude:` entirely) and re-run all three shakedowns.

- [ ] **Step 2: Assert**

```powershell
gh run view $RUN --json jobs --jq '.jobs[] | "\(.name) | \(.conclusion)"'
```

Assert: `Perf — Gatling smoke` → `skipped`; `Perf — Gatling load` → `success`; fence → `success`.

- [ ] **Step 3: Report final state**

Summarize for the session log: three shakedown run URLs, which (if any) contingency was applied, and the reminder that spec §7.4 (first `platform=all` run confirming the fence timeline under real load) happens with the NEXT full dispatch — it is multi-hour and deliberately not part of this plan.
