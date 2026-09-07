import type { BusinessPlanResult } from "../domains/business-types.js";
import { conflictScopes } from "./conflict-scope.js";
import { effectIdentity } from "./recovery.js";
import { blockRunId, updateKey } from "./identity.js";
import { assertTransition } from "./state-machine.js";
import type {
  AcceptUpdateInput, BlockRunSeed, ConfirmationInput, ConflictScope, DurableRun,
  DurableUpdate, EffectRecovery, ExecutionLease, InteractionResult, PendingInteraction, PersistReconciliationInput, SnapshotRecord,
  ClarificationDeliveryClaim, PrimaryStatusClaim, PrimaryStatusState
} from "./durable-types.js";

export type ClaimResult =
  | { readonly status: "CLAIMED"; readonly run: DurableRun }
  | { readonly status: "NOT_CLAIMABLE"; readonly reason: string; readonly run: DurableRun }
  | { readonly status: "CONFLICT"; readonly scopes: readonly ConflictScope[]; readonly run: DurableRun };

export interface DurableStateRepository {
  acceptUpdate(input: AcceptUpdateInput, seeds?: readonly BlockRunSeed[]): Promise<DurableUpdate>;
  createBlockRuns(update: DurableUpdate, seeds: readonly BlockRunSeed[]): Promise<readonly DurableRun[]>;
  getRun(runId: string): Promise<DurableRun | undefined>;
  getUpdate(updateKey: string): Promise<DurableUpdate | undefined>;
  transitionRun(runId: string, next: DurableRun["status"], expectedVersion: number, error?: string): Promise<DurableRun>;
  replanRun(runId: string, decision: BusinessPlanResult, expectedVersion: number, now: Date, context?: { readonly date?: string }): Promise<DurableRun>;
  claimClarificationDelivery(runId: string, now: Date): Promise<ClarificationDeliveryClaim>;
  recordClarificationDelivery(runId: string, expectedVersion: number, state: "DELIVERED" | "FAILED_RETRYABLE" | "FAILED_FINAL", now: Date, error?: string): Promise<DurableRun>;
  claimPrimaryStatus(updateKey: string, state: PrimaryStatusState, aggregateFingerprint: string, now: Date): Promise<PrimaryStatusClaim>;
  recordPrimaryStatus(updateKey: string, expectedVersion: number, state: PrimaryStatusState, aggregateFingerprint: string, delivery: "DELIVERED" | "FAILED", now: Date, messageId?: string): Promise<DurableUpdate>;
  completeExecution(runId: string, owner: string, expectedVersion: number, now: Date): Promise<DurableRun>;
  markEffectUncertain(runId: string, owner: string, expectedVersion: number, now: Date): Promise<DurableRun>;
  recoverExpiredExecution(runId: string, now: Date): Promise<DurableRun>;
  persistReconciliation(input: PersistReconciliationInput): Promise<DurableRun>;
  completeReconciledRun(runId: string, expectedVersion: number): Promise<DurableRun>;
  confirm(input: ConfirmationInput): Promise<InteractionResult>;
  clarify(input: ConfirmationInput): Promise<InteractionResult>;
  claimExecution(runId: string, owner: string, now: Date, leaseMs: number): Promise<ClaimResult>;
  markWriteStarted(runId: string, owner: string, expectedVersion: number, now: Date): Promise<DurableRun>;
  markWriteConfirmed(runId: string, owner: string, expectedVersion: number, now: Date): Promise<DurableRun>;
  claimReconciliation(runId: string, owner: string, now: Date, leaseMs: number): Promise<ClaimResult>;
  failExecution(runId: string, owner: string, expectedVersion: number, final: boolean, reason: string, now: Date): Promise<DurableRun>;
  listRunnableRuns(limit: number): Promise<readonly DurableRun[]>;
  listExpiredExecutingRuns(now: Date, limit: number): Promise<readonly DurableRun[]>;
  getSnapshot(store: DurableRun["store"], date: string): Promise<SnapshotRecord>;
}

const PLANABLE: ReadonlySet<BusinessPlanResult["status"]> = new Set(["READY", "NO_OP", "REQUIRES_CONFIRMATION"]);

export class InMemoryDurableStateRepository implements DurableStateRepository {
  private readonly updates: Map<string, DurableUpdate>;
  private readonly runs: Map<string, DurableRun>;
  private readonly scopeLeases: Map<string, { runId: string; expiresAt: number }>;
  private readonly snapshots: Map<string, SnapshotRecord>;

  constructor(state: InMemoryRepositoryState = createInMemoryRepositoryState()) {
    this.updates = state.updates;
    this.runs = state.runs;
    this.scopeLeases = state.scopeLeases;
    this.snapshots = state.snapshots;
  }

  async acceptUpdate(input: AcceptUpdateInput, seeds: readonly BlockRunSeed[] = []): Promise<DurableUpdate> {
    const key = updateKey(input.botId, input.updateId);
    const existing = this.updates.get(key);
    if (existing) {
      if (seeds.length && existing.blockRunIds.length === 0) {
        const runs = await this.createBlockRuns(existing, seeds);
        const updated = Object.freeze({ ...existing, blockRunIds: Object.freeze(runs.map(run => run.runId)) });
        this.updates.set(key, updated);
        return updated;
      }
      return existing;
    }
      const update: DurableUpdate = Object.freeze({
      updateKey: key, botId: input.botId, updateId: input.updateId,
      chatId: input.chatId, userId: input.userId, messageId: input.messageId,
      receivedAt: input.receivedAt.toISOString(),
      blockRunIds: Object.freeze(seeds.map(seed => blockRunId(key, seed.blockIndex))), version: 0, primaryStatusMessage: undefined
    });
    this.updates.set(key, update);
    if (seeds.length) await this.createBlockRuns(update, seeds);
    return update;
  }

  async createBlockRuns(update: DurableUpdate, seeds: readonly BlockRunSeed[]): Promise<readonly DurableRun[]> {
    const result: DurableRun[] = [];
    for (const seed of seeds) {
      const id = blockRunId(update.updateKey, seed.blockIndex);
      const existing = this.runs.get(id);
      if (existing) { result.push(existing); continue; }
      const run = createDurableRun(update, id, seed);
      this.runs.set(id, run);
      result.push(run);
    }
    return Object.freeze(result);
  }

  async getRun(runId: string): Promise<DurableRun | undefined> { return this.runs.get(runId); }
  async getUpdate(updateKeyValue: string): Promise<DurableUpdate | undefined> { return this.updates.get(updateKeyValue); }

  async transitionRun(runId: string, next: DurableRun["status"], expectedVersion: number, error?: string): Promise<DurableRun> {
    const current = this.requireRun(runId);
    if (current.status === "READY" && next === "COMPLETED") throw new Error("READY execution requires claim; NO_OP is completed at acceptance");
    if (current.snapshotEstablishment && next === "COMPLETED") throw new Error("Snapshot completion requires execution lease");
    if (current.status === "EXECUTING" && ["COMPLETED", "EFFECT_UNCERTAIN", "FAILED_RETRYABLE", "FAILED_FINAL"].includes(next)) {
      throw new Error("Execution transition requires lease owner");
    }
    if (current.version !== expectedVersion) throw new Error("Run version conflict");
    assertTransition(current.status, next);
    const updated = this.updateRun(current, { status: next, lastError: error });
    this.runs.set(runId, updated);
    if (next === "COMPLETED") this.finishSnapshot(updated);
    if (next === "COMPLETED" || next === "FAILED_FINAL") this.releaseScopes(runId);
    return updated;
  }

  async replanRun(runId: string, decision: BusinessPlanResult, expectedVersion: number, now: Date, context?: { readonly date?: string }): Promise<DurableRun> {
    const current = this.requireRun(runId);
    if (!["RECEIVED", "NEEDS_CLARIFICATION", "PARSED"].includes(current.status)) throw new Error("Run is not awaiting a replan");
    if (current.version !== expectedVersion) throw new Error("Run version conflict");
    const update = this.updates.get(current.updateKey);
    if (!update) throw new Error("Parent update not found");
    this.releaseScopes(runId);
    const plan = "plan" in decision ? decision.plan : undefined;
    const status = statusForDecision(decision);
    const pendingInteraction = status === "AWAITING_CONFIRMATION" || status === "NEEDS_CLARIFICATION"
      ? interactionFor(update, status, now) : undefined;
    const updated = this.updateRun(current, {
      status, decisionStatus: decision.status, plan, date: plan?.date ?? context?.date ?? current.date,
      conflictScopes: plan ? conflictScopes(plan) : [], pendingInteraction,
      snapshotEstablishment: Boolean(plan?.domain === "DAILY_SO" && plan.effects.some(effect => effect.provenance === "AUTO_FILL_MISSING")),
      clarificationDelivery: status === "NEEDS_CLARIFICATION" ? { interactionVersion: current.version + 1, state: "PENDING", attempt: 0, claimedAt: now.toISOString() } : undefined,
      lastError: undefined
    });
    this.runs.set(runId, updated);
    return updated;
  }

  async claimClarificationDelivery(runId: string, now: Date): Promise<ClarificationDeliveryClaim> {
    const current = this.requireRun(runId);
      if (current.status !== "NEEDS_CLARIFICATION" || current.pendingInteraction?.kind !== "CLARIFICATION") return { status: "NOT_CLAIMABLE", reason: "Run is not awaiting clarification", run: current };
    if (Date.parse(current.pendingInteraction.expiresAt) <= now.getTime()) {
      const expired = this.updateRun(current, { status: "FAILED_FINAL", clarificationDelivery: current.clarificationDelivery ? { ...current.clarificationDelivery, state: "FAILED_FINAL" as const, lastError: "Clarification expired" } : undefined, lastError: "Clarification expired" });
      this.runs.set(runId, expired);
      return { status: "NOT_CLAIMABLE", reason: "Clarification expired", run: expired };
    }
    const delivery = current.clarificationDelivery;
    if (delivery?.state === "DELIVERED") return { status: "ALREADY_DELIVERED", run: current };
    if (delivery?.state === "IN_FLIGHT" && Date.parse(delivery.claimedAt) + 120_000 > now.getTime()) return { status: "NOT_CLAIMABLE", reason: "Clarification delivery is in flight", run: current };
    if (delivery?.state === "FAILED_FINAL") return { status: "NOT_CLAIMABLE", reason: "Clarification delivery failed permanently", run: current };
    if (delivery?.state === "FAILED_RETRYABLE" && delivery.attempt >= 3) {
      const exhausted = this.updateRun(current, { clarificationDelivery: { ...delivery, state: "FAILED_FINAL" as const, lastError: "Clarification delivery retry limit reached" }, lastError: "Clarification delivery retry limit reached" });
      this.runs.set(runId, exhausted);
      return { status: "NOT_CLAIMABLE", reason: "Clarification delivery retry limit reached", run: exhausted };
    }
    const claimed = Object.freeze({ interactionVersion: current.version, state: "IN_FLIGHT" as const, attempt: (delivery?.attempt ?? 0) + 1, claimedAt: now.toISOString() });
    const updated = this.updateRun(current, { clarificationDelivery: claimed });
    this.runs.set(runId, updated);
    return { status: "CLAIMED", run: updated };
  }

  async claimPrimaryStatus(updateKeyValue: string, state: PrimaryStatusState, aggregateFingerprint: string, now: Date): Promise<PrimaryStatusClaim> {
    const current = this.updates.get(updateKeyValue);
    if (!current) throw new Error("Update not found");
    const marker = current.primaryStatusMessage;
    if (marker?.state === state && marker.delivery === "DELIVERED" && marker.aggregateFingerprint === aggregateFingerprint) return { status: "ALREADY_DELIVERED", update: current };
    if (marker?.delivery === "IN_FLIGHT" && Date.parse(marker.claimedAt) + 120_000 > now.getTime()) return { status: "NOT_CLAIMABLE", reason: "Primary status delivery is in flight", update: current };
    const next = Object.freeze({ ...current, version: current.version + 1, primaryStatusMessage: Object.freeze({ ...marker, state, aggregateFingerprint, delivery: "IN_FLIGHT" as const, attempt: (marker?.attempt ?? 0) + 1, claimedAt: now.toISOString(), updatedAt: now.toISOString() }) });
    this.updates.set(updateKeyValue, next);
    return { status: "CLAIMED", update: next };
  }

  async recordPrimaryStatus(updateKeyValue: string, expectedVersion: number, state: PrimaryStatusState, aggregateFingerprint: string, delivery: "DELIVERED" | "FAILED", now: Date, messageId?: string): Promise<DurableUpdate> {
    const current = this.updates.get(updateKeyValue);
    if (!current || current.version !== expectedVersion || !current.primaryStatusMessage || current.primaryStatusMessage.delivery !== "IN_FLIGHT") throw new Error("Primary status delivery version conflict");
    const next = Object.freeze({ ...current, version: current.version + 1, primaryStatusMessage: Object.freeze({ ...current.primaryStatusMessage, state, aggregateFingerprint, delivery, ...(messageId ? { messageId } : {}), updatedAt: now.toISOString() }) });
    this.updates.set(updateKeyValue, next);
    return next;
  }

  async recordClarificationDelivery(runId: string, expectedVersion: number, state: "DELIVERED" | "FAILED_RETRYABLE" | "FAILED_FINAL", now: Date, error?: string): Promise<DurableRun> {
    const current = this.requireRun(runId);
    if (current.status !== "NEEDS_CLARIFICATION" || current.version !== expectedVersion || !current.clarificationDelivery || current.clarificationDelivery.state !== "IN_FLIGHT") throw new Error("Clarification delivery version conflict");
    const updated = this.updateRun(current, { clarificationDelivery: Object.freeze({ ...current.clarificationDelivery, state, ...(state === "DELIVERED" ? { deliveredAt: now.toISOString() } : {}), ...(error ? { lastError: error } : {}) }) });
    this.runs.set(runId, updated);
    return updated;
  }

  async completeExecution(runId: string, owner: string, expectedVersion: number, now: Date): Promise<DurableRun> {
    return this.finishExecution(runId, owner, "COMPLETED", expectedVersion, now);
  }

  async markEffectUncertain(runId: string, owner: string, expectedVersion: number, now: Date): Promise<DurableRun> {
    return this.finishExecution(runId, owner, "EFFECT_UNCERTAIN", expectedVersion, now);
  }

  async recoverExpiredExecution(runId: string, now: Date): Promise<DurableRun> {
    const current = this.requireRun(runId);
    if (current.status !== "EXECUTING" || !current.lease || Date.parse(current.lease.expiresAt) > now.getTime()) throw new Error("Execution lease is not expired");
    const updated = this.updateRun(current, { status: "EFFECT_UNCERTAIN", lease: undefined });
    this.runs.set(runId, updated);
    return updated;
  }

  async claimReconciliation(runId: string, owner: string, now: Date, leaseMs: number): Promise<ClaimResult> {
    const current = this.requireRun(runId);
    if (current.status !== "EFFECT_UNCERTAIN") return { status: "NOT_CLAIMABLE", reason: "Run is not uncertain", run: current };
    if (current.effectRecovery) return { status: "NOT_CLAIMABLE", reason: "Reconciliation already persisted", run: current };
    this.clearExpiredLeases(now.getTime());
    const blocked = current.conflictScopes.filter(scope => {
      const lease = this.scopeLeases.get(scope.key);
      return lease && lease.runId !== runId;
    });
    if (blocked.length) return { status: "CONFLICT", scopes: blocked, run: current };
    const lease: ExecutionLease = Object.freeze({ owner, generation: (current.lease?.generation ?? 0) + 1, expiresAt: new Date(now.getTime() + leaseMs).toISOString() });
    const updated = this.updateRun(current, { lease });
    this.runs.set(runId, updated);
    for (const scope of current.conflictScopes) this.scopeLeases.set(scope.key, { runId, expiresAt: Date.parse(lease.expiresAt) });
    return { status: "CLAIMED", run: updated };
  }

  async failExecution(runId: string, owner: string, expectedVersion: number, final: boolean, reason: string, now: Date): Promise<DurableRun> {
    const current = this.requireRun(runId);
    if (current.status !== "EXECUTING" || current.version !== expectedVersion || current.lease?.owner !== owner || Date.parse(current.lease.expiresAt) <= now.getTime()) throw new Error("Execution lease is not valid");
    const updated = this.updateRun(current, { status: final ? "FAILED_FINAL" : "FAILED_RETRYABLE", lastError: reason });
    this.runs.set(runId, updated);
    this.releaseScopes(runId);
    return updated;
  }

  async listRunnableRuns(limit: number): Promise<readonly DurableRun[]> {
    const statuses = new Set(["RECEIVED", "READY", "EFFECT_UNCERTAIN", "FAILED_RETRYABLE"]);
    const runnable = [...this.runs.values()].filter(run => statuses.has(run.status));
    const clarification = [...this.runs.values()].filter(run => run.status === "NEEDS_CLARIFICATION" && (run.clarificationDelivery?.state === "PENDING" || run.clarificationDelivery?.state === "FAILED_RETRYABLE"));
    return [...runnable, ...clarification].slice(0, Math.max(0, limit));
  }
  async listExpiredExecutingRuns(now: Date, limit: number): Promise<readonly DurableRun[]> {
    return [...this.runs.values()].filter(run => run.status === "EXECUTING" && run.lease && Date.parse(run.lease.expiresAt) <= now.getTime()).slice(0, Math.max(0, limit));
  }

  async persistReconciliation(input: PersistReconciliationInput): Promise<DurableRun> {
    const current = this.requireRun(input.runId);
    if (current.status !== "EFFECT_UNCERTAIN") throw new Error("Run is not awaiting reconciliation");
    if (current.version !== input.expectedVersion || !current.plan) throw new Error("Reconciliation version or plan conflict");
    if (input.owner && (current.lease?.owner !== input.owner || Date.parse(current.lease.expiresAt) <= input.now.getTime())) throw new Error("Reconciliation lease is not valid");
    validateRecoveryOutcomes(current, input.outcomes);
    const updated = this.updateRun(current, { effectRecovery: Object.freeze([...input.outcomes]), residualEffectIds: Object.freeze(input.outcomes.filter(outcome => outcome.outcome === "RETRY_NEEDED").map(outcome => outcome.effectId)) });
    this.runs.set(input.runId, updated);
    return updated;
  }

  async completeReconciledRun(runId: string, expectedVersion: number): Promise<DurableRun> {
    const current = this.requireRun(runId);
    if (current.status !== "EFFECT_UNCERTAIN" || current.version !== expectedVersion || !current.effectRecovery) throw new Error("Run is not reconciled");
    if (current.effectRecovery.some(outcome => outcome.outcome !== "ALREADY_APPLIED")) throw new Error("Unresolved effects remain");
    const updated = this.updateRun(current, { status: "COMPLETED" });
    this.runs.set(runId, updated);
    this.finishSnapshot(updated);
    this.releaseScopes(runId);
    return updated;
  }

  async confirm(input: ConfirmationInput): Promise<InteractionResult> {
    return this.resolveInteraction(input, "CONFIRMATION", "READY");
  }

  async clarify(input: ConfirmationInput): Promise<InteractionResult> {
    return this.resolveInteraction(input, "CLARIFICATION", "PARSED");
  }

  async claimExecution(runId: string, owner: string, now: Date, leaseMs: number): Promise<ClaimResult> {
    const current = this.requireRun(runId);
    if (current.status === "EFFECT_UNCERTAIN" && !current.effectRecovery) return { status: "NOT_CLAIMABLE", reason: "Reconciliation required before retry", run: current };
    if (current.status === "EFFECT_UNCERTAIN" && current.effectRecovery?.some(outcome => outcome.outcome === "DO_NOT_OVERWRITE")) return { status: "NOT_CLAIMABLE", reason: "Recovery conflict requires replan", run: current };
    if (current.status === "EFFECT_UNCERTAIN" && current.residualEffectIds?.length === 0) return { status: "NOT_CLAIMABLE", reason: "No residual effects; complete reconciliation", run: current };
    if (current.status !== "READY" && current.status !== "EFFECT_UNCERTAIN" && current.status !== "FAILED_RETRYABLE") {
      return { status: "NOT_CLAIMABLE", reason: `Run status ${current.status} cannot execute`, run: current };
    }
    if (current.snapshotEstablishment && (await this.getSnapshot(current.store, current.date!)).state === "ESTABLISHED") {
      return { status: "NOT_CLAIMABLE", reason: "Snapshot established; run requires replan", run: current };
    }
    this.clearExpiredLeases(now.getTime());
    const blocked = current.conflictScopes.filter(scope => {
      const lease = this.scopeLeases.get(scope.key);
      return lease && lease.runId !== runId;
    });
    if (blocked.length) return { status: "CONFLICT", scopes: blocked, run: current };
    if (current.lease && current.lease.expiresAt > now.toISOString() && current.lease.owner !== owner) {
      return { status: "NOT_CLAIMABLE", reason: "Run already claimed", run: current };
    }
    const generation = (current.lease?.generation ?? 0) + 1;
    const lease: ExecutionLease = Object.freeze({ owner, generation, expiresAt: new Date(now.getTime() + leaseMs).toISOString() });
    const updated = this.updateRun(current, { status: "EXECUTING", lease, executionPhase: "PRE_WRITE" });
    this.runs.set(runId, updated);
    for (const scope of current.conflictScopes) this.scopeLeases.set(scope.key, { runId, expiresAt: Date.parse(lease.expiresAt) });
    return { status: "CLAIMED", run: updated };
  }

  async getSnapshot(store: DurableRun["store"], date: string): Promise<SnapshotRecord> {
    const key = `${store}:${date}`;
    const existing = this.snapshots.get(key);
    if (existing) return existing;
    const created = Object.freeze({ key, store, date, state: "NOT_ESTABLISHED" as const, updatedAt: new Date(0).toISOString() });
    this.snapshots.set(key, created);
    return created;
  }

  async markWriteStarted(runId: string, owner: string, expectedVersion: number, now: Date): Promise<DurableRun> {
    const current = this.requireRun(runId);
    this.assertWriteAuthority(current, owner, expectedVersion, now);
    const updated = this.updateRun(current, { executionPhase: "WRITE_STARTED" });
    this.runs.set(runId, updated);
    return updated;
  }

  async markWriteConfirmed(runId: string, owner: string, expectedVersion: number, now: Date): Promise<DurableRun> {
    const current = this.requireRun(runId);
    this.assertWriteAuthority(current, owner, expectedVersion, now);
    if (current.executionPhase !== "WRITE_STARTED") throw new Error("Write was not started");
    const updated = this.updateRun(current, { executionPhase: "WRITE_CONFIRMED" });
    this.runs.set(runId, updated);
    return updated;
  }

  private resolveInteraction(input: ConfirmationInput, kind: "CONFIRMATION" | "CLARIFICATION", next: "READY" | "PARSED"): InteractionResult {
    const current = this.runs.get(input.runId);
    if (!current || !current.pendingInteraction || current.pendingInteraction.kind !== kind) return { status: "NOT_PENDING" };
    const interaction = current.pendingInteraction;
    if (interaction.chatId !== input.chatId || interaction.userId !== input.userId) return { status: "NOT_AUTHORIZED" };
    if (Date.parse(interaction.expiresAt) <= input.now.getTime()) {
      if (current.status === "AWAITING_CONFIRMATION" || current.status === "NEEDS_CLARIFICATION") {
        const expired = this.updateRun(current, { status: "FAILED_FINAL", lastError: `${kind} expired` });
        this.runs.set(current.runId, expired);
        this.releaseScopes(current.runId);
      }
      return { status: "EXPIRED" };
    }
    if (current.status === next) return { status: "ALREADY_ACCEPTED", run: current };
    if (current.status !== (kind === "CONFIRMATION" ? "AWAITING_CONFIRMATION" : "NEEDS_CLARIFICATION")) return { status: "NOT_PENDING" };
    const updated = this.updateRun(current, { status: next });
    this.runs.set(current.runId, updated);
    return { status: "ACCEPTED", run: updated };
  }

  private updateRun(current: DurableRun, changes: Partial<DurableRun>): DurableRun {
    return Object.freeze({ ...current, ...changes, version: current.version + 1, updatedAt: new Date().toISOString() });
  }

  private async finishExecution(runId: string, owner: string, next: "COMPLETED" | "EFFECT_UNCERTAIN", expectedVersion: number, now: Date): Promise<DurableRun> {
    const current = this.requireRun(runId);
    if (current.status !== "EXECUTING" || current.version !== expectedVersion) throw new Error("Execution authority or version conflict");
    if (!current.lease || (current.lease.owner !== owner && next !== "EFFECT_UNCERTAIN") || (next === "COMPLETED" && Date.parse(current.lease.expiresAt) <= now.getTime()) || (next === "EFFECT_UNCERTAIN" && current.lease.owner !== owner && Date.parse(current.lease.expiresAt) > now.getTime())) throw new Error("Execution lease is not valid");
    const updated = this.updateRun(current, { status: next });
    this.runs.set(runId, updated);
    if (next === "COMPLETED") {
      this.finishSnapshot(updated);
      this.releaseScopes(runId);
    }
    return updated;
  }

  private finishSnapshot(run: DurableRun): void {
    if (!run.snapshotEstablishment || !run.date) return;
    const key = `${run.store}:${run.date}`;
    const snapshot: SnapshotRecord = Object.freeze({ key, store: run.store, date: run.date, state: "ESTABLISHED", establishedByRunId: run.runId, updatedAt: run.updatedAt });
    this.snapshots.set(key, snapshot);
  }

  private releaseScopes(runId: string): void {
    for (const [key, lease] of this.scopeLeases) if (lease.runId === runId) this.scopeLeases.delete(key);
  }

  private clearExpiredLeases(now: number): void {
    for (const [key, lease] of this.scopeLeases) if (lease.expiresAt <= now) this.scopeLeases.delete(key);
  }

  private requireRun(runId: string): DurableRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error("Run not found");
    return run;
  }

  private assertWriteAuthority(current: DurableRun, owner: string, expectedVersion: number, now: Date): void {
    if (current.status !== "EXECUTING" || current.version !== expectedVersion || current.lease?.owner !== owner || Date.parse(current.lease.expiresAt) <= now.getTime()) throw new Error("Execution lease is not valid");
  }
}

export type InMemoryRepositoryState = {
  readonly updates: Map<string, DurableUpdate>;
  readonly runs: Map<string, DurableRun>;
  readonly scopeLeases: Map<string, { runId: string; expiresAt: number }>;
  readonly snapshots: Map<string, SnapshotRecord>;
};

export function createInMemoryRepositoryState(): InMemoryRepositoryState {
  return { updates: new Map(), runs: new Map(), scopeLeases: new Map(), snapshots: new Map() };
}

export function validateRecoveryOutcomes(run: DurableRun, outcomes: readonly EffectRecovery[]): void {
  if (outcomes.length !== run.plan!.effects.length) throw new Error("Reconciliation must cover every effect");
  const expected = new Set(run.plan!.effects.map(effectIdentity));
  const received = new Set(outcomes.map(outcome => outcome.effectId));
  if (received.size !== expected.size || [...expected].some(effectId => !received.has(effectId))) throw new Error("Reconciliation effect identity mismatch");
  const previous = new Map((run.effectRecovery ?? []).map(outcome => [outcome.effectId, outcome.outcome]));
  for (const outcome of outcomes) {
    const old = previous.get(outcome.effectId);
    if (old && old !== outcome.outcome && old !== "RETRY_NEEDED") throw new Error("Reconciliation outcome cannot be downgraded");
  }
}

export function statusForDecision(decision: BusinessPlanResult): DurableRun["status"] {
  switch (decision.status) {
    case "READY": return "READY";
    case "NO_OP": return "COMPLETED";
    case "REQUIRES_CONFIRMATION": return "AWAITING_CONFIRMATION";
    case "REQUIRES_CLARIFICATION": return "NEEDS_CLARIFICATION";
    case "REJECTED": return "REJECTED";
    case "INCONSISTENT_STATE": return "FAILED_FINAL";
  }
}

export function interactionFor(update: DurableUpdate, status: "AWAITING_CONFIRMATION" | "NEEDS_CLARIFICATION", now: Date): PendingInteraction {
  return Object.freeze({ kind: status === "AWAITING_CONFIRMATION" ? "CONFIRMATION" : "CLARIFICATION", chatId: update.chatId, userId: update.userId, expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString() });
}

export function createDurableRun(update: DurableUpdate, runId: string, seed: BlockRunSeed): DurableRun {
  const decision = seed.decision;
  const status = seed.initialStatus ?? statusForDecision(decision);
  const plan = "plan" in decision ? decision.plan : undefined;
  const pendingInteraction = (status === "AWAITING_CONFIRMATION" || status === "NEEDS_CLARIFICATION")
    ? interactionFor(update, status, seed.now) : undefined;
  return Object.freeze({
    runId, updateKey: update.updateKey, blockIndex: seed.blockIndex, status, version: 0,
    store: seed.store, domain: seed.domain, date: plan?.date, decisionStatus: decision.status, rawBlockBody: seed.rawBlockBody,
    plan, conflictScopes: Object.freeze(plan ? [...conflictScopes(plan)] : []), pendingInteraction,
    clarificationDelivery: status === "NEEDS_CLARIFICATION" ? { interactionVersion: 1, state: "PENDING" as const, attempt: 0, claimedAt: seed.now.toISOString() } : undefined,
    snapshotEstablishment: Boolean(plan?.domain === "DAILY_SO" && plan.effects.some(effect => effect.provenance === "AUTO_FILL_MISSING")),
    executionPhase: undefined, createdAt: seed.now.toISOString(), updatedAt: seed.now.toISOString()
  });
}
