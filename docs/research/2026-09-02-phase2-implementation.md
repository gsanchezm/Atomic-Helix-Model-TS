# Research Hardening — Phase 2 Implementation Report

**Date:** 2026-09-02
**Status:** Phase 2 implemented and smoke-validated. **No scientific campaign launched.** Campaign A awaits approval of the metric formulas (separate proposal doc); the experimental freeze (branch + tag) is deliberately deferred until a campaign is about to launch.
**Responds to:** the author's Phase-1 approval with decisions (a)–(f) and additional rulings (legacy naming compatibility, iOS as verification gap, locator-class faults only, `@a11y-only`, stale-§ fixes).
**Commits:** `db4fe71` (archive + retry analysis), `07b62ab` (experiment workflow + instrumentation), `c423863` (docs + stale refs) on `main`; OmniPizza `9ca3767` (version endpoint, deployed).

---

## (a) Dataset archived — DONE, off-machine

GitHub release **`atomic-testing-dataset-v1`** (tag on `f9938ef`, the commit the paper draft was written against): 1,119 files / 67 MB, per-file SHA-256 in `MANIFEST.json` + `SHA256SUMS.txt`, tarball sha256 `098f644b…`. Contents: `metrics/raw/{cucumber-jsonl,proxy-jsonl,run-manifest}`, full `metrics/processed/`, schemas, all campaign dispatch ledgers, the four experiment report JSONs, **and the complete GH Actions log zips of all 197 campaign runs** — captured before the ~late-November retention expiry, and load-bearing (see (b)). Local staging stays in `archives/` (gitignored — raw data out of main history, as decided). Zenodo deposit for a DOI remains a later, author-driven step.

## (b) Retry-sensitivity re-analysis — DONE; campaign retained, no rerun

Full analysis in `docs/research/2026-09-02-retry-sensitivity-analysis.md`. Key points:

- Reconstruction is **exact**, not approximated: cucumber's JSON formatter drops retried attempt-1 records outright, but the archived job logs list every "(attempt 1, retried)" scenario.
- 14/30 atomic-Android determinism dispatches had an attempt-1 failure of **one** scenario (*Selecting toppings … Margherita in MX*; element-wait on `text-estimated-total-value` — the same locator-resolution failure family as the baseline's divergence). 8 were retry-healed (invisible in the published data), 6 failed twice (already counted). Zero retried attempts in atomic-web and in both retry-0 baseline legs.
- Android twin/atomic pass→fail ratio: **29.6× final-status** (reproduces the paper's 0.176 % / 5.215 % exactly) vs **21.1× retry-adjusted** (atomic 0.248 %). Direction and substantive conclusion stable → per the approved decision rule the existing campaign stands; both numbers and the asymmetry go into Threats to Validity at rewrite time.

## (c) Campaign A metrics — PROPOSED, awaiting approval

`docs/research/2026-09-02-campaign-a-metrics-proposal.md`: Metric 1 (within-failed-scenario skipped-step fraction, dispatch-level step-weighted) and Metric 2 (**matched semantic-oracle loss** over the 4 oracles shared 1:1 between the journey and its atomic owners), positions EARLY `loginButton` / MIDDLE `confirmAddToCartButton` / LATE `placeOrderButton`, class `LOCATOR_RESOLUTION_FAILURE` on `CLICK` (never ASSERTION_FAILURE), proposed N=10/cell. Nothing dispatches until approved.

## (d)/(e)/(f) Experiment infrastructure — DONE

- **`.github/workflows/atomic-testing-experiment.yml`** — `test_strategy` (atomic | **horizontal-e2e**) × `platform` (web | android | ios), one single job per dispatch, retry 0 in both arms (new cucumber `research` profile; the baseline keeps `nonAtomicTwin`), `CUCUMBER_PARALLEL` default 1, no stagger, own concurrency group, **required** `omnipizza_release_tag` used verbatim (the resolver only validates the tag), fault knobs incl. the new `tom_inject_fault_target`.
- **Matched slice** — `evaluation_slice=matched` selects `@matched-horizontal-e2e`: the 7 US-market Examples rows whose source behaviors the journey concatenates (login-localization S1, catalog-render S2, open-builder S3, size S4, toppings S5, confirm-add S6, credit-card checkout S7). Examples-block tags are additive; every pre-existing filter sees identical rows. Journey step 11 (*proceed to checkout with the built cart*) remains the one disclosed twin-only glue step with no atomic owner. Counts verified by dry-run: 7 (web) / 6 (android, ios — S1 is desktop-only).
- **`@a11y-only`** on the checkout accessibility-only scenario; research expressions exclude `@security`/`@security-infra`/`@a11y-only` and deliberately keep the piggyback `@visual`/`@a11y` tags (they no-op with plugins off). Full atomic web slice: 96 scenarios.
- **Fault positioning** — `TOM_INJECT_FAULT_TARGET` narrows the injected fault to one logical key (`src/kernel/fault-injection.ts`, chaos-proxy passes the raw pre-resolution target); 6 new unit tests, suite 39/39 green.
- **Provenance (record-only, per decision (f))** — every run now produces an `experiment-manifest.json` (and matching run-manifest fields) carrying: the **resolved commit SHA** (decision (e)), the pinned release tag, the SHA-256 of the downloaded APK/simulator zip, and the live backend/frontend build identity. OmniPizza side (commit `9ca3767`, deployed): new dependency-free `GET /api/version` returns `git_commit` from Render's `RENDER_GIT_COMMIT`; the frontend build now emits `dist/version.json`. Both verified live in production returning `9ca3767`.
- **Orchestrator** — `run-campaign.ts --workflow experiment` dispatches the new workflow, **interleaves pairs by run_index** (atomic-001, horizontal-001, atomic-002, …), requires `--omnipizza-release-tag`, records `resolvedSha` in the campaign manifest (schema 1.2.0) and refuses to resume across a moved ref. Legacy mode is byte-for-byte unchanged (verified by dry-runs).

## Phase 3 smoke validation — all 6 strategy×platform combinations GREEN

| # | Dispatch | Run | Result |
|---|---|---|---|
| 1 | atomic / web (matched) | 33691229416 | ✅ 7/7 scenarios |
| 2 | horizontal-e2e / web | 33691719476 | ✅ 16/16 instances |
| 3 | atomic / android (matched) | 33691968941 | ✅ 6/6 scenarios |
| 4 | horizontal-e2e / android | 33692562468 | ✅ 16/16 instances |
| 5 | atomic / ios (matched) | 33695331381 | ✅ 6/6 scenarios |
| 6 | **horizontal-e2e / ios** (the never-executed verification gap, audit Q3) | 33696552483 | ✅ 16/16 instances |

Smoke 6 confirms the audit's classification: the journey ran green on iOS **with zero twin-specific iOS code added** — it was a verification gap, not an implementation gap. Manifest spot-checks (smokes 1 and 3) confirm the full provenance chain: resolved SHA `c423863`, tag `v1.1.8`, APK sha256 recorded, backend/frontend both reporting build `9ca3767`.

## Known follow-ups (not blockers for approval, blockers for execution)

1. ~~**Author approval** of the Campaign A formulas + N (proposal doc §4).~~ **DONE 2026-09-02** — approved with refinements; see `docs/research/2026-09-02-campaign-a-frozen-definitions.md` (the binding document, supersedes the proposal).
2. **Freeze** — create `atomic-testing-experiment-v2` branch + annotated tag immediately before the first campaign; the orchestrator already records the resolved SHA per decision (e). **NOT STARTED** — deliberately, pending item 3.
3. **Render deploy freeze** — manual, while campaigns are active (autoDeploy is on; a mid-campaign OmniPizza push would change the app under test — the provenance fields would *detect* it, but the freeze *prevents* it). **Author's own action, still outstanding.**
4. ~~`aggregate-campaign-artifacts.ts` still speaks the legacy artifact-name layer; wire `experimentArtifactNamesFor` before aggregating an experiment-mode campaign.~~ **DONE 2026-09-02** — wired (`--workflow experiment`, shared `lib/artifact-merge.ts`) and validated against all 6 real smoke artifacts, including the previously-unvalidated analysis-layer `tool_name` resolution (`horizontal-e2e-*` values) — see `scripts/experiments/validate-experiment-ingestion.ts` and the frozen-definitions doc §9.
5. Campaign B (paired determinism under the symmetric workflow) needs its own dispatch plan once Campaign A's design is settled. Still open — explicitly gated on Campaign A completing cleanly (author ruling 2026-09-02: no Campaign B if Campaign A exposes a new instrumentation defect).
6. **Campaign A dispatch itself** — `buildCampaignAItems()` / `--instrument campaign-a --workflow experiment` is implemented, dry-run verified (60 items, pre-declared balanced order confirmed empirically), but **not dispatched**. Blocked on items 2 and 3 above, both of which require the author's go-ahead, not further implementation.
