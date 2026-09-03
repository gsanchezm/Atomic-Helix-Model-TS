// Synthetic-fixture tests for campaign-a-analysis.ts — written and run BEFORE any real Campaign A
// data exists (author requirement). Fixtures are hand-built ScenarioRecord[] shapes matching real
// cucumber-jsonl exactly (see lib/campaign-a-identity.ts's header for how the real shape/strings
// were verified), never data from an actual dispatch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeDispatch,
  classifyAttribution,
  computeM1,
  computeMOL,
  findFaultOccurrences,
  isSemanticStep,
  ScenarioRecord,
  StepRecord,
  CAMPAIGN_A_FAULT_MARKER,
} from './campaign-a-analysis';

function step(name: string, status: string, errorMessage: string | null = null): StepRecord {
  return { name, status, durationMs: 10, errorMessage };
}

function scenario(feature: string, name: string, status: string, steps: StepRecord[]): ScenarioRecord {
  return { runId: 'test', feature, scenario: name, status, steps };
}

// --- Metric 1: semantic-step allowlist ---

test('isSemanticStep: Gherkin-keyword steps are semantic', () => {
  assert.equal(isSemanticStep('Given the login screen is open'), true);
  assert.equal(isSemanticStep('When they confirm add to cart'), true);
  assert.equal(isSemanticStep('Then the order is accepted'), true);
  assert.equal(isSemanticStep('And they log in as "standard_user"'), true);
  assert.equal(isSemanticStep('But something'), true);
  assert.equal(isSemanticStep('* a custom keyword step'), true);
});

test('isSemanticStep: hooks (Before/After) are excluded', () => {
  assert.equal(isSemanticStep('Before'), false);
  assert.equal(isSemanticStep('After'), false);
});

test('computeM1: excludes hooks from both numerator and denominator', () => {
  const scenarios = [
    scenario('F', 'S', 'FAIL', [
      step('Given a', 'PASS'),
      step('When b', 'FAIL', 'boom'),
      step('Then c', 'SKIP'),
      step('Before', 'PASS'), // hook — must not enter denominator
      step('After', 'PASS'), // hook — must not enter denominator
      step('After', 'PASS'), // a second After hook (real cucumber emits one per registered hook)
    ]),
  ];
  const result = computeM1(scenarios);
  assert.equal(result.m1, 1 / 3); // 1 semantic SKIP out of 3 semantic steps, NOT out of 6
  assert.equal(result.perScenario[0].total, 3);
  assert.equal(result.perScenario[0].skipped, 1);
});

test('computeM1: step-weighted aggregation across multiple failed scenarios', () => {
  const scenarios = [
    scenario('F', 'S1', 'FAIL', [step('Given a', 'PASS'), step('When b', 'FAIL'), step('Then c', 'SKIP'), step('Then d', 'SKIP')]),
    scenario('F', 'S2', 'FAIL', [step('Given a', 'PASS'), step('When b', 'FAIL')]),
    scenario('F', 'S3', 'PASS', [step('Given a', 'PASS')]), // not failed — excluded entirely
  ];
  const result = computeM1(scenarios);
  // S1: 2 skipped / 4 total; S2: 0 skipped / 2 total -> step-weighted (2+0)/(4+2) = 1/3
  assert.equal(result.m1, 2 / 6);
});

test('computeM1: restrictToScenario ignores an unrelated failed scenario elsewhere in the dispatch', () => {
  const scenarios = [
    scenario('F', 'Attributed scenario', 'FAIL', [step('Given a', 'PASS'), step('When b', 'FAIL'), step('Then c', 'SKIP')]),
    // An unrelated scenario failed too (e.g. a flaky assertion unconnected to the injected fault) —
    // this must NOT dilute/inflate M1's step-weighted average.
    scenario('F', 'Unrelated scenario', 'FAIL', [step('Given x', 'PASS'), step('When y', 'FAIL'), step('Then z', 'SKIP'), step('Then w', 'SKIP')]),
  ];
  const restricted = computeM1(scenarios, 'Attributed scenario');
  assert.equal(restricted.m1, 1 / 3); // only the attributed scenario's 1/3 semantic steps skipped
  assert.equal(restricted.perScenario.length, 1);

  const unrestricted = computeM1(scenarios); // the old, non-Campaign-A generic behavior
  assert.notEqual(unrestricted.m1, restricted.m1); // proves restriction actually changes the result
});

test('computeM1: no failed scenario -> null, not zero', () => {
  const scenarios = [scenario('F', 'S', 'PASS', [step('Given a', 'PASS')])];
  const result = computeM1(scenarios);
  assert.equal(result.m1, null);
});

// --- Deterministic attribution ---

const EARLY_ATOMIC_SCENARIOS = (faultStep: 'expected' | 'wrong' | 'none' | 'twice'): ScenarioRecord[] => {
  const loginScenario = scenario('Market-driven language localization across login + post-login UI', 'Logout label is translated to English after market US', faultStep === 'expected' || faultStep === 'twice' ? 'FAIL' : 'PASS', [
    step('Given the OmniPizza login screen is open', 'PASS'),
    step('When the user selects the "US" market with language "English"', 'PASS'),
    step(
      'And they log in as "standard_user"',
      faultStep === 'expected' || faultStep === 'twice' ? 'FAIL' : 'PASS',
      faultStep === 'expected' || faultStep === 'twice' ? CAMPAIGN_A_FAULT_MARKER : null,
    ),
    step('Then the logout button label is "Logout"', 'SKIP'),
  ]);
  const otherScenario = scenario('Browse the OmniPizza catalog across markets', 'Catalog renders in US/en', faultStep === 'wrong' || faultStep === 'twice' ? 'FAIL' : 'PASS', [
    step('Given they are browsing the catalog in market "US" using language "en"', 'PASS'),
    step('Then the catalog screen is fully displayed', faultStep === 'wrong' || faultStep === 'twice' ? 'FAIL' : 'PASS', faultStep === 'wrong' || faultStep === 'twice' ? CAMPAIGN_A_FAULT_MARKER : null),
  ]);
  return [loginScenario, otherScenario];
};

test('classifyAttribution: valid when the fault fires exactly on the pre-registered carrier', () => {
  const result = classifyAttribution(EARLY_ATOMIC_SCENARIOS('expected'), 'atomic', 'EARLY');
  assert.equal(result.status, 'valid');
  assert.equal(result.occurrences.length, 1);
});

test('classifyAttribution: fault_not_injected when the marker never appears', () => {
  const result = classifyAttribution(EARLY_ATOMIC_SCENARIOS('none'), 'atomic', 'EARLY');
  assert.equal(result.status, 'fault_not_injected');
});

test('classifyAttribution: wrong_semantic_target when the fault lands elsewhere', () => {
  const result = classifyAttribution(EARLY_ATOMIC_SCENARIOS('wrong'), 'atomic', 'EARLY');
  assert.equal(result.status, 'wrong_semantic_target');
  assert.equal(result.occurrences[0].scenario, 'Catalog renders in US/en');
});

test('classifyAttribution: multiple_fires when the marker appears more than once', () => {
  const result = classifyAttribution(EARLY_ATOMIC_SCENARIOS('twice'), 'atomic', 'EARLY');
  assert.equal(result.status, 'multiple_fires');
  assert.equal(result.occurrences.length, 2);
});

test('classifyAttribution: tooling_error when the expected case is absent entirely (distinct from wrong_semantic_target)', () => {
  // Simulates a stale table entry / wrong evaluation_slice: the login scenario this position
  // expects doesn't exist in the dispatch's own scenario set at all.
  const scenarios = [scenario('Some Other Feature', 'Some other scenario', 'PASS', [step('Given x', 'PASS')])];
  const result = classifyAttribution(scenarios, 'atomic', 'EARLY');
  assert.equal(result.status, 'tooling_error');
});

// --- MOL ---

function fullMatchedSlicePassing(): ScenarioRecord[] {
  return [
    scenario('Browse the OmniPizza catalog across markets', 'Catalog renders in US/en', 'PASS', [
      step('Then the catalog screen is fully displayed', 'PASS'),
    ]),
    scenario('Browse the OmniPizza catalog across markets', 'Opening a pizza card launches the builder in US', 'PASS', [
      step('Then the pizza builder is displayed for "Pepperoni"', 'PASS'),
    ]),
    scenario('Customize a pizza in the builder across markets', 'Confirming add to cart closes the builder and increments the navbar cart count in US', 'PASS', [
      step('When they confirm add to cart', 'PASS'),
      step('Then the pizza builder is closed', 'PASS'),
    ]),
    scenario('Place a delivery order across markets', 'Place a delivery order in US paying with credit card', 'PASS', [
      step('Then the order is accepted', 'PASS'),
    ]),
    scenario('Market-driven language localization across login + post-login UI', 'Logout label is translated to English after market US', 'PASS', [
      step('And they log in as "standard_user"', 'PASS'),
    ]),
  ];
}

test('computeMOL: atomic EARLY is exactly 0/4 — the faulted scenario (login) hosts none of the 4 oracles', () => {
  const scenarios = fullMatchedSlicePassing();
  // EARLY fault fails the login scenario, which carries no oracle in O — all 4 oracle scenarios
  // above are untouched/PASS, so MOL must be exactly 0, not merely "small".
  const result = computeMOL(scenarios, 'atomic');
  assert.equal(result.mol, 0);
  assert.deepEqual(result.perOracle, { o1: 'DELIVERED', o2: 'DELIVERED', o3: 'DELIVERED', o4: 'DELIVERED' });
});

test('computeMOL: atomic MIDDLE loses o3 via SKIP (separate click/oracle steps)', () => {
  const scenarios = fullMatchedSlicePassing();
  const confirmScenario = scenarios.find((s) => s.scenario.startsWith('Confirming add to cart'))!;
  confirmScenario.status = 'FAIL';
  confirmScenario.steps = [
    step('When they confirm add to cart', 'FAIL', CAMPAIGN_A_FAULT_MARKER),
    step('Then the pizza builder is closed', 'SKIP'), // never reached — separate step from the click
  ];
  const result = computeMOL(scenarios, 'atomic');
  assert.equal(result.mol, 1 / 4);
  assert.equal(result.perOracle.o3, 'LOST_SKIP');
  assert.equal(result.perOracle.o1, 'DELIVERED');
  assert.equal(result.perOracle.o2, 'DELIVERED');
  assert.equal(result.perOracle.o4, 'DELIVERED');
});

test('computeMOL: atomic LATE loses o4 via FAIL, not SKIP (click+oracle fused in one step)', () => {
  const scenarios = fullMatchedSlicePassing();
  const checkoutScenario = scenarios.find((s) => s.scenario.startsWith('Place a delivery order'))!;
  checkoutScenario.status = 'FAIL';
  // The fused step: verifyOrderAccepted() clicks placeOrderButton THEN asserts, in ONE Gherkin step.
  checkoutScenario.steps = [step('Then the order is accepted', 'FAIL', CAMPAIGN_A_FAULT_MARKER)];
  const result = computeMOL(scenarios, 'atomic');
  assert.equal(result.mol, 1 / 4);
  assert.equal(result.perOracle.o4, 'LOST_FAIL'); // NOT LOST_SKIP — this is the case the approval's
  // FAILED-counts-as-lost rule exists for; the old "FAIL is delivered" semantics would have scored
  // this DELIVERED, which is exactly what was wrong with the superseded proposal.
});

test('computeMOL: twin EARLY loses all 4 oracles via SKIP (single journey instance, everything downstream)', () => {
  const journeyScenario = scenario(
    'Non-atomic horizontal journey — login through order confirmation',
    'Concurrent journey instance 1 completes login through order confirmation via UI only',
    'FAIL',
    [
      step('Given the OmniPizza login screen is open', 'PASS'),
      step('When they log in as "standard_user"', 'FAIL', CAMPAIGN_A_FAULT_MARKER),
      step('And they are browsing the catalog in market "US" using language "en"', 'SKIP'),
      step('Then the catalog screen is fully displayed', 'SKIP'),
      step('When they open the pizza "Pepperoni"', 'SKIP'),
      step('Then the pizza builder is displayed for "Pepperoni"', 'SKIP'),
      step('When they select size "Large"', 'SKIP'),
      step('And they add toppings "mushrooms"', 'SKIP'),
      step('When they confirm add to cart', 'SKIP'),
      step('Then the pizza builder is closed', 'SKIP'),
      step('When they proceed to checkout in market "US" with the built cart', 'SKIP'),
      step('And they provide delivery details "123 Luxury Avenue" "90210", "" for "Julian Casablancas" "+1 415 555 0101"', 'SKIP'),
      step('And they choose payment method "Credit Card"', 'SKIP'),
      step('And they enter card details "4242 4242 4242 4242" expiration "12/28" cvv "123"', 'SKIP'),
      step('Then the order is accepted', 'SKIP'),
    ],
  );
  const result = computeMOL([journeyScenario], 'twin');
  assert.equal(result.mol, 1);
  assert.deepEqual(result.perOracle, { o1: 'LOST_SKIP', o2: 'LOST_SKIP', o3: 'LOST_SKIP', o4: 'LOST_SKIP' });
});

test('computeMOL: oracle absent from the dispatch entirely counts as LOST_ABSENT, not DELIVERED', () => {
  const scenarios = fullMatchedSlicePassing().filter((s) => !s.scenario.startsWith('Place a delivery order'));
  const result = computeMOL(scenarios, 'atomic');
  assert.equal(result.perOracle.o4, 'LOST_ABSENT');
  assert.equal(result.mol, 1 / 4);
});

// --- End-to-end dispatch analysis ---

test('analyzeDispatch: valid attribution computes both metrics; invalid computes neither', () => {
  const validScenarios = EARLY_ATOMIC_SCENARIOS('expected').concat(fullMatchedSlicePassing().slice(1));
  const validAnalysis = analyzeDispatch('campaign-a__atomic__early__001', validScenarios, 'atomic', 'EARLY');
  assert.equal(validAnalysis.attribution.status, 'valid');
  assert.notEqual(validAnalysis.m1, null);
  assert.notEqual(validAnalysis.mol, null);

  const invalidScenarios = EARLY_ATOMIC_SCENARIOS('none');
  const invalidAnalysis = analyzeDispatch('campaign-a__atomic__early__002', invalidScenarios, 'atomic', 'EARLY');
  assert.equal(invalidAnalysis.attribution.status, 'fault_not_injected');
  assert.equal(invalidAnalysis.m1, null);
  assert.equal(invalidAnalysis.mol, null);
});

test('findFaultOccurrences: matches by substring, tolerant of surrounding context in a real error message', () => {
  const scenarios = [
    scenario('F', 'S', 'FAIL', [
      step('When x', 'FAIL', `Error: ${CAMPAIGN_A_FAULT_MARKER} (locator: "loginButton")`),
    ]),
  ];
  const occurrences = findFaultOccurrences(scenarios, CAMPAIGN_A_FAULT_MARKER);
  assert.equal(occurrences.length, 1);
});
