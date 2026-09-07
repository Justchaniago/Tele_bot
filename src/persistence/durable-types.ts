import type { BusinessPlanResult, MutationPlan } from "../domains/business-types.js";
import type { DomainId, StoreId } from "../core/identifiers.js";

export type RunStatus =
  | "RECEIVED" | "PARSED" | "NEEDS_CLARIFICATION" | "PLANNED"
  | "AWAITING_CONFIRMATION" | "READY" | "EXECUTING" | "EFFECT_UNCERTAIN"
  | "COMPLETED" | "FAILED_RETRYABLE" | "FAILED_FINAL" | "REJECTED";
export type ExecutionPhase = "PRE_WRITE" | "WRITE_STARTED" | "WRITE_CONFIRMED";

export type InteractionKind = "CONFIRMATION" | "CLARIFICATION";

export type PendingInteraction = {
  readonly kind: InteractionKind;
  readonly chatId: string;
  readonly userId: string;
  readonly expiresAt: string;
};

export type ClarificationDelivery = {
  readonly interactionVersion: number;
  readonly state: "PENDING" | "IN_FLIGHT" | "DELIVERED" | "FAILED_RETRYABLE" | "FAILED_FINAL";
  readonly attempt: number;
  readonly claimedAt: string;
  readonly deliveredAt?: string;
  readonly lastError?: string;
};

export type ClarificationDeliveryClaim =
  | { readonly status: "CLAIMED"; readonly run: DurableRun }
  | { readonly status: "ALREADY_DELIVERED"; readonly run: DurableRun }
  | { readonly status: "NOT_CLAIMABLE"; readonly reason: string; readonly run: DurableRun };

export type PrimaryStatusState = "RECEIVED" | "PROCESSING" | "NEEDS_INFORMATION" | "NEEDS_CONFIRMATION" | "SUCCESS" | "FAILED";

export type PrimaryStatusMessage = {
  readonly messageId?: string;
  readonly state: PrimaryStatusState;
  readonly delivery: "PENDING" | "IN_FLIGHT" | "DELIVERED" | "FAILED";
  readonly attempt: number;
  readonly claimedAt: string;
  readonly updatedAt: string;
  /** Stable content identity so aggregate changes are not hidden by state-only dedup. */
  readonly aggregateFingerprint?: string;
};

export type PrimaryStatusClaim =
  | { readonly status: "CLAIMED"; readonly update: DurableUpdate }
  | { readonly status: "ALREADY_DELIVERED"; readonly update: DurableUpdate }
  | { readonly status: "NOT_CLAIMABLE"; readonly reason: string; readonly update: DurableUpdate };

export type ConflictScope = {
  readonly key: string;
  readonly kind: "TARGET" | "DAILY_SO_SNAPSHOT";
  readonly store: StoreId;
  readonly domain: DomainId;
  readonly date: string;
};

export type ExecutionLease = {
  readonly owner: string;
  readonly generation: number;
  readonly expiresAt: string;
};

export type DurableUpdate = {
  readonly updateKey: string;
  readonly botId: string;
  readonly updateId: number;
  readonly chatId: string;
  readonly userId: string;
  readonly messageId?: string;
  readonly receivedAt: string;
  readonly blockRunIds: readonly string[];
  readonly version: number;
  readonly primaryStatusMessage?: PrimaryStatusMessage;
};

export type DurableRun = {
  readonly runId: string;
  readonly updateKey: string;
  readonly blockIndex: number;
  readonly status: RunStatus;
  readonly version: number;
  readonly store: StoreId;
  readonly domain: DomainId;
  readonly date?: string;
  readonly decisionStatus: BusinessPlanResult["status"];
  readonly rawBlockBody?: string;
  readonly plan?: MutationPlan;
  readonly conflictScopes: readonly ConflictScope[];
  readonly pendingInteraction?: PendingInteraction;
  readonly clarificationDelivery?: ClarificationDelivery;
  readonly lease?: ExecutionLease;
  readonly executionPhase?: ExecutionPhase;
  readonly effectRecovery?: readonly EffectRecovery[];
  readonly residualEffectIds?: readonly string[];
  readonly snapshotEstablishment: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastError?: string;
};

export type SnapshotRecord = {
  readonly key: string;
  readonly store: StoreId;
  readonly date: string;
  readonly state: "NOT_ESTABLISHED" | "ESTABLISHED";
  readonly establishedByRunId?: string;
  readonly updatedAt: string;
};

export type BlockRunSeed = {
  readonly blockIndex: number;
  readonly store: StoreId;
  readonly domain: DomainId;
  readonly decision: BusinessPlanResult;
  readonly now: Date;
  readonly rawBlockBody?: string;
  readonly initialStatus?: "RECEIVED";
};

export type AcceptUpdateInput = {
  readonly botId: string;
  readonly updateId: number;
  readonly chatId: string;
  readonly userId: string;
  readonly messageId?: string;
  readonly receivedAt: Date;
};

export type ConfirmationInput = {
  readonly runId: string;
  readonly chatId: string;
  readonly userId: string;
  readonly now: Date;
};

export type InteractionResult =
  | { readonly status: "ACCEPTED"; readonly run: DurableRun }
  | { readonly status: "ALREADY_ACCEPTED"; readonly run: DurableRun }
  | { readonly status: "EXPIRED" }
  | { readonly status: "NOT_AUTHORIZED" }
  | { readonly status: "NOT_PENDING" };

export type RecoveryObservation = "EXPECTED_OLD" | "DESIRED" | "CONFLICT";
export type RecoveryDecision = "RETRY_NEEDED" | "ALREADY_APPLIED" | "DO_NOT_OVERWRITE";

export type EffectRecovery = {
  readonly effectId: string;
  readonly outcome: RecoveryDecision;
  readonly reconciledAt: string;
};

export type PersistReconciliationInput = {
  readonly runId: string;
  readonly expectedVersion: number;
  readonly outcomes: readonly EffectRecovery[];
  readonly now: Date;
  readonly owner?: string;
};
