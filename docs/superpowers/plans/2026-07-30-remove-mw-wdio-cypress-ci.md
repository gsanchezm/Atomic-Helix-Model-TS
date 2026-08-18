# Remove Mobilewright/WebdriverIO/Cypress from CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the `e2e-mobilewright`, `e2e-webdriverio`, `e2e-cypress` jobs and their gates from `.github/workflows/ahm-execution-helix.yml`, clean all collateral references, then cancel the in-flight `platform=all` run and re-dispatch it clean.

**Architecture:** One surgical-edit task on the workflow (small verbatim Edits for gates/references + a line-range splice script for the three large job bodies, since 100-300-line blocks can't be Edit old_strings) plus a one-line amendment in the perf-isolation spec; then one live-execution task (cancel → push → re-dispatch → startup assertions). Spec: `docs/superpowers/specs/2026-07-30-remove-mw-wdio-cypress-ci-design.md`.

**Tech Stack:** GitHub Actions YAML; Git Bash (`grep -nF` + `sed -i` splice — preserves LF line endings, unlike PowerShell `Set-Content`); actionlint via Docker `rhysd/actionlint`; `gh` CLI.

## Global Constraints

- Files touched: `.github/workflows/ahm-execution-helix.yml` + ONE amendment line in `docs/superpowers/specs/2026-07-29-gatling-ci-perf-isolation-design.md`. Nothing else (spec §4 Non-goals: no plugin source, docker-compose, package.json, pipeline.config.json, orchestrator, other CI configs, dashboard).
- After Task 1, `Select-String -Path .github/workflows/ahm-execution-helix.yml -Pattern "mobilewright|webdriverio|cypress"` (case-insensitive by default) must return ZERO matches.
- Fence `needs:` ends with exactly 10 members: `api-smoke`, `e2e-web`, `e2e-web-responsive`, `visual-web`, `visual-web-responsive`, `a11y-web`, `e2e-android`, `e2e-ios`, `security-zap`, `perf-gatling-smoke`.
- actionlint: zero NEW findings vs the current baseline of 15; the count may DROP (several pre-existing findings live inside the deleted jobs) — a drop is fine, an addition is not.
- Commits directly on `main`, style `ci(helix): ...` / `docs(specs): ...`. Do NOT push until Task 2 says so.
- Line numbers below were measured at commit `6c0c5fb` — re-locate by anchor strings, never by number.

---

### Task 1: Workflow removal + collateral references + spec amendment

**Files:**
- Modify: `.github/workflows/ahm-execution-helix.yml` (options line ~32; gates ~193-201 and ~226-244; resolve comment ~253-262 and `if` ~276; three job blocks ~1474-1769, ~2283-2469; fence needs ~2158-2161; consolidate comment ~2480-2485)
- Modify: `docs/superpowers/specs/2026-07-29-gatling-ci-perf-isolation-design.md` (§4 fence-membership row)

**Interfaces:**
- Consumes: current workflow state at `6c0c5fb`.
- Produces: a workflow whose job set Task 2's assertions rely on — 8 gates (`gate-api`, `gate-web-desktop`, `gate-web-responsive`, `gate-android`, `gate-ios`, `gate-gatling`, `gate-security`, `gate-a11y`), no job name containing Mobilewright/WebdriverIO/Cypress.

- [ ] **Step 1: Capture the actionlint baseline**

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/ahm-execution-helix.yml 2>&1 | Tee-Object -FilePath "$env:TEMP\actionlint-baseline-removal.txt"
```

Expected: 15 findings (current baseline). Save for the Step 8 diff.

- [ ] **Step 2: Delete the three large job blocks with the splice script (Git Bash)**

Each deletion runs from the `# ---` separator line ABOVE the start anchor through the line TWO above the end anchor (keeping the end anchor's own separator). Run exactly this:

```bash
f=.github/workflows/ahm-execution-helix.yml
del() {
  s=$(grep -nF "$1" "$f" | head -1 | cut -d: -f1)
  e=$(grep -nF "$2" "$f" | head -1 | cut -d: -f1)
  { [ -n "$s" ] && [ -n "$e" ] && [ "$e" -gt "$s" ]; } || { echo "ANCHOR FAIL: '$1'($s) / '$2'($e)"; exit 1; }
  sed -i "$((s-1)),$((e-2))d" "$f"
  echo "deleted lines $((s-1))..$((e-2)) for block starting '$1'"
}
del '# Job: Mobilewright E2E (Android + iOS)' '# Job: Security — ZAP'
del '# Job: WebdriverIO E2E (alternate web engine' '# Job: Cypress E2E'
del '# Job: Cypress E2E' '# Job 7: Consolidate'
```

Each anchor occurs exactly once at `6c0c5fb` (verify with `grep -c` if in doubt BEFORE running). If any `ANCHOR FAIL` prints, STOP — do not improvise ranges. Note each deleted block includes the `# Backend-traffic job — member of perf-fence's needs: list` pointer comment that sits between the header comment and the job key.

- [ ] **Step 3: Delete the three gates (verbatim Edits)**

Edit 1 — replace with empty string (note the trailing blank line):

```yaml
  gate-mobilewright:
    name: Gate — Mobilewright
    runs-on: ubuntu-latest
    if: >-
      github.event_name != 'workflow_dispatch'
      || inputs.platform == 'all'
      || inputs.platform == 'mobilewright'
    steps:
      - run: echo "Mobilewright selected"

```

Edit 2 — gate-cypress and gate-webdriverio are contiguous; replace both with empty string (trailing blank line included):

```yaml
  gate-cypress:
    name: Gate — Cypress
    runs-on: ubuntu-latest
    if: >-
      github.event_name != 'workflow_dispatch'
      || inputs.platform == 'all'
      || inputs.platform == 'cypress'
    steps:
      - run: echo "Cypress selected"

  gate-webdriverio:
    name: Gate — WebdriverIO
    runs-on: ubuntu-latest
    if: >-
      github.event_name != 'workflow_dispatch'
      || inputs.platform == 'all'
      || inputs.platform == 'webdriverio'
    steps:
      - run: echo "WebdriverIO selected"

```

- [ ] **Step 4: Clean the `platform` input options**

Replace:

```yaml
        options: [all, api, web, playwright, playwright-desktop, playwright-responsive, pixelmatch, pixelmatch-desktop, pixelmatch-responsive, mobile, android, ios, appium, appium-android, appium-ios, perf, gatling, mobilewright, security, a11y, cypress, webdriverio]
```

with:

```yaml
        options: [all, api, web, playwright, playwright-desktop, playwright-responsive, pixelmatch, pixelmatch-desktop, pixelmatch-responsive, mobile, android, ios, appium, appium-android, appium-ios, perf, gatling, security, a11y]
```

- [ ] **Step 5: Clean `resolve-omnipizza-release` (comment + if)**

Edit A — replace:

```yaml
  # API call is skipped when only API/Web/Perf are dispatched. `mobilewright`
  # is included here too — e2e-mobilewright downloads the same OmniPizza
  # APK/simulator bundle as e2e-android/e2e-ios and consumes this job's
  # outputs the same way. `security` is included too — security-mobsf needs
```

with:

```yaml
  # API call is skipped when only API/Web/Perf are dispatched. `security` is
  # included too — security-mobsf needs
```

Edit B — replace:

```yaml
      || inputs.platform == 'appium-ios'
      || inputs.platform == 'mobilewright'
      || inputs.platform == 'security'
```

with:

```yaml
      || inputs.platform == 'appium-ios'
      || inputs.platform == 'security'
```

- [ ] **Step 6: Shrink the fence to 10 members**

Replace (inside `perf-fence`'s `needs:`):

```yaml
      - e2e-ios
      - e2e-mobilewright
      - security-zap
      - e2e-webdriverio
      - e2e-cypress
      - perf-gatling-smoke
```

with:

```yaml
      - e2e-ios
      - security-zap
      - perf-gatling-smoke
```

- [ ] **Step 7: Prune the consolidate header comment + amend the perf-isolation spec**

Edit A (workflow) — replace:

```yaml
  # NOT extended by this task: a11y-web, security-zap, security-mobsf,
  # e2e-mobilewright, e2e-webdriverio, e2e-cypress are absent from the
  # `needs:` list below, so their artifacts (and, for e2e-cypress, its
  # complete lack of a metrics/TOM upload — see that job's own header
  # comment) do not feed this consolidated run. Left as-is; out of this
  # task's scope to change.
```

with:

```yaml
  # NOT extended by this task: a11y-web, security-zap and security-mobsf are
  # absent from the `needs:` list below, so their artifacts do not feed this
  # consolidated run. Left as-is; out of this task's scope to change.
  # (e2e-mobilewright/webdriverio/cypress were removed from this workflow
  # entirely on 2026-07-30 — see
  # docs/superpowers/specs/2026-07-30-remove-mw-wdio-cypress-ci-design.md.)
```

Edit B (spec `docs/superpowers/specs/2026-07-29-gatling-ci-perf-isolation-design.md`, §4 fence-membership row) — replace:

```
User-selected at final review, 2026-07-30. |
```

with:

```
User-selected at final review, 2026-07-30. **2026-07-30 later change:** `e2e-mobilewright`, `e2e-webdriverio`, `e2e-cypress` were removed from the workflow entirely (fence now 10 members) — see `2026-07-30-remove-mw-wdio-cypress-ci-design.md`. |
```

- [ ] **Step 8: Verify (lint + structure)**

```powershell
docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:latest -color .github/workflows/ahm-execution-helix.yml
(Select-String -Path .github/workflows/ahm-execution-helix.yml -Pattern "mobilewright|webdriverio|cypress").Count
(Select-String -Path .github/workflows/ahm-execution-helix.yml -Pattern "^  gate-").Count
(Select-String -Path .github/workflows/ahm-execution-helix.yml -Pattern "^      - ").Count
```

Expected: actionlint has zero findings that were NOT in the Step 1 baseline (fewer total is expected — several baseline findings lived in the deleted jobs; actionlint also proves no dangling `needs:` target remains); tool-name match count = 0; `gate-` job count = 8. The fourth command is orientation only — additionally confirm visually that `perf-fence`'s needs list is exactly the 10 members from Global Constraints (`git diff` shows the 3 removed lines and nothing else in that block).

- [ ] **Step 9: Commit (both files, one commit)**

```powershell
git add .github/workflows/ahm-execution-helix.yml docs/superpowers/specs/2026-07-29-gatling-ci-perf-isolation-design.md
git commit -m @'
ci(helix): remove Mobilewright, WebdriverIO and Cypress from the workflow

Jobs, gates, platform options and every collateral reference (resolver
clause, fence membership 13->10, consolidate comment). Plugins remain
usable locally; this only removes them from GitHub Actions execution.
Spec: docs/superpowers/specs/2026-07-30-remove-mw-wdio-cypress-ci-design.md

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HTbQvKsCadJP3c9DmE551J
'@
```

---

### Task 2: Cancel in-flight run, push, re-dispatch, startup assertions

**Files:** none (live execution; spec §3)

**Interfaces:**
- Consumes: Task 1's commit on local `main`; the in-flight run id 30543044140; `gh` CLI (authenticated).
- Produces: the new `platform=all` run id (record it in the report — it doubles as the perf-isolation spec §7.4 confirmation run).

- [ ] **Step 1: Cancel the in-flight run and wait for it to settle**

```powershell
gh run cancel 30543044140
gh run view 30543044140 --json status,conclusion --jq '.status + "/" + (.conclusion // "-")'
```

Poll the second command (separate quick invocations, ~30 s apart) until status is `completed` (conclusion `cancelled`). Do NOT dispatch anything while it is still `in_progress` — although `cancel-in-progress: true` would cancel it anyway, the explicit cancel keeps causality obvious in the run history. Note: cancelled fence members do NOT trigger the perf legs (`!cancelled()` design) — expect the run to show perf-gatling/fence as cancelled or skipped, never started-after-cancel.

- [ ] **Step 2: Push (divergence check first)**

```powershell
git fetch origin
git status -sb   # expect "ahead 1" (or ahead N if spec/plan commits pending), NOT diverged; if diverged, STOP and report BLOCKED
git push origin main
```

- [ ] **Step 3: Re-dispatch the full run**

```powershell
gh workflow run ahm-execution-helix.yml --ref main -f platform=all -f architecture_type=standard -f perf_profiles='["smoke","load","stress"]' -f perf_users=20 -f perf_duration=120 -f android_api_level=33 -f cucumber_parallel=4
Start-Sleep -Seconds 20
$RUN = gh run list --workflow=ahm-execution-helix.yml --limit 1 --json databaseId --jq '.[0].databaseId'
$RUN   # print for the log
```

- [ ] **Step 4: Startup assertions (~90 s after dispatch; poll with separate quick commands, do not wait on background monitors)**

```powershell
gh run view $RUN --json jobs --jq '.jobs[] | .status + " | " + (.conclusion // "-") + " | " + .name'
```

Assert ALL of:
1. NO job whose name contains `Mobilewright`, `WebdriverIO` or `Cypress` (neither gates nor E2E jobs).
2. Exactly 8 `Gate — *` jobs, all `success`.
3. `Resolve — OmniPizza latest release` present (still triggered by `platform=all`).
4. `Perf — Gatling smoke` appears and reaches `in_progress`/`completed` within the first minutes (free-overlap intact).
5. The usual functional jobs (Playwright reads legs, API reads, A11y, ZAP, MobSF, Appium reads) are scheduling as before.

Do NOT wait for the run to finish (multi-hour). Record `$RUN` in the report as the §7.4 confirmation run.

- [ ] **Step 5: Report**

Report includes: cancel evidence (final status/conclusion of run 30543044140), push evidence, new run id + URL, the raw startup job table, each assertion PASS/FAIL.
