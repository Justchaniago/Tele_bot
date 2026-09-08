# Tele Auto V2 × Neo AVO Integration PRD

**Document:** `NEO_AVO_INTEGRATION.md`
**Status:** Integration Contract — Ready for Implementation
**Systems:** Tele Auto V2 Production × Neo AVO
**Integration mode:** Observe-first / telemetry-first

## 1. Purpose

Integrate **Tele Auto V2 production** with **Neo AVO** so Neo AVO provides centralized operational visibility, health, activity, incidents, and later AI-assisted operational analysis without becoming part of Tele Auto's business execution path.

> **Tele Auto owns execution. Neo AVO owns operational visibility.**

The integration is successful only if Tele Auto continues to perform its core function normally when Neo AVO is unavailable.

## 2. Scope

Tele Auto V2 production domains in scope:
- Production
- Waste
- Daily SO

Neo AVO capabilities in scope:
- project registry
- operational events/activity
- availability and operational health
- incidents/alerts
- investigation context
- deep links
- later AI Ops analysis

**Tele Auto V1 is completely out of scope. No migration, compatibility layer, legacy events, or legacy integration is required.**

## 3. Goals

1. Register Tele Auto V2 as a production project in Neo AVO.
2. Receive meaningful operational events from Tele Auto.
3. Show activity with store and domain context.
4. Separate availability from operational health.
5. Surface meaningful failures/incidents without alert noise.
6. Deduplicate repeated telemetry.
7. Minimize sensitive data exposure.
8. Preserve independent deployment and runtime.
9. Prove Tele Auto remains functional during Neo AVO failure.
10. Establish a clean contract for future bounded commands without implementing them now.

## 4. Non-Goals

Initial integration does not include:
- moving Tele Auto execution/scheduling/recovery into Neo AVO
- direct Neo AVO writes to Google Sheets
- arbitrary Neo AVO mutation of Tele Auto Firestore
- shared Telegram/GCP/Vertex credentials
- generic workflow engine or new event broker
- second durable business queue solely for telemetry
- Redis/Kafka/Temporal/BullMQ/Kubernetes/microservice decomposition
- arbitrary shell/remote-code execution
- automatic remediation
- Neo AVO → Tele Auto commands
- Tele Auto V1 compatibility

## 5. Mandatory Architectural Invariants

### INV-01 — Independence
No project may depend on Neo AVO to perform its core function.

### INV-02 — Execution Authority
Tele Auto remains sole authority for Telegram processing, parsing, SKU resolution, validation, clarification/confirmation, Sheets mutations, durable business state, retries, reconciliation, and recovery.

### INV-03 — Visibility Authority
Neo AVO owns cross-project visibility, event persistence, activity, health, incidents, alerts, investigation surfaces, and AI Ops interpretation.

### INV-04 — Failure Isolation
Neo AVO outage, timeout, credential failure, 5xx, or internal error MUST NOT reject, retry, roll back, duplicate, or materially delay a Tele Auto business operation.

### INV-05 — Business Success
Neo AVO telemetry delivery is never part of Tele Auto business success.

### INV-06 — No Direct Mutation
Neo AVO MUST NOT directly write Tele Auto Sheets or arbitrarily mutate Tele Auto durable business state.

### INV-07 — Observe First
Initial direction is one-way:

`Tele Auto V2 → Neo AVO`

Commands are deferred.

### INV-08 — Credential Separation
Neo AVO project credentials are independent from Telegram, worker, GCP, Sheets, and Vertex credentials.

### INV-09 — Repository Ownership
Neither project's agent owns the other project's implementation. The contract is the boundary.

## 6. Ownership

### Tele Auto agent owns
- inspect current Tele Auto architecture/runtime
- choose minimal integration seam
- internal fact → event mapping
- sanitization
- deterministic event identity
- bounded telemetry delivery
- Tele Auto configuration/deployment
- Tele Auto-side verification
- Neo AVO failure-isolation proof
- preserving existing production behavior

### Neo AVO agent owns
- inspect current Neo AVO architecture/runtime
- project registration/authentication
- generic event ingestion
- validation/dedup/persistence
- activity projection
- availability/health projection
- incident/alert interpretation
- dashboard/UI integration where applicable
- Neo AVO deployment and verification

If one side needs a capability from the other, report a **contract gap** instead of modifying the other repository.

## 7. Target Architecture

```text
Telegram
   |
   v
Tele Auto V2
   |
   +--> Firestore / durable state
   +--> Google Sheets
   +--> Vertex AI
   +--> Telegram status
   |
   +--> sanitized operational telemetry
              |
              v
           Neo AVO
              |
              +--> Event ingestion
              +--> Event store
              +--> Activity
              +--> Health
              +--> Incidents / alerts
              +--> AI Ops context
```

Telemetry is non-authoritative for Tele Auto execution.

## 8. Tele Auto Integration Boundary

Prefer the existing observability boundary. Conceptually:

```text
internal operational fact
→ map
→ sanitize
→ stable eventId
→ bounded Neo AVO POST
```

Do not introduce a generic SDK unless the current architecture genuinely requires one. Domain code should not know Neo AVO transport/auth/persistence details.

The Tele Auto agent owns the exact implementation after inspecting current `main`.

## 9. Project Identity

Canonical identity:

```yaml
projectId: tele-auto
name: Tele Auto V2
environment: production
type: operational-automation
```

Optional safe metadata:

```yaml
runtime: cloud-run
gcpProject: tele-auto-v2-prod
```

## 10. Authentication

Use a dedicated Tele Auto → Neo AVO project credential.

Requirements:
- scoped to Tele Auto
- stored in deployment secret/config system
- never committed or logged
- independently rotatable
- compromise must not grant Telegram, Sheets, Vertex, or GCP access

Neo AVO agent chooses the exact mechanism consistent with current Neo AVO security architecture.

## 11. Event Ingestion Contract

Prefer/reuse Neo AVO's generic project-event ingestion endpoint, conceptually:

```http
POST /api/v1/events
```

Expected pipeline:

```text
authenticate
→ validate
→ deduplicate eventId
→ persist
→ 202
→ asynchronous projections/analysis
```

Do not create Tele Auto-specific endpoints such as `/api/tele-auto` unless an existing Neo AVO architecture makes generic ingestion impossible and the agent reports why.

## 12. Event Envelope

Semantic minimum:

```yaml
eventId: string
eventType: string
occurredAt: ISO-8601

projectId: tele-auto
environment: production

runId: string | null
store: PMS | TP6 | null
domain: PRODUCTION | WASTE | DAILY_SO | null

status: string | null
severity: INFO | WARNING | ERROR | CRITICAL
executionPhase: string | null
errorCode: string | null
durationMs: number | null

metadata: object
```

Exact representation may follow existing Neo AVO schema conventions while preserving these semantics.

## 13. Idempotency

Re-delivering the same logical event MUST NOT duplicate activity or incidents.

Conceptual stable identity:

```text
tele-auto:<runId>:<eventType>:<durable-version-or-transition-id>
```

Exact algorithm is owned by the Tele Auto agent. It must be deterministic for the same logical event. Neo AVO deduplicates by `eventId`.

Do not generate a new random event ID for each retry of the same logical event.

## 14. Initial Event Taxonomy

Prioritize meaningful operational facts, not every state transition.

```text
tele_auto.run.received
tele_auto.run.processing
tele_auto.run.needs_clarification
tele_auto.run.awaiting_confirmation
tele_auto.run.completed
tele_auto.run.failed
tele_auto.run.effect_uncertain

tele_auto.worker.recovery
tele_auto.telegram.delivery_failed
tele_auto.sheets.schema_mismatch
```

Agents may align names to established Neo AVO conventions while preserving semantic coverage.

## 15. Event Semantics

- `run.received`: trusted business run durably accepted; INFO.
- `run.processing`: meaningful execution began; INFO; optional if redundant/noisy.
- `run.needs_clarification`: normal user interaction; INFO; not automatically incident.
- `run.awaiting_confirmation`: protected correction waiting for user; INFO; not automatically incident.
- `run.completed`: Tele Auto durable successful terminal state; INFO.
- `run.failed`: failure; severity reflects transient/final/operational significance.
- `run.effect_uncertain`: external effect cannot be proven; high-value error telemetry.
- `worker.recovery`: recovery took meaningful action; isolated successful recovery is not automatically critical.
- `telegram.delivery_failed`: Telegram status failed; MUST NOT imply business mutation failure.
- `sheets.schema_mismatch`: mutation blocked because live spreadsheet contract mismatched expected schema; operationally significant.

## 16. Sanitization

MUST NOT transmit:
- raw Telegram update/message text
- Telegram bot/webhook secrets
- worker secrets
- Neo AVO credential
- Google/GCP/Vertex credentials
- authorization headers/private keys
- raw spreadsheet contents/arbitrary rows
- unrelated user data

Prefer:
- run/update identifiers where safe
- store
- domain
- normalized status/error code
- execution phase
- duration
- bounded technical metadata

SKU/quantity data should not be included by default. Extend only if a demonstrated operational need exists.

## 17. Delivery Semantics

1. Delivery is bounded by a short timeout.
2. Failure is isolated.
3. Business execution never waits indefinitely.
4. Telemetry failure never triggers business-operation replay.
5. Neo AVO response never determines Tele Auto business success.
6. Duplicate delivery is safe through event idempotency.
7. Do not add a second durable business queue solely for initial telemetry.

Do not over-engineer telemetry reliability before production evidence requires it.

## 18. Availability vs Operational Health

Neo AVO must keep two dimensions.

Availability:

```text
ONLINE / STALE / OFFLINE / UNKNOWN
```

Operational health:

```text
HEALTHY / DEGRADED / FAILING / UNKNOWN
```

Examples:

```text
runtime reachable + normal runs → ONLINE + HEALTHY
runtime reachable + repeated schema failures → ONLINE + DEGRADED/FAILING
runtime unavailable → OFFLINE + appropriate health state
```

No business events for a period MUST NOT automatically mean OFFLINE.

Existing Tele Auto health/readiness endpoints may be used if compatible with Neo AVO architecture.

## 19. Activity Projection

Neo AVO should present operational meaning, e.g.:

```text
PMS · Daily SO · Completed
TP6 · Production · Completed
PMS · Waste · Needs clarification
TP6 · Production · Failed
```

Useful context/filters where supported:
project, environment, store, domain, status, severity, time.

## 20. Incident Policy

Normally NOT incidents:
- clarification
- confirmation
- normal correction
- run receipt/completion
- isolated successful recovery

Incident candidates:
- EFFECT_UNCERTAIN
- repeated final/retryable failures
- spreadsheet schema mismatch
- persistent worker recovery failure
- runtime offline
- sustained Telegram delivery failure
- sustained observability authentication/ingestion failure

Neo AVO owns aggregation and suppression. One event does not necessarily equal one incident.

## 21. AI Ops

Neo AVO AI Ops may summarize incidents, correlate failures, explain likely causes, suggest investigation steps, and identify patterns.

AI Ops MUST NOT decide Tele Auto mutations, write Sheets, mutate Tele Auto durable business state, replay operations, or auto-remediate in this integration.

Machines determine what happened; AI helps explain why and what to consider.

## 22. Deep Links

Neo AVO may link to safe operational surfaces such as project detail, approved Cloud Run/log views, repository, or run investigation surfaces.

No secrets in links. Editable Google Sheet deep links are not required.

## 23. Commands — Deferred

Neo AVO → Tele Auto commands are explicitly OUT OF SCOPE initially.

Possible future bounded commands:

```text
retry safe run
trigger recovery sweep
re-send Telegram status
```

Future invariant:

> Neo AVO requests. Tele Auto validates, decides, and executes.

No arbitrary shell/command interface.

## 24. Configuration

Tele Auto may require config conceptually equivalent to:

```text
NEO_AVO_ENABLED
NEO_AVO_BASE_URL
NEO_AVO_PROJECT_ID
NEO_AVO_ENVIRONMENT
NEO_AVO_API_TOKEN
NEO_AVO_TIMEOUT_MS
```

Exact names follow repo conventions.

Integration must be safely disable-able. Secrets are never committed. Runtime Neo AVO unavailability must not stop Tele Auto.

## 25. Integration Sequence

Agents own implementation autonomously. Recommended convergence order:

1. Neo AVO agent inspects current Neo AVO.
2. Verify/prepare generic event ingestion and `tele-auto` project identity.
3. Establish project credential/config.
4. Tele Auto agent inspects current Tele Auto.
5. Implement minimal adapter/event mapping.
6. Configure Tele Auto with Neo AVO endpoint/credential.
7. Deploy each side using its existing mechanism.
8. Verify end-to-end event delivery.
9. Verify Neo AVO failure isolation.
10. Close integration.

This is not a micro-milestone prompting requirement.

## 26. Mandatory Verification

### Contract
- Tele Auto authenticates as `tele-auto`.
- valid events accepted.
- invalid auth rejected.
- duplicate eventId does not duplicate activity.
- required fields validated.
- sensitive/raw payload not emitted.

### End-to-End
A normal Tele Auto V2 production operation continues through its existing flow with Neo AVO enabled and representative events appear in Neo AVO.

### Failure Isolation — Release Critical
Simulate an unreachable Neo AVO endpoint, controlled timeout, or temporary 5xx and prove:

```text
Tele Auto command accepted
→ processes normally
→ intended Sheets behavior remains correct
→ Telegram business outcome remains correct
→ no duplicate business effect
```

Restoring Neo AVO must not require repair of Tele Auto business state.

## 27. Acceptance Criteria

- [ ] `tele-auto` represented in Neo AVO.
- [ ] normalized operational events emitted.
- [ ] dedicated authentication works.
- [ ] events validated and persisted.
- [ ] duplicate events idempotent.
- [ ] sanitization requirements satisfied.
- [ ] meaningful activity visible.
- [ ] PMS and TP6 distinguishable.
- [ ] Production/Waste/Daily SO distinguishable.
- [ ] clarification/confirmation treated as normal activity.
- [ ] meaningful failures contribute appropriately to health/incidents.
- [ ] availability and operational health separate.
- [ ] Neo AVO outage does not break Tele Auto.
- [ ] Neo AVO timeout cannot duplicate Tele Auto business effects.
- [ ] no Neo AVO dependency in critical business path.
- [ ] no direct Neo AVO → Sheets mutation.
- [ ] no Tele Auto V1 compatibility layer.
- [ ] commands remain deferred.
- [ ] each project deploys independently.

## 28. Definition of Done

> A real Tele Auto V2 production operation can execute normally, Neo AVO can observe its operational lifecycle, and deliberately making Neo AVO unavailable does not alter Tele Auto's business outcome.

Tests alone are not Done. A dashboard alone is not Done. The independence boundary must be proven.

## 29. Agent Working Rules

Each repository agent must:
1. read this contract;
2. inspect its own repository/runtime before changing code;
3. reuse existing primitives;
4. choose the smallest correct implementation;
5. implement autonomously;
6. test critical contracts rather than maximize test count;
7. deploy through existing project mechanisms;
8. inspect real runtime behavior;
9. fix genuine blockers until convergence;
10. avoid unrelated refactors and hypothetical architecture.

Do not repeatedly stop for ordinary implementation decisions.

Stop only for:
- contradictory contract;
- genuine missing cross-project capability;
- owner-only credential/authorization;
- unsafe unknown production mutation risk;
- required violation of an architectural invariant.

When stopped, report one concrete blocker and the minimum action required.

## 30. Agent Handoff Format

```text
PROJECT:
Tele Auto V2 | Neo AVO

INTEGRATION_STATUS:
READY | BLOCKED

IMPLEMENTED:
...

EXPOSED_CONTRACT:
...

CONFIG_REQUIRED_BY_OTHER_SIDE:
...

VERIFIED:
...

CROSS_PROJECT_GAP:
NONE | exact gap

COMMIT:
...

DEPLOYED_REVISION:
...
```

## 31. Final Integration Report

```text
TELE AUTO V2 × NEO AVO — INTEGRATION REPORT

TELE_AUTO_COMMIT:
TELE_AUTO_REVISION:

NEO_AVO_COMMIT:
NEO_AVO_REVISION:

PROJECT_REGISTRATION: PASS/FAIL
AUTHENTICATION: PASS/FAIL
EVENT_INGESTION: PASS/FAIL
EVENT_DEDUPLICATION: PASS/FAIL
SANITIZATION: PASS/FAIL
ACTIVITY_PROJECTION: PASS/FAIL
AVAILABILITY: PASS/FAIL
OPERATIONAL_HEALTH: PASS/FAIL
INCIDENT_MAPPING: PASS/FAIL
PMS_CONTEXT: PASS/FAIL
TP6_CONTEXT: PASS/FAIL
PRODUCTION_CONTEXT: PASS/FAIL
WASTE_CONTEXT: PASS/FAIL
DAILY_SO_CONTEXT: PASS/FAIL
NEO_AVO_OUTAGE_ISOLATION: PASS/FAIL
TELE_AUTO_BUSINESS_REGRESSION: PASS/FAIL
DIRECT_BUSINESS_COUPLING: NONE/details

ACTIONABLE_BACKLOG:
0/details

KNOWN_NON_BLOCKING_LIMITATIONS:
...

FINAL_VERDICT:
INTEGRATION_READY | BLOCKED
```

## 32. Final Authority

```text
Tele Auto V2 = autonomous operational system
Neo AVO      = autonomous operations hub
Integration  = bounded operational contract
```

Neo AVO observes Tele Auto. Future bounded actions may be requested by Neo AVO but validated and executed by Tele Auto. Neo AVO must never become the reason Tele Auto can or cannot perform its core business function.
