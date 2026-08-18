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
- [x] **Twin scaffold exists** (discovered stale-checkbox 2026-07-23, see `docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md`): `evaluation/non-atomic-twin/` directory, `nonAtomicTwin` cucumber profile, the concatenated journey feature + step_definitions/organisms reusing existing molecules — all already built (currently K=8, being bumped to K=16). **Still open:** it has never been run live on any driver. Verify-and-tune (Playwright smoke run, then `DRIVER=mobilewright`) is the actual next task, not construction.
- [x] **Playwright leg verified live** (2026-07-23, commit `be6a04e`): first-ever live run found and fixed a real harness bug — `CheckoutNonAtomicRoute` was reusing atomic `CheckoutRoute` pieces designed to bootstrap a session from nothing (a second independent login call, and `injectBrowserSession()`'s `SEED_CHECKOUT_SESSION` which deletes the client-side `omnipizza-cart`), which destroyed the twin's real UI-built session/cart before reaching checkout. Fixed: read the real token/cart back from browser storage instead. 8/8 journey instances now green (120/120 steps); atomic `place-delivery-order.feature` re-verified green too (the fix touched two shared, exported helper functions). K is still 8, not yet bumped to 16. Mobilewright-Android leg not yet attempted.
- [ ] Implement the four delta instruments (§8.4): parallel-safety sweep (reuses the *existing* atomic checkout suite as-is on that arm — no new construction needed there), shared-layer fault-injection harness, determinism repeated-run plan, portability delta.
- [x] Repeated-run plan decided (2026-07-23, see `docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md`): **N=30** `run_index` values per arm, on **web (Playwright/Chromium) + Mobilewright-Android** (iOS excluded from the repeated determinism runs — macOS runner concurrency — but still covered by the one-shot portability instrument). Execution environment for **all four** §8.4 instruments: **GitHub Actions** `workflow_dispatch` (repo is public — no minutes ceiling), driven by an idempotent campaign orchestrator over the existing `experiment_batch_id`/`run_index` inputs. Parallel-safety sweep: **K=16** identical Outline rows, 1 dispatch per worker level (1/2/4/8).
- [ ] Abstract — write last, once Sections 4–5 and Results are stable.
- [ ] Related Work — needs actual literature search (test isolation, flaky tests, model-based testing, metamorphic testing; Test Pyramid/Trophy/Honeycomb as heuristic granularity baselines already named in the README). Also needs prior art on author-constructed baselines / mutation-testing-style transformation validity, since §8.1 leans on that argument.
- [ ] Results — blocked on the twin suites existing and on repeated runs of both arms through the unmodified TOM pipeline.
- [ ] References — pick a citation format (BibTeX vs. inline numbered) once we know the target venue.
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

> TODO. Candidate lines to cover:
> - Granularity heuristics: Test Pyramid (Cohn), Testing Trophy (Dodds), Testing Honeycomb (Spotify) — position these as *heuristic*, non-formal, and orthogonal to atomicity.
> - Test isolation and flaky test literature (e.g., Luo et al. on flaky tests, test order dependency research).
> - Model-based testing / formal specification-driven testing.
> - Metamorphic testing (as a contrast: metamorphic relations vs. atomic isolation).
> - BDD/Gherkin as a specification language — and where this work departs from typical BDD practice (no UI-driven `Given`, disjoint per-scenario state).
> - Microkernel / plugin-based test execution architectures (cite the companion TOM paper here, not re-explained).

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
  shared-state dependency explicitly (an escape hatch, not a violation).
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

> TODO — cover: visual, accessibility, and (proposed) security implemented as *contracts* attached to
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
touched to build it (§8.4). See `docs/superpowers/specs/2026-07-23-atomic-testing-evaluation-campaign-design.md`
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
| **Parallel safety** (from R2) | Atomic checkout suite's failure rate stays flat as concurrency increases (it already declares `@writes-shared-state` on `standard_user` and is serialized by the existing FIFO write-lock hook — verified in `write-lock.hooks.ts`, gated on that tag alone); the twin's climbs | Run the **existing, unmodified** atomic checkout suite (no new construction needed on this arm) and the twin's K-row Outline both at `CUCUMBER_PARALLEL = 1, 2, 4, 8`; plot failure rate vs. worker count for each | A curve isolates *where* contention starts; a single ratio hides that shape. Using the twin's K identical journey rows (not a fused/reduced scenario count) keeps the number of parallelizable units stable across sweep points — the flaw in the earlier fused-Outline design |
| **Diagnosability** (from R1, compounded) | A fault fails exactly the atomic scenario that owns it, classified into its true failure bucket; the same fault in the journey produces a wider blast radius (the whole journey fails) and can surface far from its true cause (e.g. a cart-calculation fault only manifesting at the order-confirmation assertion) | Systematic fault injection at a layer **both arms genuinely share** — backend/network, not UI vs. API setup, since the twin's setup is now all-UI while the atomic arm's is API and a setup-layer fault wouldn't be the "same" fault in both. One representative fault per entry in the existing 14-bucket taxonomy (`scripts/metrics/lib/failure-buckets.ts`). Measure blast radius (# scenarios/oracles failing) and localization accuracy (does the reported bucket name the true cause, or the symptom where it happened to surface) | Injecting from the *whole* taxonomy, at a shared layer, removes both fault-selection bias and arm-asymmetric injection as sources of bias |
| **Determinism** (from R4, mediated by R2) | The twin shows a higher pass↔fail transition rate across repeated runs than the atomic suite, *even with TOM's chaos suppression identical in both arms* | Repeat each suite across **N=30** `run_index` values under one `experiment_batch_id`, on **web (Playwright/Chromium) + Appium-Android** (iOS excluded from repetition), both arms at `retry: 0` (see §8.3) so a masked retry doesn't hide the signal; reuse the existing reliability infrastructure (`measure-reliability.ts`, pass→fail / fail→pass transition probabilities) | TOM's chaos suppression (`λ < 0`) only absorbs *transient* noise and fails fast on deterministic ones (README:27,48). R2 collisions in the twin are deterministic, not transient — TOM won't retry them away. That's the mechanism making the delta attributable to the method. Suppression applies identically to both arms, so it still partially masks method-induced flakiness in the twin too — read the delta as a **conservative, lower-bound** estimate |
| **Platform invariance** (from R3, Corollary 1) | Porting the atomic suites from Playwright (web) to Appium (Android + iOS) costs ~0 spec changes; porting the twin journey costs materially more | For both arms, measure LOC/files touched in the `.feature`/step-definition layer needed to also pass under Appium, with the API surface held as the common $S_0$ path on the atomic side (the twin's Appium-Android leg built for the determinism instrument is the artifact measured here — no separate construction) | Isolates the *specification*-level cost from the architecture, which is held constant and already supports both platforms |

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

### 8.5 Evidence policy (inherited from the framework's own norm)

Consistent with `docs/research/metrics-protocol.md` §9: no fabricated or estimated values. A metric
that cannot yet be computed (because the twin suites don't exist yet, or a given worker-count/run
count hasn't been executed) is reported as **not yet measured**, not as a placeholder number. Section
9 stays a skeleton until real runs exist.

---

## 9. Results

> TODO — blocked on: (1) building the de-atomized twin suites (§8.2–§8.3), (2) running both arms
> through the unmodified TOM pipeline for each instrument in §8.4. Skeleton below shows the target
> shape; **no values are estimated or filled until real runs produce them.**

### 9.1 Parallel safety

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

| Suite | run_index count | Fail→Pass transitions | Pass→Fail transitions | Flaky rate |
|---|---|---|---|---|
| Atomic | — | — | — | — |
| Non-atomic twin | — | — | — | — |

*(Read as a conservative/lower-bound delta — see §8.4.)*

### 9.4 Portability (cost to add a second platform)

| Suite | Files touched | LOC changed |
|---|---|---|
| Atomic | — | — |
| Non-atomic twin | — | — |

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

### 10.2 Limitations

> TODO — known, honest gaps to disclose rather than hide:
> - Security is a *proposed*, not implemented, cross-cutting contract — excluded from §9 results by
>   design, not oversight.
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

> TODO — pick citation style once venue is known. Placeholder numbered list to grow as sources are found in §2.

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
