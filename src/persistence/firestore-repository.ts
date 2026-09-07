import { Firestore, type DocumentReference, type DocumentSnapshot, type Transaction } from "@google-cloud/firestore";
import { V2_FIRESTORE_DATABASE_ID, V2_GCP_PROJECT_ID } from "../config/env.js";
import type { BusinessPlanResult } from "../domains/business-types.js";
import { conflictScopes } from "./conflict-scope.js";
import { V2_COLLECTIONS } from "./collection-model.js";
import { blockRunId, updateKey } from "./identity.js";
import { assertTransition } from "./state-machine.js";
import {
  createDurableRun, interactionFor, statusForDecision,
  validateRecoveryOutcomes, type DurableStateRepository, type ClaimResult
} from "./repository.js";
import type {
  AcceptUpdateInput, BlockRunSeed, ConfirmationInput, ConflictScope, DurableRun,
  DurableUpdate, EffectRecovery, ExecutionLease, InteractionResult, PendingInteraction, PersistReconciliationInput, SnapshotRecord,
  ClarificationDeliveryClaim, PrimaryStatusClaim, PrimaryStatusState
} from "./durable-types.js";

export type FirestoreRepositoryOptions = {
  readonly firestore?: Firestore;
  readonly projectId?: string;
  readonly databaseId?: string;
};

/** Production durable-state adapter. Uses ADC; never creates or reads static key files. */
export class FirestoreDurableStateRepository implements DurableStateRepository {
  readonly projectId = V2_GCP_PROJECT_ID;
  readonly databaseId: string;
  private readonly db: Firestore;

  constructor(options: FirestoreRepositoryOptions = {}) {
    this.databaseId = options.databaseId ?? V2_FIRESTORE_DATABASE_ID;
    if (this.databaseId !== V2_FIRESTORE_DATABASE_ID) throw new Error(`Firestore database must be ${V2_FIRESTORE_DATABASE_ID}`);
    if (options.projectId && options.projectId !== V2_GCP_PROJECT_ID) throw new Error(`Firestore project must be ${V2_GCP_PROJECT_ID}`);
    this.db = options.firestore ?? new Firestore({ projectId: V2_GCP_PROJECT_ID, databaseId: V2_FIRESTORE_DATABASE_ID });
  }

  async acceptUpdate(input: AcceptUpdateInput, seeds: readonly BlockRunSeed[] = []): Promise<DurableUpdate> {
    const key = updateKey(input.botId, input.updateId);
    const ref = this.updateRef(key);
    return this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists) {
        const existing = fromUpdate(snapshot);
        if (seeds.length && existing.blockRunIds.length === 0) {
          const runs = await this.createRunsInTransaction(tx, existing, seeds);
          const updated = { ...existing, blockRunIds: runs.map(run => run.runId) };
          tx.update(ref, updated);
          return updated;
        }
        return existing;
      }
      const update: DurableUpdate = {
        updateKey: key, botId: input.botId, updateId: input.updateId,
        chatId: input.chatId, userId: input.userId, messageId: input.messageId,
        receivedAt: input.receivedAt.toISOString(),
        blockRunIds: seeds.map(seed => blockRunId(key, seed.blockIndex)), version: 0
      };
      tx.create(ref, update);
      for (const seed of seeds) {
        const run = createDurableRun(update, blockRunId(key, seed.blockIndex), seed);
        tx.create(this.runRef(run.runId), serializeRun(run));
      }
      return update;
    });
  }

  async createBlockRuns(update: DurableUpdate, seeds: readonly BlockRunSeed[]): Promise<readonly DurableRun[]> {
    return this.db.runTransaction(async tx => {
      const parent = await tx.get(this.updateRef(update.updateKey));
      if (!parent.exists) throw new Error("Parent update not found");
      const current = fromUpdate(parent);
      const runs = await this.createRunsInTransaction(tx, current, seeds);
      const ids = [...new Set([...current.blockRunIds, ...runs.map(run => run.runId)])];
      if (ids.length !== current.blockRunIds.length) tx.update(this.updateRef(update.updateKey), { blockRunIds: ids });
      return runs;
    });
  }

  async getRun(runId: string): Promise<DurableRun | undefined> {
    const snapshot = await this.runRef(runId).get();
    return snapshot.exists ? fromRun(snapshot) : undefined;
  }
  async getUpdate(updateKeyValue: string): Promise<DurableUpdate | undefined> {
    const snapshot = await this.updateRef(updateKeyValue).get();
    return snapshot.exists ? fromUpdate(snapshot) : undefined;
  }

  async transitionRun(runId: string, next: DurableRun["status"], expectedVersion: number, error?: string): Promise<DurableRun> {
    return this.db.runTransaction(async tx => {
      const ref = this.runRef(runId);
      const current = fromRequired(await tx.get(ref));
      if (current.status === "READY" && next === "COMPLETED") throw new Error("READY execution requires claim; NO_OP is completed at acceptance");
      if (current.snapshotEstablishment && next === "COMPLETED") throw new Error("Snapshot completion requires execution lease");
      if (current.version !== expectedVersion) throw new Error("Run version conflict");
      if (current.status === "EXECUTING" && ["COMPLETED", "EFFECT_UNCERTAIN", "FAILED_RETRYABLE", "FAILED_FINAL"].includes(next)) throw new Error("Execution transition requires lease owner");
      assertTransition(current.status, next);
      const updated = nextRun(current, { status: next, ...(error ? { lastError: error } : {}) });
      tx.set(ref, serializeRun(updated));
      if (next === "COMPLETED") await this.setSnapshotIfNeeded(tx, updated);
      return updated;
    });
  }

  async replanRun(runId: string, decision: BusinessPlanResult, expectedVersion: number, now: Date, context?: { readonly date?: string }): Promise<DurableRun> {
    return this.db.runTransaction(async tx => {
      const ref = this.runRef(runId);
      const current = fromRequired(await tx.get(ref));
      if (!["RECEIVED", "NEEDS_CLARIFICATION", "PARSED"].includes(current.status)) throw new Error("Run is not awaiting a replan");
      if (current.version !== expectedVersion) throw new Error("Run version conflict");
      const update = fromRequiredUpdate(await tx.get(this.updateRef(current.updateKey)));
      const plan = "plan" in decision ? decision.plan : undefined;
      const status = statusForDecision(decision);
      const pendingInteraction = status === "AWAITING_CONFIRMATION" || status === "NEEDS_CLARIFICATION" ? interactionFor(update, status, now) : undefined;
      const updated = nextRun(current, {
        status, decisionStatus: decision.status, plan, date: plan?.date ?? context?.date ?? current.date,
        conflictScopes: plan ? conflictScopes(plan) : [], pendingInteraction,
        snapshotEstablishment: Boolean(plan?.domain === "DAILY_SO" && plan.effects.some(effect => effect.provenance === "AUTO_FILL_MISSING")),
        clarificationDelivery: status === "NEEDS_CLARIFICATION" ? { interactionVersion: current.version + 1, state: "PENDING", attempt: 0, claimedAt: now.toISOString() } : undefined
      });
      tx.set(ref, serializeRun(updated));
      return updated;
    });
  }

  async claimClarificationDelivery(runId: string, now: Date): Promise<ClarificationDeliveryClaim> {
    return this.db.runTransaction(async tx => {
      const ref = this.runRef(runId);
      const current = fromRequired(await tx.get(ref));
      if (current.status !== "NEEDS_CLARIFICATION" || current.pendingInteraction?.kind !== "CLARIFICATION") return { status: "NOT_CLAIMABLE", reason: "Run is not awaiting clarification", run: current };
      if (Date.parse(current.pendingInteraction.expiresAt) <= now.getTime()) {
        const expired = nextRun(current, { status: "FAILED_FINAL", clarificationDelivery: current.clarificationDelivery ? { ...current.clarificationDelivery, state: "FAILED_FINAL" as const, lastError: "Clarification expired" } : undefined, lastError: "Clarification expired" });
        tx.set(ref, serializeRun(expired));
        return { status: "NOT_CLAIMABLE", reason: "Clarification expired", run: expired };
      }
      const delivery = current.clarificationDelivery;
      if (delivery?.state === "DELIVERED") return { status: "ALREADY_DELIVERED", run: current };
      if (delivery?.state === "IN_FLIGHT" && Date.parse(delivery.claimedAt) + 120_000 > now.getTime()) return { status: "NOT_CLAIMABLE", reason: "Clarification delivery is in flight", run: current };
      if (delivery?.state === "FAILED_FINAL") return { status: "NOT_CLAIMABLE", reason: "Clarification delivery failed permanently", run: current };
      if (delivery?.state === "FAILED_RETRYABLE" && delivery.attempt >= 3) {
        const exhausted = nextRun(current, { clarificationDelivery: { ...delivery, state: "FAILED_FINAL" as const, lastError: "Clarification delivery retry limit reached" }, lastError: "Clarification delivery retry limit reached" });
        tx.set(ref, serializeRun(exhausted));
        return { status: "NOT_CLAIMABLE", reason: "Clarification delivery retry limit reached", run: exhausted };
      }
      const claimed = { interactionVersion: current.version, state: "IN_FLIGHT" as const, attempt: (delivery?.attempt ?? 0) + 1, claimedAt: now.toISOString() };
      const updated = nextRun(current, { clarificationDelivery: claimed });
      tx.set(ref, serializeRun(updated));
      return { status: "CLAIMED", run: updated };
    });
  }

  async recordClarificationDelivery(runId: string, expectedVersion: number, state: "DELIVERED" | "FAILED_RETRYABLE" | "FAILED_FINAL", now: Date, error?: string): Promise<DurableRun> {
    return this.db.runTransaction(async tx => {
      const ref = this.runRef(runId);
      const current = fromRequired(await tx.get(ref));
      if (current.status !== "NEEDS_CLARIFICATION" || current.version !== expectedVersion || !current.clarificationDelivery || current.clarificationDelivery.state !== "IN_FLIGHT") throw new Error("Clarification delivery version conflict");
      const updated = nextRun(current, { clarificationDelivery: { ...current.clarificationDelivery, state, ...(state === "DELIVERED" ? { deliveredAt: now.toISOString() } : {}), ...(error ? { lastError: error } : {}) } });
      tx.set(ref, serializeRun(updated));
      return updated;
    });
  }

  async claimPrimaryStatus(updateKeyValue: string, state: PrimaryStatusState, aggregateFingerprint: string, now: Date): Promise<PrimaryStatusClaim> {
    return this.db.runTransaction(async tx => {
      const ref = this.updateRef(updateKeyValue);
      const snapshot = await tx.get(ref);
      const current = fromRequiredUpdate(snapshot);
      const marker = current.primaryStatusMessage;
      if (marker?.state === state && marker.delivery === "DELIVERED" && marker.aggregateFingerprint === aggregateFingerprint) return { status: "ALREADY_DELIVERED", update: current };
      if (marker?.delivery === "IN_FLIGHT" && Date.parse(marker.claimedAt) + 120_000 > now.getTime()) return { status: "NOT_CLAIMABLE", reason: "Primary status delivery is in flight", update: current };
      const next = { ...current, version: (current.version ?? 0) + 1, primaryStatusMessage: { ...marker, state, aggregateFingerprint, delivery: "IN_FLIGHT" as const, attempt: (marker?.attempt ?? 0) + 1, claimedAt: now.toISOString(), updatedAt: now.toISOString() } };
      tx.set(ref, next);
      return { status: "CLAIMED", update: next };
    });
  }

  async recordPrimaryStatus(updateKeyValue: string, expectedVersion: number, state: PrimaryStatusState, aggregateFingerprint: string, delivery: "DELIVERED" | "FAILED", now: Date, messageId?: string): Promise<DurableUpdate> {
    return this.db.runTransaction(async tx => {
      const ref = this.updateRef(updateKeyValue);
      const current = fromRequiredUpdate(await tx.get(ref));
      if (current.version !== expectedVersion || !current.primaryStatusMessage || current.primaryStatusMessage.delivery !== "IN_FLIGHT") throw new Error("Primary status delivery version conflict");
      const next = { ...current, version: current.version + 1, primaryStatusMessage: { ...current.primaryStatusMessage, state, aggregateFingerprint, delivery, ...(messageId ? { messageId } : {}), updatedAt: now.toISOString() } };
      tx.set(ref, next);
      return next;
    });
  }

  async completeExecution(runId: string, owner: string, expectedVersion: number, now: Date): Promise<DurableRun> {
    return this.finishExecution(runId, owner, expectedVersion, now, "COMPLETED");
  }

  async markEffectUncertain(runId: string, owner: string, expectedVersion: number, now: Date): Promise<DurableRun> {
    return this.finishExecution(runId, owner, expectedVersion, now, "EFFECT_UNCERTAIN");
  }

  async recoverExpiredExecution(runId: string, now: Date): Promise<DurableRun> {
    return this.db.runTransaction(async tx => {
      const ref = this.runRef(runId);
      const current = fromRequired(await tx.get(ref));
      if (current.status !== "EXECUTING" || !current.lease || Date.parse(current.lease.expiresAt) > now.getTime()) throw new Error("Execution lease is not expired");
      const updated = nextRun(current, { status: "EFFECT_UNCERTAIN", lease: undefined });
      tx.set(ref, serializeRun(updated));
      return updated;
    });
  }

  async persistReconciliation(input: PersistReconciliationInput): Promise<DurableRun> {
    return this.db.runTransaction(async tx => {
      const ref = this.runRef(input.runId);
      const current = fromRequired(await tx.get(ref));
      if (current.status !== "EFFECT_UNCERTAIN" || current.version !== input.expectedVersion || !current.plan) throw new Error("Reconciliation version or plan conflict");
      if (input.owner && (current.lease?.owner !== input.owner || Date.parse(current.lease.expiresAt) <= input.now.getTime())) throw new Error("Reconciliation lease is not valid");
      validateRecoveryOutcomes(current, input.outcomes);
      const updated = nextRun(current, { effectRecovery: Object.freeze([...input.outcomes]), residualEffectIds: Object.freeze(input.outcomes.filter(outcome => outcome.outcome === "RETRY_NEEDED").map(outcome => outcome.effectId)) });
      tx.set(ref, serializeRun(updated));
      return updated;
    });
  }

  async completeReconciledRun(runId: string, expectedVersion: number): Promise<DurableRun> {
    return this.db.runTransaction(async tx => {
      const ref = this.runRef(runId);
      const current = fromRequired(await tx.get(ref));
      if (current.status !== "EFFECT_UNCERTAIN" || current.version !== expectedVersion || !current.effectRecovery || current.effectRecovery.some(outcome => outcome.outcome !== "ALREADY_APPLIED")) throw new Error("Unresolved effects remain");
      const scopes = current.conflictScopes.map(scope => this.scopeRef(scope.key));
      for (const scope of scopes) await tx.get(scope);
      const updated = nextRun(current, { status: "COMPLETED" });
      tx.set(ref, serializeRun(updated));
      await this.setSnapshotIfNeeded(tx, updated);
      scopes.forEach(scope => tx.delete(scope));
      return updated;
    });
  }

  async claimReconciliation(runId: string, owner: string, now: Date, leaseMs: number): Promise<ClaimResult> {
    return this.db.runTransaction(async tx => {
      const ref = this.runRef(runId);
      const current = fromRequired(await tx.get(ref));
      if (current.status !== "EFFECT_UNCERTAIN") return { status: "NOT_CLAIMABLE", reason: "Run is not uncertain", run: current };
      if (current.effectRecovery) return { status: "NOT_CLAIMABLE", reason: "Reconciliation already persisted", run: current };
      const scopeRefs = current.conflictScopes.map(scope => this.scopeRef(scope.key));
      const scopeSnapshots = [];
      for (const scopeRef of scopeRefs) scopeSnapshots.push(await tx.get(scopeRef));
      const blocked: ConflictScope[] = [];
      scopeSnapshots.forEach((snap, index) => {
        const data = snap.data() as { runId?: string; expiresAt?: string } | undefined;
        if (snap.exists && data?.runId !== runId && data?.expiresAt && Date.parse(data.expiresAt) > now.getTime()) blocked.push(current.conflictScopes[index]);
      });
      if (blocked.length) return { status: "CONFLICT", scopes: blocked, run: current };
      const lease: ExecutionLease = { owner, generation: (current.lease?.generation ?? 0) + 1, expiresAt: new Date(now.getTime() + leaseMs).toISOString() };
      const updated = nextRun(current, { lease });
      tx.set(ref, serializeRun(updated));
      current.conflictScopes.forEach((scope, index) => tx.set(scopeRefs[index], { ...scope, runId, owner, generation: lease.generation, expiresAt: lease.expiresAt }));
      return { status: "CLAIMED", run: updated };
    });
  }

  async failExecution(runId: string, owner: string, expectedVersion: number, final: boolean, reason: string, now: Date): Promise<DurableRun> {
    return this.db.runTransaction(async tx => {
      const ref = this.runRef(runId);
      const current = fromRequired(await tx.get(ref));
      if (current.status !== "EXECUTING" || current.version !== expectedVersion || current.lease?.owner !== owner || Date.parse(current.lease.expiresAt) <= now.getTime()) throw new Error("Execution lease is not valid");
      const scopes = current.conflictScopes.map(scope => this.scopeRef(scope.key));
      for (const scope of scopes) await tx.get(scope);
      const updated = nextRun(current, { status: final ? "FAILED_FINAL" : "FAILED_RETRYABLE", lastError: reason });
      tx.set(ref, serializeRun(updated));
      scopes.forEach(scope => tx.delete(scope));
      return updated;
    });
  }

  async listRunnableRuns(limit: number): Promise<readonly DurableRun[]> {
    if (limit <= 0) return [];
    const [base, clarification] = await Promise.all([
      this.db.collection(V2_COLLECTIONS.runs).where("status", "in", ["RECEIVED", "READY", "EFFECT_UNCERTAIN", "FAILED_RETRYABLE"]).limit(limit).get(),
      this.db.collection(V2_COLLECTIONS.runs).where("clarificationDelivery.state", "in", ["PENDING", "FAILED_RETRYABLE"]).limit(limit).get()
    ]);
    const unique = new Map<string, DurableRun>();
    for (const document of [...base.docs, ...clarification.docs]) { const run = fromRun(document); unique.set(run.runId, run); }
    return [...unique.values()].slice(0, limit);
  }
  async listExpiredExecutingRuns(now: Date, limit: number): Promise<readonly DurableRun[]> {
    if (limit <= 0) return [];
    const snapshot = await this.db.collection(V2_COLLECTIONS.runs)
      .where("status", "==", "EXECUTING")
      .where("lease.expiresAt", "<=", now.toISOString())
      .orderBy("lease.expiresAt", "asc")
      .limit(limit)
      .get();
    return snapshot.docs.map(document => fromRun(document));
  }

  async confirm(input: ConfirmationInput): Promise<InteractionResult> { return this.resolveInteraction(input, "CONFIRMATION", "READY"); }
  async clarify(input: ConfirmationInput): Promise<InteractionResult> { return this.resolveInteraction(input, "CLARIFICATION", "PARSED"); }

  async claimExecution(runId: string, owner: string, now: Date, leaseMs: number): Promise<ClaimResult> {
    return this.db.runTransaction(async tx => {
      const ref = this.runRef(runId);
      const current = fromRequired(await tx.get(ref));
      if (current.status === "EFFECT_UNCERTAIN" && !current.effectRecovery) return { status: "NOT_CLAIMABLE", reason: "Reconciliation required before retry", run: current };
      if (current.status === "EFFECT_UNCERTAIN" && current.effectRecovery?.some(outcome => outcome.outcome === "DO_NOT_OVERWRITE")) return { status: "NOT_CLAIMABLE", reason: "Recovery conflict requires replan", run: current };
      if (current.status === "EFFECT_UNCERTAIN" && current.residualEffectIds?.length === 0) return { status: "NOT_CLAIMABLE", reason: "No residual effects; complete reconciliation", run: current };
      if (current.status !== "READY" && current.status !== "EFFECT_UNCERTAIN" && current.status !== "FAILED_RETRYABLE") return { status: "NOT_CLAIMABLE", reason: `Run status ${current.status} cannot execute`, run: current };
      const scopeRefs = current.conflictScopes.map(scope => this.scopeRef(scope.key));
      const scopeSnapshots = [];
      for (const scopeRef of scopeRefs) scopeSnapshots.push(await tx.get(scopeRef));
      let snapshot: SnapshotRecord | undefined;
      if (current.snapshotEstablishment && current.date) snapshot = await this.readSnapshotInTransaction(tx, current.store, current.date);
      if (current.snapshotEstablishment && snapshot?.state === "ESTABLISHED") return { status: "NOT_CLAIMABLE", reason: "Snapshot established; run requires replan", run: current };
      const blocked: ConflictScope[] = [];
      scopeSnapshots.forEach((snap, index) => {
        const data = snap.data() as { runId?: string; expiresAt?: string } | undefined;
        if (snap.exists && data?.runId !== runId && data?.expiresAt && Date.parse(data.expiresAt) > now.getTime()) blocked.push(current.conflictScopes[index]);
      });
      if (blocked.length) return { status: "CONFLICT", scopes: blocked, run: current };
      if (current.lease && Date.parse(current.lease.expiresAt) > now.getTime() && current.lease.owner !== owner) return { status: "NOT_CLAIMABLE", reason: "Run already claimed", run: current };
      const lease: ExecutionLease = { owner, generation: (current.lease?.generation ?? 0) + 1, expiresAt: new Date(now.getTime() + leaseMs).toISOString() };
      const updated = nextRun(current, { status: "EXECUTING", lease, executionPhase: "PRE_WRITE" });
      tx.set(ref, serializeRun(updated));
      current.conflictScopes.forEach((scope, index) => tx.set(scopeRefs[index], { ...scope, runId, owner, generation: lease.generation, expiresAt: lease.expiresAt }));
      return { status: "CLAIMED", run: updated };
    });
  }

  async getSnapshot(store: DurableRun["store"], date: string): Promise<SnapshotRecord> {
    const snapshot = await this.snapshotRef(store, date).get();
    return snapshot.exists ? snapshot.data() as SnapshotRecord : { key: `${store}:${date}`, store, date, state: "NOT_ESTABLISHED", updatedAt: new Date(0).toISOString() };
  }

  async markWriteStarted(runId: string, owner: string, expectedVersion: number, now: Date): Promise<DurableRun> {
    return this.updateWritePhase(runId, owner, expectedVersion, "PRE_WRITE", "WRITE_STARTED", now);
  }

  async markWriteConfirmed(runId: string, owner: string, expectedVersion: number, now: Date): Promise<DurableRun> {
    return this.updateWritePhase(runId, owner, expectedVersion, "WRITE_STARTED", "WRITE_CONFIRMED", now);
  }

  private async updateWritePhase(runId: string, owner: string, expectedVersion: number, required: "PRE_WRITE" | "WRITE_STARTED", nextPhase: "WRITE_STARTED" | "WRITE_CONFIRMED", now: Date): Promise<DurableRun> {
    return this.db.runTransaction(async tx => {
      const ref = this.runRef(runId);
      const current = fromRequired(await tx.get(ref));
      if (current.status !== "EXECUTING" || current.version !== expectedVersion || current.lease?.owner !== owner || Date.parse(current.lease.expiresAt) <= now.getTime() || (current.executionPhase ?? "PRE_WRITE") !== required) throw new Error("Execution write phase authority is not valid");
      const updated = nextRun(current, { executionPhase: nextPhase });
      tx.set(ref, serializeRun(updated));
      return updated;
    });
  }

  private async createRunsInTransaction(tx: Transaction, update: DurableUpdate, seeds: readonly BlockRunSeed[]): Promise<readonly DurableRun[]> {
    const result: DurableRun[] = [];
    for (const seed of seeds) {
      const id = blockRunId(update.updateKey, seed.blockIndex);
      const snapshot = await tx.get(this.runRef(id));
      if (snapshot.exists) result.push(fromRun(snapshot));
      else {
        const run = createDurableRun(update, id, seed);
        tx.create(this.runRef(id), serializeRun(run));
        result.push(run);
      }
    }
    return result;
  }

  private async resolveInteraction(input: ConfirmationInput, kind: "CONFIRMATION" | "CLARIFICATION", next: "READY" | "PARSED"): Promise<InteractionResult> {
    return this.db.runTransaction(async tx => {
      const ref = this.runRef(input.runId);
      const current = fromRequired(await tx.get(ref));
      const interaction = current.pendingInteraction;
      if (!interaction || interaction.kind !== kind) return { status: "NOT_PENDING" };
      if (interaction.chatId !== input.chatId || interaction.userId !== input.userId) return { status: "NOT_AUTHORIZED" };
      if (Date.parse(interaction.expiresAt) <= input.now.getTime()) {
        if (current.status === "AWAITING_CONFIRMATION" || current.status === "NEEDS_CLARIFICATION") {
          const expired = nextRun(current, { status: "FAILED_FINAL", lastError: `${kind} expired` });
          tx.set(ref, serializeRun(expired));
        }
        return { status: "EXPIRED" };
      }
      if (current.status === next) return { status: "ALREADY_ACCEPTED", run: current };
      const expected = kind === "CONFIRMATION" ? "AWAITING_CONFIRMATION" : "NEEDS_CLARIFICATION";
      if (current.status !== expected) return { status: "NOT_PENDING" };
      const updated = nextRun(current, { status: next });
      tx.set(ref, serializeRun(updated));
      return { status: "ACCEPTED", run: updated };
    });
  }

  private async finishExecution(runId: string, owner: string, expectedVersion: number, now: Date, next: "COMPLETED" | "EFFECT_UNCERTAIN"): Promise<DurableRun> {
    return this.db.runTransaction(async tx => {
      const ref = this.runRef(runId);
      const current = fromRequired(await tx.get(ref));
      if (current.status !== "EXECUTING" || current.version !== expectedVersion) throw new Error("Execution authority or version conflict");
      if (!current.lease || (current.lease.owner !== owner && next !== "EFFECT_UNCERTAIN") || (next === "COMPLETED" && Date.parse(current.lease.expiresAt) <= now.getTime()) || (next === "EFFECT_UNCERTAIN" && current.lease.owner !== owner && Date.parse(current.lease.expiresAt) > now.getTime())) throw new Error("Execution lease is not valid");
      const scopes = current.conflictScopes.map(scope => this.scopeRef(scope.key));
      for (const scope of scopes) await tx.get(scope);
      const updated = nextRun(current, { status: next });
      tx.set(ref, serializeRun(updated));
      if (next === "COMPLETED") {
        await this.setSnapshotIfNeeded(tx, updated);
        scopes.forEach(scope => tx.delete(scope));
      }
      return updated;
    });
  }

  private async setSnapshotIfNeeded(tx: Transaction, run: DurableRun): Promise<void> {
    if (!run.snapshotEstablishment || !run.date) return;
    tx.set(this.snapshotRef(run.store, run.date), { key: `${run.store}:${run.date}`, store: run.store, date: run.date, state: "ESTABLISHED", establishedByRunId: run.runId, updatedAt: run.updatedAt });
  }

  private async readSnapshotInTransaction(tx: Transaction, store: DurableRun["store"], date: string): Promise<SnapshotRecord | undefined> {
    const snapshot = await tx.get(this.snapshotRef(store, date));
    return snapshot.exists ? snapshot.data() as SnapshotRecord : undefined;
  }

  private updateRef(key: string): DocumentReference { return this.db.collection(V2_COLLECTIONS.updates).doc(key); }
  private runRef(key: string): DocumentReference { return this.db.collection(V2_COLLECTIONS.runs).doc(key); }
  private scopeRef(key: string): DocumentReference { return this.db.collection(V2_COLLECTIONS.conflictScopes).doc(encodeURIComponent(key)); }
  private snapshotRef(store: DurableRun["store"], date: string): DocumentReference { return this.db.collection(V2_COLLECTIONS.snapshots).doc(`${store}:${date}`); }
}

function nextRun(current: DurableRun, changes: Partial<DurableRun>): DurableRun {
  return Object.freeze({ ...current, ...changes, version: current.version + 1, updatedAt: new Date().toISOString() });
}

function serializeRun(run: DurableRun): Record<string, unknown> {
  return JSON.parse(JSON.stringify(run)) as Record<string, unknown>;
}

function fromUpdate(snapshot: DocumentSnapshot): DurableUpdate { const data = snapshot.data() as DurableUpdate; return { ...data, version: data.version ?? 0 }; }
function fromRun(snapshot: DocumentSnapshot): DurableRun { return Object.freeze(snapshot.data() as DurableRun); }
function fromRequiredUpdate(snapshot: DocumentSnapshot): DurableUpdate {
  if (!snapshot.exists) throw new Error("Durable update not found");
  return fromUpdate(snapshot);
}
function fromRequired(snapshot: DocumentSnapshot): DurableRun {
  if (!snapshot.exists) throw new Error("Durable document not found");
  return fromRun(snapshot);
}
