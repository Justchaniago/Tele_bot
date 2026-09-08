# Tele Auto v2 — Architecture

## Shape

Tele Auto v2 is one modular monolith. src/runtime owns process boundaries, src/app owns application composition/use cases, src/core owns framework-neutral contracts and errors, and adapters are added later under src/telegram, src/sheets, src/persistence, and src/observability.

V2 entrypoints expose the current Cloud Run runtime boundary:

- src/runtime/http-main.ts: HTTP process with health endpoints, Telegram webhook ingestion, and an authenticated bounded worker drain.
- Normal worker execution is reached through the durable Firestore run state and the Cloud Tasks wakeup/recovery-sweep boundary; no separate long-polling worker entrypoint is required.

Tele Auto V1 runtime code, panel, AWS/PM2 deployment path, and in-process scheduler are retired. They are not compatibility shims or runtime dependencies of V2.

## M2 sheet boundary

The verified workbook registry lives in src/sheets/workbook-registry.ts. Canonical IDs live in src/core/identifiers.ts. Production, Waste, and Daily SO maps live in their domain sheet-schema modules. src/sheets/target-resolver.ts is the only coordinate resolver; src/sheets/schema-guard.ts validates supplied read observations and fails closed. These modules perform no Google API calls and contain no user-language parsing.

## M3 interpretation boundary

src/parsing is domain-first and deterministic-first: strict command segmentation, normalization, exact vocabulary, conservative fuzzy matching, bounded candidate-validated AI fallback, quantity-token parsing, and parser-only outcomes. Date safety uses Asia/Jakarta with an injected clock. Production/Waste tab resolution accepts supplied metadata, tolerates verified spacing variants, and fails closed on zero or multiple matches. Parser results contain canonical IDs and dates, never workbook coordinates.

M3 stops before business mutation, existing-cell decisions, durable state, Telegram transport, or external API calls. M4 owns pure business planning.

Qualifier safety is explicit in vocabulary family metadata. Generic sibling language returns AMBIGUOUS; qualified terms must provide complete LOCAL/BASE/G1 evidence; one-character fragments such as l or g cannot authorize a variant. Fuzzy matching may repair locl to LOCAL but cannot invent a missing qualifier. AI receives the same bounded candidate set and cannot resolve insufficient evidence by preference.

## M4 business boundary

src/domains/production/business.ts and src/domains/waste/business.ts apply independent SET/CLEAR semantics: omitted SKUs stay untouched, explicit zero clears Production/Waste, equal values are NO_OP, and changed existing values require block-level confirmation. src/domains/daily-so/business.ts distinguishes NOT_ESTABLISHED first snapshots from ESTABLISHED corrections; first snapshots cover all ten M2 SKUs with AUTO_FILL_MISSING zeroes, while later submissions touch explicit SKUs only.

M4 consumes M3 parsed canonical intent, trusted store context, M2 targets, and adapter-supplied observed values. It returns immutable plans, expected-old values, desired values, provenance, corrections, or fail-closed clarification/inconsistency results. It performs no reads or writes. Its frozen quantity gate allows non-negative Production/Waste values with at most two decimal places, and non-negative integer Daily SO PCS counts; invalid lexical quantities cannot produce executable plans.

M5 owns durable run state, update deduplication, confirmation persistence, idempotency, locking, concurrency, and uncertain-outcome recovery. M6 owns external runtime and adapters.

## M5 durable correctness boundary

V1 Firestore collections remain legacy: `pending_inputs` stores dynamic coordinates, `telegram_pending_drafts` stores raw operational payloads without observed TTL, `telegram_chats` stores branch-keyed chat metadata, and `scheduler_state/reminders` stores reminder state. V2 does not reuse them. Its isolated collection model is `tele_auto_v2_updates`, `tele_auto_v2_runs`, `tele_auto_v2_conflict_scopes`, and `tele_auto_v2_daily_snapshots`.

Production Firestore is fixed to project `tele-auto-v2-prod`, database `(default)`, location `asia-southeast2`. `FirestoreDurableStateRepository` is injected through `DurableStateRepository`; it initializes with ADC and explicit project/database validation. Cloud Run will use `tele-auto-runtime@tele-auto-v2-prod.iam.gserviceaccount.com`. No static credentials or `GOOGLE_APPLICATION_CREDENTIALS` are required. V1 Firestore project/configuration is not a V2 runtime dependency.

Update identity is `botId:update_id`; block run identity is `updateKey:block:index`. Acceptance and run creation require create-if-absent transaction semantics. Run transitions require expected version and an explicit finite-state predecessor. Confirmation and clarification retain chat/user/run correlation with 15-minute expiry. Conflict scopes use concrete M2 target identity; Daily SO first snapshots additionally reserve one store/date snapshot scope. Independent target cells, dates, and stores remain parallel.

Firestore transactions can atomically protect V2 documents, but cannot transact with Google Sheets. M5 therefore targets exactly-once business effect, not exactly-once API invocation or delivery. `SET`/`CLEAR` desired state, expected-old values, leases, and post-write observation support safe recovery. Timeout after a possible Sheets write becomes `EFFECT_UNCERTAIN`; observed desired state is already applied, expected-old state is retryable, and any other state is non-overwritable conflict.

Reconciliation is persisted before residual retry. Each effect has deterministic identity and durable outcome metadata: `ALREADY_APPLIED`, `RETRY_NEEDED`, or `DO_NOT_OVERWRITE`. Reload derives residual work only from persisted outcomes; applied effects never re-enter retry, and conflict effects block blind block retry. An all-applied uncertain run can complete through a guarded reconciliation transition without another external write.

## M6 Cloud Run boundary

`src/runtime/http-main.ts` composes production adapters. `POST /telegram/webhook` validates Telegram shape and secret, resolves store only from trusted chat configuration, persists M5 acceptance, then returns success. It never starts long polling or performs business work in the request. `POST /internal/worker/drain` is an authenticated, bounded worker boundary; workers discover durable runs after restart and use M5 claims/fencing.

`src/sheets` owns ADC-authenticated Google Sheets transport only. M2 targets and schema guards remain authoritative; worker rereads current cells before every effect and marks timeout-after-possible-write as `EFFECT_UNCERTAIN`. Telegram delivery is subordinate to business completion: notification failure cannot rerun Sheets work.

Cloud Run target region is `asia-southeast2`. `Dockerfile.v2` runs `start:v2`, stateless runtime uses PORT, ADC, structured logs, and no local durable queue. After Firestore acceptance, optional Cloud Tasks wakeup enqueues only an `updateKey` hint with authenticated OIDC invocation; Firestore remains queue and state authority. Each task also carries the configured `x-tele-auto-worker-token`, matching the application worker endpoint's second authentication layer; the token never enters task body or logs. Enqueue failure returns retryable HTTP failure, while later duplicate delivery or recovery sweep safely reuses durable identity. Cloud Scheduler is recovery sweeper only, not normal-command trigger. V1 in-process reminder loop is not recreated because no V2 reminder contract authorizes it. Scheduler/Tasks provisioning is deployment-owner work, not application startup.

M6.1 adds `VertexAiSkuResolver` as a narrow parser fallback. It uses `@google/genai` Vertex mode with ADC, project `tele-auto-v2-prod`, location `global`, and model `gemini-3.1-flash-lite`. Worker parsing injects this resolver; deterministic parser outcomes never invoke it. Requests contain only domain, normalized term, and bounded candidate IDs. Structured JSON, candidate validation, and a bounded abort timeout preserve parser safety. Vertex does not own store, date, quantity, workbook, coordinates, or mutation authority.

## Neo AVO telemetry boundary

Tele Auto emits bounded operational events to the generic Neo AVO `POST /api/v1/events` endpoint through `src/observability/neo-avo-telemetry.ts`. The adapter uses a dedicated `NEO_AVO_API_TOKEN`, the canonical project identity `tele-auto`, and an explicit production environment. Event IDs are deterministic from the run/update subject, event type, and durable version so repeated worker delivery is idempotent at the receiving project.

Telemetry is disabled unless `NEO_AVO_ENABLED=true`. When enabled, configuration requires an explicit base URL and project credential; requests have a bounded timeout and contain only normalized lifecycle metadata. Provider errors are logged as sanitized operational warnings and never affect Telegram acceptance, parsing, Sheets mutation, durable completion, retry, or recovery. No raw Telegram input, spreadsheet values, SKU/quantity data, or credentials are emitted. Neo AVO is observe-first; it has no mutation or command authority.

## Dependency rules

Dependencies point inward: runtime/adapters may depend on application and core; application may depend on core ports; core must not import Telegraf, Google SDKs, Firestore, Express, or Neo AVO. Telegram, parsing, Sheets, and persistence remain separate concerns. Parser code must not own sheet coordinates.

## Configuration and identity

src/config/env.ts is the only V2 environment reader. It validates process settings and keeps future GCP/store/Telegram settings optional until their owning milestone. No service-account key file or GOOGLE_APPLICATION_CREDENTIALS requirement exists. Cloud Run will use ADC/runtime identity; local impersonation belongs to developer tooling.

## Milestone ownership

- M2: fixed sheet schemas and write guards
- M3: vocabulary, parser, date safety
- M4: business semantics
- M5: durable Firestore run state, idempotency, concurrency
- M6: Cloud Run webhook, bounded worker drain, Sheets adapter, and scheduler boundary
- M7: Neo AVO adapter
- M8: post-retirement hardening and operational audit

## Retirement boundary

V1 is retired and V2 is the only maintained implementation. The current deployment path is Dockerfile.v2/cloudbuild.v2.yaml to Cloud Run in asia-southeast2, with Firestore, Cloud Tasks, Google Sheets, Vertex AI, and Telegram webhook boundaries. No V1 compatibility or execution path remains.
