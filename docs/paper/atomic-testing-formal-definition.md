# A Formal Definition of Atomic Testing for Deterministic Software Validation

> **Status:** draft skeleton — sections are being filled in incrementally.
> **Target:** research article (venue TBD).
> **Terminology — approach, not model.** *Automated Atomic Testing* is an **approach**: a set of
> authoring principles (Definition 1, §4) that a test either satisfies or does not. It makes no
> architectural commitment and is not itself a model. The **Atomic Helix Model (AHM)** is a separate,
> specific *formal reference model* — one particular architecture-level instantiation of the approach,
> adding a layer composition, set-theoretic grounding, π-calculus message passing, and chaos
> suppression (§6). AHM is evidence that the approach is realizable and enforceable; it is not a
> synonym for it, and other, non-AHM instantiations of the same approach are possible in principle.
> **Scope boundary:** this paper defines and formalizes the *approach* — the properties a test must
> satisfy to be atomic, and why those properties guarantee determinism and cross-platform portability.
> It is decoupled from any specific execution architecture. The AHM reference implementation (this
> repository) exists to demonstrate that the approach is realizable and mechanically enforceable — it
> is evidence, not the contribution. The microkernel execution architecture underneath (**TOM**,
> Test-Oriented Microkernel) is a separate contribution with its own companion paper and repository
> ([Test-Oriented-Microkernel-Architecture-TS](https://github.com/gsanchezm/Test-Oriented-Microkernel-Architecture-TS)) —
> reference it, don't re-derive it here.
> **Tool scope (this paper's experiments):** **Playwright** for web (desktop + responsive viewports),
> **Appium** for mobile (Android + iOS), and **API** as the surface that operationalizes Rule 3
> ($S_0$ state injection) and anchors the atomicity argument. Mobilewright — the reference
> implementation's newer mobile plugin, and this paper's original mobile instrument choice — was
> dropped in favor of Appium after the evaluation itself surfaced a reproducible instrument defect;
> see §7.1. Gatling (performance) and Pixelmatch (visual) exist in the full AHM reference
> implementation but are out of scope for this paper's evaluation.

---

## Working notes (remove before submission)

Tracking what's sourced vs. still open, so we know where to focus next.

- [x] Core definition (the four atomicity rules) — sourced verbatim from `README.md` Appendix, just needs formal restatement.
- [x] AHM layer table — sourced from `README.md`.
- [x] Evaluation strategy decided: **Path B (comparative/causal)**, not a pure descriptive audit. See §8.1 for why a descriptive-only design can't attribute benefits to the method on a co-designed system.
- [x] Baseline-construction method decided: **mechanical de-atomization** (documented, reproducible transformation ruleset) of the existing atomic suite — *not* free-hand authoring of a "bad" suite. Verified there is no pre-atomic git history to mine instead: the first commit (`f90ee8a`, 2026-07-11, "initial import — Automated Atomic Testing reference implementation") already contains `place-delivery-order.feature`, `invalid-credentials.feature`, and `market-language-localization.feature` in atomic form. The repository was born atomic; a found, zero-construction-bias baseline does not exist.
- [x] Baseline scope decided (superseded once, see below): **both** checkout and login domains get de-atomized coverage.
- [x] Terminology clarified: **Automated Atomic Testing is an approach, not a model** — no architectural commitment. AHM is one specific formal reference model that instantiates it; it is not a synonym. Applied at the top scope box and reinforced at §5 Corollary 1 / §6.
- [x] Tool scope for this paper's experiments decided 2026-07-23: **Playwright** (web, desktop + responsive), **Mobilewright** (Android + iOS), **API** (the Rule-3 $S_0$ surface, also the constant precondition path for the portability instrument). Appium (legacy), Gatling, and Pixelmatch explicitly out of scope. **SUPERSEDED 2026-07-25** — see next entry.
- [x] **Mobile instrument changed Mobilewright → Appium, 2026-07-25.** While verifying the twin's mobile leg, found a reproducible, 100%-repeatable Mobilewright defect: whichever of the two sequential expiry-date pickers (month/year) opens *second* on the card-entry screen fails to open at all — confirmed positional (not field-specific) by reversing call order, confirmed not a timing race (an 87s-later retry tap still failed), confirmed not a Mobilewright-dispatch bug (a raw `adb shell input tap` at the same coordinates, bypassing Mobilewright's own driver entirely, also failed). A live cross-check of the identical sequence under Appium, same device, same unmodified app binary, passed cleanly end-to-end — exonerating the app and pointing at Mobilewright/device-session state specifically. Left unresolved: this same Mobilewright flow was explicitly verified working on this same app binary three days earlier (`d02d759`, 2026-07-22) — either that verification was incomplete, or session state degrades over long device-connected runs; not conclusively distinguished. Given a reference-implementation mobile plugin cannot be trusted mid-evaluation to reliably execute a spec-correct two-picker sequence, and Appium is already present in the full AHM implementation as the previously-designated "legacy" path, the pragmatic choice was to swap instruments rather than debug the plugin further or block the evaluation. Full investigation trail kept in the project's own memory system, not reproduced here.
- [x] **Twin shape superseded**: not two isolated per-domain fused-Outline twins. Adopted instead — a single, cross-domain **horizontal journey** twin, built by *mechanically concatenating* the existing atomic step sequences of **four** domains (login → catalog → pizzaBuilder → checkout), wrapped in a K-row Outline against one shared, undeclared-tag account. Domain-scope expansion (2→4) confirmed by the author 2026-07-20 — it's a consequence of R3 having no honest UI-driven equivalent to cart injection *within* checkout alone. See §8.2–§8.3 for the full design and why this resolves the R1-fusion-vs-parallel-unit-count tension the earlier per-domain design had.
- [x] **Twin scaffold exists** (discovered stale-checkbox 2026-07-23, see `docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md`): `evaluation/non-atomic-twin/` directory, `nonAtomicTwin` cucumber profile, the concatenated journey feature + step_definitions/organisms reusing existing molecules. **Status as of 2026-08-23: fully verified live, both platforms** — see the next two bullets for the Playwright and mobile (Mobilewright→Appium) verification runs and their outcomes.
- [x] **Playwright leg verified live** (2026-07-23, commit `be6a04e`): first-ever live run found and fixed a real harness bug — `CheckoutNonAtomicRoute` was reusing atomic `CheckoutRoute` pieces designed to bootstrap a session from nothing (a second independent login call, and `injectBrowserSession()`'s `SEED_CHECKOUT_SESSION` which deletes the client-side `omnipizza-cart`), which destroyed the twin's real UI-built session/cart before reaching checkout. Fixed: read the real token/cart back from browser storage instead. 8/8 journey instances green (120/120 steps); atomic `place-delivery-order.feature` re-verified green too (the fix touched two shared, exported helper functions). **Re-verified at K=16 same day** (commit `fdf7cf1`, 20:17): 16/16 scenarios, 240/240 steps green.
- [x] **Mobile leg verified live — build-order step 1 (§ campaign design doc) is now fully complete on both platforms, superseding the "Mobilewright-Android leg not yet attempted" status the previous bullet (Playwright verification) used to carry.** First attempt under Mobilewright (2026-07-25, commit `342d2e0`): three root-caused fixes applied (stale `logoutButton` mobilewright locator; an open soft keyboard occluding elements after Android `TYPE`, fixed by dismissing the IME via BACK; the twin had no equivalent of the atomic suite's `addToOrder()` API cart-seed, needed because mobile checkout deep-links with `hydrateCart=true` against a real backend cart — added `seedAndReadCartFromDraft`) — reached **13/15 steps**, blocked on the same card-expiry-year picker defect documented above that triggered the Mobilewright→Appium swap. Re-run under Appium the same day (commit `6561098`) after also fixing a stale Appium `logoutButton` locator (`login.webdriver.locators.json`, content-desc lookup for a button with no such content-desc): **15/15 steps green on the first attempt.**
- [x] **`CUCUMBER_PARALLEL` is already parameterized in CI** — `ahm-execution-helix.yml` exposes it as a `cucumber_parallel` `workflow_dispatch` input (line ~75), consumed by both Playwright jobs (desktop + responsive) with a `'4'` fallback. This resolves build-order step 2 of `docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md`, whose §2 "Current-state findings" claims it's still hardcoded — that claim is now stale (the parameterization looks like an incidental side effect of the 2026-08-21 stagger/jitter work, not a deliberate step-2 delivery). Confirmed 2026-08-23 by reading the workflow directly rather than trusting the spec doc.
- [ ] **New risk found 2026-08-23** — the determinism instrument's two arms are exposed asymmetrically to backend load — the twin performs a real UI login (and UI cart-building) on every one of its N=30×K journey rows, while the atomic arm's precondition is a single API `$S_0$` call. This project has twice this month (2026-08-21 stagger-jitter investigation, 2026-08-22/23 ZAP Path Traversal false-positive investigation) documented that concurrent CI load against the backend produces mid-run 502/503/429 responses, and that job-start jitter alone does not prevent mid-run collisions; the subsequent Render plan upgrade raises the threshold but doesn't remove the structural asymmetry (see §10.1). If that dynamic recurs during the 120-dispatch determinism campaign, it would inflate the twin's measured pass↔fail transition rate for an infrastructure reason, not a method reason — directly confounding the paper's causal claim for exactly the instrument that carries it. (a) **Done this session**: §10.1 threat-to-validity entry added. (b) **Still open**: the campaign orchestrator (build-order step 5) that would actually enforce a concurrency cap and the disclosed `INFRASTRUCTURE_FAILURE`-bucket exclusion/flagging rule doesn't exist yet — disclosure without enforcement is not a mitigation.
- [x] **Portability delta tooling built and run 2026-08-23** (build-order step 4) — `scripts/experiments/portability-delta.ts` (`pnpm experiments:portability-delta`), output `reports/portability-delta.json` (gitignored, regenerate on demand). Two deliberately separate measurements, not one hybrid number (a mixed structural-vs-historical delta would fail §8.1's own construct-validity standard — see the design note in §8.4/§9.4): (1) a **symmetric structural check**, identical procedure both arms — do the `.feature`/`step_definitions` files contain any `PLATFORM`/`DRIVER`-conditional code? **Zero for both** (atomic: 0/11 files scanned across login+catalog+pizzaBuilder+checkout; twin: 0/4 files scanned) — direct structural support for Corollary 1. (2) The twin's mobile-port cost (`342d2e0`/`6561098`), refined from a 2-way to a **3-way** classification after checking whether each fix survived the Mobilewright→Appium swap: `checkout-nonatomic.route.ts`'s `seedAndReadCartFromDraft` is twin-only code, verified present unchanged at the Appium-green commit and HEAD — **spec-forced, counted** (1 file, 63 LOC). `login.webdriver.locators.json`'s stale Appium locator is shared plugin-contract code — **plugin-gap, excluded but disclosed** (1 file, 5 LOC). `login.wright.locators.json` and `Type.ts` are Mobilewright-only fixes from the abandoned attempt, never exercised again after the swap to Appium (§7.1 excludes Mobilewright from this paper's tool scope entirely) — **out-of-scope, neither counted nor plugin-gap** (2 files, 16 LOC). No atomic-arm equivalent computed for (2): the atomic suites' Android support predates this evaluation at unknown effort/circumstance parity, so a historical diff would not be a like-for-like §8.1 comparison — reported as a labeled, non-comparable line item instead (§9.4).
- [x] **CI wiring for the non-atomic twin — closed 2026-08-23** (the "no CI job dispatches the twin at all" gap flagged repeatedly this session, e.g. §9.1's partial parallel-safety data point above). `ahm-execution-helix.yml` gained `twin`/`twin-web`/`twin-android` `platform` values, dedicated gates (`gate-twin-web`/`gate-twin-android`, deliberately excluded from `platform: all` and the disabled push/PR fallback so an ordinary CI run can never fire a §8.4 campaign dispatch by accident), and the actual dispatchable jobs (`eval-twin-web`/`eval-twin-android`) running the `nonAtomicTwin` cucumber profile. `eval-twin-web` exposes `cucumber_parallel` (1/2/4/8) — this is specifically what unblocks the parallel-safety sweep's remaining worker levels; `eval-twin-android` runs at a fixed parallel=1 (single emulator — the sweep is web-only per the campaign design's own dispatch-count math, Android's role is the determinism/portability instruments). **One known gap, not yet confirmed fixed as of this writing:** `consolidate`'s `needs:` list doesn't include the two new jobs, so a `platform=twin-web -f architecture_type=TOM` dispatch risks `consolidate` completing before the twin's own metrics artifact uploads — flagged to whoever lands this diff, verify before relying on TOM-mode consolidation for a twin dispatch. This closes the CI-wiring *capability* only, one dispatch at a time — the campaign orchestrator (build-order step 5) that would drive the full ~156-dispatch matrix, with resumability and a concurrency cap, still doesn't exist.
- [x] Repeated-run plan decided (2026-07-23, see `docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md`): **N=30** `run_index` values per arm, on **web (Playwright/Chromium) + Mobilewright-Android** — written before the 2026-07-25 tool swap; read as **Appium-Android** per §7.1 (iOS excluded from the repeated determinism runs — macOS runner concurrency — but still covered by the one-shot portability instrument). Execution environment for **all four** §8.4 instruments: **GitHub Actions** `workflow_dispatch` (repo is public — no minutes ceiling), driven by an idempotent campaign orchestrator over the existing `experiment_batch_id`/`run_index` inputs. Parallel-safety sweep: **K=16** identical Outline rows, 1 dispatch per worker level (1/2/4/8).
- [ ] Abstract — write last, once Sections 4–5 and Results are stable.
- [x] **Related Work sourced 2026-08-23** — §2 filled in (granularity heuristics incl. Google's test-size taxonomy, flaky tests/test isolation incl. industrial scale data, model-based testing, metamorphic testing incl. the oracle-problem survey, BDD/Gherkin incl. specification-by-example, and a new §2.6 test-fixture/isolation-patterns subsection) plus the §8.1 author-constructed-baseline-validity paragraph. **27 citations total**, independently verified across two passes the same day (15 then +12, the second pass at the author's explicit request for ≥25 references) — real DOI/arXiv/URL/ISBN fetched or cross-checked against publisher/institutional-repo records, not assumed from title plausibility alone; 0 rejected across both passes. Full reference list now in §References.
- [x] **Diagnosability fault-injection harness designed 2026-08-23** (build-order step 3) — see `docs/superpowers/specs/2026-08-23-diagnosability-fault-injection-harness-design.md`. Two-site mechanism: OmniPizza's existing 7 seeded "chaos users" (zero new backend code, session-scoped so safe under concurrent dispatches) for API/data buckets, a new small `chaos-proxy.ts` hook for tool/UI buckets. 11/14 taxonomy buckets have a grounded mechanism (1 needs a known-contract-mismatch check before use, 1 needs implementation-time confirmation); `VISUAL_DIFF_FAILURE`/`VISUAL_BASELINE_MISSING` honestly excluded (twin runs no visual contract). **Implemented and live-verified the same day** (`src/kernel/fault-injection.ts`, `chaos-proxy.ts` integration, commit `048667c`) — `tsc --noEmit` clean, standalone verification confirmed all 5 chaos-proxy-injectable buckets classify correctly, and a live run against `place-delivery-order.feature` produced real injected failures in telemetry. Not yet wired into the campaign orchestrator or dispatched via CI — the mechanism works locally, nothing dispatches it at scale yet.
- [x] **New finding 2026-08-23 — parallel-safety instrument (§8.4/§9.1) returned a null result, root-caused.** First-ever run of the K=16 twin at `CUCUMBER_PARALLEL=4`: 16/16 scenarios, 240/240 steps, zero degradation (`retry:0`, so not retry-masked). Read OmniPizza's backend source directly (`~/Documents/Repos/OmniPizza/backend/database.py:89-91`, `routers/auth.py:60`): its three mutable stores (`orders`, `sessions`, `user_profiles`) are keyed by UUID/`session_id`, **never by username** — a fresh `session_id` is minted on every login regardless of which account logs in. There is no server-side shared mutable state keyed by account in this application, so the twin's R2 violation (shared `standard_user`, no per-instance fixture) cannot produce a data collision here at any worker count or repetition — a structural finding, not a sample-size one. This also reframes the original motivation for `write-lock.hooks.ts`/`@writes-shared-state` (see project memory `project_parallelism_write_lock`, 2026-07-13): the "known race against OmniPizza's shared `standard_user` account" it cites was very likely backend-capacity/rate-limiting under concurrent login bursts (independently documented twice this month, §10.1), not an application-level data race. **Resolved 2026-08-23:** the author chose to **reframe** the instrument rather than redesign it or disclose the null result as a bare limitation — its prediction is rewritten in §8.4, the interim (partial) finding is reported in §9.1, and the implication for `write-lock.hooks.ts`'s original rationale is disclosed in §10.1.
- [ ] Results — the twin suites exist and are verified live on both platforms (see above), and §9.4 (portability) is now fully populated; §9.1 (parallel safety) has one partial data point, and the twin is now dispatchable via CI (one call at a time — see the CI-wiring bullet above). §9.2 (diagnosability) and §9.3 (determinism), and the rest of §9.1's sweep, remain blocked on the campaign orchestrator (build-order step 5, not yet built) to actually drive the full matrix, then on repeated runs of both arms through the unmodified TOM pipeline.
- [x] References — inline `[Author, Year]` + alphabetical reference list adopted 2026-08-23 (§References). Revisit only if the target venue mandates a different style.
- [ ] Decide whether Corollaries (§5) need actual proofs or stay as informal justifications.

---

## Abstract

> TODO — 150–250 words, written last.

**Keywords:** TODO (e.g., software testing, test isolation, formal methods, determinism, cross-platform test automation)

---

## 1. Introduction

### 1.1 Motivation

Test suites accumulate flakiness and ambiguous failures for reasons that are well known in practice
but rarely formalized:

- **Shared, mutable state** between test cases — one scenario's leftover data silently changes
  another's outcome.
- **UI-driven precondition setup** — rebuilding state by clicking through screens before the actual
  assertion, which multiplies the surface area for transient failure and couples the test to
  incidental UI behavior.
- **Ambiguous failure diagnosis** — a test that asserts more than one behavior fails without telling
  you *which* behavior broke.
- **Non-determinism treated as unavoidable noise** — instead of being explicitly separated from
  genuine, reproducible defects.

Granularity heuristics (Test Pyramid, Testing Trophy, Testing Honeycomb) prescribe *how much* testing
to do at each layer, but none of them formally define what makes a single test *atomic* — a property
independent of layer, tool, or platform. TODO: expand.

### 1.2 Contributions

> TODO — likely list:
> 1. A formal, tool-agnostic definition of an atomic test (§4).
> 2. Derived properties that follow mechanically from the definition (§5).
> 3. A reference model (AHM) showing the definition composes into a full test architecture (§6).
> 4. A reference implementation and objective evaluation methodology (§7–§8).

### 1.3 Paper structure

> TODO — one paragraph once section numbers are final.

---

## 2. Related Work

This section situates atomic testing, as formalized in this paper, against six adjacent bodies of
work. None of them define atomicity as a per-scenario predicate over state disjointness, precondition
injection, and outcome determinism; each addresses a related but distinct concern, and the contrast is
made explicit in each subsection below. (Microkernel/plugin-based test execution architecture is out of
scope here — cite the companion Test-Oriented Microkernel paper directly rather than re-covering it.)

### 2.1 Granularity Heuristics

The Test Pyramid [Cohn, 2009; Fowler, 2012], the Testing Trophy [Dodds, 2019], and the Testing Honeycomb
[Schaffer and Dybeck, 2018] are the three most widely cited heuristics for shaping a test suite's
composition. Cohn's pyramid recommends a large base of unit tests, a thinner layer of service tests, and
a still thinner layer of UI tests, in that decreasing order of quantity as tests move up in cost and
fragility. Fowler's later bliki entry states the same shape in the terms most commonly quoted in
practitioner discourse today — many fast, low-level unit tests; fewer, coarser-grained service/
integration tests; and a minimal number of slow, brittle end-to-end UI tests at the top — and is, in
practice, at least as frequently cited a primary source for the pyramid metaphor as Cohn's earlier
formulation, so the two are cited together here. Dodds's trophy shifts the weight of that recommendation
toward integration tests, adding a static-analysis layer beneath unit tests. Schaffer and Dybeck's
honeycomb, developed for Spotify's microservice architecture, inverts the pyramid's proportions again,
favoring integration tests over unit tests when service boundaries are the primary source of risk.

All three are heuristics about the *proportion of tests across layers* — how many unit versus
integration versus end-to-end tests a suite should contain; none of them specifies what makes an
individual test case well-formed. A more recent line of practitioner literature, Winters, Manshreck, and
Wright's *Software Engineering at Google* [2020] (the testing chapter written by Bender), introduces a
second axis that is explicitly orthogonal to this proportion question rather than a fourth member of the
proportion set: *size* — small, medium, or large — defined not by which layer of the pyramid a test
occupies but by the process, network, filesystem, and thread access a test is permitted, with
determinism stated as a size requirement in its own right. Size does constrain an individual test case,
which distinguishes it from the three proportion heuristics above; it is nonetheless a different
constraint from atomicity. Size bounds *what resources and processes a test may touch*; atomicity bounds
*how a scenario's state relates to every other scenario's* — disjoint state, independently
API-injected preconditions, and a single deterministic outcome per scenario. A small test in Google's
taxonomy could still violate atomicity by sharing fixture state with a sibling small test, and a large
test could satisfy atomicity by injecting fully disjoint preconditions despite a resource footprint that
places it outside the small category. Size and atomicity constrain different properties of a test case —
resource access versus inter-scenario state relationships — so they compose rather than compete.

Atomicity, as defined in this paper, therefore remains layer- and size-agnostic: it is a predicate that
can be evaluated against any single scenario regardless of which layer of a pyramid, trophy, or honeycomb
it occupies, or which size class it falls into. A unit test that shares mutable fixture state with other
unit tests violates atomicity despite sitting at the heuristics' most-recommended layer; an end-to-end UI
scenario with API-injected, disjoint preconditions satisfies it despite sitting at their least-recommended
layer. Because the granularity heuristics — proportion-based and size-based alike — are silent on this
inter-scenario axis, atomicity is orthogonal to them rather than a competing or refining proposal.

### 2.2 Test Isolation and Flaky Tests

Luo et al. [2014] established the empirical baseline for this literature with a study of 201 commits
fixing flaky tests across 51 open-source projects, producing a taxonomy of root causes that includes
asynchronous waits, concurrency, and test-order dependency. Eck, Palomba, Castelluccio, and Bacchelli
[2019] complement that root-cause taxonomy with the developer's perspective, surveying and interviewing
practicing engineers to characterize how flaky tests are actually triaged and diagnosed once they appear
— root cause and triage are different questions, and Luo et al.'s taxonomy answers only the first. Lam et
al.'s iDFlakies [2019] built an automated framework that isolates one of those categories —
order-dependent (OD) versus non-order-dependent (NOD) flakiness — by randomizing test execution order
across 422 flaky tests. Bell et al.'s DeFlaker [2018] takes a complementary, rerun-free approach, flagging
a newly failing test as flaky when its failure correlates with code outside the latest change's coverage,
reporting 95.5% recall without the cost of repeated executions. Parry, Kapfhammer, Hilton, and McMinn's
more recent survey [2022] synthesizes this and subsequent work into a single taxonomy of causes, detection
techniques, and mitigations, giving an up-to-date map of the field against which the four narrower,
earlier studies above can be situated.

The scale of the underlying problem is not merely academic: Micco's account of Google's test
infrastructure [2016] reports that roughly 1.5% of all test runs exhibit some flaky result, grounding this
paper's motivation for a scenario-authoring method that removes order-dependency and shared mutable state
as sources of flakiness by construction, rather than detecting or triaging it after the fact.

This body of work is fundamentally diagnostic: it detects, classifies, and triages nondeterminism in tests
that already exist and have already exhibited flaky behavior, whether through repeated runs (Luo et al.,
iDFlakies), coverage analysis (DeFlaker), developer interviews (Eck et al.), or survey synthesis (Parry et
al.). Atomicity, by contrast, is constructive rather than diagnostic. Because each scenario's
preconditions are injected independently via API DAOs and its state is required to be disjoint from every
other scenario's, the order-dependent (OD) category that iDFlakies is built to separate out becomes
structurally unreachable rather than merely detectable after the fact. Luo et al.'s taxonomy is useful
here precisely as a specification of the failure modes atomicity's constraints are designed to preclude by
construction, not as a detection technique this paper adopts.

### 2.3 Model-Based and Specification-Driven Testing

Utting, Pretschner, and Legeard [2012] provide the standard taxonomy of model-based testing (MBT),
classifying approaches by the characteristics of the model used, the strategy for generating test cases
from it, and the traceability maintained between model and tests. Utting and Legeard's earlier,
practitioner-oriented book [2007] grounds that taxonomy's abstract categories in concrete workflow: model
notations, test-selection criteria, and the generation and execution tooling needed to run an MBT pipeline
end-to-end — a level of tooling detail the 2012 taxonomy paper does not itself provide, and one that
parallels this paper's own contract-driven, tool-generated approach to scenario execution. Broy, Jonsson,
Katoen, Leucker, and Pretschner's edited volume [2005] extends the MBT picture to reactive systems
specifically, collecting foundational treatments of finite-state-machine and labeled-transition-system
test generation for systems whose behavior is driven by ongoing external events — the same reactive,
event-driven shape as the UI and API flows this framework automates, and further grounds (alongside Dick
and Faivre, below) for treating state-machine-derived test generation as an established methodology this
paper's Gherkin scenarios are compatible with, even though they are not themselves machine-generated.
Dick and Faivre [1993] offer an early, concrete instance of specification-driven generation: they reduce a
VDM specification's partitions to disjunctive normal form and construct a finite-state machine over the
resulting partitions, which is then traversed to both generate and *sequence* test cases.

MBT literature addresses test *provenance* — where a test case comes from and how it is derived and traced
back to a model. Atomicity is agnostic to provenance; it constrains the well-formedness of an individual
test case regardless of whether that case was hand-written, model-generated, or produced by any other
means. The contrast sharpens with Dick and Faivre specifically: their FSM-based approach deliberately
chains tests together, so that reaching one test in the sequence requires having already traversed the
states reached by prior tests. This is the direct inverse of the atomic requirement that each scenario's
precondition be independently injectable and its state disjoint from every other scenario's —
MBT-style sequencing optimizes for efficient traversal of a model's state space across tests, exactly where
atomicity insists on independence between them.

### 2.4 Metamorphic Testing

Chen, Cheung, and Yiu [1998] introduced metamorphic testing to address the oracle problem: when no single
expected output is available to check a test against, a metamorphic relation instead relates the outputs
of multiple, related executions to one another. Barr, Harman, McMinn, Shahbaz, and Yoo's survey of the
oracle problem itself [2015] frames the broader landscape metamorphic testing is one response to: it
catalogues the general strategies the field has developed for determining pass/fail outcomes — specified,
derived, and implicit oracles, alongside metamorphic relations — and situates metamorphic testing as the
strategy of choice specifically when no other oracle is derivable from the specification or the system
itself. Segura et al.'s survey [2016] formalizes the metamorphic-testing mechanism as the field matured,
characterizing metamorphic relations as constraints over sets of test-case outputs and cataloguing the
domains in which they have been applied where full oracles are infeasible. Chen, Kuo, Liu, Poon, Towey,
Tse, and Zhou's later, broader review [2018] extends that survey with subsequent developments in relation
identification, automated test generation for metamorphic testing, and its integration with fault
localization and automated program repair, without duplicating Segura et al.'s earlier scope.

Metamorphic testing and atomic testing address different problems and are not in competition. Metamorphic
testing exists, per Barr et al.'s taxonomy of oracle strategies, precisely because a full oracle is
*unavailable*; it substitutes a relation across several executions' outputs for a single expected value.
Atomicity applies when an oracle *is* available, and requires that each scenario check exactly one
behavior against one deterministic outcome, without coupling to any other scenario's execution or state.
The two are complementary rather than conflicting: nothing prevents a metamorphic relation from being
evaluated over a set of individually atomic scenarios, each independently satisfying disjoint-state
atomicity, with the relation checked across their separately deterministic outcomes rather than through
any shared mutable state between them.

### 2.5 BDD/Gherkin as a Specification Language

Dan North's original article [North, 2006] coined behaviour-driven development and introduced the
Given/When/Then structure this paper's scenarios are written in, reframing testing vocabulary around
"behaviour" rather than "test." Adzic's *Specification by Example* [2011] extends that reframing from
vocabulary into practice, formalizing "living documentation" — executable examples maintained as the
single source of truth shared between business stakeholders and developers — as the mechanism by which
BDD-style specifications stay synchronized with the system they describe; this paper's treatment of each
Gherkin scenario as an executable, API-verifiable contract for a single behavior draws directly on that
living-documentation framing. Binamungu, Embury, and Konstantinou [2020] surveyed 56 industrial BDD
practitioners to derive and validate four quality principles for Gherkin specifications: step reuse,
conservation of domain vocabulary, elimination of technical vocabulary, and a consistent level of
abstraction within a scenario.

This paper adopts Gherkin per North's original vocabulary and Adzic's living-documentation practice as its
specification language, but layers an additional execution-semantics constraint on top of the
specification-quality guidance all three citations provide. North's own examples, and BDD practice
generally, permit a `Given` step to be driven through the UI (e.g., logging in by clicking through a login
form) and permit scenarios to share long-lived fixtures across a suite; Adzic's living-documentation
practice is likewise silent on where a `Given` step's state comes from, so long as the example stays
synchronized with the system. Binamungu et al.'s four principles target the readability and
maintainability of the Gherkin *text* — they say nothing about what state a `Given` step may touch or
whether that state may be shared across scenarios; their "step reuse" principle concerns reusing step
*definitions*, which this paper's design is fully compatible with. What this paper departs from typical
BDD practice on, and what none of the three citations addresses, is two specific execution-semantics
constraints: preconditions are injected exclusively through API DAOs rather than the UI, and state is
required to be disjoint per scenario rather than shared. The departure is additive — a constraint on top
of existing specification-quality work — not a rejection of it.

### 2.6 Test Fixture and Isolation Patterns

Meszaros's *xUnit Test Patterns* [2007] is the canonical catalogue of fixture-management patterns for the
xUnit family of test frameworks, and its Fresh Fixture pattern — each test constructs its own private
fixture rather than reusing or sharing one — is the direct design-pattern precedent for this paper's
requirement that every scenario's state be disjoint from every other scenario's. Meszaros treats Fresh
Fixture as one legitimate choice among several named alternatives (Shared Fixture, Prebuilt Fixture, Lazy
Setup, and others), each with documented trade-offs between isolation and setup cost; the catalogue is
deliberately permissive, offering a vocabulary for choosing a fixture strategy rather than a predicate a
given scenario must satisfy. Atomicity narrows that choice into an obligation: it requires
Fresh-Fixture-equivalent disjointness of every scenario's state as a well-formedness condition, not merely
as one option among several, and adds two clauses xUnit Test Patterns does not itself specify — that the
fixture be established through API-injected preconditions rather than through the system's own UI, and
that the scenario's outcome be deterministic. The catalogue is also largely silent on *how* a fixture
should be established for a UI- or API-driven end-to-end scenario specifically, since its patterns were
developed primarily for xUnit-style unit tests; that gap is exactly where this paper's API-DAO
precondition-injection clause sits. Read against Luo et al.'s flaky-test taxonomy (§2.2), a Shared Fixture
in Meszaros's terms is precisely the mechanism by which the order-dependent (OD) failure category arises —
Fresh Fixture, and atomicity's stricter version of it, is the constructive answer to that failure mode
rather than a mechanism for detecting it after the fact.

---

## 3. Problem Statement

> TODO. Frame the gap precisely: existing literature defines test *levels* (unit/integration/e2e) and
> test *smells* (flakiness, order-dependency) but has no positive, formal definition of atomicity that
> a test either satisfies or does not — analogous to how ACID gives a positive definition for
> transactions rather than just cataloguing failure modes. State the research question(s) explicitly.

---

## 4. Formal Definition of Atomic Testing

### 4.1 Preliminaries and notation

> TODO — define the universe of discourse before Definition 1: a test suite $T = \{t_1, \dots, t_n\}$,
> each test $t_i$ associated with a state set $S_{t_i}$, a single observable outcome (oracle) $O_{t_i}$,
> and an execution environment/platform $P$.

### 4.2 Definition 1 (Atomic Test)

A test $t$ is **atomic** if and only if it satisfies all four of the following rules.

| # | Rule | Formal statement | Informal meaning |
|---|------|-------------------|-------------------|
| 1 | **Single behavior** | $t$ has exactly one oracle $O_t$ | The test asserts exactly one thing; failure diagnosis is unambiguous. |
| 2 | **Disjoint state** | $\forall\, t_i \neq t_j \in T,\ S_{t_i} \cap S_{t_j} = \emptyset$ | No test can observe or mutate another test's data; isolation is definitional, not disciplinary. |
| 3 | **No UI-driven setup** | Preconditions are established via a state-injection function $S_0(t)$ external to the interface under test | Setup never depends on the same interaction surface being verified. |
| 4 | **Deterministic outcome** | $\forall$ repeated executions of $t$ under fixed inputs, $O_t$ is invariant once transient noise is absorbed (chaos suppression, $\lambda < 0$) | Real failures fail fast and reproducibly; transient noise is explicitly not a failure. |

> TODO: decide whether to present this as a conjunction of four independent predicates
> $\text{Atomic}(t) \iff R_1(t) \wedge R_2(t) \wedge R_3(t) \wedge R_4(t)$, and whether each $R_i$ needs
> its own fully formal (not just tabular) statement for the target venue's rigor bar.

### 4.3 Discussion of the definition

> TODO — justify each rule's necessity with a counterexample (a test that fails to be atomic without
> it) and connect back to the motivation in §1.1.

---

## 5. Derived Properties (Corollaries)

Properties that follow mechanically once a test suite is composed entirely of atomic tests, rather
than being separately engineered:

- **Corollary 1 — Platform invariance.** TODO: because atomicity rules 2–4 don't reference a specific
  interface, an atomic test's specification is portable across execution surfaces without
  modification. This paper's evaluation exercises this corollary across exactly three surfaces —
  web (Playwright, desktop + responsive), mobile (Appium, Android + iOS), and API — see the
  tool-scope note at the top of the document and §7.1. The full AHM reference implementation supports
  additional surfaces (Gatling load, Pixelmatch visual) as cross-cutting *contracts* rather than
  alternate platforms; they are out of scope here (§7.1) but not counterevidence to the corollary.
- **Corollary 2 — Parallel safety.** TODO: Rule 2 ($S_{t_i} \cap S_{t_j} = \emptyset$) implies the test
  suite is safe to execute concurrently without explicit ordering, except for tests that declare a
  shared-state dependency explicitly (an escape hatch, not a violation). This paper's reference
  application has no naturally occurring account-keyed shared mutable state, so this corollary cannot
  be empirically discriminated via data-collision on this dataset — see §8.4/§9.1 for what was
  measured instead.
- **Corollary 3 — Deterministic diagnosis.** TODO: Rules 1 + 4 together imply that a failing atomic
  test identifies both *what* broke and that the break is reproducible, not transient.

> TODO: decide the proof obligation for each corollary — informal argument vs. more formal derivation.

---

## 6. Reference Model: the Atomic Helix Model (AHM)

### 6.1 Layer model

> TODO — restate in the paper's own words; the raw source table from the reference implementation is
> reproduced here for now:

| Layer | Responsibility |
|-------|-----------------|
| Atoms | The single, indivisible execution primitive (one intent, one action). |
| Molecules | Grouped atomic intents composed into one cross-platform interaction. |
| Organisms | Orchestration of molecules into business flows; execution-surface selection. |
| Eco-Systems | Specification-level composition (BDD scenarios) of organisms into test cases. |
| Resonance | Load/performance simulations driven by the same specification data. |
| Execution Helix | CI/CD composition of every layer into parallel, isolated execution runs. |

### 6.2 Formal grounding

AHM composes Definition 1 with three formal constraints, distinguishing it from heuristic
strategy metaphors (Test Pyramid, Trophy, Honeycomb):

- **Set-theoretic isolation** — $S_{t_i} \cap S_{t_j} = \emptyset$ (Rule 2, restated at the
  architecture level).
- **π-calculus message passing** — cross-process communication is a typed, addressed message
  (intent); there is no shared memory or global mutable state between layers.
- **Chaos suppression** — transient failures are modeled and absorbed such that the system's
  effective failure dynamics have Lyapunov exponent $\lambda < 0$; deterministic failures are not
  retried.

### 6.3 Relationship to the execution architecture (scope boundary)

> TODO: one paragraph, explicit. AHM (this paper) defines *what* must be true of a test and a test
> architecture for atomicity to hold. It does not prescribe *how* intents are transported, retried, or
> routed — that is the Test-Oriented Microkernel's contribution (companion paper). Cite, don't restate.

---

## 7. Reference Implementation

> TODO — kept intentionally brief; this section exists for reproducibility, not as the paper's
> contribution.

### 7.1 Tool scope for this paper

The full AHM reference implementation realizes the approach across six execution tools (Playwright,
Appium, Mobilewright, Gatling, API/fetch, Pixelmatch) behind a single Gherkin specification layer.
**This paper's experiments (§8–§9) exercise a deliberately narrower slice of that surface:**

| Tool | Role in this paper | Why |
|---|---|---|
| **Playwright** | Web UI — desktop and responsive viewports | Primary UI surface for both the atomic suite and the non-atomic twin's R3 (UI-driven setup) violation |
| **Appium** | Mobile UI — Android and iOS | The "second platform" for the Corollary 1 (portability) instrument in §8.4 |
| **API** | Contract execution / $S_0$ state injection | Directly operationalizes Rule 3 — the atomic suite's `Given` steps route preconditions through this surface instead of through UI; it is the mechanism the atomicity argument stands on, not just a third platform |

**Mobile instrument note.** The reference implementation offers two mobile UI plugins: **Mobilewright**
(newer) and **Appium** (the more established, WebDriver-based path). This paper originally selected
Mobilewright. That choice was revised to **Appium** mid-evaluation (2026-07-25) after Mobilewright
exhibited a reproducible defect while executing the twin's mobile leg — a card-entry screen with two
sequential picker interactions consistently failed to open whichever picker came second, independent of
which field it was. The defect was isolated to be positional rather than field-specific, shown not to
be a timing race, shown not to be a Mobilewright input-dispatch bug (a raw OS-level tap at the same
target also failed), and shown not to be an application defect (the identical interaction sequence,
same device, same unmodified app build, completed correctly under Appium). Because a mobile execution
plugin's own reliability is a precondition for this paper's instruments — not something the evaluation
is measuring — the resolution was to swap the designated mobile tool rather than treat plugin debugging
as in-scope experimental work. This is disclosed here per the evidence policy in §8.5: an instrument
substitution made for reasons independent of the method under test.

**Explicitly out of scope for this paper:** **Mobilewright** (see above), **Gatling**
(performance/load), and **Pixelmatch** (visual regression). All three exist in the full repository as
cross-cutting quality-attribute *contracts* (§7.2) or alternate plugins rather than this paper's chosen
execution platforms, and belong to the architecture-level (TOM) evaluation, not this paper's
method-level one.

### 7.2 Cross-cutting quality attributes as contracts

> TODO — cover: visual, accessibility, and security (implemented since `5330693`, 2026-07-16 — out of
> this paper's evaluation scope per §10.2, not unimplemented) as *contracts* attached to
> existing atomic tests, not as a parallel test layer — evidence that Definition 1 doesn't need a
> special case for non-functional testing. Link out to the implementation repository rather than
> reproducing source.

---

## 8. Evaluation Methodology

### 8.1 Why a descriptive audit is not enough

A first instinct is to measure the existing AHM reference suite in isolation — e.g. "N% of scenarios
are not tagged `@writes-shared-state`" — and read the result as evidence for Corollary 2. That
argument does not hold on this system: **method and execution architecture are co-designed.**
Portability, diagnosability, and (partly) determinism are produced jointly by (a) the test-writing
method (Definition 1) and (b) the Test-Oriented Microkernel underneath it (logical locators, typed
intents, chaos suppression). A single-suite descriptive number cannot separate the two — a reviewer
can always ask "how much of this is TOM, not the method?", and a descriptive design has no answer.

This paper therefore adopts a **comparative, causal design**: hold the execution architecture fixed
and vary only the authoring method, so that any measured difference is attributable to atomicity
itself. This is heavier than a descriptive audit, but it is the only design that licenses a causal
claim ("atomicity causes X"), not merely a correlational one ("the atomic suite happens to have X").

**On the validity of an author-constructed comparison baseline.** A natural objection to this
evaluation is that an author-constructed non-atomic baseline risks encoding the very bias the
comparison is meant to measure. That risk is substantially mitigated to the extent that each non-atomic
twin is not composed freely but produced from its atomic counterpart by applying a fixed, documented
set of de-atomization operators — e.g., collapsing per-scenario preconditions into a shared fixture or
reintroducing UI-driven `Given` steps — which is the same construct-validity logic that licenses
mutation testing's mechanically-derived program variants as legitimate comparison artifacts rather than
adversarially hand-picked counterexamples [DeMillo et al., 1978; Jia and Harman, 2011; Papadakis et al.,
2019]. Papadakis et al.'s more recent survey brings that mutation-testing account up to date — reviewing
roughly two further decades of mutation-operator, tool, and empirical development — without changing the
underlying construct-validity logic the comparison relies on. Wohlin et al.'s
treatment of construct validity in controlled software-engineering experiments specifies what such a
derivation must report to be defensible: the operators applied, their scope, and the threats introduced
by holding the rest of the artifact fixed [Wohlin et al., 2012]. Under that discipline, the twin's
non-atomicity functions as a controlled independent variable rather than an uncontrolled source of
experimenter bias, and its validity becomes an empirical property of the documented derivation
procedure rather than an assumption asked to be taken on faith — see §8.3 for this paper's own
disclosed operator set.

### 8.2 Constructing a fair non-atomic baseline

The comparison needs a second, **non-atomic** twin suite exercising the same application behaviors as
the existing atomic one, with TOM held constant underneath both. The central threat to this design is
**construction bias**: if the authors write the "bad" suite by hand, a reviewer can dismiss it as a
straw man built to lose.

Two baseline sources were considered and one was ruled out by evidence, not preference:

- **Found pre-atomic history.** Ideal — zero construction bias. Ruled out: `git log` on
  `place-delivery-order.feature`, `invalid-credentials.feature`, and
  `market-language-localization.feature` shows they entered the repository already atomic, in the
  first commit (`f90ee8a`, "initial import — Automated Atomic Testing reference implementation",
  2026-07-11). The repository was born atomic; there is no earlier, naturally-occurring non-atomic
  form to recover.
- **Mechanical de-atomization (adopted).** The non-atomic twin is produced by applying a small,
  disclosed set of transformations to the *existing* atomic scenarios, rather than by free-hand
  authoring. This bounds the transformation to exactly the rules under test, makes the baseline
  auditable (a reader can diff twin against original and verify each violation was introduced, not
  invented), and keeps every other property of the scenario — the behavior under test, the assertions'
  intent, the data — identical between arms.

**Design note on shape.** An earlier iteration of this design built two isolated, per-domain twins
(checkout, login) by fusing 2–3 `Scenario Outline` rows each. The adopted shape instead composes a
single **horizontal, cross-domain journey** — closer to how non-atomic suites are actually written in
practice (one long "user story" test) — but built the same auditable way: by **mechanically
concatenating step sequences that already exist** in the atomic suites (login → catalog →
pizzaBuilder → checkout), not by hand-authoring a new narrative. Every step in the twin traces back to
an atomic scenario's existing step; the only new material is minimal connective navigation between
domains, which is disclosed rather than hidden. This is *not* the free-hand-authoring option ruled
against above — it is mechanical de-atomization applied across a domain boundary instead of within a
single domain.

### 8.3 The transformation

**Scope.** The atomic step sequences of four domains — `login`, `catalog`, `pizzaBuilder`,
`checkout` — are concatenated into one continuous scenario (the existing `place-delivery-order.feature`
and `invalid-credentials.feature`/`market-language-localization.feature` remain untouched as the
atomic arm). This is a wider domain footprint than the checkout+login scope decided earlier; it falls
out of R3 having no honest UI-driven equivalent to `CheckoutDao.addToCart()` *within* the checkout
domain — the only real UI path to a populated cart is catalog → pizzaBuilder. Confirmed with the
author rather than assumed.

| Operation | Rule(s) it violates | What it does | Mechanism it defeats |
|---|---|---|---|
| **Concatenate** | R1 (compounded) | Chain login's, catalog's, pizzaBuilder's, and checkout's existing atomic step sequences into one scenario; every domain's oracle becomes one more `Then`/`And` block inside that single scenario instead of living in its own scenario | Failure localization *across* domain boundaries, not just within one |
| **R2 — disjoint state** | Point every domain leg of the journey at **one shared account/session**, reused by every concurrent journey instance, instead of each atomic scenario's own per-scenario fixture | Parallel safety, and downstream, determinism |
| **R3 — no UI-driven setup** | Replace every API $S_0$ injection along the chain — login via `LoginDao`, cart contents via `CheckoutDao.addToCart` — with the existing UI molecule that already performs that action in the reference implementation (login's `submitCredentials`, catalog's card-click, pizzaBuilder's open/size/toppings/confirm) | Cross-platform portability and setup reliability |
| R4 — deterministic outcome | *Not transformed directly* — predicted **consequence** of the R2 transformation | See §8.4 |

**Concurrency shape.** The journey is wrapped in one `Scenario Outline` with **K = 16 identical rows**
(each row: "one concurrent user runs the full journey"), all targeting the same shared, untagged
account. cucumber-js distributes Outline rows as independent pickles across workers, so this single
Outline — run at `CUCUMBER_PARALLEL = 1, 2, 4, 8` — sweeps concurrency without changing scenario count
between sweep points, which is what makes §8.4's parallel-safety curve legible (see design note there).
K=16 and the single-dispatch-per-level decision (no repeated `run_index` needed at this stage — the
object of interest is the failure-rate curve's shape, not a point estimate needing error bars) are
recorded in `docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md`.

**Where it lives.** `evaluation/non-atomic-twin/` — outside `src/core/tests/`, so the default
`cucumber.js` glob (`src/core/tests/**/*.feature`) cannot pick it up. A dedicated named profile in
`cucumber.js` points at it, inheriting `timeout`/`requireModule`/the `support/**` require path from
`default` for parity, but with `retry: 0` (not `default`'s `retry: 1`) — a retry would silently re-run
the *entire* journey and mask exactly the determinism signal §8.4 measures, at high cost given the
journey's length. Manifest/telemetry env vars (`TOOL_NAME`, etc.) tag its runs distinctly so the
existing `metrics/` pipeline ingests both arms without any pipeline code change.

**Platform legs.** As specced above, the twin's step sequences are Playwright/web (the UI molecules
named — `submitCredentials`, catalog card-click, pizzaBuilder open/size/toppings/confirm — are the
Playwright ones). The determinism instrument (§8.4) additionally requires an **Appium-Android**
leg of the same concatenated journey, built the same mechanical way from the corresponding Appium
organisms; this construction is shared with the portability instrument, which measures the LOC/files
touched to build it (§8.4). **Both legs are now built and verified live**, not just specced: Playwright
is green at K=16 (240/240 steps, commit `fdf7cf1`), and Android is green under Appium (15/15 steps,
commit `6561098`) after an interim Mobilewright attempt reached 13/15 and surfaced the picker defect
behind the §7.1 tool substitution. The LOC/files-touched number itself — the portability instrument's
actual measurement — has not yet been computed from that construction. See
`docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md`
for why the scope widened past the original Playwright-only framing, why iOS is excluded from the
repeated determinism runs specifically while still covered by the one-shot portability check, and §7.1
for why this leg's designated tool changed from Mobilewright to Appium mid-evaluation.

Both suites otherwise run through the **identical, unmodified** TOM stack (same proxy, same plugins,
same locator contracts, same chaos-suppression policy) — the only independent variable is which suite
is being executed.

**Browser held constant.** Every Playwright-leg run for the §8.4 causal instruments uses a single
engine (Chromium). The reference implementation already supports a full cross-browser matrix
(Chromium/Firefox/WebKit, `pnpm test:all-browsers`), but the causal variable under test is atomicity,
not browser engine — running the primary comparison ×3 browsers would mostly multiply cost without
adding a dimension to what's being attributed, and WebKit's known engine-level flakiness would inflate
the twin's determinism transition rate (§8.4) for reasons that are not method-attributable, contaminating
that instrument specifically. Cross-browser replication is treated as a separate, secondary
generalization check (§10.2) — not one of the primary instruments.

### 8.4 What each corollary predicts, and how it is measured

| Corollary | Prediction | Instrument | Why this shape, not a single ratio |
|---|---|---|---|
| **Parallel safety** (from R2) | **Reframed 2026-08-23 — see the note below the table.** A source-level audit of OmniPizza's backend (`backend/database.py:89-91`, `backend/routers/auth.py:60`) found its three mutable stores (`orders`, `sessions`, `user_profiles`) keyed by UUID/`session_id`, never by username — this reference application has no account-keyed collision surface for R2 to guard against. The instrument therefore no longer predicts a data-collision failure-rate delta; it instead measures whether concurrent same-account UI traffic (the twin's R2 violation) degrades correctness or exposes backend-capacity limits as concurrency increases | Run the **existing, unmodified** atomic `@desktop` suite (the full ~97-scenario suite exercised by CI's `e2e-web` job — not a checkout-only subset; no new construction needed on this arm) and the twin's K-row Outline both at `CUCUMBER_PARALLEL = 1, 2, 4, 8`; plot failure rate vs. worker count for each | A curve still isolates *where* contention starts — now read as *where backend capacity limits, if any, start*, not as a data-collision signal. Using the twin's K identical journey rows (not a fused/reduced scenario count) keeps the number of parallelizable units stable across sweep points — the flaw in the earlier fused-Outline design. The atomic/twin scenario-count mismatch (97 vs. 16) doesn't bias this instrument: failure rate is computed *within* each arm, not as a cross-arm ratio, so unequal volume between arms is irrelevant to the curve's shape (see the execution-efficiency instrument below for why this same mismatch *does* disqualify a cross-arm wall-clock comparison) |
| **Diagnosability** (from R1, compounded) | A fault fails exactly the atomic scenario that owns it, classified into its true failure bucket; the same fault in the journey produces a wider blast radius (the whole journey fails) and can surface far from its true cause (e.g. a cart-calculation fault only manifesting at the order-confirmation assertion) | Systematic fault injection at a layer **both arms genuinely share** — backend/network, not UI vs. API setup, since the twin's setup is now all-UI while the atomic arm's is API and a setup-layer fault wouldn't be the "same" fault in both. One representative fault per entry in the existing 14-bucket taxonomy (`scripts/metrics/lib/failure-buckets.ts`). Measure blast radius (# scenarios/oracles failing) and localization accuracy (does the reported bucket name the true cause, or the symptom where it happened to surface) | Injecting from the *whole* taxonomy, at a shared layer, removes both fault-selection bias and arm-asymmetric injection as sources of bias |
| **Determinism** (from R4, mediated by R2) | The twin shows a higher pass↔fail transition rate across repeated runs than the atomic suite, *even with TOM's chaos suppression identical in both arms* | Repeat each suite across **N=30** `run_index` values under one `experiment_batch_id`, on **web (Playwright/Chromium) + Appium-Android** (iOS excluded from repetition), both arms at `retry: 0` (see §8.3) so a masked retry doesn't hide the signal; reuse the existing reliability infrastructure (`measure-reliability.ts`, pass→fail / fail→pass transition probabilities) | TOM's chaos suppression (`λ < 0`) only absorbs *transient* noise and fails fast on deterministic ones (README:27,48). R2 collisions in the twin are deterministic, not transient — TOM won't retry them away. That's the mechanism making the delta attributable to the method. Suppression applies identically to both arms, so it still partially masks method-induced flakiness in the twin too — read the delta as a **conservative, lower-bound** estimate |
| **Platform invariance** (from R3, Corollary 1) | **Measured 2026-08-23 — see the note below the table.** Porting the atomic suites from Playwright (web) to Appium (Android + iOS, both live-verified in CI) costs 0 spec-layer changes, confirmed structurally; the same structural check on the twin also reads 0 — but the twin's *live* mobile port was only ever run on Android (iOS was never attempted for the twin, and is out of scope per §8.3's exclusion of iOS from the repeated determinism/twin runs), and that Android-only port costs a small, non-zero amount of twin-only implementation code (63 LOC, 1 file) that the atomic arm has no equivalent of | For both arms, check the `.feature`/step-definition layer for platform-conditional code (structural, symmetric across arms, and platform-agnostic by construction — it does not require live execution on either mobile platform); separately, for the twin only, classify each file touched while getting its **Android** mobile leg green as spec-forced (counts), plugin-gap (excluded, disclosed), or out-of-scope (Mobilewright artifacts, §7.1 — neither counted nor plugin-gap) | Isolates the *specification*-level cost from the architecture, which is held constant and already supports both platforms; the two measurements are kept separate rather than combined into one number because they use different procedures (structural check vs. classified historical diff) — combining them would fail §8.1's own construct-validity standard |
| **Execution efficiency** (from R3, ancillary — companion to Platform invariance, not a §5 Rule-derived corollary in its own right) | **Web and Android both reach the N≥10 evidence bar (web 2026-08-27, Android 2026-08-28) — see the note below the table.** Reaching a given precondition state via API injection (`LoginDao`, the checkout DAO's cart-population call — the same mechanisms named in §8.3's R3 row) costs less step-time than reaching the *same* state via the UI molecule sequence R3's transformation substitutes for it (`submitCredentials`, catalog→builder UI navigation) | Per-operation `cucumber-jsonl` step-`durationMs` for two comparandum pairs that reach an identical functional end state by a genuinely different mechanism in each arm ("logged in"; "cart populated with 1 item") — **not** whole-suite or whole-job wall-clock, and **not** an assembled sum of atomic scenarios (see the design note for both rejected alternatives and why) | Whole-job wall-clock conflates this instrument's own atomic/twin volume and job-shape asymmetry (the `e2e-web` job's full matrix vs. the twin's single unmatrixed job, plus a chained visual-diff job downstream of neither arm's actual test execution) with any method effect. Per-operation step-time removes both: the unit compared is one operation reaching one state, symmetric regardless of how many other scenarios either suite happens to run alongside it |

**Threat specific to the portability instrument.** Mobile execution (Appium, Android + iOS) is
not optional here — it *is* the instrument, not an add-on (see §7.1). But it makes this instrument the
one most exposed to conflating **tool immaturity with non-atomicity**: if the mobile plugin is
missing an action the twin's heavier UI journey happens to need, or — as found during this evaluation
with the originally-designated Mobilewright plugin — behaves unreliably on an interaction the
specification itself requires, porting the twin costs extra work (or an instrument swap) for a reason
that belongs to TOM's plugin surface, not to the method. Mitigation: only count spec changes forced by
the *specification itself* (different assertions, different navigation structure); any change forced by
a missing or unreliable plugin action gets logged separately and excluded from the reported delta, with
the gap itself disclosed rather than silently worked around — see §7.1 for the Mobilewright→Appium
substitution this policy produced. Also tracked in §10.1.

**Note on the portability instrument's measurement (2026-08-23).** Computed by
`scripts/experiments/portability-delta.ts` (`pnpm experiments:portability-delta`); full output in
`reports/portability-delta.json` (gitignored, regenerate on demand rather than trusting a stale copy).
Two separate procedures, not one combined delta — a single "atomic: 0 vs. twin: N" number would mix a
structural claim (inspecting the current tree) with a historical git-diff (a past port event), which
fails this paper's own construct-validity standard (§8.1: the same operator, applied the same way, to
both arms). **Structural check (symmetric, both arms):** the `.feature`/`step_definitions` files for
login+catalog+pizzaBuilder+checkout (atomic, 11 files) and for the twin (4 files) contain zero
`PLATFORM`/`DRIVER`-conditional code — the specification is identical across Playwright and Appium for
both arms. This is Corollary 1's actual claim, and it holds for both arms equally; note it is a
*structural* read of the shared step-definitions layer, not proof of live execution on every platform —
it does not by itself establish that the twin would port to iOS at zero cost, only that nothing in the
spec layer special-cases a platform. **Twin-only mobile-port cost (not symmetric, no atomic
equivalent — disclosed as such, not hidden):** of the four files touched getting the twin's **Android**
mobile leg green (`342d2e0`, `6561098` — iOS was never attempted for the twin, per §8.3), one survives, unchanged, into the
Appium-green state and HEAD — `checkout-nonatomic.route.ts`'s `seedAndReadCartFromDraft`, twin-only code
forced by the specification itself (mobile checkout deep-links with a real backend cart the twin had no
equivalent of) — **spec-forced, 1 file, 63 LOC, counted**. One is shared plugin-contract code relevant to
Appium specifically (`login.webdriver.locators.json`'s stale locator) — **plugin-gap, 1 file, 5 LOC,
excluded but disclosed**, per the mitigation policy above. Two are fixes made during the abandoned
Mobilewright attempt (`login.wright.locators.json`, `Type.ts`) — since Mobilewright is outside this
paper's tool scope entirely (§7.1) and neither fix was exercised again after the swap to Appium, these
are **out of scope, 2 files, 16 LOC, neither counted nor plugin-gap**. No atomic-arm number is reported
for this half of the measurement: the atomic suites' Android support predates this evaluation, at
unknown effort/circumstance parity, so a historical diff of those original commits would not be a
like-for-like comparison — reported in §9.4 as a labeled, non-comparable line item instead of a
fabricated zero.

**Note on the parallel-safety instrument's reframing (2026-08-23).** The first-ever dispatch of this
instrument, K=16 at `CUCUMBER_PARALLEL=4` (one of the four planned worker levels), returned a null
result: 16/16 scenarios, 240/240 steps, zero degradation, `retry:0` so the result is not retry-masked.
Root-caused by reading OmniPizza's backend source directly rather than inferring from behavior alone
(`backend/database.py:89-91`, `backend/routers/auth.py:60`): the application's three mutable stores are
keyed by UUID/`session_id`, minted fresh on every login regardless of account, and never by username —
there is no server-side shared mutable state keyed by account for the twin's R2 violation (shared
`standard_user`, no per-instance fixture) to collide against, at any worker count. The instrument's
causal target is therefore reframed from data-collision correctness to concurrent-traffic resilience —
the row above no longer predicts a failure-rate delta attributable to R2, only measures whether
concurrent same-account UI load degrades correctness or surfaces backend-capacity limits. This does not
call Corollary 2 (§5) into question in general — it remains a direct logical consequence of Rule 2's
disjoint-state requirement — only that this specific reference application cannot demonstrate it via
data collision. One further implication follows, disclosed here as a hypothesis this evaluation did not
directly test rather than a proven claim: given the absence of account-keyed backend state, the original
2026-07-13 rationale for `write-lock.hooks.ts`/`@writes-shared-state` (avoiding "the known race against
OmniPizza's shared `standard_user` account") was most likely protecting against backend-capacity/
rate-limiting under concurrent login bursts — independently documented twice this month, §10.1 — rather
than an application-level data race.

**Note on the execution-efficiency instrument (2026-08-25).** Requested after the atomic-web CI
dispatch's wall-clock was observed running far longer than the twin-web dispatch — a naive reading
would call that evidence atomic testing is slower, which the instrument below shows is not a valid
inference from that number. Design, rejected alternatives (whole-job wall-clock; an assembled "sum of
atomic scenarios" — impossible without either skipping an operation or double-paying a precondition, since
R1 forbids a single pizzaBuilder scenario that selects size, adds toppings, *and* confirms in one
behavior), and the full illustrative pass are in
`docs/superpowers/specs/2026-08-25-execution-efficiency-instrument-design.md`. Computed by
`scripts/experiments/execution-efficiency-delta.ts`
(`pnpm experiments:execution-efficiency-delta`), which reads `metrics/raw/cucumber-jsonl/*.jsonl` —
step-level, not `sendIntent`-level (`metrics/raw/tool-events/*.jsonl`, which
`scripts/metrics/aggregate-durations.ts` expects, is not populated by this campaign's uploaded
artifacts) — so this instrument measures **step-time**, disclosed as one level coarser than the
individual gRPC intents a step may issue, not wall-clock and not mechanism-time. Two comparandum pairs
only, both reaching an identical functional end state by a different mechanism in each arm with no R1
independence cost on either side ("logged in": atomic `LoginDao` Background step vs. twin's login-screen
UI molecule; "cart populated": atomic's checkout cart-injection step vs. twin's full catalog→builder UI
sequence) — a catalog/builder-click step pair, driven by UI in *both* arms, is kept only as a disclosed
negative control, and the atomic-only "builder is open" precondition step is excluded entirely because
it pays R1's independence cost, not R3's mechanism cost, and would misattribute the two. **Both legs now
cross the design doc's N≥10 evidence bar** — web (started from the already-completed parallel-safety `w1`
pair, then 10 dedicated repeats, N=11 atomic/N=176 twin as of 2026-08-27) and Android (10 usable dedicated
dispatches out of 13 attempted — repeats 001, 003-006, 008, 009, 011-013 — N=10 atomic/N=159 twin as of
2026-08-28; repeats 002, 007, and 010 excluded, not silently dropped, each for a distinct, investigated
reason — see below and §9.5) — see §9.5 for the current per-comparandum numbers. Ratios: web ≈3.4-4.7×
(logged in) / ≈2.3-3.5× (cart populated); Android ≈85-127× (logged in) / ≈78-90× (cart populated), stable
across the full N=2→N=10 accumulation; both legs' negative control stays near parity throughout (web
≈0.86×, Android ≈1.03-1.10×), as expected of an operation with no R3 substitution on either side. The
negative control's own ~3.1-3.3s-per-interaction baseline on Android (both arms) shows Android/Appium UI
automation is uniformly far more expensive than web regardless of arm, while the atomic side's API-call
cost stays roughly platform-invariant — so the much larger Android ratio is the same substitution effect
at a higher UI-cost baseline, not a different phenomenon. See §9.5 for the full tables. **Both legs are now
§9 results** — the atomic side is N=11 (web) / N=10 (Android) per comparandum as of 2026-08-28, meeting
§8.5's evidence policy bar for a reported number rather than just a directionally-consistent one.

### 8.5 Evidence policy (inherited from the framework's own norm)

Consistent with `docs/research/metrics-protocol.md` §9: no fabricated or estimated values. A metric
that cannot yet be computed (because the twin suites don't exist yet, or a given worker-count/run
count hasn't been executed) is reported as **not yet measured**, not as a placeholder number. Section
9 stays a skeleton until real runs exist.

---

## 9. Results

> TODO — §9.4 (portability) is fully populated as of 2026-08-23. §9.3 (determinism) is fully populated
> as of 2026-08-31 — the 120-dispatch campaign (`det-2026-campaign`) completed and its data has been
> through the full aggregate → `metrics:experiment` → reliability-metrics pipeline. §9.1 (parallel
> safety) has a full `w1-w8` sweep from the campaign orchestrator's 2026-08-24 smoke test, pending
> `aggregate-campaign-artifacts.ts` + `pnpm metrics:experiment` to turn it into a populated table. §9.2
> (diagnosability) remains blocked: the fault-injection harness is built (see working notes) but not
> yet wired into the campaign orchestrator. §9.5 (execution efficiency, added 2026-08-25) reached the
> N≥10 evidence bar on both platforms 2026-08-27/28. **No values are estimated or filled until real
> runs produce them.**

### 9.1 Parallel safety

**Partial — 1 of 4 planned worker levels dispatched.** The `worker=4` twin-only dispatch (§8.4's
reframing note): 16/16 scenarios, 240/240 steps, zero failures, `retry:0`. Per the reframe above, this
is evidence of backend resilience under concurrent same-account UI traffic, not evidence bearing on
Corollary 2's general claim — this application has no data-collision surface for that claim to be
tested against (§8.4). The twin is now dispatchable via CI (`ahm-execution-helix.yml`, closed
2026-08-23 — see the working notes above), one worker level at a time; the remaining worker levels
(1/2/8) and the atomic arm's own sweep are pending the campaign orchestrator (build-order step 5, not
yet built) to actually drive the full matrix rather than one-off manual dispatches.

| Workers | Atomic suite — failure rate | Non-atomic twin — failure rate |
|---|---|---|
| 1 | — | — |
| 2 | — | — |
| 4 | — | — |
| 8 | — | — |

### 9.2 Diagnosability (fault injection, one per failure bucket)

| Failure bucket | Injected in | Atomic — blast radius / localized correctly? | Non-atomic — blast radius / localized correctly? |
|---|---|---|---|
| `API_CONTRACT_FAILURE` | … | — | — |
| `API_RESPONSE_FAILURE` | … | — | — |
| `UI_ACTION_FAILURE` | … | — | — |
| `LOCATOR_RESOLUTION_FAILURE` | … | — | — |
| `VISUAL_DIFF_FAILURE` | … | — | — |
| `VISUAL_BASELINE_MISSING` | … | — | — |
| `PERFORMANCE_THRESHOLD_FAILURE` | … | — | — |
| `MOBILE_SESSION_FAILURE` | … | — | — |
| `WEB_SESSION_FAILURE` | … | — | — |
| `INFRASTRUCTURE_FAILURE` | … | — | — |
| `DATA_SETUP_FAILURE` | … | — | — |
| `ASSERTION_FAILURE` | … | — | — |
| `TIMEOUT_FAILURE` | … | — | — |
| `UNKNOWN_FAILURE` | … | — | — |

### 9.3 Determinism (pass↔fail transition rate across repeated runs)

**N=30 `run_index` values per arm per platform** (`experiment_batch_id=det-2026-campaign`, dispatched
sequentially by the campaign orchestrator, `scripts/experiments/run-campaign.ts` — 2026-08-29 to
2026-08-31, 120/120 dispatches completed, 0 flagged `likelyInfra`). Metrics below are at the
**scenario** level, not the dispatch level: each dispatch runs an entire suite, and "flaky" means one
tracked scenario's outcome changed at least once across the 30 repeats — a finer grain than "N of 30
dispatches had a failure" (e.g. the Android atomic row below: 6 of 30 *dispatches* had a failing
scenario, all traced to exactly 1 *scenario* that flipped state).

| Platform | Suite | Scenarios tracked | Flaky scenarios | Pass→Fail transitions | Fail→Pass transitions |
|---|---|---|---|---|---|
| Web | Atomic | 89 | 0 (0%) | 0/2,581 (0%) | — (no Fail state observed) |
| Web | Non-atomic twin | 16 | 0 (0%) | 0/464 (0%) | — (no Fail state observed) |
| Android | Atomic | 98 | 1 (1.0%) | 5/2,836 (0.18%) | 5/6 (83%) |
| Android | Non-atomic twin | 16 | 16 (100%) | 23/441 (5.2%) | 23/23 (100%) |

**Web: a null result for both arms.** Zero scenarios in either suite changed outcome across 30 repeats.
This leg cannot support or refute the determinism corollary with the current dataset — reported plainly
as inconclusive rather than reached for.

**Android: the predicted direction, at a large and consistent magnitude.** The twin's pass→fail
transition rate (5.2%) is approximately **29×** the atomic suite's (0.18%), and *every one* of the
twin's 16 tracked scenarios flipped state at least once, against 1 of the atomic suite's 98 — a
~98× difference in how much of each suite's own scenario population shows any instability at all.
Both arms' real failures are dominated by the same `LOCATOR_RESOLUTION_FAILURE` bucket (100% of the
atomic suite's 6 failing observations; 21/23, 91%, of the twin's) on Android/Appium UI interactions —
this class of platform-level timing sensitivity is not unique to the twin; it is the same failure mode
already documented and partially mitigated elsewhere in this project (the `chaos-proxy.ts`
transient-retry widening, see project history). What differs sharply between arms is *blast radius*:
the atomic suite's R1/R2 isolation confines this risk to whichever single scenario happens to touch the
affected interaction (here, one topping-selection assertion, hit on 6 of 30 repeats); the twin's long,
cross-domain, R2-violating journey chains the same class of interaction through login, catalog,
size/topping selection, delivery, and order confirmation in every one of its 16 concurrent instances —
so the identical underlying timing risk gets many more opportunities per run to flip *some* instance's
outcome. This reads as direct support for the §8.4 mechanism: non-atomicity does not invent a new
defect class here, it propagates an existing one across a much larger share of the suite. As a single
campaign on one application, the ~29× ratio itself should not be read as a value expected to generalize
beyond this dataset — the *direction* and the *blast-radius* mechanism are the claims this result
supports.

*(Read as a conservative/lower-bound delta — see §8.4: TOM's chaos suppression is identical in both
arms and still partially absorbs transient noise before it reaches this transition count.)*

### 9.4 Portability (cost to add a second platform)

Two separate measurements — see §8.4's "Note on the portability instrument's measurement" for why they
are not combined into one delta. Computed by `pnpm experiments:portability-delta`
(`reports/portability-delta.json`).

**Structural check** — `.feature`/`step_definitions` files containing `PLATFORM`/`DRIVER`-conditional
code, out of files scanned:

| Suite | Platform-conditional files | Files scanned |
|---|---|---|
| Atomic (login+catalog+pizzaBuilder+checkout) | 0 | 11 |
| Non-atomic twin | 0 | 4 |

**Twin-only mobile-port cost** — no atomic-arm equivalent (see note above for why):

| Classification | Files | LOC changed | Counted in delta? |
|---|---|---|---|
| Spec-forced (`checkout-nonatomic.route.ts`) | 1 | 63 | Yes |
| Plugin-gap, Appium-relevant (`login.webdriver.locators.json`) | 1 | 5 | No — disclosed |
| Out-of-scope, Mobilewright (`login.wright.locators.json`, `Type.ts`) | 2 | 16 | No — out of §7.1 tool scope |

### 9.5 Execution efficiency (ancillary R3 measurement)

> **Both legs reach the N≥10 threshold — web 2026-08-27, Android 2026-08-28.** See §8.4's note and
> `docs/superpowers/specs/2026-08-25-execution-efficiency-instrument-design.md` for the full design and
> the rejected alternatives. Web: the `w1` pair (atomic-web GH run `32768226121`, twin-web GH run
> `32793108181`) plus 10 dedicated repeats dispatched 2026-08-27 (`pnpm experiments:run-campaign --
> --instrument efficiency --platform-leg web --repeats 10`) — N=11 atomic, N=176 twin. Android: 10 usable
> dedicated dispatches out of 13 attempted, dispatched across 2026-08-26 through 2026-08-28
> (`pnpm experiments:run-campaign -- --instrument efficiency --platform-leg android --repeats 13`) —
> repeats 001, 003, 004, 005, 006, 008, 009, 011, 012, 013 usable, N=10 atomic, N=159 twin. Both legs: the
> twin side gets a larger effective N "for free" from its K identical Outline rows within each run.
>
> **Three Android repeats are excluded, not silently dropped — each for a distinct, investigated reason:**
> **Repeat 2** (2026-08-26, GH runs `33128635991`/`33130393523`) coincided with a first attempt at fixing
> the twin-android "add toppings" race (commit `6a49706`) that turned out to be itself a regression — every
> topping-touching scenario failed deterministically that run (see §8.4's note and the design doc for the
> full story; reverted in `df0c637`). **Repeat 7** (2026-08-28, atomic GH run `33186973238`) failed 2/89
> scenarios on the atomic side — "Opening a pizza card launches the builder" (a catalog-open click,
> unrelated to the topping-click mechanism above) and a toppings-total assertion whose own click had
> already succeeded — confirmed via job logs as isolated Appium flakiness, not a reintroduction of the
> topping-click regression (neither the failure count nor the specific step/error text matches that
> pattern). **Repeat 10** (2026-08-28, twin GH run `33213511299`) failed before any scenario ran at all:
> `curl: (35) Recv failure: Connection reset by peer` downloading the Android APK from the release asset in
> the "Download Android app artifact" step, confirmed via `gh run view 33213511299 --log-failed` — pure CI
> network infrastructure, unrelated to app or test logic. In every case the extractor correctly refused the
> pair (the queried scenario had no valid PASS row) rather than average in failed-run data.

**Web — N=11 atomic / N=176 twin, the design doc's N≥10 threshold reached 2026-08-27.** Reported with
spread, not just a point estimate, per §8.5's evidence policy now that N is adequate on this leg:

| Comparandum | Atomic mean ± sd (range) | Twin mean ± sd (range) | Ratio (twin/atomic) |
|---|---|---|---|
| Reach "logged in" | 87 ± 15ms (57-109) | 386 ± 295ms (193-2,267) | ≈4.4× |
| Reach "cart populated" | 244 ± 97ms (123-413) | 750 ± 207ms (455-1,501) | ≈3.1× |
| *(negative control)* catalog-click → builder rendered — UI-driven in both arms, no R3 substitution | 77 ± 10ms (58-90) | 66 ± 18ms (30-180) | ≈0.86× (near parity, as expected) |

The twin's wide login range (up to 2,267ms on one row) is consistent with occasional Render free-tier
cold-start latency already documented elsewhere in this evaluation — not excluded, since it's a real cost
the UI-driven path pays that the API-injected path structurally doesn't.

**Android — N=10 atomic / N=159 twin, the design doc's N≥10 threshold reached 2026-08-28.** Reported with
spread, not just a point estimate, per §8.5's evidence policy now that N is adequate on this leg:

| Comparandum | Atomic mean ± sd (range) | Twin mean ± sd (range) | Ratio (twin/atomic) |
|---|---|---|---|
| Reach "logged in" | 137 ± 76ms (52-280) | 12,929 ± 5,526ms (10,122-50,396) | ≈94.7× |
| Reach "cart populated" | 286 ± 86ms (130-415) | 25,854 ± 8,871ms (18,737-82,947) | ≈90.3× |
| *(negative control)* catalog-click → builder rendered — UI-driven in both arms, no R3 substitution | 3,135 ± 199ms (2,700-3,384) | 3,266 ± 384ms (2,684-5,627) | ≈1.04× (near parity, as expected) |

Ratios are stable across the growing N on both legs (web: 3.4-4.7× logged-in, 2.3-3.5× cart-populated
across all 11 atomic samples; Android: 85-127× logged-in, 78-90× cart-populated across all 10 usable
atomic samples spanning repeats 001-013) — directionally consistent with the earlier illustrative pass,
not an artifact of a small N.

The negative control's own baseline (~3.1-3.3s per Android UI interaction, both arms) shows Appium/mobile
automation is uniformly far more expensive than Playwright/web *regardless of arm* — the atomic side's
own API-call cost is nearly platform-invariant (137ms/286ms Android vs. 87ms/244ms web, consistent with
hitting the same backend either way), so the much larger Android ratio isn't "Android is slow" noise; it
is what the same UI-vs-injection substitution looks like when the UI side's per-step cost is an order of
magnitude higher. Directionally sharper evidence for the same corollary, on the platform where R3's
UI-avoidance matters most in absolute terms — now backed by the same N≥10 evidence bar as web.

---

## 10. Discussion

### 10.1 Threats to validity

> TODO — likely candidates: single reference application (OmniPizza) as the only subject system;
> author-authored reference implementation (potential confirmation bias); metrics measure the
> architecture, not independent replications by third parties yet.

- **Tool-immaturity attribution (portability instrument).** See §8.4's dedicated note: a gap or defect
  in the mobile plugin's action coverage or reliability could inflate the twin's measured porting cost
  for reasons unrelated to atomicity — realized during this evaluation itself, when the originally-
  designated Mobilewright plugin proved unreliable on a two-picker interaction sequence and was swapped
  for Appium (§7.1). Mitigated by excluding plugin-gap-forced changes from the reported delta and
  disclosing them separately, but this requires active bookkeeping during construction, not a
  one-time check.
- **Browser-engine flakiness contaminating the determinism instrument** if cross-browser results were
  ever folded into it. Mitigated structurally, not just by disclosure: the primary causal instruments
  (§8.4) hold the browser constant at Chromium; cross-browser is a separate, secondary check (§10.2)
  and its results are never merged into the primary determinism/parallel-safety/diagnosability numbers.
- **Backend-load asymmetry contaminating the determinism instrument (found 2026-08-23, not yet
  mitigated in tooling).** The twin's precondition is a real UI login plus UI cart-building on every
  journey row; the atomic arm's precondition is a single API `$S_0$` call. Both arms hit the same
  shared backend, but the twin issues materially more requests per run to do it. This project has
  independently documented, twice in the same month and outside this evaluation, that concurrent CI
  load against the reference application's backend produces mid-run 502/503/429 responses, and that
  job-start staggering does not prevent mid-run collisions once a run is underway (`ci(helix)` commits
  `7c2079c`/`b9a3151`, and the ZAP Path Traversal false-positive investigation that reproduced the same
  load-correlated pattern). If this recurs during the 120-dispatch determinism campaign (§8.4), it would
  raise the twin's measured pass↔fail transition rate for a backend-capacity reason, not a method
  reason — a direct threat to the instrument that carries the paper's central causal claim. The backend
  hosting plan was since upgraded from Render's free tier (verified via a subsequent all-33-jobs-green
  `platform=all` run, `32614000923`), which raises the load threshold before this triggers but does not
  remove the structural asymmetry itself — the twin still issues materially more requests per run than
  the atomic arm, so the confound is dormant, not resolved, and could resurface at the determinism
  campaign's actual concurrency (multiple simultaneous `workflow_dispatch` calls, a heavier load shape
  than any single `platform=all` run). Not yet mitigated: the campaign orchestrator that would enforce a
  concurrency cap and a disclosed `INFRASTRUCTURE_FAILURE`-bucket exclusion/flagging rule for this
  instrument specifically (mirroring the existing plugin-gap bookkeeping policy for the portability
  instrument, §8.4) has not been built. Tracked as an open working-note (top of document) until the
  orchestrator design closes it.
- **Reference application has no natural parallel-safety collision surface (found 2026-08-23, reframed
  not mitigated).** OmniPizza's `InMemoryDB` has zero mutable state keyed by username — confirmed by
  reading `backend/database.py` and `backend/routers/auth.py` directly (see §8.4's reframing note for
  the exact locations: `database.py:89-91`, `auth.py:60`). This means the parallel-safety instrument
  (§8.4/§9.1) cannot empirically discriminate Corollary 2 via data-collision on this specific reference
  application, at any worker count — a limitation of this dataset's applicability to that corollary, not
  a refutation of the corollary itself, which remains a general logical consequence of Rule 2's
  disjoint-state requirement (§5). Also disclosed, hedged as noted-not-proven since it was not directly
  tested: this reframes the likely original motivation for `write-lock.hooks.ts` as probable
  backend-capacity protection rather than a correctness requirement in this application.

### 10.2 Limitations

> TODO — known, honest gaps to disclose rather than hide:
> - Security is an implemented cross-cutting contract (since `5330693`, 2026-07-16 — ZAP web +
>   MobSF mobile, contract-shaped on `login` and infra-shaped in `support/`) but is a deliberate scope
>   exclusion from this paper's evaluation, not an unbuilt one — §7.1 fixes the tool scope to
>   Playwright/Appium/API, and security's DAST-style checks don't map onto any of the four §8.4
>   causal instruments as designed. Excluded from §9 results by scope, not by non-existence or
>   oversight.
> - Load/stress performance data conflation on same-day runs is a known, accepted limitation of the
>   current dataset.
> - **Cross-browser generalization is secondary, not primary.** Whether the atomic-vs-twin delta
>   replicates across Firefox and WebKit (in addition to the Chromium-only primary instruments) is
>   reported, if at all, as a bounded robustness check reusing the existing `pnpm test:all-browsers`
>   orchestration — not as a repetition of the full §8.4 instrument suite. Scope was deliberately kept
>   narrow here: browser engine is not the paper's causal variable, and a full browser × atomic/twin ×
>   worker-count × repeated-run × mobile matrix would multiply experiment cost without testing a new
>   hypothesis.

---

## 11. Conclusion and Future Work

> TODO.

---

## References

Adzic, G. (2011). *Specification by Example: How Successful Teams Deliver the Right Software*. Manning
Publications. ISBN 978-1-61729-008-4.

Barr, E. T., Harman, M., McMinn, P., Shahbaz, M., & Yoo, S. (2015). The Oracle Problem in Software
Testing: A Survey. *IEEE Transactions on Software Engineering*, 41(5), 507–525.
https://doi.org/10.1109/TSE.2014.2372785

Bell, J., Legunsen, O., Hilton, M., Eloussi, L., Yung, T., & Marinov, D. (2018). DeFlaker: Automatically
Detecting Flaky Tests. In *Proceedings of the 40th International Conference on Software Engineering
(ICSE 2018)*, pp. 433–444, Gothenburg, Sweden. https://doi.org/10.1145/3180155.3180164

Binamungu, L. P., Embury, S. M., & Konstantinou, N. (2020). Characterising the Quality of Behaviour
Driven Development Specifications. In *Agile Processes in Software Engineering and Extreme Programming
(XP 2020)*, Lecture Notes in Business Information Processing, vol. 383, Springer, Cham.
https://doi.org/10.1007/978-3-030-49392-9_6

Broy, M., Jonsson, B., Katoen, J.-P., Leucker, M., & Pretschner, A. (Eds.). (2005). *Model-Based Testing
of Reactive Systems: Advanced Lectures*. Lecture Notes in Computer Science, vol. 3472, Springer, Berlin,
Heidelberg. https://doi.org/10.1007/b137241

Chen, T. Y., Cheung, S. C., & Yiu, S. M. (1998). Metamorphic Testing: A New Approach for Generating Next
Test Cases. Technical Report HKUST-CS98-01, Department of Computer Science, Hong Kong University of
Science and Technology. Self-archived as arXiv:2002.12543 [cs.SE].

Chen, T. Y., Kuo, F.-C., Liu, H., Poon, P.-L., Towey, D., Tse, T. H., & Zhou, Z. Q. (2018). Metamorphic
Testing: A Review of Challenges and Opportunities. *ACM Computing Surveys*, 51(1), Article 4, 1–27.
https://doi.org/10.1145/3143561

Cohn, M. (2009). *Succeeding with Agile: Software Development Using Scrum*. Addison-Wesley Professional
(Addison-Wesley Signature Series). ISBN 978-0-321-57936-2.

DeMillo, R. A., Lipton, R. J., & Sayward, F. G. (1978). Hints on Test Data Selection: Help for the
Practicing Programmer. *Computer (IEEE)*, 11(4), 34–41. https://doi.org/10.1109/C-M.1978.218136

Dick, J., & Faivre, A. (1993). Automating the Generation and Sequencing of Test Cases from Model-Based
Specifications. In *FME '93: Industrial-Strength Formal Methods*, Lecture Notes in Computer Science,
vol. 670, pp. 268–284. https://doi.org/10.1007/BFb0024651

Dodds, K. C. (2019). Write tests. Not too many. Mostly integration. kentcdodds.com.
https://kentcdodds.com/blog/write-tests

Eck, M., Palomba, F., Castelluccio, M., & Bacchelli, A. (2019). Understanding Flaky Tests: The
Developer's Perspective. In *Proceedings of the 2019 27th ACM Joint Meeting on European Software
Engineering Conference and Symposium on the Foundations of Software Engineering (ESEC/FSE 2019)*,
pp. 830–840, Tallinn, Estonia. https://doi.org/10.1145/3338906.3338945

Fowler, M. (2012). TestPyramid. martinfowler.com (bliki). https://martinfowler.com/bliki/TestPyramid.html

Jia, Y., & Harman, M. (2011). An Analysis and Survey of the Development of Mutation Testing. *IEEE
Transactions on Software Engineering*, 37(5), 649–678. https://doi.org/10.1109/TSE.2010.62

Lam, W., Oei, R., Shi, A., Marinov, D., & Xie, T. (2019). iDFlakies: A Framework for Detecting and
Partially Classifying Flaky Tests. In *2019 IEEE 12th International Conference on Software Testing,
Verification and Validation (ICST 2019)*, pp. 312–322, Xi'an, China.
https://doi.org/10.1109/ICST.2019.00038

Luo, Q., Hariri, F., Eloussi, L., & Marinov, D. (2014). An Empirical Analysis of Flaky Tests. In
*Proceedings of the 22nd ACM SIGSOFT International Symposium on Foundations of Software Engineering
(FSE 2014)*, pp. 643–653, Hong Kong, China. https://doi.org/10.1145/2635868.2635920

Meszaros, G. (2007). *xUnit Test Patterns: Refactoring Test Code*. Addison-Wesley Professional
(Addison-Wesley Signature Series). ISBN 978-0-13-149505-0.

Micco, J. (2016). Flaky Tests at Google and How We Mitigate Them. Google Testing Blog.
https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html

North, D. (2006). Introducing BDD. *Better Software* magazine; self-hosted at dannorth.net.
https://dannorth.net/blog/introducing-bdd/

Papadakis, M., Kintis, M., Zhang, J., Jia, Y., Le Traon, Y., & Harman, M. (2019). Mutation Testing
Advances: An Analysis and Survey. *Advances in Computers*, 112, 275–378.
https://doi.org/10.1016/bs.adcom.2018.03.015

Parry, O., Kapfhammer, G. M., Hilton, M., & McMinn, P. (2022). A Survey of Flaky Tests. *ACM
Transactions on Software Engineering and Methodology*, 31(1), Article 17, 1–50.
https://doi.org/10.1145/3476105

Schaffer, A., & Dybeck, R. (2018). Testing of Microservices. Spotify Engineering.
https://engineering.atspotify.com/2018/01/testing-of-microservices

Segura, S., Fraser, G., Sánchez, A. B., & Ruiz-Cortés, A. (2016). A Survey on Metamorphic Testing. *IEEE
Transactions on Software Engineering*, 42(9), 805–824. https://doi.org/10.1109/TSE.2016.2532875

Utting, M., & Legeard, B. (2007). *Practical Model-Based Testing: A Tools Approach*. Morgan Kaufmann.
ISBN 978-0-12-372501-1.

Utting, M., Pretschner, A., & Legeard, B. (2012). A Taxonomy of Model-Based Testing Approaches.
*Software Testing, Verification and Reliability*, 22(5), 297–312. https://doi.org/10.1002/stvr.456

Winters, T., Manshreck, T., & Wright, H. (Eds.). (2020). *Software Engineering at Google: Lessons
Learned from Programming Over Time*. O'Reilly Media. Chapter 11, "Testing Overview," written by
A. Bender. ISBN 978-1-492-08279-8.

Wohlin, C., Runeson, P., Höst, M., Ohlsson, M. C., Regnell, B., & Wesslén, A. (2012). *Experimentation
in Software Engineering*. Springer, Berlin, Heidelberg. https://doi.org/10.1007/978-3-642-29044-2

> **27 citations total** (15 verified 2026-08-23 morning + 12 verified 2026-08-23, same day, in a
> second expansion pass requested by the author — "vamos por lo menos con 25 referencias"). All 27
> were independently verified (real DOI/arXiv/URL/ISBN fetched or cross-checked against
> publisher/institutional-repo records — not assumed from title plausibility) — see the working notes'
> Related Work entry. Citation style (inline `[Author, Year]`) may need reformatting once the target
> venue is known.

---

## Appendix A — Notation

| Symbol | Meaning |
|---|---|
| $t$ | A test (scenario) |
| $T$ | A test suite, $T = \{t_1, \dots, t_n\}$ |
| $S_t$ | The state set owned by test $t$ |
| $O_t$ | The oracle (single observable outcome) of test $t$ |
| $S_0(t)$ | The state-injection function establishing $t$'s preconditions |
| $\lambda$ | Lyapunov exponent characterizing the system's transient-failure dynamics; $\lambda < 0$ required |
| $P$ | An execution platform/surface (web, mobile, API, load, …) |

## Appendix B — Glossary

> TODO — define AHM, TOM, intent, molecule/organism/eco-system terminology, chaos suppression, and any
> other term introduced informally in the body, for readers unfamiliar with the reference
> implementation's vocabulary.
