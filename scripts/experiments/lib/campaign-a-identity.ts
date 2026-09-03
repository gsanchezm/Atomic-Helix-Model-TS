// Campaign A — frozen semantic-identity tables (deterministic fault attribution + MOL oracle
// carriers). Companion to lib/campaign-matrix.ts's buildCampaignAItems() and to
// docs/research/2026-09-02-campaign-a-frozen-definitions.md, whose §5/§10 this file implements as
// data. Every (feature, scenario, step) triple below was verified empirically — NOT hand-counted —
// against real cucumber output on 2026-09-03:
//   - the 7 matched-slice scenario names + feature names via `cucumber-js --dry-run --tags
//     "(...) and @matched-horizontal-e2e" --format json`
//   - the journey's instance-1 scenario name via `cucumber-js --profile nonAtomicTwin --dry-run
//     --format json`
//   - the exact step text (incl. keyword) each injected fault lands on, and the exact recorded
//     `feature`/`scenario` strings, by grepping a REAL LOCATOR_RESOLUTION_FAILURE-on-CLICK
//     diagnosability dispatch's merged metrics/raw/cucumber-jsonl for the injected-fault marker
//     string and reading which scenario/step actually carried it (both arms) — this is what
//     confirmed the identifier shape (`feature` is the Feature: name, not the file uri; `scenario`
//     is the fully-rendered Outline instance name; `steps[].name` is `keyword + text` trimmed) has
//     to match cucumber-jsonl's real shape, not an invented one.
//
// This file does NOT change the wire protocol or the hot dispatch path (ptom.proto, client.ts,
// chaos-proxy.ts are untouched) — deterministic attribution is achieved by matching the ALREADY-
// RECORDED injected-fault error string (src/kernel/fault-injection.ts's FAULT_MESSAGES, exported
// for this exact purpose) to its carrying (feature, scenario, step) in the merged cucumber-jsonl,
// not by adding new instrumentation to the request path. See
// docs/research/2026-09-02-campaign-a-frozen-definitions.md §10 for why this was chosen over a
// proto-level scenario-context field (verified against real data before deciding, not assumed).

import { Arm, CampaignAPosition, CAMPAIGN_A_POSITIONS } from './campaign-matrix';

export interface SemanticCase {
  feature: string; // exact Feature: name (NOT the file uri — matches NormalizedScenario.feature)
  scenario: string; // exact fully-rendered scenario name (matches NormalizedScenario.scenario)
  step: string; // exact `keyword + text` (matches NormalizedScenario.steps[].name)
}

// The (feature, scenario, step) that SHOULD carry the injected fault for each (arm, position).
// This is the "requested intervention identity" against which the actually-recorded carrier is
// compared (docs/.../frozen-definitions.md §10's attribution_valid rule). Frozen — do not edit
// after the atomic-testing-experiment-v2 tag is created.
export const CAMPAIGN_A_EXPECTED_ATTRIBUTION: Record<Arm, Record<CampaignAPosition['key'], SemanticCase>> = {
  atomic: {
    EARLY: {
      feature: 'Market-driven language localization across login + post-login UI',
      scenario: 'Logout label is translated to English after market US',
      step: 'And they log in as "standard_user"',
    },
    MIDDLE: {
      feature: 'Customize a pizza in the builder across markets',
      scenario: 'Confirming add to cart closes the builder and increments the navbar cart count in US',
      step: 'When they confirm add to cart',
    },
    LATE: {
      feature: 'Place a delivery order across markets',
      scenario: 'Place a delivery order in US paying with credit card',
      // Fused click+oracle step (frozen-definitions.md §2) — this IS also o4's carrier below.
      step: 'Then the order is accepted',
    },
  },
  // The journey is one scenario (one pickle per Outline instance) — "instance 1" is always the
  // expected carrier for every position; only the STEP differs, since all three fault-target
  // clicks live in the same scenario.
  twin: {
    EARLY: {
      feature: 'Non-atomic horizontal journey — login through order confirmation',
      scenario: 'Concurrent journey instance 1 completes login through order confirmation via UI only',
      step: 'When they log in as "standard_user"',
    },
    MIDDLE: {
      feature: 'Non-atomic horizontal journey — login through order confirmation',
      scenario: 'Concurrent journey instance 1 completes login through order confirmation via UI only',
      step: 'When they confirm add to cart',
    },
    LATE: {
      feature: 'Non-atomic horizontal journey — login through order confirmation',
      scenario: 'Concurrent journey instance 1 completes login through order confirmation via UI only',
      step: 'Then the order is accepted',
    },
  },
};

export type OracleKey = 'o1' | 'o2' | 'o3' | 'o4';
export const ORACLE_KEYS: readonly OracleKey[] = ['o1', 'o2', 'o3', 'o4'];

// The 4 matched semantic oracles' carrier (feature, scenario, step) per arm — frozen-definitions.md
// §5. Identical step text in both arms (the whole point of "matched"); only the carrying
// scenario differs (4 separate atomic scenarios vs. one journey instance).
export const CAMPAIGN_A_ORACLE_CARRIERS: Record<Arm, Record<OracleKey, SemanticCase>> = {
  atomic: {
    o1: {
      feature: 'Browse the OmniPizza catalog across markets',
      scenario: 'Catalog renders in US/en',
      step: 'Then the catalog screen is fully displayed',
    },
    o2: {
      feature: 'Browse the OmniPizza catalog across markets',
      scenario: 'Opening a pizza card launches the builder in US',
      step: 'Then the pizza builder is displayed for "Pepperoni"',
    },
    o3: {
      feature: 'Customize a pizza in the builder across markets',
      scenario: 'Confirming add to cart closes the builder and increments the navbar cart count in US',
      step: 'Then the pizza builder is closed',
    },
    o4: {
      feature: 'Place a delivery order across markets',
      scenario: 'Place a delivery order in US paying with credit card',
      step: 'Then the order is accepted',
    },
  },
  twin: {
    o1: {
      feature: 'Non-atomic horizontal journey — login through order confirmation',
      scenario: 'Concurrent journey instance 1 completes login through order confirmation via UI only',
      step: 'Then the catalog screen is fully displayed',
    },
    o2: {
      feature: 'Non-atomic horizontal journey — login through order confirmation',
      scenario: 'Concurrent journey instance 1 completes login through order confirmation via UI only',
      step: 'Then the pizza builder is displayed for "Pepperoni"',
    },
    o3: {
      feature: 'Non-atomic horizontal journey — login through order confirmation',
      scenario: 'Concurrent journey instance 1 completes login through order confirmation via UI only',
      step: 'Then the pizza builder is closed',
    },
    o4: {
      feature: 'Non-atomic horizontal journey — login through order confirmation',
      scenario: 'Concurrent journey instance 1 completes login through order confirmation via UI only',
      step: 'Then the order is accepted',
    },
  },
};

// Re-exported for convenience (analysis code only needs this module, not campaign-matrix.ts too).
export { CAMPAIGN_A_POSITIONS };
export type { CampaignAPosition };
