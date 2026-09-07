import { describe, expect, it } from "vitest";
import { resolveProductionTarget, resolveDailySoTarget } from "../src/sheets/target-resolver.js";
import { createInMemoryRepositoryState, InMemoryDurableStateRepository } from "../src/persistence/repository.js";
import { blockRunId, updateKey } from "../src/persistence/identity.js";
import { canTransition } from "../src/persistence/state-machine.js";
import { effectIdentity, recoverPlan, recoveryDecision, recoveryEntries, residualEffects } from "../src/persistence/recovery.js";
import { classifyRetry } from "../src/persistence/retry-policy.js";
import type { MutationPlan } from "../src/domains/business-types.js";
import type { BlockRunSeed, RecoveryObservation } from "../src/persistence/durable-types.js";

const now = new Date("2026-09-07T01:00:00.000Z");
const target = resolveProductionTarget({ store: "PMS", sku: "PEARL_BASE", sheetName: "7 - 2026" });
const honeyTarget = resolveProductionTarget({ store: "PMS", sku: "HONEY_BASE", sheetName: "7 - 2026" });
const puddingTarget = resolveProductionTarget({ store: "PMS", sku: "PUDDING_BASE", sheetName: "7 - 2026" });

function plan(overrides: Partial<MutationPlan> = {}): MutationPlan {
  return {
    store: "PMS", domain: "PRODUCTION", date: "2026-09-07", effects: [], noOps: [], corrections: [], executable: true, ...overrides
  };
}

function readySeed(blockIndex = 0, decision: "READY" | "NO_OP" | "REQUIRES_CONFIRMATION" | "REQUIRES_CLARIFICATION" = "READY"): BlockRunSeed {
  const p = plan({ effects: decision === "READY" ? [{ store: "PMS", domain: "PRODUCTION", date: "2026-09-07", canonicalSkuId: "PEARL_BASE", target, expectedOldValue: null, desiredValue: 5, operation: "SET", provenance: "USER_EXPLICIT" }] : [], executable: decision === "READY" });
  if (decision === "NO_OP") return { blockIndex, store: "PMS", domain: "PRODUCTION", decision: { status: "NO_OP", plan: p }, now };
  if (decision === "REQUIRES_CONFIRMATION") return { blockIndex, store: "PMS", domain: "PRODUCTION", decision: { status: "REQUIRES_CONFIRMATION", plan: { ...p, corrections: [{ store: "PMS", domain: "PRODUCTION", date: p.date, canonicalSkuId: "PEARL_BASE", target, oldValue: 2, proposedValue: 5, operation: "SET" }] } }, now };
  if (decision === "REQUIRES_CLARIFICATION") return { blockIndex, store: "PMS", domain: "PRODUCTION", decision: { status: "REQUIRES_CLARIFICATION", reasons: ["MISSING_QUANTITY"] }, now };
  return { blockIndex, store: "PMS", domain: "PRODUCTION", decision: { status: "READY", plan: p }, now };
}

function updateInput(updateId: number) {
  return { botId: "tele-auto-v2", updateId, chatId: "chat-1", userId: "user-1", messageId: `message-${updateId}`, receivedAt: now };
}

describe("durable identity and acceptance", () => {
  it("deduplicates same update atomically and creates deterministic block runs", async () => {
    const repo = new InMemoryDurableStateRepository();
    const input = updateInput(10);
    const [a, b] = await Promise.all([repo.acceptUpdate(input, [readySeed(0), readySeed(1)]), repo.acceptUpdate(input, [readySeed(0), readySeed(1)])]);
    expect(a.updateKey).toBe(updateKey("tele-auto-v2", 10));
    expect(a).toEqual(b);
    expect(a.blockRunIds).toEqual([blockRunId(a.updateKey, 0), blockRunId(a.updateKey, 1)]);
    expect(await repo.getRun(a.blockRunIds[0])).toBeTruthy();
  });

  it("keeps different Telegram updates independent", async () => {
    const repo = new InMemoryDurableStateRepository();
    const a = await repo.acceptUpdate(updateInput(11), [readySeed()]);
    const b = await repo.acceptUpdate(updateInput(12), [readySeed()]);
    expect(a.updateKey).not.toBe(b.updateKey);
    expect(a.blockRunIds[0]).not.toBe(b.blockRunIds[0]);
  });
});

describe("run state machine and interactions", () => {
  it("enforces legal transitions and terminal states", async () => {
    const repo = new InMemoryDurableStateRepository();
    const update = await repo.acceptUpdate(updateInput(20), [readySeed()]);
    let run = (await repo.getRun(update.blockRunIds[0]))!;
    expect(run.status).toBe("READY");
    expect(canTransition("READY", "EXECUTING")).toBe(true);
    expect(canTransition("COMPLETED", "EXECUTING")).toBe(false);
    const claim = await repo.claimExecution(run.runId, "worker-a", now, 60_000);
    expect(claim.status).toBe("CLAIMED");
    run = claim.run;
    run = await repo.completeExecution(run.runId, "worker-a", run.version, now);
    await expect(repo.transitionRun(run.runId, "EXECUTING", run.version)).rejects.toThrow("Illegal run transition");
  });

  it("persists the external write boundary with fenced phases", async () => {
    const repo = new InMemoryDurableStateRepository();
    const update = await repo.acceptUpdate(updateInput(25), [readySeed()]);
    const claimed = await repo.claimExecution(update.blockRunIds[0], "worker-a", now, 60_000);
    if (claimed.status !== "CLAIMED") return;
    const started = await repo.markWriteStarted(claimed.run.runId, "worker-a", claimed.run.version, now);
    expect(started.executionPhase).toBe("WRITE_STARTED");
    const confirmed = await repo.markWriteConfirmed(started.runId, "worker-a", started.version, now);
    expect(confirmed.executionPhase).toBe("WRITE_CONFIRMED");
    await expect(repo.markWriteConfirmed(confirmed.runId, "worker-a", confirmed.version, now)).rejects.toThrow();
  });

  it("completes NO_OP without execution claim and rejects clarification/rejected runs", async () => {
    const repo = new InMemoryDurableStateRepository();
    const update = await repo.acceptUpdate(updateInput(21), [readySeed(0, "NO_OP"), readySeed(1, "REQUIRES_CLARIFICATION"), { blockIndex: 2, store: "PMS", domain: "PRODUCTION", decision: { status: "REJECTED", reason: "invalid" }, now }]);
    expect((await repo.getRun(update.blockRunIds[0]))!.status).toBe("COMPLETED");
    expect((await repo.getRun(update.blockRunIds[1]))!.status).toBe("NEEDS_CLARIFICATION");
    expect((await repo.getRun(update.blockRunIds[2]))!.status).toBe("REJECTED");
    expect((await repo.claimExecution(update.blockRunIds[0], "worker", now, 60_000)).status).toBe("NOT_CLAIMABLE");
    expect((await repo.claimExecution(update.blockRunIds[2], "worker", now, 60_000)).status).toBe("NOT_CLAIMABLE");
  });

  it("isolates confirmation and clarification by chat, user, run, and TTL", async () => {
    const repo = new InMemoryDurableStateRepository();
    const update = await repo.acceptUpdate(updateInput(22), [readySeed(0, "REQUIRES_CONFIRMATION"), readySeed(1, "REQUIRES_CLARIFICATION")]);
    const confirmation = await repo.confirm({ runId: update.blockRunIds[0], chatId: "chat-1", userId: "user-1", now });
    expect(confirmation.status).toBe("ACCEPTED");
    expect((await repo.confirm({ runId: update.blockRunIds[0], chatId: "chat-1", userId: "user-1", now })).status).toBe("ALREADY_ACCEPTED");
    expect((await repo.confirm({ runId: update.blockRunIds[0], chatId: "chat-1", userId: "other", now })).status).toBe("NOT_AUTHORIZED");
    const clarification = await repo.clarify({ runId: update.blockRunIds[1], chatId: "chat-1", userId: "user-1", now });
    expect(clarification.status).toBe("ACCEPTED");
    const replanned = await repo.replanRun(update.blockRunIds[1], { status: "READY", plan: plan() }, 1, now);
    expect(replanned.status).toBe("READY");

    const expiredUpdate = await repo.acceptUpdate(updateInput(23), [readySeed(0, "REQUIRES_CONFIRMATION")]);
    const expired = await repo.confirm({ runId: expiredUpdate.blockRunIds[0], chatId: "chat-1", userId: "user-1", now: new Date(now.getTime() + 15 * 60_000) });
    expect(expired.status).toBe("EXPIRED");
    expect((await repo.getRun(expiredUpdate.blockRunIds[0]))!.status).toBe("FAILED_FINAL");
    const expiredClarificationUpdate = await repo.acceptUpdate(updateInput(24), [readySeed(0, "REQUIRES_CLARIFICATION")]);
    expect((await repo.clarify({ runId: expiredClarificationUpdate.blockRunIds[0], chatId: "chat-1", userId: "user-1", now: new Date(now.getTime() + 15 * 60_000) })).status).toBe("EXPIRED");
  });
});

describe("execution claims and conflict scopes", () => {
  it("allows one owner per run and one owner per overlapping scope", async () => {
    const repo = new InMemoryDurableStateRepository();
    const update = await repo.acceptUpdate(updateInput(30), [readySeed()]);
    const [a, b] = await Promise.all([
      repo.claimExecution(update.blockRunIds[0], "worker-a", now, 60_000),
      repo.claimExecution(update.blockRunIds[0], "worker-b", now, 60_000)
    ]);
    expect([a.status, b.status].filter(status => status === "CLAIMED")).toHaveLength(1);

    const other = await repo.acceptUpdate(updateInput(31), [readySeed()]);
    expect((await repo.claimExecution(other.blockRunIds[0], "worker-c", now, 60_000)).status).toBe("CONFLICT");
  });

  it("keeps independent cells and stores parallel", async () => {
    const repo = new InMemoryDurableStateRepository();
    const independent = resolveProductionTarget({ store: "PMS", sku: "HONEY_BASE", sheetName: "7 - 2026" });
    const p = plan({ effects: [{ store: "PMS", domain: "PRODUCTION", date: "2026-09-07", canonicalSkuId: "HONEY_BASE", target: independent, expectedOldValue: null, desiredValue: 2, operation: "SET", provenance: "USER_EXPLICIT" }] });
    const seedA: BlockRunSeed = { blockIndex: 0, store: "PMS", domain: "PRODUCTION", decision: { status: "READY", plan: plan({ effects: [{ store: "PMS", domain: "PRODUCTION", date: "2026-09-07", canonicalSkuId: "PEARL_BASE", target, expectedOldValue: null, desiredValue: 2, operation: "SET", provenance: "USER_EXPLICIT" }] }) }, now };
    const seedB: BlockRunSeed = { blockIndex: 0, store: "PMS", domain: "PRODUCTION", decision: { status: "READY", plan: p }, now };
    const a = await repo.acceptUpdate(updateInput(32), [seedA]);
    const b = await repo.acceptUpdate(updateInput(33), [seedB]);
    expect((await repo.claimExecution(a.blockRunIds[0], "a", now, 60_000)).status).toBe("CLAIMED");
    expect((await repo.claimExecution(b.blockRunIds[0], "b", now, 60_000)).status).toBe("CLAIMED");
    const tpTarget = resolveProductionTarget({ store: "TP6", sku: "PEARL_BASE", sheetName: "7 - 2026" });
    const tpPlan = plan({ store: "TP6", effects: [{ store: "TP6", domain: "PRODUCTION", date: "2026-09-07", canonicalSkuId: "PEARL_BASE", target: tpTarget, expectedOldValue: null, desiredValue: 2, operation: "SET", provenance: "USER_EXPLICIT" }] });
    const tp = await repo.acceptUpdate(updateInput(34), [{ blockIndex: 0, store: "TP6", domain: "PRODUCTION", decision: { status: "READY", plan: tpPlan }, now }]);
    expect((await repo.claimExecution(tp.blockRunIds[0], "tp", now, 60_000)).status).toBe("CLAIMED");
  });
});

describe("Daily SO snapshot authority and external recovery", () => {
  it("serializes first snapshot and establishes only after completion", async () => {
    const repo = new InMemoryDurableStateRepository();
    const dailyTarget = resolveDailySoTarget({ store: "PMS", sku: "HARRY_POTTER_CUP", day: 1 });
    const p: MutationPlan = { store: "PMS", domain: "DAILY_SO", date: "2026-09-07", effects: [{ store: "PMS", domain: "DAILY_SO", date: "2026-09-07", canonicalSkuId: "HARRY_POTTER_CUP", target: dailyTarget, expectedOldValue: null, desiredValue: 0, operation: "SET", provenance: "AUTO_FILL_MISSING" }], noOps: [], corrections: [], executable: true };
    const seed: BlockRunSeed = { blockIndex: 0, store: "PMS", domain: "DAILY_SO", decision: { status: "READY", plan: p }, now };
    const a = await repo.acceptUpdate(updateInput(40), [seed]);
    const b = await repo.acceptUpdate(updateInput(41), [seed]);
    expect((await repo.claimExecution(a.blockRunIds[0], "a", now, 60_000)).status).toBe("CLAIMED");
    expect((await repo.claimExecution(b.blockRunIds[0], "b", now, 60_000)).status).toBe("CONFLICT");
    let run = (await repo.getRun(a.blockRunIds[0]))!;
    run = await repo.completeExecution(run.runId, "a", run.version, now);
    expect((await repo.getSnapshot("PMS", "2026-09-07")).state).toBe("ESTABLISHED");
    expect((await repo.claimExecution(b.blockRunIds[0], "b", now, 60_000)).status).toBe("NOT_CLAIMABLE");
  });

  it("decides uncertain effects without blind replay", () => {
    expect(recoveryDecision("EXPECTED_OLD")).toBe("RETRY_NEEDED");
    expect(recoveryDecision("DESIRED")).toBe("ALREADY_APPLIED");
    expect(recoveryDecision("CONFLICT")).toBe("DO_NOT_OVERWRITE");
    const p = plan({ effects: [
      { store: "PMS", domain: "PRODUCTION", date: "2026-09-07", canonicalSkuId: "PEARL_BASE", target, expectedOldValue: 2, desiredValue: 5, operation: "SET", provenance: "USER_EXPLICIT" },
      { store: "PMS", domain: "PRODUCTION", date: "2026-09-07", canonicalSkuId: "HONEY_BASE", target: resolveProductionTarget({ store: "PMS", sku: "HONEY_BASE", sheetName: "7 - 2026" }), expectedOldValue: 2, desiredValue: 5, operation: "SET", provenance: "USER_EXPLICIT" }
    ] });
    const recovered = recoverPlan(p, { PEARL_BASE: "DESIRED", HONEY_BASE: "EXPECTED_OLD" });
    expect(recovered.alreadyApplied.map(effect => effect.canonicalSkuId)).toEqual(["PEARL_BASE"]);
    expect(recovered.retry.map(effect => effect.canonicalSkuId)).toEqual(["HONEY_BASE"]);
  });
});

describe("retry classification", () => {
  it("classifies transient failures only", () => {
    expect(classifyRetry("TIMEOUT")).toBe("RETRYABLE");
    expect(classifyRetry("TRANSIENT_EXTERNAL")).toBe("RETRYABLE");
    expect(classifyRetry("SCHEMA_MISMATCH")).toBe("FINAL");
    expect(classifyRetry("AUTHORIZATION")).toBe("FINAL");
  });
});

describe("durable per-effect reconciliation", () => {
  function uncertainPlan(): MutationPlan {
    return plan({ effects: [
      { store: "PMS", domain: "PRODUCTION", date: "2026-09-07", canonicalSkuId: "PEARL_BASE", target, expectedOldValue: 2, desiredValue: 5, operation: "SET", provenance: "USER_EXPLICIT" },
      { store: "PMS", domain: "PRODUCTION", date: "2026-09-07", canonicalSkuId: "HONEY_BASE", target: honeyTarget, expectedOldValue: 2, desiredValue: 5, operation: "SET", provenance: "USER_EXPLICIT" },
      { store: "PMS", domain: "PRODUCTION", date: "2026-09-07", canonicalSkuId: "PUDDING_BASE", target: puddingTarget, expectedOldValue: 2, desiredValue: 5, operation: "SET", provenance: "USER_EXPLICIT" }
    ] });
  }

  it("persists A/B/C reconciliation and reloads only B as residual", async () => {
    const state = createInMemoryRepositoryState();
    const repo = new InMemoryDurableStateRepository(state);
    const p = uncertainPlan();
    const update = await repo.acceptUpdate(updateInput(70), [{ ...readySeed(), decision: { status: "READY", plan: p } }]);
    const claimed = await repo.claimExecution(update.blockRunIds[0], "worker", now, 60_000);
    expect(claimed.status).toBe("CLAIMED");
    if (claimed.status !== "CLAIMED") return;
    let run = await repo.markEffectUncertain(claimed.run.runId, "worker", claimed.run.version, now);
    const observations = Object.fromEntries(p.effects.map((effect, index) => [effectIdentity(effect), index === 0 ? "DESIRED" : index === 1 ? "EXPECTED_OLD" : "CONFLICT"])) as Record<string, RecoveryObservation>;
    run = await repo.persistReconciliation({ runId: run.runId, expectedVersion: run.version, outcomes: recoveryEntries(p, observations, now), now });
    const reloaded = new InMemoryDurableStateRepository(state);
    const afterRestart = (await reloaded.getRun(run.runId))!;
    expect(afterRestart.effectRecovery?.map(entry => entry.outcome)).toEqual(["ALREADY_APPLIED", "RETRY_NEEDED", "DO_NOT_OVERWRITE"]);
    expect(residualEffects(afterRestart).map(effect => effect.canonicalSkuId)).toEqual(["HONEY_BASE"]);
    expect((await reloaded.claimExecution(run.runId, "retry", now, 60_000)).status).toBe("NOT_CLAIMABLE");
  });

  it("rejects stale reconciliation and completes all-applied state after restart", async () => {
    const state = createInMemoryRepositoryState();
    const repo = new InMemoryDurableStateRepository(state);
    const p = uncertainPlan();
    const update = await repo.acceptUpdate(updateInput(71), [{ ...readySeed(), decision: { status: "READY", plan: p } }]);
    const claim = await repo.claimExecution(update.blockRunIds[0], "worker", now, 60_000);
    if (claim.status !== "CLAIMED") return;
    let run = await repo.markEffectUncertain(claim.run.runId, "worker", claim.run.version, now);
    const allApplied = recoveryEntries(p, Object.fromEntries(p.effects.map(effect => [effectIdentity(effect), "DESIRED"])), now);
    run = await repo.persistReconciliation({ runId: run.runId, expectedVersion: run.version, outcomes: allApplied, now });
    await expect(repo.persistReconciliation({ runId: run.runId, expectedVersion: run.version - 1, outcomes: allApplied, now })).rejects.toThrow("Reconciliation");
    const restarted = new InMemoryDurableStateRepository(state);
    expect(residualEffects((await restarted.getRun(run.runId))!)).toHaveLength(0);
    run = await restarted.completeReconciledRun(run.runId, run.version);
    expect(run.status).toBe("COMPLETED");
    expect(residualEffects((await new InMemoryDurableStateRepository(state).getRun(run.runId))!)).toHaveLength(0);
  });

  it("preserves retry progress across a second restart", async () => {
    const state = createInMemoryRepositoryState();
    const repo = new InMemoryDurableStateRepository(state);
    const p = uncertainPlan();
    const update = await repo.acceptUpdate(updateInput(72), [{ ...readySeed(), decision: { status: "READY", plan: p } }]);
    const claim = await repo.claimExecution(update.blockRunIds[0], "worker", now, 60_000);
    if (claim.status !== "CLAIMED") return;
    let run = await repo.markEffectUncertain(claim.run.runId, "worker", claim.run.version, now);
    const partial = recoveryEntries(p, Object.fromEntries(p.effects.map((effect, index) => [effectIdentity(effect), index === 0 ? "DESIRED" : index === 1 ? "EXPECTED_OLD" : "CONFLICT"])) as Record<string, RecoveryObservation>, now);
    run = await repo.persistReconciliation({ runId: run.runId, expectedVersion: run.version, outcomes: partial, now });
    const restarted = new InMemoryDurableStateRepository(state);
    expect(residualEffects((await restarted.getRun(run.runId))!)).toHaveLength(1);
    const final = recoveryEntries(p, Object.fromEntries(p.effects.map((effect, index) => [effectIdentity(effect), index < 2 ? "DESIRED" : "CONFLICT"])) as Record<string, RecoveryObservation>, now);
    run = await restarted.persistReconciliation({ runId: run.runId, expectedVersion: run.version, outcomes: final, now });
    expect(residualEffects(run)).toHaveLength(0);
    expect((await new InMemoryDurableStateRepository(state).getRun(run.runId))?.effectRecovery?.[0].outcome).toBe("ALREADY_APPLIED");
  });

  it("moves expired execution conservatively to uncertainty", async () => {
    const repo = new InMemoryDurableStateRepository();
    const update = await repo.acceptUpdate(updateInput(73), [readySeed()]);
    const claim = await repo.claimExecution(update.blockRunIds[0], "worker", now, 1);
    if (claim.status !== "CLAIMED") return;
    const uncertain = await repo.recoverExpiredExecution(update.blockRunIds[0], new Date(now.getTime() + 2));
    expect(uncertain.status).toBe("EFFECT_UNCERTAIN");
    expect((await repo.claimExecution(uncertain.runId, "new-worker", new Date(now.getTime() + 2), 60_000)).status).toBe("NOT_CLAIMABLE");
  });
});
