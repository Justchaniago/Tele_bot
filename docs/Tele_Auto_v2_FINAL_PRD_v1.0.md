# Tele Auto v2 --- Final Product Requirements Document

PRD v1.0 • Reliability-first Telegram operational data entry • Neo
AVO-ready

Status: FINAL PRODUCT CONTRACT. Implementation-specific coordinates,
spreadsheet IDs, credentials, and the initial complete SKU/alias dataset
remain controlled implementation inputs and must be verified against the
real production sheets before release.

Product definition: Tele Auto v2 is a low-friction operational
data-entry system over Telegram for Production, Waste, and Daily SO.
Complexity belongs to the system, not to store staff.

## 1. Executive Product Contract

Tele Auto v2 accepts explicit Telegram commands, resolves human SKU
vocabulary safely, validates dates and quantities, and performs bounded
writes to fixed Google Sheets targets. It is designed for concurrent
store operations, Cloud Run execution, durable idempotency, safe
corrections, and optional operational telemetry to Neo AVO.

Primary invariant: when uncertain, Tele Auto may delay or reject a
write; it must never guess a spreadsheet mutation.

UX invariant: user simplicity must never be purchased by sacrificing
data integrity. Internal retries, queues, fuzzy matching, AI fallback,
and telemetry remain invisible unless human clarification is genuinely
required.

Neo AVO invariant: Tele Auto owns execution. Neo AVO owns operational
visibility. Neo AVO being unavailable must never prevent Tele Auto from
performing its core function.

### 1.1 Goals

-   Make Production, Waste, and Daily SO submission fast enough for real
    store operations.

-   Eliminate cross-section and wrong-cell writes by deterministic
    domain and sheet boundaries.

-   Handle common vocabulary, aliases, typos, ambiguity, duplicates,
    corrections, rapid messages, and concurrent users safely.

-   Run cleanly on Cloud Run without relying on process memory for
    correctness.

-   Provide useful, sanitized operational telemetry to Neo AVO without
    coupling business execution to Neo AVO.

-   Keep the implementation boring, inspectable, testable, and
    maintainable.

### 1.2 Non-goals

-   Tele Auto is not a spreadsheet calculation engine and must not
    reproduce formulas, conversions, yields, UOM logic, or business
    calculations already owned by Sheets.

-   Tele Auto is not an autonomous workflow engine or generic automation
    platform.

-   AI must not decide mutation domains, spreadsheet cells, rows,
    columns, or future dates.

-   Neo AVO is not an execution dependency, credential broker, model
    gateway, or business database for Tele Auto.

-   No speculative Redis, Kafka, Pub/Sub, vector database, microservice
    split, or generic SDK unless later evidence requires it.

## 2. Actors, Stores, and Authority

Initial stores: TP/TP6 and PMS. Store authority is derived from trusted
Telegram deployment/chat configuration. The user does not select or
override the store in a command.

All authorized users in the configured Telegram context may submit and
correct operational data. v2 does not introduce correction RBAC.
Accountability is provided through audit records.

| Concern \| Contract \|

| --- \| --- \|

| Store selection \| Derived from trusted Telegram
  context/configuration; never inferred by AI or free-text. \|

| Correction permission \| Allowed for all authorized Tele Auto users in
  that store context. \|

| Audit actor \| Record stable Telegram actor identifier where
  permitted, run ID, timestamp, store, domain, date, SKU, old value, and
  new value. Do not send raw private content to Neo AVO. \|

| Cross-store write \| Forbidden. A TP context cannot mutate PMS targets
  and vice versa. \|

## 3. User-facing Domains and Commands

Only three mutation domains are supported. Commands are strict and
complete:

``` text
/production
/waste
/dailyso
```

Aliases such as /prod, /wst, /so, plain-text domain names, or
AI-inferred commands are not part of the v2 contract.

Every command block requires an explicit date in Indonesian day-first
semantics. A single Telegram bubble may contain multiple command blocks.

### 3.1 Transaction boundary

One command block equals one business transaction. One Telegram bubble
does not equal one transaction.

The entire message is segmented and structurally parsed before mutation
begins. Independent valid command blocks may complete independently.
Failure of one domain must not roll back an unrelated domain that
already completed safely.

Within a single command block, all lines must resolve and validate
before mutation begins. A block with an unresolved or conflicting line
is held for clarification; already-valid lines from that same block are
not written early. This prevents half-applied business commands.

## 4. Date Safety Contract

Date is mandatory because store reports may legitimately be entered
after midnight. Tele Auto must never silently substitute the current
date.

Accepted semantics are DD-MM-YY or DD-MM-YYYY with reasonable separator
normalization. US MM-DD interpretation is forbidden.

| Classification \| Behavior \|

| --- \| --- \|

| TODAY \| Normal processing. \|

| PREVIOUS DAY at 00:00--03:00 WIB \| NORMAL_LATE_CLOSING. Process
  normally without historical warning. \|

| PAST DATE outside late-closing grace \| Allowed as
  backfill/correction. Existing target values determine whether
  correction protection is required. \|

| FUTURE DATE \| Block mutation. Never silently write future operational
  data. \|

| INVALID CALENDAR DATE \| Reject/clarify; no mutation. \|

| Suspicious/ambiguous year or month \| Clarify; no silent
  interpretation. \|

No arbitrary 2-day/7-day/30-day historical tiers are required in v2.
Historical input is allowed, while overwrite protection and audit
provide safety.

## 5. Production Domain Contract

Production writes only to the hardcoded Production section of the
correct store workbook and correct date tab. SKU targets are
deterministic and write only to Column D.

``` text
date → store workbook → date tab → PRODUCTION mapping → canonical SKU → fixed Production row → Column D
```

-   No global worksheet SKU search.

-   No search into Waste.

-   No accumulation. A submitted quantity represents the desired value,
    not an increment.

-   Omitted SKUs remain untouched/blank as they currently are.

-   Quantity 0 means blank/null for Production; it is not stored as
    numeric zero.

-   A different existing value is a correction candidate and requires
    correction protection before overwrite.

-   The same existing value is a no-op and must not generate unnecessary
    mutation.

-   Writing outside the Production allowlist or outside Column D is
    forbidden.

## 6. Waste Domain Contract

Waste follows the same mutation semantics as Production but has a
completely separate hardcoded Waste section and SKU-row mapping.

``` text
date → store workbook → date tab → WASTE mapping → canonical SKU → fixed Waste row → Column D
```

A SKU that exists in both Production and Waste is not ambiguous after
the command domain is known. /waste can never resolve to or write a
Production row.

-   No accumulation.

-   Omitted SKUs remain untouched.

-   Quantity 0 means blank/null.

-   Different existing value is a correction candidate.

-   Same existing value is a no-op.

-   Write guard must reject every target outside the Waste allowlist and
    Column D.

## 7. Daily SO Domain Contract

Daily SO uses a fixed row-per-SKU and day-column matrix. There are
separate store spreadsheets with the same domain behavior.

First submission for a store/date creates a complete Daily SO snapshot:
explicitly provided SKUs use submitted quantities and every omitted
valid Daily SO SKU is written as numeric 0.

Subsequent submissions are corrections: only explicitly provided SKUs
may change. Omission on a subsequent submission must never reset another
SKU to zero.

| Case \| Daily SO behavior \|

| --- \| --- \|

| First submission: SKU supplied \| SET submitted numeric value. \|

| First submission: valid SKU omitted \| SET numeric 0 with
  AUTO_FILL_MISSING provenance. \|

| Explicit `SKU 0` \| SET numeric 0 with USER_EXPLICIT provenance. \|

| Subsequent submission: SKU omitted \| Untouched. \|

| Subsequent: same value \| No-op. \|

| Subsequent: different value \| Correction candidate. \|

| SKU mentioned but quantity missing \| Incomplete input; ask for
  quantity. Do not treat as omission. \|

The sheet value for explicit zero and auto-filled zero may be identical,
but audit provenance must distinguish them.

## 8. Sheet Integrity and Hardcoded Boundaries

The production spreadsheet layout is a fixed operational contract.
Hardcoding domain boundaries and canonical SKU-to-row targets is
intentional because it eliminates a known V1 failure mode in which Waste
input could overwrite Production.

Hardcoding must be centralized in domain sheet-schema modules rather
than scattered raw coordinates.

``` text
Canonical SKU ID + Domain + Store/Sheet Contract → deterministic target cell
```

Before mutation, the write layer must assert: expected domain, allowed
row, allowed column, and---where practical---expected SKU label/schema
identity. A mismatch must fail closed as SHEET_SCHEMA_MISMATCH.

Principle: it is preferable to fail a write than to succeed against the
wrong SKU, section, store, date, or cell.

## 9. Canonical SKU Vocabulary and Parsing

A canonical SKU registry is required before production rollout.
Vocabulary is domain-scoped and maps human language to stable internal
SKU IDs. Spreadsheet coordinates are not parser output.

``` text
raw line
→ normalize
→ exact canonical match
→ exact alias match
→ fuzzy match
→ AI fallback only when needed
→ final domain/schema validation
→ canonical SKU ID + quantity
```

Vocabulary contains real human terminology and aliases, not exhaustive
manually enumerated typos. Typo tolerance belongs to fuzzy matching. AI
handles residual ambiguity, not normal cases.

| Layer \| Responsibility \|

| --- \| --- \|

| Normalizer \| Whitespace, casing, punctuation/separator normalization
  without changing business meaning. \|

| Canonical/alias resolver \| Deterministic resolution of known
  terminology. \|

| Fuzzy matcher \| Conservative typo tolerance inside the
  already-selected domain. \|

| AI fallback \| Resolve residual language ambiguity from bounded valid
  candidates; structured output only. \|

| Final validator \| Reject any candidate outside the command domain or
  canonical registry. \|

| Domain service \| Maps canonical SKU ID to deterministic sheet target
  and business semantics. \|

Ambiguous vocabulary such as a bare `medium` where both Medium G1 and
Medium Local are valid must not be silently assigned to either SKU. Ask
the user.

Unknown vocabulary must not be AI-forced to the nearest SKU. AI has no
authority to select rows/cells or expand the valid SKU universe.

### 9.1 Controlled vocabulary improvement

Parser telemetry may reveal repeated noncanonical terminology. Neo AVO
may surface this operationally, but production aliases are promoted only
through deliberate developer review. Tele Auto must not self-modify its
production vocabulary.

## 10. Quantity Contract

Quantity parsing must be deterministic. Negative values and malformed
numbers are invalid. Production/Waste numeric zero maps to blank/null;
Daily SO numeric zero remains a valid numeric value.

Whether non-integer quantities are operationally valid is an
implementation input that must be verified against the actual
SKU/business data before release. The implementation must not invent
unit conversion rules. If the production contract confirms integer-only
quantities, enforce integer-only validation centrally.

## 11. Corrections and Existing Data

There is no accumulation mode. Re-submission never means ADD.

| Existing target \| New desired value \| Behavior \|

| --- \| --- \| --- \|

| Blank \| Valid nonzero value \| Normal SET. \|

| Same value \| Same value \| No-op; success may be reported without
  write. \|

| Different value \| Different value \| Correction candidate; require
  explicit user confirmation before overwrite. \|

| Production/Waste nonblank \| 0 \| Correction candidate from old value
  → BLANK; require confirmation. \|

| Daily SO nonzero \| 0 \| Correction candidate to numeric zero; require
  confirmation. \|

Correction confirmation must show enough business context to prevent
accidental approval: domain, report date, SKU, old value, and proposed
value. It must not require resending the whole command.

## 12. Clarification and Pending Context

Clarification is used only when human input is genuinely required:
ambiguous SKU, missing quantity, conflicting duplicate line, or
correction confirmation.

Initial clarification TTL is 15 minutes and must be configurable. After
expiry, an unrelated response must not revive the old mutation.

Pending context must be isolated at least by chat ID + user ID + run ID.
Another user in the same group must never satisfy someone else's pending
clarification.

When possible, use one-tap Telegram choices for bounded
ambiguity/correction decisions. Execution must not be delayed merely to
aggregate presentation.

## 13. Duplicate, Idempotency, and Concurrency

Telegram delivery can be duplicated and Cloud Run instances can execute
concurrently. Correctness must not depend on in-memory Maps, arrays, or
a single process.

Technical delivery deduplication uses Telegram update_id or an
equivalently stable Telegram delivery identity. Business execution uses
durable run identity and mutation protection.

Target exactly-once effect, not exactly-once delivery.

| Scenario \| Required behavior \|

| --- \| --- \|

| Same Telegram update redelivered \| Suppress duplicate business
  effect. \|

| Same SKU twice, same value in one block \| Collapse safely. \|

| Same SKU twice, different values in one block \| Clarify before any
  block mutation. \|

| Two users write same business target concurrently \| Serialize/protect
  conflicting mutation scope; never last-write blindly. \|

| Different nonconflicting scopes \| May execute concurrently. \|

| Three rapid messages from one user \| Accept independently; user need
  not wait for previous reply. \|

| Cloud Run restart \| Durable state permits safe continuation/retry
  without double mutation. \|

Mutation contention scope must be derived from actual write targets.
Because Production and Waste can share a worksheet, the implementation
must lock/protect the concrete business target rather than assuming
domain names alone are always sufficient.

## 14. Multi-command Messages and Response UX

A single Telegram message may contain /production, /waste, and /dailyso
blocks. Segment first, structurally validate blocks, then execute each
block according to its own transaction boundary.

Different valid domains can complete independently. A failure in Daily
SO does not retroactively undo a successfully committed Production
transaction.

For rapid separate messages, multiple internal runs may be represented
by an aggregated editable bot status message. This is presentation only;
runs remain independent.

If a business mutation completes but Telegram message editing/reply
fails, the business run remains COMPLETED. Never repeat a spreadsheet
mutation merely to repair UI delivery.

## 15. Durable Execution and Cloud Run

Tele Auto v2 targets Cloud Run. The webhook path should
authenticate/validate, deduplicate, durably accept the run, and return
promptly. Long Gemini/Sheets work should not unnecessarily hold the
Telegram webhook request open.

Durable run state must survive instance restart and horizontal
concurrency. Existing Firestore usage is a candidate for this role and
must be audited before introducing another queue/state technology.

Do not add Pub/Sub, Cloud Tasks, Redis, or another queue merely because
they are common patterns. Add infrastructure only if the implementation
proves the simpler durable design insufficient.

Cloud Run service identity/ADC should be used for GCP services. Do not
create static credential JSON files at runtime when workload
identity/service-account credentials can be used.

## 16. Retry, Timeout, and Failure Recovery

Retries are bounded and restricted to transient failures. Business
validation failures are not retryable.

| Retryable examples \| Non-retryable examples \|

| --- \| --- \|

| Network timeout; 429; temporary 5xx/503; temporary
  Telegram/Vertex/Sheets transport failure \| Malformed command; invalid
  date; unknown SKU; unresolved ambiguity; invalid quantity;
  permission/auth denial; schema mismatch \|

The dangerous case is an uncertain write outcome: Sheets may have
committed even if the client timed out. Recovery must inspect durable
run/target state and avoid blind mutation replay. SET semantics and
idempotent mutation planning should be used wherever possible.

Fatal failures must be visible through structured logs and operational
telemetry; they must not be silently swallowed.

## 17. Success and Run State

Business success is defined by confirmed intended spreadsheet effect,
not by Telegram reply delivery.

Recommended durable run lifecycle:

``` text
RECEIVED → PARSING → NEEDS_CLARIFICATION | READY → EXECUTING → COMPLETED | FAILED
```

Additional internal states may be used only when they clarify real
recovery behavior; avoid ceremonial state machines.

Telegram response status is separate from business mutation status.

## 18. Neo AVO Integration Contract

Neo AVO integration is first-class but optional to Tele Auto execution.
Tele Auto emits sanitized operational facts through a thin adapter.
Domain modules must not know Neo AVO HTTP/auth details.

``` text
Tele Auto business result
→ internal operational fact
→ Neo AVO adapter: map + sanitize + stable event ID + bounded delivery
→ POST /api/v1/events
→ Neo AVO durable ingestion
```

Neo AVO project identity: one project `tele-auto`, environment
`production`. Store and domain are metadata, not separate Neo AVO
projects.

Tele Auto uses its own Neo AVO project credential. Its GCP/Vertex/Sheets
runtime identity remains separate. Neo AVO must never distribute model
or Sheets credentials.

### 18.1 Telemetry requirements

-   Canonical Neo AVO event types only; do not invent Tele Auto-specific
    event taxonomy without a demonstrated need.

-   Stable eventId so retries/duplicates can be deduplicated by Neo AVO.

-   schemaVersion explicit.

-   Sanitize errors; never send secrets, tokens, credential material,
    full Telegram updates, or raw spreadsheet content.

-   Useful metadata may include domain, store, result, duration,
    resolver mode, SKU count, auto-zero count, retry count,
    correction/no-op/duplicate flags, and sanitized failure category.

-   Telemetry delivery must be bounded. Neo AVO timeout/500/offline must
    not block, fail, or cause replay of a business mutation.

-   Telemetry failure must remain visible through local structured
    logging without recursively generating uncontrolled failures.

### 18.2 Neo AVO health model

Tele Auto should expose execution-based operational facts rather than
pretending a continuously warm Cloud Run instance equals health. Neo AVO
may derive health from recent successful executions, failures,
dependency degradation, and expected scheduled activity where
applicable.

No Tele Auto-specific Neo AVO dashboard is required for v2. The
canonical project/task/event/incident surfaces should be sufficient.

### 18.3 Neo AVO independence / chaos acceptance gate

| Test \| Pass condition \|

| --- \| --- \|

| Neo AVO normal \| Sanitized telemetry arrives and deduplicates. \|

| Neo AVO HTTP 500 \| Tele Auto business execution remains correct. \|

| Neo AVO timeout/slow \| User/Sheets path is not materially blocked by
  telemetry. \|

| Neo AVO offline \| All three Tele Auto domains continue operating. \|

| Duplicate telemetry event \| Neo AVO deduplicates stable eventId. \|

| Neo AVO credential rejected \| Core Tele Auto remains functional;
  failure logged safely. \|

| Malformed telemetry payload \| Core mutation remains unaffected. \|

| Neo AVO restored \| Future telemetry resumes without replaying
  business mutations. \|

| Sensitive-data test \| Secret/raw-content leakage test fails the
  release if detected. \|

## 19. Security Requirements

-   Authenticate Telegram webhook authenticity using the supported
    secret/token mechanism and trusted deployment configuration.

-   Resolve store only from trusted configuration; never trust
    user-supplied store identifiers for write authority.

-   Use least-privilege service identities for
    Sheets/Firestore/Vertex/Neo AVO.

-   Secrets live in runtime secret/config facilities, never source
    control or logs.

-   Separate Neo AVO credentials from GCP model/data identities.

-   Do not log full Telegram updates by default.

-   Validate every AI output against domain and canonical registry
    before use.

-   Enforce sheet write allowlists at the final mutation layer even if
    upstream parsing is wrong.

-   Audit corrections and destructive blanking operations.

-   Fail closed on schema mismatch or authorization ambiguity.

## 20. Observability

End users see outcomes; developers see complexity through structured
logs and Neo AVO.

| Normal operational facts \| Interesting/degraded \| Incident-worthy \|

| --- \| --- \| --- \|

| Exact/alias/fuzzy success, latency, no-op, normal completion \| AI
  fallback, retry, ambiguous/unknown vocabulary, correction, suspicious
  duplicate, slow execution \| Persistent Sheets failure,
  auth/permission failure, repeated parser/AI failure, Telegram
  dependency failure, schema mismatch, stuck execution, unrecoverable
  mutation failure \|

Severity and notification policy belong to Neo AVO's deterministic
incident engine. Tele Auto should emit facts, not decide every
escalation channel.

## 21. Suggested Clean Module Boundaries

This is an implementation shape, not a requirement to create ceremonial
abstractions. Equivalent clean structure is acceptable.

``` text
src/
├── app/
│   ├── server.ts
│   └── config.ts
├── telegram/
│   ├── webhook.ts
│   ├── router.ts
│   └── response.ts
├── parsing/
│   ├── normalize.ts
│   ├── parse-input.ts
│   ├── fuzzy.ts
│   ├── ai-resolver.ts
│   └── vocabulary/
├── domains/
│   ├── production/
│   │   └── sheet-schema.ts
│   ├── waste/
│   │   └── sheet-schema.ts
│   └── daily-so/
│       └── sheet-schema.ts
├── execution/
│   ├── run-state.ts
│   ├── idempotency.ts
│   ├── concurrency.ts
│   └── retry.ts
├── integrations/
│   ├── sheets.ts
│   ├── firestore.ts
│   └── vertex.ts
└── observability/
    ├── logger.ts
    └── neo-avo.ts
```

Avoid repository/factory/interface layers that have only one real
implementation unless they create a concrete testability or safety
benefit.

## 22. Legacy Migration Requirements

-   Remove AWS-specific deployment/ECR artifacts once Cloud Run cutover
    is proven.

-   Remove PM2/ecosystem dependencies not needed by Cloud Run.

-   Replace long polling with webhook-oriented deployment behavior.

-   Move scheduler responsibilities out of a fragile in-process
    30-second loop; use a Cloud Run-compatible authenticated scheduling
    mechanism if those reminders remain required.

-   Audit panel-server/panel features; retain only functionality with a
    real operational purpose after Neo AVO observability exists.

-   Do not perform a risky big-bang deletion before equivalent v2
    behavior has acceptance coverage.

## 23. Release Acceptance Criteria

-   All three domains pass deterministic happy-path tests for TP and
    PMS.

-   Waste can never write a Production row; Production can never write a
    Waste row.

-   Final write layer rejects out-of-allowlist row/column targets.

-   Daily SO first snapshot auto-fills omitted SKUs to numeric zero;
    later correction does not reset omitted SKUs.

-   Production/Waste omitted SKUs remain untouched and submitted zero
    produces blank semantics.

-   No accumulation behavior exists.

-   Correction confirmation prevents silent overwrite/blanking.

-   Date late-closing behavior is correct through 03:00 WIB; future
    dates cannot mutate.

-   Strict command vocabulary enforced.

-   Alias/fuzzy/AI resolver cannot escape the selected domain.

-   Ambiguous and unknown SKU cases never silently mutate.

-   Technical Telegram duplicate does not duplicate business effect.

-   Concurrent conflicting writes are protected.

-   Cloud Run restart/retry cannot blindly duplicate a successful
    mutation.

-   Clarification expires safely and is isolated between users/runs.

-   Sheets success + Telegram reply failure does not trigger business
    replay.

-   Neo AVO chaos/independence gate passes.

-   Sensitive-data leakage tests pass.

-   Structured logs provide enough evidence to debug failed runs without
    raw-secret exposure.

-   V1 behavior needed for real operations is either preserved
    intentionally or explicitly retired.

## 24. Adversarial PRD Validation Performed

Before finalization, this PRD was challenged against the following
failure classes. The resulting safeguards are incorporated into the
contract.

| Attack / edge case \| Resulting requirement \|

| --- \| --- \|

| Waste SKU name also exists in Production \| Hardcoded domain mapping +
  final allowlist; no global search. \|

| One invalid line after several valid lines \| Validate/resolve entire
  command block before mutation; no partial line-by-line write. \|

| Daily SO omitted SKU then later correction \| First snapshot auto-zero
  only; subsequent omissions untouched. \|

| Production/Waste `0` against existing value \| Treat as correction to
  BLANK, not silent deletion. \|

| Same Telegram update delivered twice \| Durable technical idempotency.
  \|

| Two staff modify same target concurrently \| Conflict-aware
  serialization/protection at concrete mutation target. \|

| Sheets commits then client times out \| No blind retry; recover using
  durable run/target state. \|

| AI confidently returns invalid SKU \| Final canonical/domain
  validation rejects it. \|

| Bare ambiguous term such as `medium` \| Human clarification; no silent
  nearest-match mutation. \|

| User answers another user's clarification \| chat + user + run
  isolation. \|

| Old clarification reply arrives late \| 15-minute configurable TTL;
  expired context cannot mutate. \|

| Three commands in one bubble, one bad \| Independent block
  transactions; bad block does not corrupt valid domains. \|

| Three separate rapid bubbles \| Independent durable runs; no need for
  user to wait. \|

| Telegram response fails after Sheets success \| Business remains
  COMPLETED; UI failure cannot cause replay. \|

| Neo AVO down/slow/500 \| Core Tele Auto unaffected. \|

| Neo AVO telemetry duplicate \| Stable eventId + Neo AVO dedup. \|

| Spreadsheet layout unexpectedly changes \| Schema assertion/write
  guard fails closed. \|

| Future date typo \| Mutation blocked. \|

| After-midnight previous-day report \| Normal through 03:00 WIB. \|

| Cross-store spoof in message \| Store derived from trusted Telegram
  configuration, not user text. \|

### 24.1 Anti-overengineering review

The PRD intentionally avoids prescribing external queues, Redis,
microservices, a generic Neo AVO SDK, dynamic spreadsheet discovery,
self-learning vocabulary, or AI-first parsing. These are rejected until
real production evidence demonstrates a need.

The strongest complexity retained is complexity that directly protects
data integrity: durable idempotency, conflict protection, correction
confirmation, fixed sheet boundaries, clarification context, and bounded
telemetry.

## 25. Implementation Inputs Still Required Before Production Release

These are not unresolved product architecture decisions; they are
concrete production data/configuration that must be verified during
implementation:

-   Exact TP and PMS spreadsheet/workbook identifiers and month/date-tab
    selection rule.

-   Exact Production canonical SKU list and fixed row mapping per
    relevant sheet contract.

-   Exact Waste canonical SKU list and fixed row mapping.

-   Exact Daily SO canonical 9-SKU row mapping and day-column mapping
    for both stores.

-   Initial alias vocabulary derived from current V1 vocabulary and real
    staff terminology.

-   Confirmation of whether any SKU legitimately accepts decimal
    quantity; otherwise enforce integer-only.

-   Telegram bot/webhook configuration and authorized store-context
    mapping.

-   GCP service identity permissions and secret references.

-   Neo AVO production project credential/configuration and endpoint.

-   Audit of existing Firestore data/model before selecting it for
    durable run state.

## 26. Definition of Done

Tele Auto v2 is done when staff can submit Production, Waste, and Daily
SO with the existing low-friction Telegram workflow;
wrong-domain/wrong-cell writes are structurally prevented; corrections,
duplicates, concurrency, retries, and restarts cannot silently corrupt
data; Cloud Run operation is production-safe; and Neo AVO provides
useful operational visibility while remaining completely optional to
business execution.

Final release invariant: turn Neo AVO completely off. Tele Auto must
still execute all three domains correctly.

## Appendix A --- Core Behavior Matrix

| Behavior \| Production \| Waste \| Daily SO \|

| --- \| --- \| --- \| --- \|

| Date mandatory \| Yes \| Yes \| Yes \|

| Domain target \| Hardcoded Production \| Hardcoded Waste \| Hardcoded
  Daily SO \|

| Write target \| Column D \| Column D \| SKU row × day column \|

| Missing SKU first input \| Untouched \| Untouched \| Auto numeric 0 \|

| Missing SKU later \| Untouched \| Untouched \| Untouched \|

| Explicit 0 \| Blank/null \| Blank/null \| Numeric 0 \|

| Accumulation \| Never \| Never \| Never \|

| Different existing value \| Correction \| Correction \| Correction \|

| Same existing value \| No-op \| No-op \| No-op \|

| AI may select cell \| Never \| Never \| Never \|

| Cross-domain lookup \| Never \| Never \| Never \|

## Appendix B --- Mandatory Test Corpus Categories

-   Canonical names, common aliases, spacing/casing/punctuation
    variants.

-   Common typos resolvable by fuzzy matching.

-   Near-identical SKUs and genuinely ambiguous abbreviations.

-   Unknown SKUs that must fail safely.

-   Missing, zero, negative, malformed, and---if applicable---decimal
    quantities.

-   Invalid calendar dates, future dates, today, previous day
    before/at/after 03:00 WIB, historical dates.

-   Duplicate same-value and conflicting-value lines.

-   Existing-cell no-op, correction, and Production/Waste
    clear-to-blank.

-   Multi-command bubble and rapid independent bubbles.

-   Two users racing on same SKU/date/store and on nonconflicting
    targets.

-   Telegram redelivery, Cloud Run restart, Sheets timeout after
    possible commit.

-   Vertex timeout/429/5xx and AI invalid structured output.

-   Neo AVO timeout/500/offline/credential failure/duplicate event.

-   Schema mismatch and attempted out-of-bound write.
