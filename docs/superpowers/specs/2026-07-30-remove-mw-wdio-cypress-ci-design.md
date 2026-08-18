# Remove Mobilewright, WebdriverIO and Cypress from the CI workflow and execution

**Date:** 2026-07-30
**Scope:** delete the `e2e-mobilewright`, `e2e-webdriverio` and `e2e-cypress` jobs (and their gates) from `.github/workflows/ahm-execution-helix.yml`, clean every collateral reference, cancel the in-flight `platform=all` run and re-dispatch it clean. Plugin code, `ci/pipeline.config.json`, the local orchestrator and the other CI configs are untouched — the tools remain usable locally; this only removes them from GitHub Actions execution.

## 1. Motivation

In the first-ever `platform=all` run (30543044140) all three categories failed across the board (mobilewright android/ios reads+writes, webdriverio reads+writes, cypress). The user chose to remove them from CI rather than burn multi-hour runs on categories that aren't expected to pass there, keeping CI signal focused on the categories that matter now.

## 2. Changes (all in `.github/workflows/ahm-execution-helix.yml`)

1. **Delete jobs:** `e2e-mobilewright` (incl. its long DeviceLoader header comment), `e2e-webdriverio`, `e2e-cypress` — each including the `# Backend-traffic job — member of perf-fence's needs: list` pointer comment above it.
2. **Delete gates:** `gate-mobilewright`, `gate-cypress`, `gate-webdriverio`.
3. **`platform` input:** remove the `mobilewright`, `cypress`, `webdriverio` options from the choice list.
4. **`resolve-omnipizza-release`:** remove the `|| inputs.platform == 'mobilewright'` clause from its `if:` and the mobilewright mention from its header comment (the job still serves android/ios/mobile/appium/security dispatches).
5. **`perf-fence`:** `needs:` drops the three jobs — 13 → 10 members (`api-smoke`, `e2e-web`, `e2e-web-responsive`, `visual-web`, `visual-web-responsive`, `a11y-web`, `e2e-android`, `e2e-ios`, `security-zap`, `perf-gatling-smoke`). Header comment unchanged in criterion, exclusion list unchanged.
6. **`consolidate` header comment:** prune the mentions of the three deleted jobs from its "absent from the needs: list" paragraph (they are now absent from the workflow, not merely from the list).
7. **Cross-doc sync:** one amendment line in `docs/superpowers/specs/2026-07-29-gatling-ci-perf-isolation-design.md` §4 (fence membership row) pointing here, so its member count doesn't silently lie.

## 3. Execution

- Cancel in-flight run 30543044140 (`gh run cancel`) — its completed portion is mostly the failures of the three removed categories plus web reads-leg failures that a re-run reproduces; the writes/visual/perf tail had not started. Cancelling does NOT trigger the perf legs (fence and perf jobs use `!cancelled()` by design).
- Push the removal to `main` (repo's no-PR direct-push flow).
- Re-dispatch the documented `platform=all` command (unchanged apart from the vanished tools). This run doubles as spec §7.4's fence-timeline confirmation, now with less noise and shorter wall-clock.

## 4. Non-goals

- No changes to plugin source, `docker-compose.yml` profiles, `package.json` scripts, `ci/pipeline.config.json`, `scripts/orchestrate-full-run.sh`, GitLab/Jenkins/Azure/AWS configs, or the dashboard (its cards derive from ingested run data, not from this workflow).
- No re-numbering or restructuring of the surviving jobs beyond the reference cleanup above.

## 5. Verification

1. actionlint (Docker `rhysd/actionlint`) — zero NEW findings vs the current baseline of 15; the count may DROP since several pre-existing findings live inside the deleted jobs. Grep asserts: zero case-insensitive matches for `mobilewright|webdriverio|cypress` in the workflow after the edit.
2. The re-dispatched `platform=all` run: gates for the three tools gone from the job list, fence waits on 10 members, everything else schedules as before.
