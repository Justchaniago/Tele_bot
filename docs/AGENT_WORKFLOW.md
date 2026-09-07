# Tele Auto v2 --- Agent Implementation Workflow

**Version:** 1.0\
**Status:** Active Governance Contract\
**Applies to:** Tele Auto v2 implementation and migration\
**Primary product source of truth:** `Tele_Auto_v2_FINAL_PRD_v1.0.md`

------------------------------------------------------------------------

## 1. Purpose

This document defines how coding agents implement, review, and validate
Tele Auto v2.

Tele Auto uses two independent engineering agents:

-   **Agent A --- Codex:** Primary Implementer
-   **Agent B --- Gemini:** Independent Architecture & Reliability
    Reviewer

The objective is not to maximize agent activity. The objective is to
produce a small, reliable, secure, maintainable implementation that
conforms to the PRD without speculative complexity.

The agents have intentionally different responsibilities. They must not
operate as two simultaneous implementers on the same milestone.

------------------------------------------------------------------------

## 2. Authority Hierarchy

When instructions, existing code, agent preferences, or implementation
ideas conflict, use this order of authority:

1.  **Explicit current user decision**
2.  **Final PRD**
3.  **This Agent Workflow**
4.  **Verified existing production behavior that the PRD intentionally
    preserves**
5.  **Approved milestone scope / acceptance criteria**
6.  **Agent engineering judgment**

An agent must not silently override a higher-level contract because it
believes another design is cleaner.

If a real contradiction exists between higher-level sources, stop the
affected decision and report the contradiction precisely. Do not invent
a resolution.

------------------------------------------------------------------------

## 3. Non-Negotiable Product Invariants

Every implementation and review must preserve these invariants.

### 3.1 Tele Auto execution authority

Tele Auto owns its business execution.

Neo AVO is optional operational visibility. Neo AVO must never become
necessary for Production, Waste, Daily SO, Google Sheets mutation,
Telegram processing, or recovery.

Turning Neo AVO completely off must leave Tele Auto's core functions
operational.

### 3.2 Data integrity over guessing

When uncertain, Tele Auto may ask for clarification, delay a mutation,
or reject it.

It must never guess a spreadsheet mutation.

### 3.3 Fixed domain boundaries

`/production`, `/waste`, and `/dailyso` are explicit domains.

Production must never write Waste targets. Waste must never write
Production targets. AI, fuzzy matching, or parser errors must not be
able to escape the selected domain.

### 3.4 Spreadsheet authority

Tele Auto writes only the intended operational input cells defined by
the PRD and verified sheet schema.

It does not reproduce spreadsheet formulas, conversions, yields, UOM
calculations, or other spreadsheet-owned business calculations.

### 3.5 Exactly-once effect

Distributed delivery may occur more than once.

The target is **exactly-once business effect**, not exactly-once
delivery.

Retries, Telegram redelivery, Cloud Run restart, concurrent instances,
or UI response failures must not create duplicate or unintended
mutations.

### 3.6 Complexity must be earned

Do not introduce infrastructure, frameworks, abstractions, or generic
systems because they might be useful later.

Examples requiring concrete evidence before introduction include:

-   Redis
-   Kafka
-   Pub/Sub
-   generic queue infrastructure
-   microservices
-   Kubernetes
-   vector databases
-   generic Neo AVO SDK
-   generic repository/factory layers
-   self-learning production vocabulary
-   dynamic spreadsheet discovery when a fixed contract is safer

Use the simplest design that satisfies current correctness and
reliability requirements.

------------------------------------------------------------------------

## 4. Agent Roles

## 4.1 Agent A --- Codex / Primary Implementer

Codex is the only default implementation owner.

Codex responsibilities:

-   inspect the current repository before changing it;
-   understand relevant V1 behavior before replacing it;
-   implement only the active milestone;
-   create or modify production code;
-   create migrations/configuration required by the milestone;
-   add and run appropriate tests;
-   run static checks/build checks;
-   remove obsolete code only when replacement behavior is proven;
-   perform a self-review against the PRD;
-   produce a structured milestone implementation report;
-   address approved reviewer findings.

Codex may refactor when the refactor is required to implement the
milestone safely or removes demonstrated legacy complexity.

Codex must not:

-   change product semantics without approval;
-   silently broaden milestone scope;
-   introduce speculative infrastructure;
-   implement optional reviewer suggestions automatically;
-   weaken tests to make a milestone pass;
-   bypass failing safety checks;
-   hide unresolved assumptions;
-   modify Neo AVO to compensate for a Tele Auto design problem unless
    the active milestone explicitly includes a required Neo AVO contract
    change.

------------------------------------------------------------------------

## 4.2 Agent B --- Gemini / Independent Reviewer

Gemini is an adversarial reviewer, not a second primary implementer.

Gemini reviews the actual implementation produced by Codex against:

-   PRD compliance;
-   data integrity;
-   domain isolation;
-   parser safety;
-   date semantics;
-   correction behavior;
-   idempotency;
-   concurrency;
-   retry/recovery;
-   Cloud Run behavior;
-   security;
-   credential boundaries;
-   Neo AVO independence;
-   telemetry safety;
-   maintainability;
-   anti-overengineering constraints;
-   test quality and missing failure coverage.

Gemini should attempt to break the implementation using realistic
failure scenarios rather than merely reviewing style.

Gemini must not reject a milestone because it personally prefers a
different stack or architecture.

Examples that are **not sufficient reasons for rejection by
themselves**:

-   preference for Redis;
-   preference for Pub/Sub;
-   preference for microservices;
-   preference for a repository pattern;
-   preference for more interfaces;
-   preference for a different naming convention;
-   hypothetical future scalability without current evidence.

Gemini may identify these as optional observations only when useful, but
optional observations do not become implementation requirements
automatically.

------------------------------------------------------------------------

## 5. No Concurrent Conflicting Edits

Codex and Gemini must not edit the same milestone concurrently.

Default flow:

``` text
User / Product Contract
        ↓
      Codex
   implementation
        ↓
 self-test + report
        ↓
      Gemini
 adversarial review
        ↓
  ACCEPT / REJECT
```

Gemini reviews after Codex reaches a reviewable milestone state.

If Gemini identifies a required fix, implementation ownership returns to
Codex.

Gemini must not silently fix the implementation while reviewing unless
the user explicitly changes its role for that task.

This separation preserves independent review and prevents conflicting
edits.

------------------------------------------------------------------------

## 6. Milestone Protocol

Every implementation milestone follows the same lifecycle.

### Phase A --- Scope

Before editing, Codex must:

1.  read the relevant PRD sections;
2.  inspect the existing repository and relevant V1 behavior;
3.  identify exact files/systems affected;
4.  identify assumptions or missing implementation inputs;
5.  state the milestone acceptance criteria internally before coding.

Do not ask the user questions that can be answered by inspecting the
repository, existing configuration, tests, or verified spreadsheet
contract.

If a genuinely unresolved business decision would change mutation
semantics, stop and report it rather than guessing.

### Phase B --- Implementation

Codex implements the smallest coherent solution satisfying the
milestone.

Implementation should favor:

-   explicit code;
-   deterministic behavior;
-   centralized contracts;
-   bounded responsibilities;
-   fail-closed mutation safety;
-   structured error categories;
-   testable functions;
-   minimal dependencies.

### Phase C --- Verification

Codex must run relevant verification before reporting completion.

Depending on milestone scope, this includes:

-   unit tests;
-   parser corpus tests;
-   domain mapping tests;
-   mutation boundary tests;
-   concurrency/idempotency tests;
-   failure/retry tests;
-   type checking;
-   linting;
-   production build;
-   targeted integration tests.

Passing only the happy path is not sufficient for mutation-critical
milestones.

### Phase D --- Codex Self-Review

Codex checks its own work against:

-   active milestone acceptance criteria;
-   relevant PRD invariants;
-   security boundary;
-   legacy behavior being intentionally preserved;
-   unnecessary complexity introduced;
-   dead code or duplicated paths;
-   missing tests.

### Phase E --- Implementation Report

Codex produces the report defined in Section 8.

### Phase F --- Gemini Review

Gemini receives:

-   active milestone goal;
-   relevant PRD;
-   Codex report;
-   repository state / diff;
-   test evidence.

Gemini performs adversarial review and issues a verdict.

### Phase G --- Gate

Possible outcomes:

-   **ACCEPT** --- milestone closes.
-   **REJECT** --- one or more MUST FIX findings exist.
-   **ACCEPT WITH OPTIONAL FINDINGS** --- milestone closes; optional
    findings remain non-blocking unless separately approved.

A milestone must not remain artificially open because of speculative
SHOULD/OPTIONAL improvements.

------------------------------------------------------------------------

## 7. Review Severity Model

Gemini findings use the following severity.

### MUST FIX

A concrete issue that prevents milestone acceptance.

Examples:

-   violates PRD behavior;
-   can cause wrong spreadsheet mutation;
-   permits Production/Waste cross-write;
-   permits cross-store mutation;
-   breaks correction semantics;
-   creates duplicate business effects;
-   has a real concurrency race affecting correctness;
-   leaks credentials or sensitive payloads;
-   makes Neo AVO a core dependency;
-   unsafe retry can replay a mutation;
-   implementation cannot recover safely from a required failure
    scenario;
-   required acceptance test is absent or demonstrably inadequate.

Any valid MUST FIX finding means **REJECT**.

### SHOULD FIX

A demonstrated quality/reliability issue that is meaningful but does not
invalidate the current milestone contract.

A SHOULD FIX finding must explain:

-   concrete evidence;
-   realistic impact;
-   why fixing now is proportionate.

SHOULD FIX does not automatically authorize implementation. It is
evaluated before being added to scope.

### OPTIONAL

A nonessential improvement, preference, cleanup, or future possibility.

OPTIONAL findings:

-   do not block acceptance;
-   do not automatically become Codex work;
-   must not trigger infrastructure or abstraction growth without
    evidence.

------------------------------------------------------------------------

## 8. Codex Milestone Report Format

Codex must return a concise but auditable report.

``` markdown
# Milestone <ID> — Implementation Report

## Status
COMPLETE | BLOCKED

## Scope Implemented
- ...

## Files Changed
- `path/file` — purpose

## Product Contracts Satisfied
- PRD section / invariant → implementation evidence

## Tests / Verification
- command
- result

## Adversarial Cases Tested
- scenario → result

## Legacy Removed or Preserved
- ...

## Security / Data Integrity Notes
- ...

## Neo AVO Impact
- none | details
- confirmation that core execution remains independent

## Known Limitations / Pending Inputs
- ...

## Commit
- hash
```

A report must describe actual completed work, not planned work.

If blocked, identify the exact blocker and what evidence is missing.

------------------------------------------------------------------------

## 9. Gemini Review Report Format

Gemini must use:

``` markdown
# Milestone <ID> — Independent Review

## Verdict
ACCEPT | REJECT

## Scope Reviewed
- ...

## PRD Compliance
PASS | FAIL
Evidence:
- ...

## Data Integrity
PASS | FAIL
Evidence:
- ...

## Reliability / Recovery
PASS | FAIL
Evidence:
- ...

## Security
PASS | FAIL
Evidence:
- ...

## Neo AVO Independence
PASS | FAIL
Evidence:
- ...

## Anti-Overengineering
PASS | FAIL
Evidence:
- ...

## MUST FIX
1. [finding + evidence + impact + required outcome]
or
None.

## SHOULD FIX
1. ...
or
None.

## OPTIONAL
1. ...
or
None.

## Tests / Attacks Performed
- ...

## Final Gate
ACCEPT | REJECT
```

A finding without evidence should not be promoted to MUST FIX.

------------------------------------------------------------------------

## 10. Required Adversarial Review Areas

Gemini must select attacks relevant to the milestone rather than
mechanically running every case every time.

Across the complete Tele Auto v2 program, review must cover at least:

### Domain integrity

-   Waste term matching a Production SKU name.
-   Production term matching a Waste SKU name.
-   Attempted target outside domain allowlist.
-   Attempted write outside permitted column/cell.
-   Cross-store target attempt.
-   Spreadsheet schema mismatch.

### Parser safety

-   canonical SKU;
-   alias;
-   common typo;
-   fuzzy near-match;
-   genuinely ambiguous term;
-   unknown SKU;
-   AI invalid candidate;
-   AI candidate outside domain;
-   malformed quantity;
-   duplicate SKU with same value;
-   duplicate SKU with conflicting values.

### Date safety

-   today;
-   previous date during 00:00--03:00 WIB;
-   previous date after grace period;
-   historical backfill;
-   invalid calendar date;
-   future date;
-   ambiguous year/month.

### Mutation semantics

-   Production/Waste omitted SKU remains untouched;
-   Production/Waste `0` means blank;
-   Daily SO first snapshot auto-zero;
-   Daily SO subsequent omission remains untouched;
-   Daily SO explicit numeric zero;
-   same existing value becomes no-op;
-   different existing value requires correction protection;
-   no accumulation path exists.

### Transaction safety

-   invalid line after valid lines in one command block;
-   multiple command blocks in one Telegram bubble;
-   independent domains where one fails;
-   rapid separate messages.

### Distributed execution

-   Telegram update redelivery;
-   two users racing same target;
-   nonconflicting parallel targets;
-   Cloud Run restart;
-   transient dependency error;
-   Sheets commit followed by client timeout;
-   retry after uncertain result.

### Clarification

-   missing quantity;
-   ambiguous SKU;
-   correction confirmation;
-   second user attempts to answer first user's pending clarification;
-   expired clarification;
-   multiple pending runs.

### Telegram presentation

-   Sheets succeeds but reply fails;
-   edit-message fails after mutation;
-   presentation aggregation does not merge transaction identity.

### Neo AVO

-   normal telemetry;
-   duplicate event;
-   Neo AVO 500;
-   timeout;
-   offline;
-   invalid/rejected Neo AVO credential;
-   malformed telemetry;
-   restoration after outage;
-   sensitive-data leakage;
-   telemetry failure must not trigger business replay.

------------------------------------------------------------------------

## 11. Neo AVO Integration Governance

Neo AVO integration must remain a thin observability boundary.

Preferred responsibility:

``` text
business/domain code
        ↓
internal operational fact
        ↓
observability/neo-avo adapter
        ↓
map + sanitize + stable eventId
        ↓
Neo AVO canonical ingestion
```

Domain code must not depend on Neo AVO HTTP schemas, authentication
mechanics, or availability.

### Required properties

-   one Neo AVO project: `tele-auto`;
-   production environment identity;
-   store/domain represented as metadata;
-   Tele Auto owns its own Neo AVO credential;
-   GCP/Vertex/Sheets identity remains separate;
-   bounded telemetry timeout/retry behavior;
-   stable event IDs;
-   explicit schema version;
-   sanitized errors;
-   no raw Telegram updates;
-   no credentials/secrets;
-   no raw spreadsheet dump;
-   no business mutation rollback because telemetry failed.

### M9 / integration gate

Neo AVO integration is not accepted merely because an event appears in
the dashboard.

It must pass independence/chaos testing:

``` text
Neo AVO normal       → Telemetry works
Neo AVO HTTP 500     → Tele Auto works
Neo AVO timeout      → Tele Auto works
Neo AVO offline      → Tele Auto works
Duplicate event      → Deduplicated
Credential rejected  → Tele Auto works
Malformed telemetry  → Tele Auto works
Neo AVO restored     → Future telemetry resumes
Sensitive payload    → Release test fails
```

Final invariant:

> Turn Neo AVO completely off. Tele Auto must still execute Production,
> Waste, and Daily SO correctly.

------------------------------------------------------------------------

## 12. Commit Discipline

Prefer one coherent commit per accepted milestone or logically isolated
correction cycle.

Commit messages should describe the actual change, for example:

``` text
feat(tele-auto): add deterministic production and waste mappings
fix(parser): prevent ambiguous sku mutation
feat(runtime): add durable telegram update idempotency
feat(observability): add optional neo avo telemetry adapter
```

Do not mix unrelated cleanup into a mutation-critical milestone.

Before review, Codex should provide a clean diff that Gemini can audit.

Generated secrets, credentials, runtime state, local environment files,
and test artifacts must not be committed.

------------------------------------------------------------------------

## 13. Handling Existing V1 Code

Existing V1 behavior is evidence, not automatically the desired v2
contract.

Before replacing a V1 path:

1.  inspect what it currently does;
2.  determine whether the PRD preserves, changes, or retires that
    behavior;
3.  add coverage for the desired v2 behavior;
4.  migrate;
5.  remove the obsolete path only when replacement behavior is proven.

Do not retain unsafe V1 behavior merely for compatibility.

Known V1 failure classes such as Waste overwriting Production must be
eliminated structurally rather than patched with another heuristic.

------------------------------------------------------------------------

## 14. Handling PRD Ambiguity

Agents should first determine whether an apparent ambiguity can be
resolved from:

1.  explicit PRD language;
2.  explicit user decisions recorded in the active project context;
3.  verified production spreadsheet/schema;
4.  verified existing behavior that the PRD says to preserve.

If mutation semantics remain genuinely ambiguous, the agent must stop
that affected implementation decision and report:

``` text
AMBIGUITY:
<exact question>

WHY IT MATTERS:
<possible different business outcomes>

EVIDENCE CHECKED:
<files / PRD sections / behavior>

SAFE DEFAULT:
No mutation behavior implemented until resolved.
```

Do not silently select the most convenient interpretation.

------------------------------------------------------------------------

## 15. Testing Philosophy

Tests are protection for business invariants, not a coverage-number
exercise.

Prioritize tests around:

1.  wrong-write prevention;
2.  correction safety;
3.  idempotency;
4.  concurrency;
5.  uncertain external outcomes;
6.  parser ambiguity;
7.  domain/store isolation;
8.  Neo AVO independence.

A test that merely mocks every meaningful boundary and proves its own
mock is insufficient evidence for a reliability-critical milestone.

Use real integration/smoke tests where the milestone reaches a real
external boundary and safe test infrastructure is available.

Production data must not be mutated casually for testing.

------------------------------------------------------------------------

## 16. Agent Anti-Slop Rules

Both agents must avoid:

-   speculative abstractions;
-   duplicate implementation paths;
-   hidden fallbacks that change business semantics;
-   broad catch blocks that swallow fatal errors;
-   magic behavior that cannot be audited;
-   AI use where deterministic logic is sufficient;
-   comments/docs that claim guarantees not enforced by code;
-   future-proofing without a concrete second use case;
-   creating new infrastructure merely to satisfy reviewer taste;
-   rewriting stable unrelated code during a focused milestone.

Prefer one obvious path for each business operation.

Delete obsolete code once safe replacement is proven.

------------------------------------------------------------------------

## 17. Program-Level Completion Gate

Tele Auto v2 is not complete until:

-   PRD domain behavior is implemented for TP and PMS;
-   canonical SKU/schema inputs are verified;
-   parser hierarchy is safe;
-   domain and store write boundaries are enforced at the final mutation
    layer;
-   date contract is implemented;
-   corrections are protected;
-   duplicates and concurrency cannot silently corrupt data;
-   Cloud Run execution survives restart/retry safely;
-   legacy AWS/PM2/long-polling assumptions are retired where required;
-   production identities/secrets are clean;
-   Neo AVO integration passes independence and security gates;
-   Codex reports implementation complete;
-   Gemini independently returns ACCEPT;
-   remaining OPTIONAL findings are explicitly non-blocking.

------------------------------------------------------------------------

## 18. Working Principle

The two-agent system exists to create useful tension:

> **Codex is responsible for proving that the feature works. Gemini is
> responsible for proving that it is difficult to break.**

Neither agent is authorized to redefine the product.

The PRD remains the product contract, and unnecessary complexity is not
a substitute for correctness.
