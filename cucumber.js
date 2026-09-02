const configuredParallelism = Number.parseInt(process.env.CUCUMBER_PARALLEL || '1', 10);
process.env.TOM_RUN_ID ||= `local-${Date.now()}-${process.pid}`;

module.exports = {
  default: {
    paths: ["src/core/tests/**/*.feature"],

    requireModule: ["tsconfig-paths/register", "ts-node/register", "dotenv/config"],
    require: [
      "src/core/tests/support/**/*.ts",
      "src/core/tests/**/step_definitions/**/*.ts",
    ],

    format: ["progress"],

    timeout: 300000,
    parallel: Number.isFinite(configuredParallelism) && configuredParallelism > 0
      ? configuredParallelism
      : 1,

    // Render free-tier hosting (BASE_URL / API_BASE_URL on onrender.com) can
    // re-sleep a dyno mid-run or answer the first navigation slowly enough to
    // blow a step's element-wait budget — a transient flake that warm-up.ts
    // mitigates but cannot fully eliminate (it is best-effort/non-fatal by
    // design). A single bounded retry self-heals that residual blip without
    // masking deterministic failures: a real break still fails twice. Cucumber
    // marks retried-then-passed scenarios as flaky in the report, so the signal
    // is preserved rather than hidden.
    retry: 1,
  },

  // RESEARCH PROFILE — the atomic arm of the atomic-testing experiment
  // workflow (.github/workflows/atomic-testing-experiment.yml). Identical to
  // `default` except `retry: 0`, closing the retry asymmetry the 2026-09-02
  // hardening audit flagged (finding (b)): the determinism campaign ran the
  // atomic arm at retry:1 against the horizontal-E2E baseline's retry:0, so
  // an atomic attempt-1 flake healed by the retry never reached
  // scenario_outcome_history.csv. Research dispatches must measure attempt-1
  // behavior symmetrically in both arms. Ordinary CI stays on `default` —
  // the single bounded retry there is a deliberate cold-start mitigation,
  // not part of any measured claim.
  research: {
    paths: ["src/core/tests/**/*.feature"],

    requireModule: ["tsconfig-paths/register", "ts-node/register", "dotenv/config"],
    require: [
      "src/core/tests/support/**/*.ts",
      "src/core/tests/**/step_definitions/**/*.ts",
    ],

    format: ["progress"],

    timeout: 300000,
    parallel: Number.isFinite(configuredParallelism) && configuredParallelism > 0
      ? configuredParallelism
      : 1,

    retry: 0,
  },

  // EVALUATION ARTIFACT — the Horizontal E2E baseline (legacy internal name
  // "non-atomic twin" kept for manifest/data compatibility). See
  // evaluation/non-atomic-twin/README.md and
  // docs/paper/atomic-testing-formal-definition.md §3.2 (evaluation design;
  // formerly §8.3 before the paper was renumbered). Scoped to a
  // directory OUTSIDE src/core/tests/ so the `default` profile's glob can
  // never pick it up. Parity with `default` on requireModule/timeout/the
  // support/** require path; the two deliberate differences are `paths`
  // (points only at the twin) and `retry: 0` — a retry would silently
  // re-run the entire journey and mask the determinism signal §4.3 measures
  // (formerly §8.4).
  nonAtomicTwin: {
    paths: ["evaluation/non-atomic-twin/**/*.feature"],

    requireModule: ["tsconfig-paths/register", "ts-node/register", "dotenv/config"],
    require: [
      "src/core/tests/support/**/*.ts",
      "evaluation/non-atomic-twin/**/step_definitions/**/*.ts",
    ],

    format: ["progress"],

    timeout: 300000,
    parallel: Number.isFinite(configuredParallelism) && configuredParallelism > 0
      ? configuredParallelism
      : 1,

    retry: 0,
  },
};
