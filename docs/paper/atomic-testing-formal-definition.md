# A Formal Definition of Atomic Testing for Deterministic Software Validation

---

## Abstract

Automated test suites function as CI's correctness gate, yet flaky tests and ambiguous failure
diagnosis persist despite established test-granularity heuristics. No existing definition states test
well-formedness as a checkable, per-scenario predicate over state disjointness, precondition injection,
and deterministic outcome. This paper formalizes Definition 1 — an atomic test satisfying single-oracle,
disjoint-state, API-injected-precondition, and deterministic-outcome rules — and instantiates it in the
Atomic Helix Model, a microkernel-based reference architecture. The definition is evaluated against a
mechanically-derived non-atomic twin suite across parallel-safety, diagnosability, determinism, and
portability instruments. Diagnosability results show atomic scenarios confine an injected fault's blast
radius to roughly 11% of a scenario's steps, versus 76% in the non-atomic twin. On Android, the twin's
pass-to-fail transition rate reaches 5.2% against the atomic suite's 0.18% — a 29-fold divergence
dominated by a shared locator-resolution failure mode. Platform-invariance checks find zero
platform-conditional branches in either suite. Parallel-safety testing returns a null result: the
reference application's backend carries no account-keyed mutable state for the twin's shared-state
violation to collide against. These findings indicate that scenario-level state disjointness can
substitute constructive, authoring-time guarantees for after-the-fact flaky-test triage, independent of
the underlying execution architecture. Parallel safety remains a derivation-supported, empirically open
corollary, motivating replication on a reference application with genuine account-keyed write
contention.

**Keywords:** atomic testing, test isolation, precondition injection, state disjointness, flaky tests,
diagnosability, determinism, cross-platform test automation, microkernel architecture

---

## 1. Introduction

Automated Atomic Testing, the approach this paper defines, is a set of authoring principles (Definition
1, §2.3) that a test either satisfies or does not; it makes no commitment to any specific execution
architecture. The Atomic Helix Model (AHM) is a separate, specific reference model — one
architecture-level instantiation of the approach, adding a layer composition, set-theoretic grounding,
π-calculus message passing, and chaos suppression (§2.5). AHM demonstrates that the approach is
realizable and mechanically enforceable; it is evidence for the approach rather than a synonym for it,
and other, non-AHM instantiations remain possible in principle. The microkernel execution architecture
underneath AHM — the Test-Oriented Microkernel (TOM) — is documented as a separate contribution in a
companion paper and its reference repository (Test-Oriented-Microkernel-Architecture-TS), and is
treated here as a given rather than re-derived.

This paper's experiments (§3.1–§4) are scoped to three of AHM's supported surfaces: Playwright for web
(desktop and responsive viewports), Appium for mobile (Android and iOS), and API as the surface that
operationalizes Rule 3's precondition injection and anchors the atomicity argument. Appium replaced
Mobilewright, this evaluation's original mobile instrument, after Mobilewright surfaced a reproducible
instrument defect during the evaluation itself (§3.1.1). Gatling (performance) and Pixelmatch (visual)
are part of the full AHM reference implementation but fall outside this paper's evaluation scope.

### 1.1 Motivation

Automated test suites are the primary correctness signal software teams rely on before merging code
and before deploying to production, and continuous-integration pipelines increasingly treat a passing
suite as a precondition for either. That reliance assumes the signal itself is trustworthy: a passing
suite means the behavior it checks actually works, and a failing suite points reliably at what broke.
In practice, that assumption is under continuing strain. Flaky tests — tests that pass and fail on the
same code without a code change to explain the difference — are a persistent, measured cost at scale;
Micco's account of Google's own test infrastructure [1] reports roughly 1.5% of all test runs
exhibiting some flaky result, a rate large enough to motivate dedicated detection and mitigation tooling
rather than being dismissed as noise. The response the field has developed is correspondingly large:
granularity heuristics that prescribe how much testing to do at each layer of a suite — the Test
Pyramid [2], [3], the Testing Trophy, the Testing Honeycomb — and a substantial
diagnostic literature that detects, classifies, and triages flakiness once it has already appeared.

None of that machinery specifies what makes a single test case well-formed. Granularity heuristics
answer a proportion question — how many unit versus integration versus end-to-end tests a suite should
contain — not a predicate that can be checked against any individual scenario; a suite can follow a
heuristic's proportions exactly and still contain scenarios that share mutable state, rebuild
preconditions by driving the same UI surface under test, assert more than one behavior at once, or
treat non-determinism as unavoidable noise rather than a defect to be separated from genuine failure.
Existing fixture-management and size-based taxonomies come closer without closing the gap: a fixture
catalogue can name isolation as one legitimate strategy among several rather than an obligation, and a
resource-based size taxonomy can bound what a test touches without bounding how its state relates to
every other test's. What none of these approaches supplies is a single, checkable predicate over
exactly that relationship — the state, precondition, and outcome properties one scenario must hold
relative to every other scenario in its suite — stated in advance of a suite existing, rather than
inferred afterward from which tests happened to fail together.

### 1.2 Contributions

This paper states that predicate directly. §2.3 gives a formal, tool-agnostic definition of an atomic
test as a scenario satisfying four rules — a single oracle, disjoint state from every other scenario,
preconditions injected independently of the interface under test, and a deterministic outcome — each
rule targeting exactly one of the patterns identified above. §2.4 derives three properties that follow
mechanically once a suite is composed entirely of atomic tests, without requiring separate engineering
effort: platform invariance, parallel safety, and deterministic diagnosis. §2.5 shows the definition
composing into a full test architecture, the Atomic Helix Model, as evidence the four rules are
mechanically enforceable rather than a stylistic recommendation a suite may or may not follow. §3.1–§3.2
evaluate that reference implementation against a mechanically-derived non-atomic twin of the same suite,
measuring — rather than assuming — where the predicted properties hold on one reference application and
where the evaluation's own dataset leaves a corollary open. The definition is deliberately narrow: it
constrains how a scenario relates to every other scenario in its suite, not how the scenario is
generated, which layer of a pyramid, trophy, or honeycomb it occupies, or which tool executes it — the
same narrowness that lets it compose with, rather than compete against, the granularity heuristics and
diagnostic literature the field already has.

### 1.3 Paper structure

The remainder of this paper is organized as follows. §2 situates atomic testing against six adjacent
bodies of literature (§2.1), states the gap those bodies leave open (§2.2), and closes it with a formal
definition of an atomic test as a four-rule predicate (§2.3), three corollaries that follow from that
definition without additional engineering effort (§2.4), and a reference architecture — the Atomic
Helix Model — that composes the definition into a full test-authoring system (§2.5). §3 describes the
reference implementation that instantiates AHM (§3.1) and the comparative, causal evaluation
methodology used to test the corollaries against a mechanically-derived non-atomic twin of the same
suite (§3.2). §4 reports the resulting measurements — parallel safety, diagnosability, determinism,
portability, and execution efficiency — without interpretation. §5 discusses what those measurements
support and do not support, situates them against the related work of §2.1, and discloses the
evaluation's threats to validity and limitations. §6 closes with the paper's forward-looking
contribution. Appendix A collects the replication tooling, scripts, and provenance identifiers referenced
throughout §3–§5, so that the main narrative can state findings without carrying command-line invocations
and raw identifiers inline.

---

## 2. Theoretical Framework

### 2.1 Related Work

This section situates atomic testing, as formalized in this paper, against six adjacent bodies of
work. None of them define atomicity as a per-scenario predicate over state disjointness, precondition
injection, and outcome determinism; each addresses a related but distinct concern, and the contrast is
made explicit in each subsection below. Microkernel/plugin-based test execution architecture is out of
scope here; it is documented separately in the companion Test-Oriented Microkernel paper referenced in
§1.

#### 2.1.1 Granularity Heuristics

The Test Pyramid [2], [3], the Testing Trophy [4], and the Testing Honeycomb
[5] are the three most widely cited heuristics for shaping a test suite's
composition. Cohn's pyramid recommends a large base of unit tests, a thinner layer of service tests, and
a still thinner layer of UI tests, in that decreasing order of quantity as tests move up in cost and
fragility. Fowler's later bliki entry restates the same shape — many fast, low-level unit tests; fewer,
coarser-grained service/integration tests; and a minimal number of slow, brittle end-to-end UI tests at
the top — and is cited alongside Cohn's earlier formulation because the two are commonly treated as
jointly defining the pyramid metaphor in practitioner discourse. Dodds's trophy shifts the weight of that recommendation
toward integration tests, adding a static-analysis layer beneath unit tests. Schaffer and Dybeck's
honeycomb, developed for Spotify's microservice architecture, inverts the pyramid's proportions again,
favoring integration tests over unit tests when service boundaries are the primary source of risk.

All three are heuristics about the *proportion of tests across layers* — how many unit versus
integration versus end-to-end tests a suite should contain; none of them specifies what makes an
individual test case well-formed. A more recent line of practitioner literature, Winters, Manshreck, and
Wright's *Software Engineering at Google* [6] (the testing chapter written by Bender), introduces a
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

#### 2.1.2 Test Isolation and Flaky Tests

Luo et al. [7] established the empirical baseline for this literature with a study of 201 commits
fixing flaky tests across 51 open-source projects, producing a taxonomy of root causes that includes
asynchronous waits, concurrency, and test-order dependency. Eck, Palomba, Castelluccio, and Bacchelli [8] complement that root-cause taxonomy with the developer's perspective, surveying and interviewing
practicing engineers to characterize how flaky tests are actually triaged and diagnosed once they appear
— root cause and triage are different questions, and Luo et al.'s taxonomy answers only the first. Lam et al.'s iDFlakies [9] built an automated framework that isolates one of those categories —
order-dependent (OD) versus non-order-dependent (NOD) flakiness — by randomizing test execution order
across 422 flaky tests. Bell et al.'s DeFlaker [10] takes a complementary, rerun-free approach, flagging
a newly failing test as flaky when its failure correlates with code outside the latest change's coverage,
reporting 95.5% recall without the cost of repeated executions. Parry, Kapfhammer, Hilton, and McMinn's more recent survey [11] synthesizes this and subsequent work into a single taxonomy of causes, detection
techniques, and mitigations, giving an up-to-date map of the field against which the four narrower,
earlier studies above can be situated.

The scale of the underlying problem is not merely academic: Micco's account of Google's test infrastructure [1] reports that roughly 1.5% of all test runs exhibit some flaky result, grounding this
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

#### 2.1.3 Model-Based and Specification-Driven Testing

Utting, Pretschner, and Legeard [12] provide the standard taxonomy of model-based testing (MBT),
classifying approaches by the characteristics of the model used, the strategy for generating test cases
from it, and the traceability maintained between model and tests. Utting and Legeard's earlier, practitioner-oriented book [13] grounds that taxonomy's abstract categories in concrete workflow: model
notations, test-selection criteria, and the generation and execution tooling needed to run an MBT pipeline
end-to-end — a level of tooling detail the 2012 taxonomy paper does not itself provide, and one that
parallels this paper's own contract-driven, tool-generated approach to scenario execution. Broy, Jonsson, Katoen, Leucker, and Pretschner's edited volume [14] extends the MBT picture to reactive systems
specifically, collecting foundational treatments of finite-state-machine and labeled-transition-system
test generation for systems whose behavior is driven by ongoing external events — the same reactive,
event-driven shape as the UI and API flows this framework automates, and further grounds (alongside Dick
and Faivre, below) for treating state-machine-derived test generation as an established methodology this
paper's Gherkin scenarios are compatible with, even though they are not themselves machine-generated.
Dick and Faivre [15] offer an early, concrete instance of specification-driven generation: they reduce a
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

#### 2.1.4 Metamorphic Testing

Chen, Cheung, and Yiu [16] introduced metamorphic testing to address the oracle problem: when no single
expected output is available to check a test against, a metamorphic relation instead relates the outputs
of multiple, related executions to one another. Barr, Harman, McMinn, Shahbaz, and Yoo's survey of the oracle problem itself [17] frames the broader landscape metamorphic testing is one response to: it
catalogues the general strategies the field has developed for determining pass/fail outcomes — specified,
derived, and implicit oracles, alongside metamorphic relations — and situates metamorphic testing as the
strategy of choice specifically when no other oracle is derivable from the specification or the system
itself. Segura et al.'s survey [18] formalizes the metamorphic-testing mechanism as the field matured,
characterizing metamorphic relations as constraints over sets of test-case outputs and cataloguing the
domains in which they have been applied where full oracles are infeasible. Chen, Kuo, Liu, Poon, Towey, Tse, and Zhou's later, broader review [19] extends that survey with subsequent developments in relation
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

#### 2.1.5 BDD/Gherkin as a Specification Language

Dan North's original article [20] coined behaviour-driven development and introduced the
Given/When/Then structure this paper's scenarios are written in, reframing testing vocabulary around
"behaviour" rather than "test." Adzic's *Specification by Example* [21] extends that reframing from
vocabulary into practice, formalizing "living documentation" — executable examples maintained as the
single source of truth shared between business stakeholders and developers — as the mechanism by which
BDD-style specifications stay synchronized with the system they describe; this paper's treatment of each
Gherkin scenario as an executable, API-verifiable contract for a single behavior draws directly on that
living-documentation framing. Binamungu, Embury, and Konstantinou [22] surveyed 56 industrial BDD
practitioners to derive and validate four quality principles for Gherkin specifications: step reuse,
conservation of domain vocabulary, elimination of technical vocabulary, and a consistent level of
abstraction within a scenario.

This paper adopts Gherkin per North's original vocabulary and Adzic's living-documentation practice as its
specification language, but layers an additional execution-semantics constraint on top of the
specification-quality guidance all three citations provide. Neither North's original article nor BDD
practice generally prohibits a `Given` step from being driven through the UI or from sharing long-lived
fixtures across a suite — North's own worked example uses abstract, mock-based preconditions and does not
address either question directly, and Adzic's living-documentation practice is similarly silent on where a
`Given` step's state comes from, so long as the example stays synchronized with the system. Binamungu et
al.'s four principles target the readability and
maintainability of the Gherkin *text* — they say nothing about what state a `Given` step may touch or
whether that state may be shared across scenarios; their "step reuse" principle concerns reusing step
*definitions*, which this paper's design is fully compatible with. What this paper departs from typical
BDD practice on, and what none of the three citations addresses, is two specific execution-semantics
constraints: preconditions are injected exclusively through API DAOs rather than the UI, and state is
required to be disjoint per scenario rather than shared. The departure is additive — a constraint on top
of existing specification-quality work — not a rejection of it.

#### 2.1.6 Test Fixture and Isolation Patterns

Meszaros's *xUnit Test Patterns* [23] is the canonical catalogue of fixture-management patterns for the
xUnit family of test frameworks, and its Fresh Fixture pattern — each test constructs its own private
fixture rather than reusing or sharing one — is the direct design-pattern precedent for this paper's
requirement that every scenario's state be disjoint from every other scenario's. Meszaros treats Fresh
Fixture as one legitimate choice among several named alternatives (Shared Fixture, Prebuilt Fixture, Lazy
Setup, and others), each with documented trade-offs between isolation and setup cost; the catalogue is
deliberately permissive, offering a vocabulary for choosing a fixture strategy rather than a predicate a
given scenario must satisfy. Atomicity narrows that choice into an obligation: it requires
Fresh-Fixture-equivalent disjointness of every scenario's state as a well-formedness condition, not merely
as one option among several, and adds two clauses xUnit Test Patterns, to the best of our reading, does
not itself specify — that the fixture be established through API-injected preconditions rather than
through the system's own UI, and that the scenario's outcome be deterministic. The catalogue's patterns
were developed primarily for xUnit-style unit tests rather than for UI- or API-driven end-to-end scenarios
specifically; that gap is where this paper's API-DAO
precondition-injection clause sits. Read against Luo et al.'s flaky-test taxonomy (§2.1.2), a Shared Fixture
in Meszaros's terms is precisely the mechanism by which the order-dependent (OD) failure category arises —
Fresh Fixture, and atomicity's stricter version of it, is the constructive answer to that failure mode
rather than a mechanism for detecting it after the fact.

---

### 2.2 Problem Statement

§2.1 establishes what six adjacent literatures do define. Granularity heuristics define test *levels*
— how many tests to write at each layer of a suite (§2.1.1). The flaky-test literature defines test
*smells* — symptoms such as order-dependency and non-determinism, detected and triaged after a suite
already exists (§2.1.2). Model-based testing defines test *provenance* — how a case is derived from a
model (§2.1.3). Metamorphic testing defines an alternative *oracle strategy* for cases where no single
expected output is available (§2.1.4). BDD/Gherkin defines a *specification language* for expressing
behavior (§2.1.5). Fixture-management patterns catalogue *isolation strategies* a test author may
choose among (§2.1.6). None of the six states a positive predicate that a single test case either
satisfies or fails — a well-formedness condition checkable against one scenario in isolation,
independent of which layer, oracle strategy, specification language, or fixture pattern that scenario
happens to use.

Test atomicity, as formalized in §2.3, plays a structurally analogous role to ACID's atomicity property
for database transactions: instead of cataloguing failure symptoms — lost updates, dirty reads,
non-repeatable reads, for a transaction; flakiness, order-dependency, shared fixtures, for a test — it
states a positive predicate a transaction, or a test, either satisfies or does not. This is a structural
analogy about what a positive predicate buys over a symptom catalogue, not a historical claim about how
database practice developed; it occupies the same structural position relative to the flaky-test and
fixture-pattern catalogues of §2.1.2 and §2.1.6 that ACID occupies relative to a list of transaction
anomalies.

This paper asks two questions the literature surveyed in §2.1 does not answer directly. First, can a
single, formal, tool-agnostic predicate over a test's state, precondition-injection mechanism, and
outcome be stated such that a scenario either satisfies it or does not, independent of the platform,
framework, or specification language used to author it (§2.3)? Second, if such a predicate exists, do
the properties it should mechanically imply — platform invariance, parallel safety, and deterministic
diagnosis — actually hold when measured against a suite composed entirely of atomic tests, relative to
a suite that violates the predicate while exercising identical application behavior (§2.4, evaluated
empirically in §3–§4)?

---

### 2.3 Formal Definition of Atomic Testing

#### 2.3.1 Preliminaries and notation

Definition 1 is stated over the following universe of discourse. A test suite is a finite set
$T = \{t_1, \dots, t_n\}$ of tests (scenarios); each test $t_i \in T$ is associated with a state set
$S_{t_i}$ — the union of the data it reads, writes, and depends on for its preconditions to hold — and
a single observable outcome, its oracle $O_{t_i}$. A test's preconditions are established by a
state-injection function $S_0(t)$, which may or may not be external to the interface the test itself
exercises; Rule 3 below constrains which of the two it must be. Each test executes against an
execution platform or surface $P$ (web, mobile, API, load, …), and its outcome is subject to chaos
suppression: a bounded transient-failure retry policy that absorbs a failure rather than reporting it
when the failure is classified as transient, and fails fast — without retrying — when it is classified
as deterministic (§2.5.2 restates this at the architecture level). The symbols introduced here are
collected in the table below for reference.

| Symbol | Meaning |
|---|---|
| $t$ | A test (scenario) |
| $T$ | A test suite, $T = \{t_1, \dots, t_n\}$ |
| $S_t$ | The state set owned by test $t$ |
| $O_t$ | The oracle (single observable outcome) of test $t$ |
| $S_0(t)$ | The state-injection function establishing $t$'s preconditions |
| $P$ | An execution platform/surface (web, mobile, API, load, …) |

#### 2.3.2 Definition 1 (Atomic Test)

A test $t$ is **atomic** if and only if it satisfies all four of the following rules.

| # | Rule | Formal statement | Informal meaning |
|---|------|-------------------|-------------------|
| 1 | **Single behavior** | $t$ has exactly one oracle $O_t$ | The test asserts exactly one thing; failure diagnosis is unambiguous. |
| 2 | **Disjoint state** | $\forall\, t_i \neq t_j \in T,\ S_{t_i} \cap S_{t_j} = \emptyset$ | No test can observe or mutate another test's data; isolation is definitional, not disciplinary. |
| 3 | **No UI-driven setup** | Preconditions are established via a state-injection function $S_0(t)$ external to the interface under test | Setup never depends on the same interaction surface being verified. |
| 4 | **Deterministic outcome** | $\forall$ repeated executions of $t$ under fixed inputs, $O_t$ is invariant once transient noise is absorbed by chaos suppression | Real failures fail fast and reproducibly; transient noise is explicitly not a failure. |

Definition 1 is a conjunction of four independent predicates:

$$\text{Atomic}(t) \iff R_1(t) \wedge R_2(t) \wedge R_3(t) \wedge R_4(t)$$

where $R_1(t) \equiv |\{O_t\}| = 1$, $R_2(t) \equiv \forall\, t_j \neq t \in T,\ S_t \cap S_{t_j} =
\emptyset$, $R_3(t) \equiv S_0(t)$ is external to the interface $t$ exercises, and $R_4(t) \equiv O_t$
is invariant across repeated executions of $t$ once chaos suppression has absorbed transient noise.
Independence follows from §2.3.3 below: each $R_i$ admits a counterexample the remaining three do not
exclude, so no proper subset of the four predicates is equivalent to the conjunction.

#### 2.3.3 Discussion of the definition

Each rule in Definition 1 is necessary independently: dropping any one admits a counterexample the
remaining three do not exclude.

Without Rule 1 (single behavior), a test with two oracles — for example, one that asserts both that an
order-confirmation page renders and that a confirmation email is queued — produces an ambiguous failure
signal: a single red result cannot distinguish which of the two behaviors broke, reintroducing exactly
the ambiguous-triage cost the flaky-test literature spends its diagnostic effort resolving after the
fact (§2.1.2). Rule 1 removes the ambiguity at authoring time rather than at triage time.

Without Rule 2 (disjoint state), two tests that mutate a shared account balance can pass individually
and fail only when run concurrently or in a particular order — the order-dependent (OD) flakiness
category Luo et al. and iDFlakies exist specifically to detect after a suite already exhibits it
(§2.1.2). Rule 2 makes that category structurally unreachable rather than merely detectable.

Without Rule 3 (no UI-driven setup), a checkout scenario that first drives a login form to establish
its precondition inherits every failure mode of the login flow as a false negative on the checkout
assertion itself — the test's oracle no longer isolates the behavior it names. This is the precise
failure mode this paper's own non-atomic twin is constructed to exhibit (§3.2.3), and the
diagnosability instrument's blast-radius measurements (§4.2) are evidence, not merely a definitional
claim, of the cost Rule 3 removes.

Without Rule 4 (deterministic outcome), a test that flags every transient network retry as a failure
cannot be distinguished, without human intervention, from a test reporting a genuine regression —
precisely the cost Micco's account of Google's test infrastructure attributes to flaky tests at scale
([1]; discussed further in §2.1.2). Rule 4 does not forbid transient failure; it requires that transient noise be absorbed
by chaos suppression before a result is reported as a pass or fail.

Read together, the four rules target the four failure patterns named in §1.1's motivation — sharing
mutable state, rebuilding preconditions through the interface under test, asserting more than one
behavior at once, and treating non-determinism as unavoidable noise — each rule closing exactly one,
and each counterexample above surviving unless that specific rule is enforced. No proper subset of the
four rules excludes all four patterns simultaneously, which is the sense in which the conjunction above
is minimal rather than merely sufficient.

---

### 2.4 Derived Properties (Corollaries)

Properties that follow mechanically once a test suite is composed entirely of atomic tests, rather
than being separately engineered:

- **Corollary 1 — Platform invariance.** Rule 3 requires that a test's precondition-injection function
  $S_0(t)$ be external to the interface under test; in the reference implementation this is realized as
  API-DAO precondition injection dispatched through logical intent IDs rather than platform-specific UI
  actions. Because neither the scenario specification nor its precondition-injection mechanism names a
  concrete interface, the same specification is dispatchable, unmodified, to any plugin server the
  kernel can route an intent to — web, mobile, or API — with platform selection resolved by the kernel
  rather than encoded in the test. This paper's evaluation exercises this corollary across exactly
  three surfaces — web (Playwright, desktop + responsive), mobile (Appium, Android + iOS), and API —
  see the tool-scope note at the top of the document and §3.1.1. The full AHM reference implementation
  supports additional surfaces (Gatling load, Pixelmatch visual) as cross-cutting *contracts* rather
  than alternate platforms; they are out of scope here (§3.1.1) but not counterevidence to the
  corollary.
- **Corollary 2 — Parallel safety.** Rule 2 ($S_{t_i} \cap S_{t_j} = \emptyset$ for all $t_i \neq t_j
  \in T$) implies that no two tests in an atomic suite can observe or mutate the same state, so no
  ordering constraint between them is required for correctness — the suite is safe to execute under
  arbitrary concurrent scheduling, excepting tests that declare a shared-state dependency explicitly
  (an escape hatch from the rule, not a violation of it, e.g. this suite's `@writes-shared-state` tag).
  This paper's reference application carries no naturally occurring account-keyed backend state, so a
  suite built against it offers no data-collision surface on which to discriminate the corollary
  empirically; §3.2.4/§4.1 report what was measured instead — a concurrent-traffic resilience sweep
  rather than a data-collision test.
- **Corollary 3 — Deterministic diagnosis.** Rules 1 and 4 together imply that a failing atomic test
  reports both *what* broke (Rule 1's single oracle names exactly one behavior) and *whether the break
  is reproducible* (Rule 4's chaos-suppressed determinism rules out transient noise as the explanation)
  — a failing atomic test is therefore evidence of a genuine, attributable regression rather than one
  candidate among several ambiguous causes. §4.2's diagnosability instrument and §4.3's determinism
  instrument evaluate the two halves of this corollary separately, against the same fault-injection and
  repeated-run methodology described in §3.2.4.

Each corollary above is stated as an informal derivation from Definition 1 rather than a fully formal
proof: the derivation traces which rule or rules the property follows from and why, but does not
construct a mechanized or symbolic proof of the implication. This choice mirrors the evidence policy
governing the empirical claims in §3.2.5 — a claim is stated at the level of rigor the available
evidence actually supports, rather than dressed in a formalism the derivation itself does not need to
be checkable. A reader can verify each corollary by inspecting Definition 1's rules directly; nothing
in the derivations above depends on evidence external to the definition.

---

### 2.5 Reference Model: the Atomic Helix Model (AHM)

#### 2.5.1 Layer model

AHM's layer model, read through Definition 1's four rules rather than as an implementation detail in
its own right, composes exactly one guarantee per layer without re-deriving it from the layer below. An
Atom is the single, indivisible gRPC call a Molecule composes into one cross-platform interaction —
Rule 3's external-injection boundary is enforced at this layer, since an Atom never encodes which
concrete interface it targets. A Molecule composes into an Organism that orchestrates a business flow
and selects which execution surface handles it, still without touching another test's state. An
Eco-System is the specification-level composition — a Gherkin scenario together with the DAO-based
precondition injection that establishes $S_0(t)$ — at which Definition 1's four rules are checked
against a concrete test case. Resonance and the Execution Helix extend the same specification data to
load simulation and CI-parallelized execution respectively, exercising Corollaries 1 and 2 rather than
introducing new obligations of their own. The table below names each layer's responsibility; the
paragraph above states which rule of Definition 1 that responsibility discharges.

| Layer | Responsibility |
|-------|-----------------|
| Atoms | The single, indivisible execution primitive (one intent, one action). |
| Molecules | Grouped atomic intents composed into one cross-platform interaction. |
| Organisms | Orchestration of molecules into business flows; execution-surface selection. |
| Eco-Systems | Specification-level composition (BDD scenarios) of organisms into test cases. |
| Resonance | Load/performance simulations driven by the same specification data. |
| Execution Helix | CI/CD composition of every layer into parallel, isolated execution runs. |

#### 2.5.2 Formal grounding

AHM composes Definition 1 with three formal constraints, distinguishing it from heuristic
strategy metaphors (Test Pyramid, Trophy, Honeycomb):

- **Set-theoretic isolation** — $S_{t_i} \cap S_{t_j} = \emptyset$ (Rule 2, restated at the
  architecture level).
- **π-calculus message passing** — cross-process communication is a typed, addressed message
  (intent); there is no shared memory or global mutable state between layers.
- **Chaos suppression** — transient failures are detected and absorbed under a bounded retry policy;
  failures classified as deterministic are not retried and are reported immediately.

#### 2.5.3 Relationship to the execution architecture (scope boundary)

AHM, as defined in this paper, states *what* must be true of a test and of a test architecture for
atomicity to hold — Definition 1's four rules and the layer composition of §2.5.1. It does not
prescribe *how* an intent is transported between a test's specification and the plugin that executes
it, how transient failures are detected and retried, or how a logical locator resolves to a
platform-specific selector — that mechanism is the Test-Oriented Microkernel's own contribution,
developed and evaluated in a companion paper. The two are related by dependency rather than identity:
AHM's Rule 3 (no UI-driven setup) and its chaos-suppression requirement in Rule 4 presuppose an
execution architecture capable of routing typed intents and absorbing transient failure, which TOM
supplies; this paper cites that architecture's guarantees where Definition 1 depends on them (§2.5.2)
rather than re-deriving or re-evaluating them here.

---

## 3. Methodology

### 3.1 Reference Implementation

§3.1 exists to make the reference implementation reproducible, not to advance the paper's own
argument, and stays close to the code rather than to the formal apparatus of §2.5.1. That section
already maps Atom, Molecule, Organism, and Eco-System onto Definition 1's four rules; here the same
terms are re-grounded concretely, in the repository's actual layout, so a reader unfamiliar with AHM's
vocabulary can locate each concept in running code rather than in a rule number. An *intent* is the
concrete realization of an Atom: a typed, addressed message a Molecule sends to the kernel through
`sendIntent()`, identified by a member of a centralized `INTENT` enum rather than a raw string, keeping
the system's primitive actions closed and enumerable. One or more intents compose into a *molecule* —
one cross-platform UI action — which composes into an *organism*, the layer that orchestrates a
business flow and, via the `DRIVER` environment variable, selects which execution surface (browser,
device, or direct API call) carries out a given intent. The *eco-system* layer is where the Gherkin
scenario and its DAO-based precondition injection live together, establishing $S_0(t)$ for a concrete
test case.

Concretely, this layering is enforced by a kernel/plugin split: the kernel owns locator resolution,
transient-failure retry, and telemetry, while plugin servers are pure execution engines with no test
logic of their own, so a change of tool is a driver toggle rather than a rewrite of any layer above it.
*Chaos suppression* names the kernel's retry mechanism for known-transient errors — stale elements,
timeouts, and the like — so a scenario's reported outcome reflects genuine, reproducible failure rather
than incidental infrastructure noise.

#### 3.1.1 Tool scope for this paper

The full AHM reference implementation realizes the approach across six execution tools — Playwright,
Appium, Mobilewright, Gatling, API/fetch, Pixelmatch — behind a single Gherkin specification layer.
This paper's experiments (§3.2–§4) exercise a deliberately narrower slice of that surface, chosen and
bounded as follows:

| Tool | Role in this paper | Why |
|---|---|---|
| **Playwright** | Web UI, desktop and responsive viewports | The primary UI surface for both the atomic suite and the non-atomic twin's R3 (UI-driven setup) violation |
| **Appium** | Mobile UI, Android and iOS | The "second platform" driving the Corollary 1 (portability) instrument in §3.2.4 |
| **API** | Contract execution / $S_0$ state injection | Operationalizes Rule 3 directly: the atomic suite's `Given` steps route preconditions through this surface, not through UI. This is the mechanism the atomicity argument stands on, not merely a third platform |

**Mobile instrument note.** The reference implementation offers two mobile UI plugins: **Mobilewright**
(newer) and **Appium** (the more established, WebDriver-based path). Mobilewright was this paper's
original selection, revised to **Appium** mid-evaluation after Mobilewright exhibited a reproducible
defect while executing the twin's mobile leg, isolated methodically as belonging to the plugin rather
than to the application under test or to the method being evaluated (the full diagnostic narrative is in
Appendix A). A mobile execution plugin's own reliability is a precondition for this paper's instruments,
not something the evaluation measures, so the resolution was to swap the designated mobile tool rather
than treat plugin debugging as in-scope experimental work. This is disclosed here per the evidence
policy in §3.2.5: an instrument substitution made for reasons independent of the method under test.

**Explicitly out of scope for this paper:** **Mobilewright** (see above), **Gatling**
(performance/load), and **Pixelmatch** (visual regression). All three exist in the full repository —
as cross-cutting quality-attribute *contracts* (§3.1.2) or as alternate plugins, not as this paper's
chosen execution platforms — and belong to the architecture-level (TOM) evaluation, not to this paper's
method-level one.

#### 3.1.2 Cross-cutting quality attributes as contracts

Visual regression, accessibility, and security are not modeled as a fourth kind of domain alongside
login, checkout, catalog, and the rest; each attaches to an existing atomic scenario as a *contract* —
a `*.visual.json`, `*.a11y.json`, or `*.security.json` file under that domain's own `contracts/`
directory — reused via a tag rather than authored as a parallel test layer. This is a direct structural
consequence of Definition 1 rather than an incidental implementation choice: because Rule 3 already
requires a scenario's precondition state to be independently, API-injected, the same $S_0(t)$ a
functional assertion checks against is available, unmodified, to a non-functional check attached to the
same scenario — Definition 1 needs no special case for what an oracle *is* checking, only that it
checks exactly one thing (Rule 1) against a deterministic outcome (Rule 4).

The three attributes attach by different mechanisms, disclosed here rather than treated as
interchangeable. Visual regression fires from an `After` hook keyed to a `@visual` tag; a diff failure
is logged, not thrown, because the enforced gate lives in CI's baseline-update workflow rather than in
the scenario itself. Accessibility instead runs as an explicit `Then` step inside the scenario body,
ahead of any `After` hook, because axe *is* the gate — a real violation must throw, and cucumber's own
step-registration order creates an ordering risk for a hook-shaped check that this explicit-step design
avoids; the visual hook is suspected, though not confirmed, to share the same exposure. Security splits
by shape: a contract-scoped scan against one authenticated domain (`login`), and an infrastructure-scoped
scan against the whole application (`support/`) that runs from two separate CI jobs split by whichever
plugin is live, each job's own plugin toggle making the unused half of the scenario a non-fatal warning
rather than a failure. All three are implemented in the reference repository — security (ZAP web, MobSF
mobile) since commit `5330693`, 2026-07-16 — but excluded from this paper's own evaluation scope by
design, not by omission; see §5.2.

---

### 3.2 Evaluation Methodology

#### 3.2.1 Why a descriptive audit is not enough

A descriptive audit was considered first and rejected on structural grounds, not on preference. The
naive design measures the existing AHM reference suite in isolation — e.g., "$N\%$ of scenarios are not
tagged `@writes-shared-state`" — and reads the result as evidence for Corollary 2. That argument fails on
this system because **method and execution architecture are co-designed**: portability, diagnosability,
and (partly) determinism are produced jointly by the test-writing method (Definition 1) and by the
Test-Oriented Microkernel beneath it (logical locators, typed intents, chaos suppression). A
single-suite descriptive number cannot separate the two contributions, since it offers no way to
attribute a measured property to the method as opposed to the architecture underneath it.

A **comparative, causal design** was adopted instead: the execution architecture is held fixed and only
the authoring method is varied. Fixing the architecture isolates the authoring-method effect from that
one confound; it does not by itself rule out every threat to internal validity, and the remaining threats
(construction bias in the non-atomic baseline, chief among them) are addressed directly below and in
§5.1. The added weight of this design is deliberate — it licenses a causal claim ("atomicity contributes
to X") on the confound it controls, rather than a merely correlational one ("the atomic suite happens to
have X").

**On the validity of an author-constructed comparison baseline.** The evaluation's central threat is that
an author-constructed non-atomic baseline could encode the very bias it is meant to measure. This risk is
mitigated by construction: each non-atomic twin is not composed freely, but is
produced from its atomic counterpart by applying a fixed, documented set of de-atomization operators —
collapsing per-scenario preconditions into a shared fixture, reintroducing UI-driven `Given` steps.
Mutation testing licenses its own mechanically-derived program variants as legitimate comparison
artifacts — rather than adversarially hand-picked counterexamples — precisely because they are produced
by a fixed, disclosed set of operators rather than composed freely [24]–[26]. This paper applies the same
discipline to the twin's construction; the analogy establishes a shared logic, not a citation-backed
transfer of mutation testing's own validity findings to this paper's baseline. Papadakis
et al.'s survey updates that account across roughly two further decades of mutation-operator, tool, and
empirical development, without changing the underlying logic. Wohlin et al.'s treatment of construct
validity in controlled software-engineering experiments provides the framework this paper follows for
what such a derivation should report to be defensible: the operators applied, their scope, and the
threats introduced by holding the rest of the artifact fixed [27]. Under that discipline the twin's
non-atomicity functions as a controlled independent variable, not an uncontrolled source of experimenter
bias — its validity is an empirical property of the documented derivation procedure, not an assumption
taken on faith. §3.2.3 discloses this paper's own operator set.

#### 3.2.2 Constructing a fair non-atomic baseline

The comparison requires a second, **non-atomic** twin suite that exercises the same application
behaviors as the existing atomic one, with TOM held constant underneath both arms. The design's central
threat is **construction bias**: a hand-written "bad" suite risks being a straw man built to lose, biased
toward confirming the paper's own hypothesis rather than measuring it fairly.

Two baseline sources were evaluated. One was ruled out by evidence, not by preference:

- **Found pre-atomic history — ruled out.** This source is ideal in principle: zero construction bias,
  since nothing is authored, only recovered. `git log` was run against `place-delivery-order.feature`,
  `invalid-credentials.feature`, and `market-language-localization.feature`; all three entered the
  repository already atomic, in the first commit (`f90ee8a`, "initial import — Automated Atomic Testing
  reference implementation", 2026-07-11). The repository was born atomic. No earlier,
  naturally-occurring non-atomic form exists to recover.
- **Mechanical de-atomization — adopted.** The non-atomic twin is produced by applying a small,
  disclosed set of transformations to the existing atomic scenarios rather than by free-hand authoring.
  This choice bounds the transformation to exactly the rules under test, keeps the baseline auditable (a
  reader can diff twin against original and verify each violation was introduced, not invented), and
  holds every other property of the scenario — the behavior under test, the assertions' intent, the data
  — identical between arms.

**Design note on shape.** An earlier iteration built two isolated, per-domain twins (checkout, login) by
fusing 2–3 `Scenario Outline` rows each; that shape was abandoned. The adopted shape composes a single
**horizontal, cross-domain journey** instead — closer to how non-atomic suites are actually written in
practice, as one long "user story" test — while keeping the same auditable construction method: step
sequences that already exist in the atomic suites are **mechanically concatenated** (login → catalog →
pizzaBuilder → checkout), not hand-authored into a new narrative. Every step in the twin traces back to
an atomic scenario's existing step; the only new material is minimal connective navigation between
domains, disclosed here rather than hidden. This is not the free-hand-authoring option ruled out above —
it is mechanical de-atomization applied across a domain boundary instead of within a single domain.

#### 3.2.3 The transformation

**Scope.** The atomic step sequences of four domains — `login`, `catalog`, `pizzaBuilder`, `checkout` —
are concatenated into one continuous scenario. The existing `place-delivery-order.feature` and
`invalid-credentials.feature`/`market-language-localization.feature` are left untouched as the atomic
arm. The domain footprint is wider than the checkout+login scope decided earlier, for a specific
reason: R3 has no honest UI-driven equivalent to `CheckoutDao.addToCart()` *within* the checkout domain
— the only real UI path to a populated cart runs through catalog → pizzaBuilder. This was confirmed
with the author, not assumed.

| Operation | Rule(s) it violates | What it does | Mechanism it defeats |
|---|---|---|---|
| **Concatenate** | R1 (compounded) | Chains login's, catalog's, pizzaBuilder's, and checkout's existing atomic step sequences into one scenario; every domain's oracle becomes one more `Then`/`And` block inside that single scenario instead of living in its own | Failure localization *across* domain boundaries, not just within one |
| **Share account/session** | R2 (disjoint state) | Points every domain leg of the journey at **one shared account/session**, reused by every concurrent journey instance, instead of each atomic scenario's own per-scenario fixture | Parallel safety, and downstream, determinism |
| **Substitute UI for API setup** | R3 (no UI-driven setup) | Replaces every API `$S_0$` injection along the chain — login via `LoginDao`, cart contents via `CheckoutDao.addToCart` — with the existing UI molecule that already performs that action (login's `submitCredentials`, catalog's card-click, pizzaBuilder's open/size/toppings/confirm) | Cross-platform portability and setup reliability |
| *(none — not directly transformed)* | R4 (deterministic outcome) | Not transformed directly; arises as a predicted **consequence** of the R2 transformation | See §3.2.4 |

**Concurrency shape.** The journey is wrapped in one `Scenario Outline` with **K = 16 identical rows**,
each row instantiating "one concurrent user runs the full journey" against the same shared, untagged
account. cucumber-js distributes Outline rows as independent pickles across workers, so a single
Outline — dispatched at `CUCUMBER_PARALLEL = 1, 2, 4, 8` — sweeps concurrency without changing scenario
count between sweep points, which is what keeps §3.2.4's parallel-safety curve legible (see the design
note there). K=16 and the single-dispatch-per-level decision were fixed in advance, not tuned post hoc:
no repeated `run_index` is taken at this stage, because the object of interest is the failure-rate
curve's shape, not a point estimate that would need error bars. Both are recorded in
`docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md`.

**Where it lives.** The twin is placed at `evaluation/non-atomic-twin/`, outside `src/core/tests/`, so
the default `cucumber.js` glob (`src/core/tests/**/*.feature`) cannot pick it up by accident. A
dedicated named profile in `cucumber.js` points at it, inheriting `timeout`/`requireModule`/the
`support/**` require path from `default` for parity, but set to `retry: 0` — deliberately not
`default`'s `retry: 1`, since a retry would silently re-run the *entire* journey and mask exactly the
determinism signal §3.2.4 measures, at high cost given the journey's length. Manifest/telemetry env vars
(`TOOL_NAME`, etc.) tag its runs distinctly, so the existing `metrics/` pipeline ingests both arms
without any pipeline code change.

**Platform legs.** The twin's step sequences run on Playwright/web by construction — the UI molecules
named above (`submitCredentials`, catalog card-click, pizzaBuilder open/size/toppings/confirm) are the
Playwright ones. The determinism instrument (§3.2.4) additionally requires an **Appium-Android** leg of
the same concatenated journey, built the same mechanical way from the corresponding Appium organisms;
this construction is shared with the portability instrument, which measures the LOC/files touched to
build it (§3.2.4). Both legs are built *and verified live*, not merely specced: the Playwright leg runs
green at K=16 (240/240 steps, commit `fdf7cf1`), and the Android leg runs green under Appium (15/15
steps, commit `6561098`), reached only after an interim Mobilewright attempt stalled at 13/15 and
surfaced the picker defect behind the §3.1.1 tool substitution. The portability instrument's own
measurement — the LOC/files-touched number — is reported in §4.4 (63 LOC, 1 file, spec-forced; 5 LOC
plugin-gap, disclosed but not counted). `docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md`
records why the scope widened past the original Playwright-only framing, why iOS is excluded from the
repeated determinism runs specifically while still covered by the one-shot portability check, and §3.1.1
records why this leg's designated tool changed from Mobilewright to Appium mid-evaluation.

Both suites otherwise run through the **identical, unmodified** TOM stack — same proxy, same plugins,
same locator contracts, same chaos-suppression policy. The only independent variable is which suite is
being executed.

**Browser held constant.** Every Playwright-leg run for the §3.2.4 causal instruments uses a single
engine, Chromium. The reference implementation supports a full cross-browser matrix
(Chromium/Firefox/WebKit, `pnpm test:all-browsers`), but the causal variable under test is atomicity,
not browser engine: running the primary comparison ×3 browsers would mostly multiply cost without
adding a dimension to what is being attributed, and WebKit's known engine-level flakiness would inflate
the twin's determinism transition rate (§3.2.4) for reasons that are not method-attributable —
contaminating that instrument specifically. Cross-browser replication is therefore treated as a
separate, secondary generalization check (§5.2), not one of the primary instruments.

#### 3.2.4 What each corollary predicts, and how it is measured

| Corollary | Prediction | Instrument | Why this shape, not a single ratio |
|---|---|---|---|
| **Parallel safety** (from R2) | A source-level audit of OmniPizza's backend (`backend/database.py:89-91`, `backend/routers/auth.py:60`) found its three mutable stores (`orders`, `sessions`, `user_profiles`) are keyed by UUID/`session_id`, never by username — this reference application carries no account-keyed collision surface for R2 to guard against. The instrument's causal target was reframed accordingly (discussed below the table): rather than a data-collision failure-rate delta, it measures whether concurrent same-account UI traffic — the twin's R2 violation — degrades correctness or exposes backend-capacity limits as concurrency increases | The **existing, unmodified** atomic `@desktop` suite (the full ~97-scenario suite exercised by CI's `e2e-web` job, not a checkout-only subset — no new construction needed on this arm) and the twin's K-row Outline are each dispatched at `CUCUMBER_PARALLEL = 1, 2, 4, 8`; failure rate is plotted against worker count for each | A curve still isolates *where* contention starts — read here as *where backend capacity limits, if any, start*, not as a data-collision signal. The twin's K identical journey rows (not a fused/reduced scenario count) keep the number of parallelizable units stable across sweep points, correcting the flaw in the earlier fused-Outline design. The atomic/twin scenario-count mismatch (97 vs. 16) does not bias this instrument: failure rate is computed *within* each arm, not as a cross-arm ratio, so unequal volume between arms is irrelevant to the curve's shape — see the execution-efficiency instrument below for why this same mismatch *does* disqualify a cross-arm wall-clock comparison |
| **Diagnosability** (from R1, compounded) | A fault fails exactly the atomic scenario that owns it, classified into its true failure bucket. The same fault, injected into the journey, produces a wider blast radius — the whole journey fails — and can surface far from its true cause (e.g., a cart-calculation fault manifesting only at the order-confirmation assertion) | Systematic fault injection targets a layer **both arms genuinely share** — backend/network, not UI vs. API setup, since the twin's setup is now all-UI while the atomic arm's is API, and a setup-layer fault would not be the "same" fault in both. One representative fault is injected per entry in the existing 14-bucket taxonomy (`scripts/metrics/lib/failure-buckets.ts`); blast radius (# scenarios/oracles failing) and localization accuracy (does the reported bucket name the true cause, or the symptom where it happened to surface) are both measured | Injecting from the *whole* taxonomy, at a shared layer, removes both fault-selection bias and arm-asymmetric injection as sources of bias |
| **Determinism** (from R4, mediated by R2) | The twin exhibits a higher pass↔fail transition rate across repeated runs than the atomic suite, *even with TOM's chaos suppression held identical in both arms* | Each suite is repeated across **N=30** `run_index` values under one `experiment_batch_id`, on **web (Playwright/Chromium) + Appium-Android** (iOS excluded from repetition), both arms held at `retry: 0` (§3.2.3) so a masked retry cannot hide the signal; the existing reliability-measurement infrastructure is reused to compute pass→fail / fail→pass transition probabilities | Chaos suppression absorbs only *transient* noise and fails fast on deterministic ones, per Rule 4 (§2.3.2) and its architecture-level restatement (§2.5.2). R2 collisions in the twin are deterministic, not transient, so suppression will not retry them away — this is the mechanism that makes the delta attributable to the method. Suppression applies identically to both arms, so it still partially masks method-induced flakiness in the twin too: the delta should be read as a **conservative, lower-bound** estimate |
| **Platform invariance** (from R3, Corollary 1) | Porting the atomic suites from Playwright (web) to Appium (Android + iOS, both live-verified in CI) costs 0 spec-layer changes, confirmed structurally; the twin reads 0 by the same structural check. But the twin's *live* mobile port was only ever run on Android — iOS was never attempted for the twin, out of scope per §3.2.3's exclusion of iOS from the repeated determinism/twin runs — and that Android-only port costs a small, non-zero amount of twin-only implementation code (63 LOC, 1 file) that the atomic arm has no equivalent of (measurement procedure discussed below the table) | For both arms, the `.feature`/step-definition layer is checked for platform-conditional code — a structural check, symmetric across arms, platform-agnostic by construction, requiring no live execution on either mobile platform. For the twin only, each file touched while getting its **Android** mobile leg green is separately classified as spec-forced (counted), plugin-gap (excluded, disclosed), or out-of-scope (Mobilewright artifacts, §3.1.1 — neither counted nor plugin-gap) | Isolates the *specification*-level cost from the architecture, which is held constant and already supports both platforms. The two measurements are kept separate rather than combined into one number because they use different procedures — structural check vs. classified historical diff — and combining them would fail §3.2.1's own construct-validity standard |
| **Execution efficiency** (from R3, ancillary — companion to Platform invariance, not a §2.4 Rule-derived corollary in its own right) | Both the web and Android legs reach this evaluation's N≥10 evidence bar (procedure discussed below the table). Reaching a given precondition state via API injection (`LoginDao`; the checkout DAO's cart-population call — the same mechanisms named in §3.2.3's R3 row) costs less step-time than reaching the *same* state via the UI molecule sequence R3's transformation substitutes for it (`submitCredentials`, catalog→builder UI navigation) | Per-operation `cucumber-jsonl` step-`durationMs` is measured for two comparandum pairs that reach an identical functional end state by a genuinely different mechanism in each arm ("logged in"; "cart populated with 1 item") — **not** whole-suite or whole-job wall-clock, and **not** an assembled sum of atomic scenarios (see the design note for both rejected alternatives and why) | Whole-job wall-clock conflates this instrument's own atomic/twin volume and job-shape asymmetry — the `e2e-web` job's full matrix vs. the twin's single unmatrixed job, plus a chained visual-diff job downstream of neither arm's actual test execution — with any method effect. Per-operation step-time removes both: the unit compared is one operation reaching one state, symmetric regardless of how many other scenarios either suite happens to run alongside it |

**Threat specific to the portability instrument.** Mobile execution (Appium, Android + iOS) is not
optional here — it *is* the instrument, not an add-on (§3.1.1). That dependency exposes this instrument,
more than the other three, to conflating **tool immaturity with non-atomicity**: a mobile plugin missing
an action the twin's heavier UI journey needs, or — as encountered during this evaluation with the
originally-designated Mobilewright plugin — behaving unreliably on an interaction the specification
itself requires, would inflate the twin's porting cost for a reason that belongs to TOM's plugin
surface, not to the method. Mitigation is procedural, applied uniformly: only a spec change forced by
the *specification itself* (a different assertion, a different navigation structure) is counted; any
change forced by a missing or unreliable plugin action is logged separately and excluded from the
reported delta, with the gap disclosed rather than silently worked around. §3.1.1 records the
Mobilewright→Appium substitution this policy produced; §5.1 tracks the threat.

**Portability instrument: measurement procedure.** The measurement runs as two separate procedures, not
one combined delta: a single "atomic: 0 vs. twin: N" number would mix a structural claim (inspecting the
current tree) with a historical git-diff (a past port event), which fails this paper's own
construct-validity standard (§3.2.1: the same operator, applied the same way, to both arms). Tooling and
output artifacts are listed in Appendix A.

**Structural check (symmetric, both arms).** The `.feature`/`step_definitions` files were scanned for
`PLATFORM`/`DRIVER`-conditional code: zero hits across login+catalog+pizzaBuilder+checkout (atomic, 11
files) and zero across the twin (4 files) — the specification is identical across Playwright and Appium
in both arms. This is Corollary 1's actual claim, and it holds for both arms equally. It is, by
construction, a *structural* read of the shared step-definitions layer, not proof of live execution on
every platform — it establishes that nothing in the spec layer special-cases a platform, not that the
twin would port to iOS at zero cost.

**Twin-only mobile-port cost (not symmetric; no atomic equivalent — disclosed as such, not hidden).** Of
the four files touched getting the twin's **Android** mobile leg green (commit identifiers in Appendix
A — iOS was never attempted for the twin, per §3.2.3), each was classified individually rather than folded into one
aggregate count. One survives, unchanged, into the Appium-green state and HEAD:
`checkout-nonatomic.route.ts`'s `seedAndReadCartFromDraft`, twin-only code forced by the specification
itself (mobile checkout deep-links with a real backend cart the twin had no equivalent of) —
**spec-forced, 1 file, 63 LOC, counted**. One is shared plugin-contract code relevant to Appium
specifically (`login.webdriver.locators.json`'s stale locator) — **plugin-gap, 1 file, 5 LOC, excluded
but disclosed**, per the mitigation policy above. Two are fixes made during the abandoned Mobilewright
attempt (`login.wright.locators.json`, `Type.ts`); since Mobilewright sits outside this paper's tool
scope entirely (§3.1.1) and neither fix was exercised again after the swap to Appium, these are
**out of scope, 2 files, 16 LOC, neither counted nor plugin-gap**. No atomic-arm number is reported for
this half of the measurement: the atomic suites' Android support predates this evaluation, at unknown
effort/circumstance parity, so a historical diff of those original commits would not be a like-for-like
comparison. §4.4 reports it as a labeled, non-comparable line item instead of a fabricated zero.

**Parallel-safety instrument: reframing rationale.** The instrument's first dispatch — K=16 at
`CUCUMBER_PARALLEL=4`, one of the four planned worker levels — returned a null result: 16/16 scenarios,
240/240 steps, zero degradation, at `retry:0`, so the result is not retry-masked. The null was
root-caused by reading OmniPizza's backend source directly rather than inferring from behavior alone
(`backend/database.py:89-91`, `backend/routers/auth.py:60`): the application's three mutable stores are
keyed by UUID/`session_id`, minted fresh on every login regardless of account, never by username. No
server-side shared mutable state is keyed by account, so the twin's R2 violation (shared `standard_user`,
no per-instance fixture) has nothing to collide against at any worker count.

The instrument's causal target was reframed accordingly, from data-collision correctness to
concurrent-traffic resilience: the row above no longer predicts a failure-rate delta attributable to R2,
only measures whether concurrent same-account UI load degrades correctness or surfaces backend-capacity
limits. This finding does not call Corollary 2 (§2.4) into question in general — it remains a direct
logical consequence of Rule 2's disjoint-state requirement — it establishes only that this specific
reference application cannot demonstrate the corollary via data collision.

One further implication follows, disclosed here as a hypothesis this evaluation did not directly test
rather than a proven claim: given the absence of account-keyed backend state, this suite's
`write-lock.hooks.ts`/`@writes-shared-state` mechanism — designed to avoid a known race against
OmniPizza's shared `standard_user` account — was most likely protecting against backend-capacity/
rate-limiting under concurrent login bursts (independently documented in §5.1), rather than an
application-level data race.

**Execution-efficiency instrument: design and measurement procedure.** This instrument was requested
after the atomic-web CI dispatch's wall-clock was observed running far longer than the twin-web
dispatch — a naive reading would call that evidence that atomic testing is slower. The instrument below
shows that inference does not hold. Design and rejected alternatives (whole-job wall-clock; an assembled
"sum of atomic scenarios" — impossible without either skipping an operation or double-paying a
precondition, since R1 forbids a single pizzaBuilder scenario that selects size, adds toppings, *and*
confirms in one behavior) are recorded alongside the tooling listed in Appendix A.

The instrument measures **step-time**, read from per-step duration records rather than whole-job
wall-clock or individual gRPC-intent timing — disclosed as one level coarser than the individual intents
a step may issue, not wall-clock and not mechanism-time.

Two comparandum pairs only are used, both reaching an identical functional end state by a different
mechanism in each arm with no R1 independence cost on either side: "logged in" (atomic `LoginDao`
Background step vs. twin's login-screen UI molecule) and "cart populated" (atomic's checkout
cart-injection step vs. twin's full catalog→builder UI sequence). A catalog/builder-click step pair,
driven by UI in *both* arms, is kept only as a disclosed negative control. The atomic-only "builder is
open" precondition step is excluded entirely, because it pays R1's independence cost, not R3's mechanism
cost, and including it would misattribute the two.

**Both legs cross this evaluation's N≥10 evidence bar.** Web: started from the already-completed
parallel-safety `w1` pair, then accumulated 10 dedicated repeats — N=11 atomic/N=176 twin. Android: 10
usable dedicated dispatches out of 13 attempted — repeats 001, 003-006, 008, 009, 011-013 — N=10
atomic/N=159 twin; repeats 002, 007, and 010 are excluded, not silently dropped, each for a distinct,
investigated reason (see below and §4.5). §4.5 reports the current per-comparandum numbers in full.

**Ratios.** Web ≈3.4-4.7× (logged in) / ≈2.3-3.5× (cart populated); Android ≈85-127× (logged in) /
≈78-90× (cart populated), stable across the full N=2→N=10 accumulation. Both legs' negative control
stays near parity throughout (web ≈0.86×, Android ≈1.03-1.10×), as expected of an operation with no R3
substitution on either side. The negative control's own ~3.1-3.3s-per-interaction baseline on Android
(both arms) shows Android/Appium UI automation is uniformly far more expensive than web regardless of
arm, while the atomic side's API-call cost stays roughly platform-invariant — so the much larger Android
ratio is the same substitution effect at a higher UI-cost baseline, not a different phenomenon. See §4.5
for the full tables.

**Both legs report as §4 results.** The atomic side stands at N=11 (web) / N=10 (Android) per
comparandum, meeting §3.2.5's evidence policy bar for a reported number rather than just a
directionally-consistent one.

#### 3.2.5 Evidence policy (inherited from the framework's own norm)

The evidence policy is inherited, not invented for this evaluation: it follows
`docs/research/metrics-protocol.md` §9 directly. No fabricated or estimated value is reported anywhere
in §4: every number traces to a real dispatched run, and a metric that could not be computed — because a
twin suite did not yet exist, or a given worker-count/run count had not yet been dispatched — is reported
as **not measured**, never as a placeholder or estimated number.

---

## 4. Results

Each subsection below reports the instrument's methodology, caveats, and — where the data came out that
way — null or negative results, against the evidence policy of §3.2.5.

### 4.1 Parallel safety

**Full `w1`–`w8` sweep complete (8 dispatches: 2 arms × 4 worker levels, web only — one dispatch per
condition, worker count set per dispatch).** The same batch doubled as the execution-efficiency
instrument's `w1` pair (§4.5): both instruments need the same clean single/multi-worker web dispatches,
so the runs were reused rather than re-dispatched. Read out by a dedicated per-worker-level table
extractor, distinct from the reliability-measurement script's per-batch pooling — that pooling is correct
for determinism/efficiency, where `run_index` repeats the *same* condition, but wrong here, since
parallel safety repurposes `run_index` as a worker-level *label* (`w1`…`w8`) that pooling would erase
(script names in Appendix A). Zero failures in either arm at any worker level:

| Workers | Atomic suite — failure rate | Non-atomic twin — failure rate |
|---|---|---|
| 1 | 0.00 (0/89) | 0.00 (0/16) |
| 2 | 0.00 (0/89) | 0.00 (0/16) |
| 4 | 0.00 (0/89) | 0.00 (0/16) |
| 8 | 0.00 (0/89) | 0.00 (0/16) |

**On the four atomic runs' workflow-level `failure` conclusion.** All four atomic-web GH runs report a
`failure` conclusion at the workflow level while the table above reads 0.00. `gh run view --json jobs` +
`--log-failed`, checked on all four runs, identifies the failing job in every case as
`Visual — Playwright Desktop (Pixelmatch)`, an `@visual`-tagged job outside this instrument's scope: its
own 95 functional scenarios all passed, and the failure comes entirely from a separate `visual-gate.js`
post-step reporting 50 missing baselines (`Missing visual baseline for ... Run UPDATE_BASELINE ...`) for
this run context — a baseline-bootstrap gap, not a functional regression or a visual diff.
`relevantJobNamePrefixes` (`lib/campaign-matrix.ts`) excludes this job from what the campaign manifest
scores, so it does not affect the table above.

**Zero failures at every worker level, in both arms, across the entire planned sweep.** This application
has no account-keyed backend state for the twin's R2 violation to collide against at any worker count
(§3.2.4); the prediction this instrument tests is whether concurrent same-account UI load degrades
correctness or surfaces backend-capacity limits, not a data-collision delta. The result generalizes the
single `w4` twin data point from §3.2.4's reframing note to the full sweep, plus the atomic arm (not
previously dispatched). **Caveat 1:** each cell is N=1 — one dispatch per worker level, not a repeat
series like §4.3's 30 — so "zero failures" here means no failure observed in one run at that worker
level, not a statistically powered claim that failures never occur at that concurrency. As with §4.3's
web leg, this is reported as inconclusive toward collision correctness. **Caveat 2, specific to the
atomic arm's number:** the atomic arm runs under `cucumber.js`'s `default` profile (`retry: 1`); the
twin runs under `nonAtomicTwin` (`retry: 0`, so a retry cannot mask the determinism signal — see
`cucumber.js`'s own comment). TOM's raw per-scenario telemetry (`metrics/raw/cucumber-jsonl/*.jsonl`)
records only a scenario's final status, not attempt count, so `scenario_outcome_history.csv` cannot
distinguish "passed clean" from "passed after one retry" for the atomic arm — the twin's 0.00 is
retry-proof by construction, the atomic arm's is not. Against the raw CI job logs: all four atomic-web
jobs' `reads`/`writes` Cucumber summaries (`gh run view --job <id> --log`) report every scenario passing
with no `flaky`/`retry` text in the log — no retry fired in this specific sweep. This is a per-run CI-log
fact, not something the metrics pipeline itself verifies going forward.

### 4.2 Diagnosability (fault injection, one per failure bucket)

**10 injected conditions × 2 arms = 20 dispatches** (20/20 completed, 0 flagged `likelyInfra`; campaign
identifiers in Appendix A). Design doc §3 decision 5 planned
14 buckets; three are excluded, each with a stated reason — `VISUAL_DIFF_FAILURE` /
`VISUAL_BASELINE_MISSING` (the twin runs no visual/pixelmatch contract — no shared comparison surface
to inject into) and `API_CONTRACT_FAILURE` (confirmed by reading every candidate error path directly:
neither login's 403 fallback nor `security_glitch_user`'s checkout-leak message matches
`failure-buckets.ts`'s schema/contract-violation regex anywhere in this suite). `TIMEOUT_FAILURE` and
`PERFORMANCE_THRESHOLD_FAILURE` share one injected condition (`performance_glitch_user`) — which bucket
the classifier reports for each arm is itself part of what is measured. Read out by a dedicated
`scripts/experiments/diagnosability-table.ts` (`pnpm experiments:diagnosability-table`) reading
`metrics/raw/cucumber-jsonl/*.jsonl` directly and reusing the existing classifier
(`scripts/metrics/lib/failure-buckets.ts`) unchanged — for the same reason `measure-reliability.ts`'s
pooled per-batch slice is wrong for §4.1, it does no new classification logic here either.

**Localization accuracy** — does `classifyFailure()` report the bucket that was actually injected?

| True bucket | Injected via | Atomic reports | Twin reports | Correct (atomic / twin) |
|---|---|---|---|---|
| `LOCATOR_RESOLUTION_FAILURE` | chaos-proxy, `CLICK` | `LOCATOR_RESOLUTION_FAILURE` | `LOCATOR_RESOLUTION_FAILURE` | yes / yes |
| `WEB_SESSION_FAILURE` | chaos-proxy, `CLICK` | `WEB_SESSION_FAILURE` | `WEB_SESSION_FAILURE` | yes / yes |
| `MOBILE_SESSION_FAILURE` | chaos-proxy, `CLICK` (Android) | `MOBILE_SESSION_FAILURE` | `MOBILE_SESSION_FAILURE` | yes / yes |
| `INFRASTRUCTURE_FAILURE` | closed port (`ECONNREFUSED`) | `INFRASTRUCTURE_FAILURE` | `INFRASTRUCTURE_FAILURE` | yes / yes |
| `UI_ACTION_FAILURE` | chaos-proxy, `CLICK` | `INFRASTRUCTURE_FAILURE` | `INFRASTRUCTURE_FAILURE` | **no / no** |
| `UNKNOWN_FAILURE` | chaos-proxy, `CLICK` (message deliberately unclassifiable) | `INFRASTRUCTURE_FAILURE` | `INFRASTRUCTURE_FAILURE` | **no / no** |
| `DATA_SETUP_FAILURE` | backend chaos user (`locked_out_user`) | `UNKNOWN_FAILURE` | `TIMEOUT_FAILURE` | **no / no** |
| `ASSERTION_FAILURE` | backend chaos user (`problem_user`, $0 price) | `UNKNOWN_FAILURE` | *(0 failures — see below)* | **no / n/a** |
| `API_RESPONSE_FAILURE` | backend chaos user (`error_user`, 50% HTTP 500) | `UNKNOWN_FAILURE`×2, `TIMEOUT_FAILURE`×3 | `TIMEOUT_FAILURE`×7 | **no / no** |
| `TIMEOUT_FAILURE`, `PERFORMANCE_THRESHOLD_FAILURE` | backend chaos user (`performance_glitch_user`, +3s/call) | *(0 failures — see below)* | *(0 failures — see below)* | n/a / n/a |

4 of 10 injected conditions localize correctly, in both arms, with no exceptions in either direction —
the four are exactly the conditions whose true error text contains a keyword `failure-buckets.ts` already
has a rule for (`locator`/`selector`, `playwright`/`webdriver`, `appium`/`emulator`,
`econnrefused`). Every miss below is attributed to a specific, verified mechanism.

**Blast radius** — measured two ways. The atomic suite's `reads`/`writes` job split makes its raw
scenario totals (89–106) structurally incomparable to the twin's 16-row suite, and for the five
conditions injected at one `CLICK` call, exactly one scenario fails in *both* arms regardless of
architecture (the injection is single-fire by design — see the retry-masking fix below), so a raw
scenario-count blast radius of 1 in both arms does not distinguish the two suites. What does differ is
how much of the *same* failing scenario's own steps go on to `SKIP` once that one action fails — the
"wasted oracle" cost that design doc §6 means by blast radius:

| True bucket | Arm | Failed scenarios | Mean skipped steps per failed scenario |
|---|---|---|---|
| `LOCATOR_RESOLUTION_FAILURE` | atomic | 1 (reads) + 1 (writes), of 97 total | 11% (1/15, 3/19) |
| `LOCATOR_RESOLUTION_FAILURE` | twin | 1, of 16 total | 76% (13/17) |
| `UI_ACTION_FAILURE` | atomic | 1 + 1, of 97 total | 11% (1/15, 3/19) |
| `UI_ACTION_FAILURE` | twin | 1, of 16 total | 76% (13/17) |
| `WEB_SESSION_FAILURE` | atomic | 1 + 1, of 97 total | 11% (1/15, 3/19) |
| `WEB_SESSION_FAILURE` | twin | 1, of 16 total | 76% (13/17) |
| `UNKNOWN_FAILURE` | atomic | 1 + 1, of 97 total | 11% (1/15, 3/19) |
| `UNKNOWN_FAILURE` | twin | 1, of 16 total | 76% (13/17) |
| `MOBILE_SESSION_FAILURE` | atomic | 1 + 1, of 106 total | 9% (1/15, 2/19) |
| `MOBILE_SESSION_FAILURE` | twin | 1, of 16 total | 76% (13/17) |
| `INFRASTRUCTURE_FAILURE` | atomic | 97/97 (whole dispatch) | 17% (mean over 97 failures) |
| `INFRASTRUCTURE_FAILURE` | twin | 16/16 (whole dispatch) | 82% (mean over 16 failures) |
| `DATA_SETUP_FAILURE` | atomic | 86/97 (whole dispatch, see below) | 25% (mean over 86 failures) |
| `DATA_SETUP_FAILURE` | twin | 16/16 (whole dispatch) | 76% (mean over 16 failures) |

The four chaos-proxy conditions injected at the identical `CLICK` call (`LOCATOR_RESOLUTION_FAILURE`,
`UI_ACTION_FAILURE`, `WEB_SESSION_FAILURE`, `UNKNOWN_FAILURE`) reproduce the *exact same* per-arm skip
pattern every time — atomic loses 1 of 15 steps (reads job) or 3 of 19 (writes job) downstream of one
failed click; the twin loses 13 of 17. Because all four conditions share one call site and differ only in
error label, this consistency rules out injection-related noise as an explanation for the skip count at
*that* site, but it is one call site tested four ways, not four independent replications of a granularity
effect on its own. The stronger, more independent evidence comes from `INFRASTRUCTURE_FAILURE` and
`DATA_SETUP_FAILURE`: injected at a different fault bucket with whole-dispatch blast radius in *both*
arms for an unrelated reason (below), they still show the same direction (17%/25% atomic vs. 82%/76%
twin). Together, the two results are consistent with — though this evaluation's single call site and two
fault buckets do not on their own establish — a structural property of scenario granularity: one injected
fault wastes roughly **7×** as much of the twin's own oracle coverage as it wastes of the atomic suite's,
because the twin's single scenario still has login, catalog, size/topping selection, delivery, and order
confirmation queued up behind whichever step happened to fail.

**Correctly localized: `LOCATOR_RESOLUTION_FAILURE`, `WEB_SESSION_FAILURE`, `MOBILE_SESSION_FAILURE`,
`INFRASTRUCTURE_FAILURE`.** All four land on their true bucket in both arms with no ambiguity — these are
the conditions where the raw error text ("Unable to find element…", "Target closed…", "appium…",
"ECONNREFUSED…") happens to contain one of `failure-buckets.ts`'s existing keywords.

**Misclassified as `INFRASTRUCTURE_FAILURE`: `UI_ACTION_FAILURE` and `UNKNOWN_FAILURE` — a real,
root-caused classifier bug, not left unexplained.** Both conditions' injected error message is clean and
unambiguous at the first line (`"Injected fault: click interaction rejected by the target element"` and
`"Injected fault: unclassified synthetic marker (diagnosability harness)"` — the second deliberately
hand-written to be unclassifiable). But `diagnosability-table.ts` classifies the scenario's **full**
`errorMessage`, which — because every action reaches the plugin layer through `sendIntent`'s gRPC client
(`src/kernel/client.ts`) — always carries a stack trace through
`node_modules/.pnpm/@grpc+grpc-js@.../grpc-js/src/client.ts` underneath the first line. `INFRASTRUCTURE_FAILURE`'s
rule (`econnrefused|ehostunreach|enotfound|grpc|proxy|...`, rule #10 of 13 in `RULES`) matches the bare
substring `grpc` in that stack trace before rule #12 (`click|type|tap|...`, `UI_ACTION_FAILURE`'s own
keywords) or the true catch-all (`UNKNOWN_FAILURE`, reached only when *no* rule matches) is ever
evaluated. The second message is the sharper proof: a string written specifically so no keyword rule
would match it still gets swept into `INFRASTRUCTURE_FAILURE`, which means the classifier's real
"nothing else matched" fallback is **unreachable** for any error that passes through the kernel's gRPC
layer — every one of them contains "grpc" in its stack whether or not the fault is actually
infrastructure-shaped. This is left as-measured, not patched: `failure-buckets.ts` is the same classifier
§4.3's determinism table already reports bucket attributions from (its dominant `LOCATOR_RESOLUTION_FAILURE`
finding is unaffected — that keyword sits earlier in `RULES`, at rule #4 — but its attribution inherits
the same keyword-priority caveat for any future bucket rule ordered after #10). Fixing the rule order now
would silently rewrite an already-published result rather than report what was actually observed; noted
here as a known, disclosed defect for a follow-up change, not folded into this measurement retroactively.

**`DATA_SETUP_FAILURE` (`locked_out_user`) — whole-dispatch blast radius by design, two different wrong
labels.** Both arms authenticate through the same account for their entire run, so a chaos user that
rejects login at the backend fails every scenario that depends on it — not the single-scenario isolation
the four `CLICK`-injected conditions show. Atomic: 86 of 97 scenarios failed; the 11 that passed are
exactly the ones this condition cannot touch — 5 of the "Invalid login credentials" negative-outcome
scenarios (one of which, "Login rejected when user is locked out," already exercises this exact account
and already expects rejection, so the injected condition changes nothing about its outcome) plus 6
market-localization scenarios, which authenticate as `standard_user` rather than the injected account
(confirmed in `login/features/market-language-localization.feature`). Twin: all 16/16 fail,
since its one fused journey always starts with this same login. Neither arm's classifier names the true
bucket. Atomic's raw error (`"HttpError: Sorry, this user has been locked out."`) does not contain any of
`DATA_SETUP_FAILURE`'s own keywords (`seed|fixture|setup|precondition|login failed|could not
authenticate|data setup`) — it falls through every rule to the `UNKNOWN_FAILURE` fallback. The twin's UI
login never surfaces that backend text at all: rejected login leaves the twin waiting on a post-login
element (`getByTestId('logout-btn')`) that never appears, so what actually throws is
`"locator.waitFor: Timeout 20000ms exceeded... waiting for getByTestId('logout-btn')..."` — a genuine
timeout, correctly matching rule #1, but a **downstream symptom** of the injected cause, not the cause
itself. The same root fault produces two different observable failure shapes depending on whether login
is API-driven (atomic) or UI-driven (twin), and neither shape happens to carry a keyword the classifier
recognizes as "data setup."

**`ASSERTION_FAILURE` (`problem_user`, $0 prices) — atomic detects but misnames it; the twin does not
detect it at all, which is a coverage gap, not a diagnosability finding.** Atomic: 18/97 scenarios fail
with `"Pizza \"Marinara\" has invalid data: id=\"p06\", price=0"` — a bespoke guard in
`CheckoutRoute.findPizza` (`src/core/tests/checkout/organisms/checkout.route.ts:501-502`,
`if (!pizza.id || pizza.price <= 0) throw ...`). That message contains none of `ASSERTION_FAILURE`'s
keywords (`expected|assert|to equal|to contain|to be|should`) either, so it too falls to
`UNKNOWN_FAILURE` — atomic catches the fault but the classifier still misnames it. Twin: **0/16
failures** — confirmed by reading `evaluation/non-atomic-twin/checkout/organisms/checkout-nonatomic.route.ts`,
whose `prepareCheckoutContext` reads `cartItems[0]?.unit_price ?? 0` straight into `orderContext` with no
equivalent guard. This is a **test-coverage difference from the transformation process**, not evidence
about diagnosability under non-atomicity — the twin never gets the chance to localize a fault it never
observes.

**`TIMEOUT_FAILURE`/`PERFORMANCE_THRESHOLD_FAILURE` (`performance_glitch_user`, +3s/call) — a null
result.** Zero failures occurred in both arms. Median/max step durations rule out a failed injection as
the explanation: atomic max step duration 9,629ms vs. 1,047ms on a clean dispatch of the same suite;
twin 6,930ms vs. 1,865ms (both ~4–9× elevated), confirming the delay took effect. Neither arm's
wait/timeout thresholds are tight enough for a flat 3s-per-backend-call delay to trip a failure — this
application's UI-level timeouts are not sensitive to this specific magnitude of backend latency, in
either arm.

**`API_RESPONSE_FAILURE` (`error_user`, 50% random HTTP 500) — detected by both arms, localized correctly
by neither.** Atomic: 5/97 failures (2× `UNKNOWN_FAILURE`, 3× `TIMEOUT_FAILURE` — the injected 500 fires
at 50% probability, so which of the suite's checkout-touching scenarios it lands on varies run to run).
Twin: 7/16, all `TIMEOUT_FAILURE` — again a downstream UI wait, not the root HTTP failure. The raw backend text
(`"HttpError: Random checkout error triggered for testing purposes"`) never contains a status code or the
words `status`, so `API_RESPONSE_FAILURE`'s own rule (`status code|response status|expected
status|http \d{3}|unexpected status`) never fires for either arm on this backend's actual error format.

**Net.** Of the seven conditions that produced any failures at all, four localize correctly in both arms
(cases where the classifier already had the right keyword) and three do not, in either arm, for three
distinct and separately verified reasons: a keyword-priority bug in the shared classifier
(`UI_ACTION_FAILURE`/`UNKNOWN_FAILURE`), a true-cause message the classifier's keyword list simply
doesn't cover (`DATA_SETUP_FAILURE`, `ASSERTION_FAILURE`, `API_RESPONSE_FAILURE`), and one condition
whose UI-driven path replaces the root error with a generic downstream timeout before the classifier ever
sees it (the twin's login-dependent rows). What is not in question, on the seven conditions that produced
a signal at all: the atomic suite's per-scenario isolation confines the wasted-oracle cost of any single
fault to roughly a tenth of one scenario's steps, while the twin's fused journey wastes roughly
three-quarters of its own steps on the identical fault — the blast-radius asymmetry §3.2.4 predicts, holding
consistently across every condition where the comparison is structurally meaningful.

### 4.3 Determinism (pass↔fail transition rate across repeated runs)

**N=30 `run_index` values per arm per platform** (dispatched sequentially by the campaign orchestrator,
120/120 dispatches completed, 0 flagged `likelyInfra`; batch identifiers in Appendix A). Metrics below are at the
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

**Android: the predicted direction, at ~29× magnitude.** The twin's pass→fail transition rate (5.2%) is
approximately **29×** the atomic suite's (0.18%), and *every one* of the twin's 16 tracked scenarios
flipped state at least once, against 1 of the atomic suite's 98 — a ~98× difference in how much of each
suite's own scenario population shows any instability at all. Both arms' real failures are dominated by
the same `LOCATOR_RESOLUTION_FAILURE` bucket (100% of the atomic suite's 6 failing observations; 21/23,
91%, of the twin's) on Android/Appium UI interactions — the same failure mode already documented and
partially mitigated elsewhere in this project (the `chaos-proxy.ts` transient-retry widening, see
project history). Blast radius differs between arms: the atomic suite's R1/R2 isolation confines this
risk to whichever single scenario happens to touch the affected interaction (here, one topping-selection
assertion, hit on 6 of 30 repeats); the twin's long, cross-domain, R2-violating journey chains the same
class of interaction through login, catalog, size/topping selection, delivery, and order confirmation in
every one of its 16 concurrent instances. As a single campaign on one application, the ~29× ratio should
not be read as a value expected to generalize beyond this dataset; the direction and the blast-radius
pattern are what this result supports.

*(Read as a conservative/lower-bound delta — see §3.2.4: TOM's chaos suppression is identical in both
arms and still partially absorbs transient noise before it reaches this transition count.)*

### 4.4 Portability (cost to add a second platform)

Two separate measurements — see §3.2.4's "Note on the portability instrument's measurement" for why they
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
| Out-of-scope, Mobilewright (`login.wright.locators.json`, `Type.ts`) | 2 | 16 | No — out of §3.1.1 tool scope |

### 4.5 Execution efficiency (ancillary R3 measurement)

**Both legs reach this evaluation's N≥10 threshold.** Web: the already-completed parallel-safety `w1`
pair plus 10 dedicated repeats — N=11 atomic, N=176 twin. Android: 10 usable dedicated dispatches out of
13 attempted — N=10 atomic, N=159 twin. Both legs: the twin side gets a larger effective N "for free"
from its K identical Outline rows within each run. Dispatch identifiers, commands, and the full design
rationale are collected in Appendix A.

**Three Android repeats are excluded, not silently dropped — each for a distinct, investigated reason.**
One coincided with a first attempt at fixing the twin-android "add toppings" race that turned out to be
itself a regression — every topping-touching scenario failed deterministically that run (later reverted;
full story in Appendix A). Another failed 2/89 scenarios on the atomic side — a catalog-open click
unrelated to the topping-click mechanism above, and a toppings-total assertion whose own click had
already succeeded — confirmed via job logs as isolated Appium flakiness, not a reintroduction of the
topping-click regression (neither the failure count nor the specific step/error text matches that
pattern). The third failed before any scenario ran at all, on a connection reset while downloading the
Android APK from the release asset — confirmed as CI network infrastructure, unrelated to app or test
logic. In every case the extractor correctly refused the pair (the queried scenario had no valid PASS
row) rather than average in failed-run data.

**Web — N=11 atomic / N=176 twin, this evaluation's N≥10 threshold reached.** Reported with
spread, not just a point estimate, per §3.2.5's evidence policy now that N is adequate on this leg:

| Comparandum | Atomic mean ± sd (range) | Twin mean ± sd (range) | Ratio (twin/atomic) |
|---|---|---|---|
| Reach "logged in" | 87 ± 15ms (57-109) | 386 ± 295ms (193-2,267) | ≈4.4× |
| Reach "cart populated" | 244 ± 97ms (123-413) | 750 ± 207ms (455-1,501) | ≈3.1× |
| *(negative control)* catalog-click → builder rendered — UI-driven in both arms, no R3 substitution | 77 ± 10ms (58-90) | 66 ± 18ms (30-180) | ≈0.86× (near parity, as expected) |

The twin's wide login range (up to 2,267ms on one row) is consistent with occasional Render free-tier
cold-start latency already documented elsewhere in this evaluation — not excluded, since it's a real cost
the UI-driven path pays that the API-injected path structurally doesn't.

**Android — N=10 atomic / N=159 twin, this evaluation's N≥10 threshold reached.** Reported with
spread, not just a point estimate, per §3.2.5's evidence policy now that N is adequate on this leg:

| Comparandum | Atomic mean ± sd (range) | Twin mean ± sd (range) | Ratio (twin/atomic) |
|---|---|---|---|
| Reach "logged in" | 137 ± 76ms (52-280) | 12,929 ± 5,526ms (10,122-50,396) | ≈94.7× |
| Reach "cart populated" | 286 ± 86ms (130-415) | 25,854 ± 8,871ms (18,737-82,947) | ≈90.3× |
| *(negative control)* catalog-click → builder rendered — UI-driven in both arms, no R3 substitution | 3,135 ± 199ms (2,700-3,384) | 3,266 ± 384ms (2,684-5,627) | ≈1.04× (near parity, as expected) |

Ratios are stable across the growing N on both legs (web: 3.4-4.7× logged-in, 2.3-3.5× cart-populated
across all 11 atomic samples; Android: 85-127× logged-in, 78-90× cart-populated across all 10 usable
atomic samples spanning repeats 001-013) — directionally consistent with the earlier illustrative pass,
not an artifact of a small N.

The negative control's baseline is ~3.1-3.3s per Android UI interaction in both arms — Appium/mobile
automation is more expensive than Playwright/web regardless of arm. The atomic side's own API-call cost
is nearly platform-invariant (137ms/286ms Android vs. 87ms/244ms web), consistent with both platforms
hitting the same backend.

---

## 5. Discussion

The three corollaries derived in §2.4 receive markedly uneven empirical support from this evaluation,
and that unevenness is itself informative rather than a shortcoming to be smoothed over. Corollary 3
(deterministic diagnosis, from Rules 1 and 4) finds the clearest support across both the diagnosability
and determinism instruments; Corollary 1 (platform invariance, from Rule 3) finds structural and
ancillary support; Corollary 2 (parallel safety, from Rule 2) finds none, for a reason intrinsic to the
reference application rather than to the method.

The diagnosability instrument (§4.2) offers the sharpest illustration of what Rule 1's per-scenario
oracle constraint does structurally. Where an injected fault reaches only a single atomic scenario,
roughly a tenth of that scenario's own steps go on to skip (11%, `LOCATOR_RESOLUTION_FAILURE`); the
identical fault, injected into the non-atomic twin's fused journey, wastes roughly three-quarters of the
twin's steps (76%). This blast-radius asymmetry does not appear to be an artifact of suite size — the
four chaos-proxy conditions injected at an identical `CLICK` call reproduce the same per-arm skip
pattern on every dispatch — and plausibly reflects a structural consequence of scenario independence
rather than a coincidence of this particular fault set. A related asymmetry surfaces in the twin's
failure to detect the injected zero-price condition at all: `ASSERTION_FAILURE` is caught by the atomic
suite's API-path checkout route (a bespoke guard at `checkout.route.ts:501-502`) but never fires in the
twin, whose UI-chained checkout logic carries no equivalent check. This most plausibly follows from how
the non-atomic twin was constructed — by mechanically concatenating existing UI molecules (§3.2.3) rather
than re-deriving each domain's internal safety checks — though the evaluation did not test this
construction mechanism against an alternative non-atomic baseline, so the explanation is offered as the
most parsimonious account of the data available rather than an independently verified cause.

The determinism instrument (§4.3) extends this pattern from injected faults to naturally occurring
flakiness. On Android, the non-atomic twin's pass→fail transition rate (5.2%, 23/441) runs approximately
29× the atomic suite's (0.18%, 5/2,836), and every one of the twin's sixteen tracked scenarios flipped
state at least once across thirty repeats, against one of the atomic suite's ninety-eight. Micco's account of Google's test infrastructure [1] reports roughly 1.5% of all runs exhibiting some flaky
result; this evaluation's two arms straddle that figure on a single platform and a single reference
application, which invites caution about generalizing either number rather than treating the proximity
as validation. More consequential than the magnitude is the mechanism. Both arms' real failures are
dominated by the same `LOCATOR_RESOLUTION_FAILURE` bucket — a class of Android/Appium UI-timing
sensitivity already documented elsewhere in this project's own tooling. Read against Luo et al.'s flaky-test taxonomy [7], this divergence is worth naming precisely: Luo et al.'s dominant categories
center on asynchronous waits, concurrency, and — closest to the mechanism §2.1.6 already connects to
Meszaros's Shared Fixture pattern — test-order dependency arising from shared mutable state between
tests. Nothing in this dataset points to an order-dependency mechanism of that kind; the twin's account
is shared across concurrent journey instances (an R2 violation), but the flakiness observed here is a
UI-timing failure mode present, at lower frequency, in the atomic suite as well. The atomic-versus-twin
divergence, in other words, does not appear to be that the twin introduces a class of nondeterminism
absent from the atomic suite — the evidence available here does not support that stronger claim — but
that Rule 1's scenario independence confines an existing, platform-level failure mode to a narrow blast
radius, while the twin's fused journey exposes the identical failure mode across a much larger share of
its own scenario population. As a single campaign on one reference application, this reading should be
treated as a plausible account of the observed direction and mechanism, not as a magnitude expected to
generalize.

Corollary 1 (platform invariance) receives more direct, if narrower, support. The structural check in
§4.4 finds zero platform-conditional branches across both the atomic suite's eleven scanned files and
the twin's four — a symmetric result consistent with Rule 3's prediction that an atomic specification
carries no interface-specific logic. The ancillary execution-efficiency instrument (§4.5) adds a cost
dimension the structural check cannot: reaching an equivalent precondition state through API injection
costs roughly three to five times less step-time than the UI-driven equivalent on web (≈4.4×, ≈3.1×),
and on Android — where UI automation's own per-step cost runs roughly an order of magnitude higher than
on web, as the negative control's near-platform-invariant atomic-side baseline suggests — the same
substitution costs on the order of ninety times less (≈94.7×, ≈90.3×). This efficiency delta should not,
on its own, be read as further evidence of portability; the negative control's near-parity ratio (≈0.86×
web, ≈1.04× Android) on an operation with no Rule 3 substitution indicates that the ratio tracks the
injection mechanism specifically, rather than a general property of the atomic suite running faster.
Taken together, the two measurements support Corollary 1 on the single reference application and
toolchain evaluated here, without extending to a claim that every atomic specification ports at zero
marginal cost regardless of target platform or plugin maturity — a caveat this paper's own
tool-immaturity threat (§5.1) already discloses.

Corollary 2 (parallel safety) is the one prediction this evaluation cannot speak to, and that limitation
is stated plainly rather than argued around. The parallel-safety instrument (§4.1) returns a clean null
across the full planned sweep: zero failures in both arms at every worker level from one to eight
concurrent workers. As §2.4 already discloses, this is not evidence that concurrent execution is safe
under Rule 2 — OmniPizza's backend has no mutable state keyed by account, so the twin's shared-account
violation has no collision surface to expose at any concurrency this dataset tested. Corollary 2
therefore remains what it was before this evaluation began: a direct logical consequence of Rule 2's
disjoint-state requirement, supported by derivation rather than by data on this reference application.
Whether it holds empirically on an application with account-keyed mutable state is a question this
dataset was not positioned to answer.

Read together, the three corollaries do not receive uniform empirical weight, and the asymmetry tracks a
property of the reference application rather than a weakness in the evaluation design: OmniPizza happens
to carry no account-keyed backend state, which is precisely the condition Corollary 2 depends on, while
its UI layer exhibits the kind of platform-timing flakiness Corollary 3's diagnosability and determinism
instruments are well-positioned to exercise. This pattern is broadly consistent with — though not
identical to — the wider test-isolation literature's finding that flakiness has identifiable, catalogued
causes rather than being irreducibly random [7], [11]. Where this
evaluation's account differs is in treating scenario independence as a structural property enforced at
authoring time, rather than a condition to be detected, triaged, or randomized around once a suite
already exists.

### 5.1 Threats to validity

This section follows the standard construct/internal/external validity taxonomy for empirical
software-engineering studies [27]. The threats below are grouped by what they threaten, not by when they
were found.

#### 5.1.1 Construct validity

Whether this evaluation's instruments measure atomicity's effect rather than an artifact of how the
comparison was built is addressed directly in the design, not deferred to this section: §3.2.1 justifies
the comparative causal design over a single-suite descriptive one, and §3.2.2 grounds the non-atomic
twin's construction in a fixed, disclosed set of de-atomization operators, by analogy to the same
discipline mutation testing applies to its own mechanically-derived variants. §3.2.3 discloses this
paper's own operator set in full. The remaining threats below are ones that design does not by itself
resolve.

#### 5.1.2 Internal validity

The four threats below are properties of this specific evaluation's instrumentation that, if left
unaddressed, could produce a measured difference for a reason other than atomicity itself; each is
disclosed with what was found, what mitigates it, and whether that mitigation has been empirically
verified rather than merely built.

- **Tool-immaturity attribution (portability instrument).** See §3.2.4's dedicated note: a gap or defect
  in the mobile plugin's action coverage or reliability could inflate the twin's measured porting cost
  for reasons unrelated to atomicity — realized during this evaluation itself, when the originally-
  designated Mobilewright plugin proved unreliable on a two-picker interaction sequence and was swapped
  for Appium (§3.1.1). Mitigated by excluding plugin-gap-forced changes from the reported delta and
  disclosing them separately, but this requires active bookkeeping during construction, not a
  one-time check.
- **Browser-engine flakiness contaminating the determinism instrument** if cross-browser results were
  ever folded into it. Mitigated structurally, not just by disclosure: the primary causal instruments
  (§3.2.4) hold the browser constant at Chromium; cross-browser is a separate, secondary check (§5.2)
  and its results are never merged into the primary determinism/parallel-safety/diagnosability numbers.
- **Backend-load asymmetry contaminating the determinism instrument (mitigated in tooling and verified
  not to have materialized).** The twin's precondition is a real UI login plus UI cart-building on every
  journey row; the atomic arm's precondition is a single API `$S_0$` call. Both arms hit the same shared
  backend, but the twin issues materially more requests per run to do it. This project has independently
  documented, on two separate occasions outside this evaluation, that concurrent CI load against the
  reference application's backend produces mid-run 502/503/429 responses, and that job-start staggering
  does not prevent mid-run collisions once a run is underway (`ci(helix)` commits `7c2079c`/`b9a3151`,
  and the ZAP Path Traversal false-positive investigation that reproduced the same load-correlated
  pattern). If this recurred during the 120-dispatch determinism campaign (§3.2.4), it would have raised
  the twin's measured pass↔fail transition rate for a backend-capacity reason, not a method reason — a
  direct threat to the instrument that carries the paper's central causal claim. The backend hosting plan
  was since upgraded from Render's free tier (verified via a subsequent all-33-jobs-green `platform=all`
  run), which raises the load threshold before this triggers but does not remove the structural asymmetry
  itself — the twin still issues materially more requests per run than the atomic arm, so the confound is
  dormant, not eliminated by design. **Mitigated in tooling**: the campaign orchestrator enforces strictly
  sequential dispatch — one workflow dispatch, wait for terminal status, then the next — a hard
  concurrency cap of 1 forced by the CI workflow's own cancel-in-progress concurrency group, plus a
  disclosed `INFRASTRUCTURE_FAILURE`/`likelyInfra`-flagging rule that would have caught and excluded any
  load-correlated failure rather than silently folding it into the transition-rate count. **Verified, not
  just built**: the 120-dispatch determinism campaign and the 8-dispatch parallel-safety sweep both
  completed with **0 items flagged `likelyInfra`** — the confound did not manifest in either campaign's
  real data. The structural asymmetry itself is unchanged and could still resurface under a different
  load shape than either campaign exercised; reported as a mitigated, monitored, and empirically-checked
  risk, not a fully closed one.
- **Reference application has no natural parallel-safety collision surface (reframed, not mitigated).**
  OmniPizza's `InMemoryDB` has zero mutable state keyed by username — confirmed by reading
  `backend/database.py` and `backend/routers/auth.py` directly (see §3.2.4's reframing discussion for the
  exact locations: `database.py:89-91`, `auth.py:60`). This means the parallel-safety instrument
  (§3.2.4/§4.1) cannot empirically discriminate Corollary 2 via data-collision on this specific reference
  application, at any worker count — a limitation of this dataset's applicability to that corollary, not
  a refutation of the corollary itself, which remains a general logical consequence of Rule 2's
  disjoint-state requirement (§2.4). Also disclosed, hedged as noted-not-proven since it was not directly
  tested: this reframes the likely original motivation for `write-lock.hooks.ts` as probable
  backend-capacity protection rather than a correctness requirement in this application.

#### 5.1.3 External validity

The two threats below concern whether a finding here generalizes beyond this dataset, and are disclosed
as open rather than mitigated, since no evidence internal to this evaluation bears on either one.

- **Single reference application and author-authored implementation.** Every measurement in §4 comes
  from one system, OmniPizza, built and evaluated by the same author who defined the method being
  tested. Both raise the same concern from different angles: a single subject system may have
  properties — API-only precondition support, an unusually stateless backend (this section's fourth
  bullet above) — that happen to favor the atomic arm for reasons specific to this application rather
  than general to the method, and author-authored implementation and evaluation code invites
  unconscious confirmation bias that an independent replication would not share. Neither is mitigated
  within this evaluation; both are disclosed as open.
- **No independent replication yet.** Every result in §4 is a first-party measurement — no third party
  has re-run this evaluation's campaign scripts against this or another reference application. The
  campaign orchestrator, the fault-injection harness, and the de-atomization transformation ruleset are
  all published in this repository specifically so that replication is possible (§3.2.5's evidence
  policy), but possibility is not the same as having occurred.

### 5.2 Limitations

The limitations below are accepted rather than mitigated: each is a known, deliberate boundary on what
this evaluation covers, disclosed here so a reader does not mistake an unaddressed scope decision for an
oversight.

- Security is an implemented cross-cutting contract (since `5330693`, 2026-07-16 — ZAP web +
  MobSF mobile, contract-shaped on `login` and infra-shaped in `support/`) but is a deliberate scope
  exclusion from this paper's evaluation, not an unbuilt one — §3.1.1 fixes the tool scope to
  Playwright/Appium/API, and security's DAST-style checks don't map onto any of the four §3.2.4
  causal instruments as designed. Excluded from §4 results by scope, not by non-existence or
  oversight.
- Load/stress performance data conflation on same-day runs is a known, accepted limitation of the
  current dataset.
- **Cross-browser generalization is secondary, not primary.** Whether the atomic-vs-twin delta
  replicates across Firefox and WebKit (in addition to the Chromium-only primary instruments) is
  reported, if at all, as a bounded robustness check reusing the existing `pnpm test:all-browsers`
  orchestration — not as a repetition of the full §3.2.4 instrument suite. Scope was deliberately kept
  narrow here: browser engine is not the paper's causal variable, and a full browser × atomic/twin ×
  worker-count × repeated-run × mobile matrix would multiply experiment cost without testing a new
  hypothesis.

---

## 6. Conclusion

The evidence assembled here bears less on whether atomicity is a stylistic preference and more on where
an organization should locate its investment in test reliability: in detection and triage infrastructure
applied after a suite already exists, or in an authoring-time constraint that removes certain failure
classes from the space a suite can express at all. Rule 1's independence requirement does not compete
with the flaky-test detection and mitigation literature surveyed in §2.1.2; it changes what fraction of
that literature's problem space a suite can generate in the first place. Because the approach (Definition
1, §2.3) is decoupled from any specific execution architecture (§2.5.3), that implication is not tied to
AHM or to TOM specifically — it extends to any test-authoring discipline willing to adopt the same four
constraints, on whatever architecture already runs its suites.

The parallel-safety instrument was inconclusive: it could not observe Corollary 2 empirically because
OmniPizza's backend carries no mutable state keyed by account or session, not because the instrument was
under-powered or the comparison poorly constructed. The precondition the corollary's mechanism depends on
was simply absent from the application evaluated.

That specific limitation generalizes to a broader requirement for evaluating authoring-time test
properties: a reference application's own structural properties bound which corollaries an evaluation can
observe, independent of how carefully the comparative design controls the method under test. Future
evaluations of atomicity, or of any test-authoring discipline whose claims depend on a specific class of
application state, should treat the reference application's state model as a variable to be selected for,
not a convenience to be selected around.

The natural next test of Corollary 2 is therefore not a repetition of this evaluation's instrument at
larger scale on the same application, but a substitution of the reference application itself: a subject
system whose backend maintains mutable state keyed by account or session such that two concurrent
requests touching the same key genuinely contend — an order-aggregation or cart-mutation path with
server-side state shared across a session's requests, rather than one where every session mints an
independent record. Against such a system, the parallel-safety instrument would measure what this
evaluation's null result left open: whether an atomic suite's disjoint-state requirement actually
prevents the data collisions a non-atomic suite's shared fixtures invite, under the same worker-count
sweep and chaos-suppression policy used here. Corollary 2 remains, for now, a derivation without
empirical confirmation. Closing that gap is the specific work this evaluation leaves for the study that
follows it.

---

## Appendix A: Replication Package and Artifacts

This appendix collects the tooling, scripts, and provenance identifiers referenced from the Methodology
and Results sections, so that the main narrative can state findings without carrying command-line
invocations and raw identifiers inline.

**Computation scripts.** Each instrument in §3.2.4/§4 is computed by a dedicated script under
`scripts/experiments/`, invoked via a `pnpm experiments:*` command, and writes its output to a
gitignored file under `reports/` (regenerated on demand rather than trusted as a stale copy):
portability (`portability-delta.ts`), parallel safety (`parallel-safety-table.ts`), diagnosability
(`diagnosability-table.ts`), and execution efficiency (`execution-efficiency-delta.ts`, which reads
per-step duration records from `metrics/raw/cucumber-jsonl/*.jsonl`). The execution-efficiency
instrument's design rationale and rejected alternatives are recorded in
`docs/superpowers/specs/2026-08-25-execution-efficiency-instrument-design.md`. Cross-browser robustness
checks (§4, §5.2) reuse the existing `pnpm test:all-browsers` command.

**Non-atomic twin location.** The twin suite is placed at `evaluation/non-atomic-twin/`, outside
`src/core/tests/`, so that it is excluded from the reference implementation's own CI matrix by
construction rather than by a tag.

**Portability instrument: twin-only mobile-port commits.** Of the four files touched getting the twin's
Android mobile leg green, commits `342d2e0` and `6561098` correspond to the two files that survive into
the Appium-green state (one spec-forced, one plugin-gap); the two Mobilewright-era fixes made and later
abandoned are recorded in the reference implementation's own commit history rather than reproduced here.

**Mobile instrument substitution — full diagnostic narrative.** The Mobilewright defect referenced in
§3.1.1 was isolated on a card-entry screen with two sequential picker interactions: whichever picker
came second consistently failed to open, independent of which field it was. The defect is positional,
not field-specific; it is not a timing race; it is not a Mobilewright input-dispatch bug (a raw
OS-level tap at the same target also failed); and it is not an application defect (the identical
interaction sequence, on the same device and the same unmodified app build, completed correctly under
Appium). This elimination process is what grounds §3.1.1's claim that the substitution belongs to the
plugin surface, not to the method under test.

**Security implementation provenance.** The ZAP (web) and MobSF (mobile) security scans referenced in
§3.1.2 and §5.2 have been implemented in the reference repository since commit `5330693`.

**Execution-efficiency instrument: dispatch provenance.** Web: the `w1` pair (atomic-web GH run
`32768226121`, twin-web GH run `32793108181`) plus 10 dedicated repeats (`pnpm experiments:run-campaign
-- --instrument efficiency --platform-leg web --repeats 10`). Android: 10 usable dedicated dispatches out
of 13 attempted — repeats 001, 003, 004, 005, 006, 008, 009, 011, 012, 013 usable (`pnpm
experiments:run-campaign -- --instrument efficiency --platform-leg android --repeats 13`). Of the three
excluded Android repeats: repeat 2 (GH runs `33128635991`/`33130393523`) coincided with a first attempt
at fixing the twin-android "add toppings" race, commit `6a49706`, later reverted in `df0c637`; repeat 7
(atomic GH run `33186973238`) is the isolated-Appium-flakiness case; repeat 10 (twin GH run
`33213511299`) is the APK-download connection reset, confirmed via `gh run view 33213511299
--log-failed`.

**Citation verification.** All 27 references were independently verified against a real DOI, arXiv
identifier, URL, or ISBN — cross-checked against publisher or institutional-repository records rather
than assumed from title plausibility. Citation style follows IEEE numerical format, numbered by first
appearance in the text.

**CI and dispatch provenance.** §4's parallel-safety, diagnosability, and determinism instruments were
each computed from a labeled dispatch campaign executed through the reference implementation's GitHub
Actions workflows via a shared campaign-orchestrator script (`scripts/experiments/run-campaign.ts`):
parallel safety's 8-dispatch worker-level sweep (`ps-2026-campaign`), diagnosability's 20-dispatch
fault-injection campaign (`diag-2026-campaign`), and determinism's 120-dispatch `run_index`-repeated
batch (`experiment_batch_id=det-2026-campaign`). Individual run identifiers and per-run logs (including
the CI-infrastructure exclusions discussed in §4.1, §4.5, and §5.1) are preserved in the reference
repository's own Actions history.

---

## References

[1] J. Micco, "Flaky tests at Google and how we mitigate them," Google Testing Blog, 2016. [Online].
Available: https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html

[2] M. Cohn, *Succeeding with Agile: Software Development Using Scrum*. Boston, MA, USA:
Addison-Wesley Professional, 2009.

[3] M. Fowler, "TestPyramid," martinfowler.com, 2012. [Online]. Available:
https://martinfowler.com/bliki/TestPyramid.html

[4] K. C. Dodds, "Write tests. Not too many. Mostly integration.," kentcdodds.com, 2019. [Online].
Available: https://kentcdodds.com/blog/write-tests

[5] A. Schaffer and R. Dybeck, "Testing of microservices," Spotify Engineering, 2018. [Online].
Available: https://engineering.atspotify.com/2018/01/testing-of-microservices

[6] T. Winters, T. Manshreck, and H. Wright, Eds., *Software Engineering at Google: Lessons Learned
from Programming Over Time*. Sebastopol, CA, USA: O'Reilly Media, 2020, ch. 11, "Testing Overview,"
written by A. Bender.

[7] Q. Luo, F. Hariri, L. Eloussi, and D. Marinov, "An empirical analysis of flaky tests," in *Proc.
22nd ACM SIGSOFT Int. Symp. Found. Softw. Eng. (FSE 2014)*, Hong Kong, China, 2014, pp. 643–653,
doi: 10.1145/2635868.2635920.

[8] M. Eck, F. Palomba, M. Castelluccio, and A. Bacchelli, "Understanding flaky tests: The developer's
perspective," in *Proc. 2019 27th ACM Joint Meeting Eur. Softw. Eng. Conf. Symp. Found. Softw. Eng.
(ESEC/FSE 2019)*, Tallinn, Estonia, 2019, pp. 830–840, doi: 10.1145/3338906.3338945.

[9] W. Lam, R. Oei, A. Shi, D. Marinov, and T. Xie, "iDFlakies: A framework for detecting and partially
classifying flaky tests," in *Proc. 2019 IEEE 12th Int. Conf. Softw. Testing, Verification and
Validation (ICST 2019)*, Xi'an, China, 2019, pp. 312–322, doi: 10.1109/ICST.2019.00038.

[10] J. Bell, O. Legunsen, M. Hilton, L. Eloussi, T. Yung, and D. Marinov, "DeFlaker: Automatically
detecting flaky tests," in *Proc. 40th Int. Conf. Softw. Eng. (ICSE 2018)*, Gothenburg, Sweden, 2018,
pp. 433–444, doi: 10.1145/3180155.3180164.

[11] O. Parry, G. M. Kapfhammer, M. Hilton, and P. McMinn, "A survey of flaky tests," *ACM Trans. Softw.
Eng. Methodol.*, vol. 31, no. 1, Art. no. 17, pp. 1–50, 2022, doi: 10.1145/3476105.

[12] M. Utting, A. Pretschner, and B. Legeard, "A taxonomy of model-based testing approaches," *Softw.
Test. Verif. Reliab.*, vol. 22, no. 5, pp. 297–312, 2012, doi: 10.1002/stvr.456.

[13] M. Utting and B. Legeard, *Practical Model-Based Testing: A Tools Approach*. San Francisco, CA,
USA: Morgan Kaufmann, 2007.

[14] M. Broy, B. Jonsson, J.-P. Katoen, M. Leucker, and A. Pretschner, Eds., *Model-Based Testing of
Reactive Systems: Advanced Lectures*, Lecture Notes in Computer Science, vol. 3472. Berlin, Heidelberg:
Springer, 2005, doi: 10.1007/b137241.

[15] J. Dick and A. Faivre, "Automating the generation and sequencing of test cases from model-based
specifications," in *FME '93: Industrial-Strength Formal Methods*, Lecture Notes in Computer Science,
vol. 670, 1993, pp. 268–284, doi: 10.1007/BFb0024651.

[16] T. Y. Chen, S. C. Cheung, and S. M. Yiu, "Metamorphic testing: A new approach for generating next
test cases," Dept. Comput. Sci., Hong Kong Univ. Sci. Technol., Hong Kong, Tech. Rep. HKUST-CS98-01,
1998. Self-archived as arXiv:2002.12543 [cs.SE].

[17] E. T. Barr, M. Harman, P. McMinn, M. Shahbaz, and S. Yoo, "The oracle problem in software testing:
A survey," *IEEE Trans. Softw. Eng.*, vol. 41, no. 5, pp. 507–525, 2015, doi: 10.1109/TSE.2014.2372785.

[18] S. Segura, G. Fraser, A. B. Sánchez, and A. Ruiz-Cortés, "A survey on metamorphic testing," *IEEE
Trans. Softw. Eng.*, vol. 42, no. 9, pp. 805–824, 2016, doi: 10.1109/TSE.2016.2532875.

[19] T. Y. Chen, F.-C. Kuo, H. Liu, P.-L. Poon, D. Towey, T. H. Tse, and Z. Q. Zhou, "Metamorphic
testing: A review of challenges and opportunities," *ACM Comput. Surv.*, vol. 51, no. 1, Art. no. 4,
pp. 1–27, 2018, doi: 10.1145/3143561.

[20] D. North, "Introducing BDD," *Better Software* magazine; self-hosted at dannorth.net, 2006.
[Online]. Available: https://dannorth.net/blog/introducing-bdd/

[21] G. Adzic, *Specification by Example: How Successful Teams Deliver the Right Software*. Shelter
Island, NY, USA: Manning Publications, 2011.

[22] L. P. Binamungu, S. M. Embury, and N. Konstantinou, "Characterising the quality of behaviour
driven development specifications," in *Agile Processes in Software Engineering and Extreme
Programming (XP 2020)*, Lecture Notes in Business Information Processing, vol. 383. Cham: Springer,
2020, doi: 10.1007/978-3-030-49392-9_6.

[23] G. Meszaros, *xUnit Test Patterns: Refactoring Test Code*. Boston, MA, USA: Addison-Wesley
Professional, 2007.

[24] R. A. DeMillo, R. J. Lipton, and F. G. Sayward, "Hints on test data selection: Help for the
practicing programmer," *Computer*, vol. 11, no. 4, pp. 34–41, 1978, doi: 10.1109/C-M.1978.218136.

[25] Y. Jia and M. Harman, "An analysis and survey of the development of mutation testing," *IEEE
Trans. Softw. Eng.*, vol. 37, no. 5, pp. 649–678, 2011, doi: 10.1109/TSE.2010.62.

[26] M. Papadakis, M. Kintis, J. Zhang, Y. Jia, Y. Le Traon, and M. Harman, "Mutation testing advances:
An analysis and survey," *Adv. Comput.*, vol. 112, pp. 275–378, 2019, doi: 10.1016/bs.adcom.2018.03.015.

[27] C. Wohlin, P. Runeson, M. Höst, M. C. Ohlsson, B. Regnell, and A. Wesslén, *Experimentation in
Software Engineering*. Berlin, Heidelberg: Springer, 2012, doi: 10.1007/978-3-642-29044-2.
