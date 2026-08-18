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

  // EVALUATION ARTIFACT — see evaluation/non-atomic-twin/README.md and
  // docs/paper/atomic-testing-formal-definition.md §8.3. Scoped to a
  // directory OUTSIDE src/core/tests/ so the `default` profile's glob can
  // never pick it up. Parity with `default` on requireModule/timeout/the
  // support/** require path; the two deliberate differences are `paths`
  // (points only at the twin) and `retry: 0` — a retry would silently
  // re-run the entire journey and mask the determinism signal §8.4 measures.
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
