# Campaign A — Post-Run Provenance Adjudication

**Date:** 2026-09-03
**Status:** RESOLVED. This is a separate, dated record — it does not edit `docs/research/2026-09-02-campaign-a-frozen-definitions.md`, whose §1-§5/§8-§13 remain frozen and unchanged.
**Scope:** an issue discovered during the mandated post-run raw-data-integrity/attribution/provenance/completeness validation of the completed 60-dispatch Campaign A, and the author's ruling on it.

## 1. The issue

Campaign A ran as 60 sequential dispatches spanning **2026-09-03T05:04:39Z to 2026-09-03T14:43:13Z** (~9.65 hours). Each dispatch's `ci/steps/record-app-provenance.sh` probes the live OmniPizza backend at `${API_BASE_URL}/api/version` (`curl -fsS --max-time 15`) to record the deployed backend's `git_commit` in that dispatch's run-manifest, falling back to `${API_BASE_URL}/api/debug/info` (no `git_commit` field) if the primary probe fails, and leaving the field null if both fail.

**13 of 60 dispatches did not get a direct backend-commit read:**
- 10 — both probes failed/timed out (`timeout_error`).
- 3 — the primary probe failed but the fallback responded (`fallback_without_commit` — confirms the backend was reachable and serving *something*, but that response carries no commit identity).

The remaining 47 dispatches read the primary probe successfully and recorded `git_commit=9ca37674d374e9303912e259641ee86baf3aabe1` (matching the frozen `v1.1.8` release) every single time — no other commit value was ever observed, in any of the 60 dispatches, at any point in the 9.65-hour window.

## 2. Evidence considered before ruling

- **Frontend static provenance (`dist/version.json`) succeeded 100% of the time (60/60)** and shows `9ca3767` with zero variance. A static build artifact doesn't have the same live-network-call failure mode as the backend probe, so this is a strong independent signal that the deployed frontend build never changed.
- **Every "verified" backend read brackets every anomaly cluster.** The anomalies are not concentrated at one edge of the timeline (e.g., only at the very end, which might suggest a late redeploy) — they're scattered across roughly 4 separate windows (~06:00-07:51, ~09:23-09:56, ~10:27-11:44, ~13:03-13:19), and the dispatch immediately before and immediately after every cluster reads `9ca3767` cleanly. A genuine mid-campaign redeploy would be expected to produce a *new* commit value in some later "verified" read; none ever appeared.
- **The backend `version` string (`"1.0.0"`) never changed**, in any of the 60 reads (verified or fallback-shaped).
- **Zero variance in the actual experimental data.** All 10 repeats in every one of the 6 (arm × position) cells produced byte-identical M1 and MOL values (§3 of the frozen doc's own no-flake baseline — 0% observed web flake rate — predicts exactly this). A real mid-campaign SUT change would plausibly perturb *some* later repeat's behavior; none was observed.
- **External corroboration attempted, not obtained.** Tried to check Render's public status page for an incident during this window; this session's local network path (corporate proxy) returned a schema stub instead of real data for that request, so this could not be used as evidence either way — disclosed rather than silently omitted.
- **Root cause, as far as it can be established:** the probe's own 15-second `curl --max-time` under ~9.65 hours of sustained real traffic to a live Render-hosted service, not a signal about the deployed commit itself. This is a reliability property of the provenance *instrumentation*, not of the *system under test*.

## 3. Author's ruling (verbatim intent, 2026-09-03)

- **All 60 Campaign A dispatches are experimentally valid.** The 13 incomplete-provenance dispatches are NOT backfilled.
- **The frozen invalid-run policy (§13) is not amended retroactively.** It defines a *confirmed* SUT-version mismatch as an invalidating condition. "Provenance read unavailable" is a distinct condition — introducing it as a new exclusion criterion *after* observing the campaign would be a post-hoc policy change, which is exactly what §13 exists to prevent. It is explicitly not approved.
- **Backend provenance is classified separately from experimental validity**, with exactly these categories and this campaign's counts:

| Category | Count | Meaning |
|---|---|---|
| `verified` | 47/60 | Primary probe succeeded; `git_commit=9ca3767...` read directly. |
| `fallback_without_commit` | 3/60 | Primary probe failed; fallback endpoint responded but carries no commit identity. |
| `timeout_error` | 10/60 | Both probes failed/timed out; no backend response recorded at all. |
| `mismatch` | 0/60 | A backend commit was read and it did NOT match the frozen `9ca3767`. |

- **Reporting constraint:** do not claim all 60 backend commits were directly verified. The accurate statement is: *no evidence of backend version drift was observed, and direct backend build provenance was available for 47/60 dispatches.*

## 4. Provenance-complete sensitivity analysis (N=47)

Reproducible via `pnpm experiments:campaign-a-provenance-check` (`scripts/experiments/campaign-a-provenance-check.ts`) — reads the raw campaign manifest and merged run-manifests directly, not a one-off calculation. Requires `campaign-a-analysis.ts` to have already been run (its output, `reports/campaign-a-analysis.json`, supplies the per-dispatch M1/MOL values this script filters).

Per-cell breakdown of the 47 `verified` dispatches (out of 10 per cell):

| Arm | Position | N total | verified | fallback_without_commit | timeout_error | mismatch |
|---|---|---|---|---|---|---|
| atomic | EARLY | 10 | 7 | 1 | 2 | 0 |
| atomic | MIDDLE | 10 | 9 | 0 | 1 | 0 |
| atomic | LATE | 10 | 8 | 0 | 2 | 0 |
| twin | EARLY | 10 | 7 | 1 | 2 | 0 |
| twin | MIDDLE | 10 | 8 | 0 | 2 | 0 |
| twin | LATE | 10 | 8 | 1 | 1 | 0 |

No cell drops below 7/10 verified.

**M1/MOL recomputed on the N=47 verified-only subset, compared against the full N=60:**

| Arm | Position | M1 (N=60) | M1 (N=47) | MOL (N=60) | MOL (N=47) | Match? |
|---|---|---|---|---|---|---|
| atomic | EARLY | 0.2500 | 0.2500 | 0 | 0 | Identical |
| atomic | MIDDLE | 0.2857 | 0.2857 | 0.25 | 0.25 | Identical |
| atomic | LATE | 0.0000 | 0.0000 | 0.25 | 0.25 | Identical |
| twin | EARLY | 0.8667 | 0.8667 | 1 | 1 | Identical |
| twin | MIDDLE | 0.4000 | 0.4000 | 0.5 | 0.5 | Identical |
| twin | LATE | 0.0000 | 0.0000 | 0.25 | 0.25 | Identical |

**Every cell's provenance-complete subset reproduces the full-N=60 value exactly.** This isn't a coincidence of rounding — within each cell, ALL 10 repeats (verified and non-verified alike) already produced byte-identical M1/MOL values (§4 of this document), so restricting to the 7-9 verified repeats per cell cannot change a median computed over a set with zero internal variance. The sensitivity analysis confirms, rather than merely asserts, that the 13 incomplete-provenance dispatches carry no detectable different signal from the 47 verified ones.

## 5. Conclusion

The Campaign A dataset (N=60) is used as-is for analysis. The provenance gap is disclosed as an instrumentation limitation of this campaign, not as a data-validity defect: no evidence of SUT drift was found across multiple independent signals (frontend, bracketing backend reads, version string, and the experimental data's own internal consistency), and the sensitivity analysis restricted to provenance-complete dispatches reproduces the full dataset's results exactly, in every cell.

## 6. Campaign B — instrumentation improvement (not applied retroactively to Campaign A)

For Campaign B only, `record-app-provenance.sh` (or its successor) should record a structured provenance status distinguishing at minimum: `verified`, `fallback_without_commit`, `timeout_error`, and `mismatch` — the same four categories used in the adjudication above — with a small number of retries on the primary probe before falling back, to reduce (not necessarily eliminate) the `timeout_error`/`fallback_without_commit` rate observed here. This is a forward-looking instrumentation change scoped to Campaign B's own dispatches; it must not be backported to reinterpret Campaign A's already-collected manifests, and Campaign A's raw data and this adjudication stand as the record of what was actually observed.
