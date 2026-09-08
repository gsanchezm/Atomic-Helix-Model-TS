# Campaign B raw-data archive — manifest pointer

This file is the committed fingerprint of Campaign B's immutable raw-data snapshot. The snapshot itself is not
committed (it lives under the gitignored `archives/` directory, same convention as
`archives/atomic-testing-dataset-v1*` for Campaign A) — this pointer exists so the archive's identity and integrity
are verifiable from git history without the raw data itself needing to be in the repo.

- **Local path:** `archives/campaign-b-raw-2026-09-05/`
- **Off-machine copy:** GitHub Release [`campaign-b-raw-2026-09-05`](https://github.com/gsanchezm/Atomic-Helix-Model-TS/releases/tag/campaign-b-raw-2026-09-05), target commit `fdaf56a77914adea96161775423bd22e6619be49` (the integrity-report commit). Assets: `campaign-b-raw-2026-09-05.tar.gz` (442,790 bytes, sha256 `15b89cce66915a65de50ffb95af56d97d7fded2a19275d28c97279fa56489390`), its `.sha256` sidecar, and `SHA256SUMS.txt`.
- **Snapshot taken:** 2026-09-06, after Campaign B's 80th dispatch completed (2026-09-05T13:35:07Z) and after
  `aggregate-campaign-artifacts.ts --instrument campaign-b --workflow experiment` merged all 80 real GH Actions
  artifacts — before any statistical interpretation, per the standing "immutable raw-data snapshot before final
  statistical interpretation" requirement.
- **Contents:** 166 files — 80 `cucumber-jsonl/*.jsonl` (raw per-scenario telemetry, one file per dispatch),
  80 `run-manifest/*.json` (per-dispatch provenance/config manifests), the campaign dispatch manifest
  (`campaign-campaign-b-manifest.json`), the artifact-aggregation manifest (`aggregated-campaign-b.json`), a
  derived 80-row run-level table (`campaign-b-run-level-table.json`), a derived 40-row pair-level table
  (`campaign-b-pair-level-table.csv`), a derived provenance-status detail table (`campaign-b-provenance-detail.json`),
  and `SHA256SUMS.txt` (per-file SHA-256 for all 165 other files).
- **GH Actions run id range covered:** `33800018553`–`33967701778` (80 distinct run ids, verified 0 duplicates —
  see `docs/research/2026-09-06-campaign-b-integrity-report.md` §B).
- **Date range covered:** 2026-09-03T20:03:13Z – 2026-09-05T13:35:07Z (~41.5h; corrected 2026-09-07 from an
  earlier version that cited the last dispatch's start time instead of its completion time).
- **`SHA256SUMS.txt` self-hash (SHA-256):** `6af02f8578ee09eda4bbe2017f6d0912f4201e7d814288cdcc44a1e919161b5c`

Anyone with a copy of `archives/campaign-b-raw-2026-09-05/` can verify it against this pointer: recompute
`shasum -a 256 SHA256SUMS.txt` and compare against the self-hash above; per-file hashes inside `SHA256SUMS.txt`
verify the 165 data files against each other. This is the raw record referenced by the integrity report — it has
not been and must not be modified.
