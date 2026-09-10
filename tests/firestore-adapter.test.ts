import { describe, expect, it } from "vitest";
import { resolveProductionTarget, resolveDailySoTarget } from "../src/sheets/target-resolver.js";
import { FirestoreDurableStateRepository } from "../src/persistence/firestore-repository.js";
import { effectIdentity, recoveryEntries, residualEffects } from "../src/persistence/recovery.js";
import type { BusinessPlanResult, MutationPlan } from "../src/domains/business-types.js";
import type { BlockRunSeed, RecoveryObservation } from "../src/persistence/durable-types.js";

class FakeSnapshot {
  constructor(private readonly value: Record<string, unknown> | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}
class FakeQuery {
  private readonly filters: { field: string; operator: "==" | "in" | "<="; value: unknown }[] = [];
  private ordering?: { field: string; direction: "asc" | "desc" };
  private max = Number.POSITIVE_INFINITY;
  constructor(private readonly store: FakeFirestore, private readonly prefix: string) {}
  where(field: string, operator: "==" | "in" | "<=", value: unknown) { this.filters.push({ field, operator, value }); return this; }
  orderBy(field: string, direction: "asc" | "desc" = "asc") { this.ordering = { field, direction }; return this; }
  limit(value: number) { this.max = value; return this; }
  async get() {
    const rows = [...this.store.data.entries()]
      .filter(([path]) => path.startsWith(`${this.prefix}/`))
      .filter(([, value]) => this.filters.every(filter => {
        const actual = getNested(value, filter.field);
        if (filter.operator === "in") return Array.isArray(filter.value) && filter.value.includes(actual);
        if (filter.operator === "<=") return String(actual) <= String(filter.value);
        return actual === filter.value;
      }))
      .sort(([, left], [, right]) => {
        if (!this.ordering) return 0;
        const a = String(getNested(left, this.ordering.field)); const b = String(getNested(right, this.ordering.field));
        return this.ordering.direction === "asc" ? a.localeCompare(b) : b.localeCompare(a);
      })
      .slice(0, this.max);
    return { docs: rows.map(([, value]) => new FakeSnapshot(value)) };
  }
}
function getNested(value: Record<string, unknown>, field: string): unknown {
  return field.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
}
class FakeRef {
  constructor(private readonly store: FakeFirestore, readonly path: string) {}
  async get() { return new FakeSnapshot(this.store.data.get(this.path)); }
  async set(value: Record<string, unknown>) { this.store.data.set(this.path, structuredClone(value)); }
  async create(value: Record<string, unknown>) { if (this.store.data.has(this.path)) throw new Error("already exists"); await this.set(value); }
  async update(value: Record<string, unknown>) { await this.set({ ...(this.store.data.get(this.path) ?? {}), ...structuredClone(value) }); }
  async delete() { this.store.data.delete(this.path); }
}
class FakeCollection {
  constructor(private readonly store: FakeFirestore, private readonly prefix: string) {}
  doc(id: string) { return new FakeRef(this.store, `${this.prefix}/${id}`); }
  where(field: string, operator: "==" | "in" | "<=", value: unknown) { return new FakeQuery(this.store, this.prefix).where(field, operator, value); }
}
class FakeTransaction {
  private readonly writes: (() => Promise<void>)[] = [];
  constructor(private readonly store: FakeFirestore) {}
  async get(ref: FakeRef) { return ref.get(); }
  create(ref: FakeRef, value: Record<string, unknown>) { this.writes.push(() => ref.create(value)); }
  set(ref: FakeRef, value: Record<string, unknown>) { this.writes.push(() => ref.set(value)); }
  update(ref: FakeRef, value: Record<string, unknown>) { this.writes.push(() => ref.update(value)); }
  delete(ref: FakeRef) { this.writes.push(() => ref.delete()); }
  async commit() { for (const write of this.writes) await write(); }
}
class FakeFirestore {
  readonly data = new Map<string, Record<string, unknown>>();
  private tail = Promise.resolve();
  collection(name: string) { return new FakeCollection(this, name); }
  runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => { const tx = new FakeTransaction(this); const result = await callback(tx); await tx.commit(); return result; });
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }
}

const fakeNow = new Date("2026-09-07T01:00:00.000Z");
const target = resolveProductionTarget({ store: "PMS", sku: "PEARL_BASE", sheetName: "7 - 2026" });
function makePlan(overrides: Partial<MutationPlan> = {}): MutationPlan {
  return { store: "PMS", domain: "PRODUCTION", date: "2026-09-07", effects: [{ store: "PMS", domain: "PRODUCTION", date: "2026-09-07", canonicalSkuId: "PEARL_BASE", target, expectedOldValue: null, desiredValue: 5, operation: "SET", provenance: "USER_EXPLICIT" }], noOps: [], corrections: [], executable: true, ...overrides };
}
function seed(decision: BusinessPlanResult = { status: "READY", plan: makePlan() }): BlockRunSeed { return { blockIndex: 0, store: "PMS", domain: "PRODUCTION", decision, now: fakeNow }; }
function input(updateId: number) { return { botId: "tele-auto-v2", updateId, chatId: "chat", userId: "user", receivedAt: fakeNow }; }
function repo(fake: FakeFirestore) { return new FirestoreDurableStateRepository({ firestore: fake as unknown as import("@google-cloud/firestore").Firestore, projectId: "cluster-01-core-prod", databaseId: "(default)" }); }

describe("FirestoreDurableStateRepository", () => {
  it("requires the dedicated project and approved database", () => {
    expect(() => new FirestoreDurableStateRepository({ firestore: new FakeFirestore() as unknown as import("@google-cloud/firestore").Firestore, projectId: "legacy-project" })).toThrow("cluster-01-core-prod");
    expect(() => new FirestoreDurableStateRepository({ firestore: new FakeFirestore() as unknown as import("@google-cloud/firestore").Firestore, databaseId: "legacy-db" })).toThrow("(default)");
  });

  it("atomically converges duplicate updates and reloads durable runs", async () => {
    const fake = new FakeFirestore();
    const first = repo(fake);
    const seeds = [seed(), { ...seed(), blockIndex: 1 }];
    const [a, b] = await Promise.all([first.acceptUpdate(input(1), seeds), first.acceptUpdate(input(1), seeds)]);
    expect(a).toEqual(b);
    expect(a.blockRunIds).toHaveLength(2);
    expect((await repo(fake).getRun(a.blockRunIds[0]))?.status).toBe("READY");
  });

  it("guards claims, stale generations, overlapping scopes, and independent scopes", async () => {
    const fake = new FakeFirestore();
    const adapter = repo(fake);
    const a = await adapter.acceptUpdate(input(2), [seed()]);
    const b = await adapter.acceptUpdate(input(3), [seed()]);
    const claimed = await adapter.claimExecution(a.blockRunIds[0], "a", fakeNow, 10);
    expect(claimed.status).toBe("CLAIMED");
    expect((await adapter.claimExecution(b.blockRunIds[0], "b", fakeNow, 10)).status).toBe("CONFLICT");
    const independentTarget = resolveProductionTarget({ store: "PMS", sku: "HONEY_BASE", sheetName: "7 - 2026" });
    const independentPlan = makePlan({ effects: [{ ...makePlan().effects[0], canonicalSkuId: "HONEY_BASE", target: independentTarget }] });
    const c = await adapter.acceptUpdate(input(4), [{ ...seed({ status: "READY", plan: independentPlan }), blockIndex: 0 }]);
    expect((await adapter.claimExecution(c.blockRunIds[0], "c", fakeNow, 10)).status).toBe("CLAIMED");
    if (claimed.status === "CLAIMED") {
      await expect(adapter.completeExecution(a.blockRunIds[0], "a", claimed.run.version, new Date(fakeNow.getTime() + 20))).rejects.toThrow();
    }
  });

  it("claims all required scopes in one transaction", async () => {
    const fake = new FakeFirestore();
    const adapter = repo(fake);
    const honeyTarget = resolveProductionTarget({ store: "PMS", sku: "HONEY_BASE", sheetName: "7 - 2026" });
    const multiPlan = makePlan({ effects: [
      makePlan().effects[0],
      { ...makePlan().effects[0], canonicalSkuId: "HONEY_BASE", target: honeyTarget }
    ] });
    const first = await adapter.acceptUpdate(input(8), [{ ...seed({ status: "READY", plan: multiPlan }) }]);
    const pearlCompetitor = await adapter.acceptUpdate(input(9), [seed()]);
    const honeyCompetitor = await adapter.acceptUpdate(input(10), [{ ...seed({ status: "READY", plan: { ...makePlan(), effects: [{ ...makePlan().effects[0], canonicalSkuId: "HONEY_BASE", target: honeyTarget }] } }) }]);
    expect((await adapter.claimExecution(first.blockRunIds[0], "first", fakeNow, 60_000)).status).toBe("CLAIMED");
    expect((await adapter.claimExecution(pearlCompetitor.blockRunIds[0], "pearl", fakeNow, 60_000)).status).toBe("CONFLICT");
    expect((await adapter.claimExecution(honeyCompetitor.blockRunIds[0], "honey", fakeNow, 60_000)).status).toBe("CONFLICT");
  });

  it("persists confirmation, uncertain state, and snapshot establishment across reload", async () => {
    const fake = new FakeFirestore();
    const adapter = repo(fake);
    const confirmation = await adapter.acceptUpdate(input(5), [seed({ status: "REQUIRES_CONFIRMATION", plan: makePlan({ corrections: [{ store: "PMS", domain: "PRODUCTION", date: "2026-09-07", canonicalSkuId: "PEARL_BASE", target, oldValue: 2, proposedValue: 5, operation: "SET" }] }) })]);
    expect((await repo(fake).confirm({ runId: confirmation.blockRunIds[0], chatId: "chat", userId: "user", now: fakeNow })).status).toBe("ACCEPTED");
    const uncertain = await adapter.acceptUpdate(input(6), [seed()]);
    const claim = await adapter.claimExecution(uncertain.blockRunIds[0], "worker", fakeNow, 60_000);
    expect(claim.status).toBe("CLAIMED");
    if (claim.status === "CLAIMED") {
      await repo(fake).markEffectUncertain(uncertain.blockRunIds[0], "worker", claim.run.version, fakeNow);
      expect((await repo(fake).getRun(uncertain.blockRunIds[0]))?.status).toBe("EFFECT_UNCERTAIN");
    }
    const dailyTarget = resolveDailySoTarget({ store: "PMS", sku: "HARRY_POTTER_CUP", day: 1 });
    const dailyPlan: MutationPlan = { store: "PMS", domain: "DAILY_SO", date: "2026-09-07", effects: [{ store: "PMS", domain: "DAILY_SO", date: "2026-09-07", canonicalSkuId: "HARRY_POTTER_CUP", target: dailyTarget, expectedOldValue: null, desiredValue: 0, operation: "SET", provenance: "AUTO_FILL_MISSING" }], noOps: [], corrections: [], executable: true };
    const daily = await adapter.acceptUpdate(input(7), [{ ...seed({ status: "READY", plan: dailyPlan }), store: "PMS", domain: "DAILY_SO" }]);
    const dailyClaim = await adapter.claimExecution(daily.blockRunIds[0], "daily", fakeNow, 60_000);
    expect(dailyClaim.status).toBe("CLAIMED");
    if (dailyClaim.status === "CLAIMED") await repo(fake).completeExecution(daily.blockRunIds[0], "daily", dailyClaim.run.version, fakeNow);
    expect((await repo(fake).getSnapshot("PMS", "2026-09-07")).state).toBe("ESTABLISHED");
  });

  it("persists per-effect reconciliation across adapter reload", async () => {
    const fake = new FakeFirestore();
    const adapter = repo(fake);
    const honeyTarget = resolveProductionTarget({ store: "PMS", sku: "HONEY_BASE", sheetName: "7 - 2026" });
    const p = makePlan({ effects: [makePlan().effects[0], { ...makePlan().effects[0], canonicalSkuId: "HONEY_BASE", target: honeyTarget }] });
    const accepted = await adapter.acceptUpdate(input(11), [seed({ status: "READY", plan: p })]);
    const claim = await adapter.claimExecution(accepted.blockRunIds[0], "worker", fakeNow, 60_000);
    expect(claim.status).toBe("CLAIMED");
    if (claim.status !== "CLAIMED") return;
    let run = await adapter.markEffectUncertain(accepted.blockRunIds[0], "worker", claim.run.version, fakeNow);
    const observations = Object.fromEntries(p.effects.map((effect, index) => [effectIdentity(effect), index === 0 ? "DESIRED" : "EXPECTED_OLD"])) as Record<string, RecoveryObservation>;
    run = await adapter.persistReconciliation({ runId: run.runId, expectedVersion: run.version, outcomes: recoveryEntries(p, observations, fakeNow), now: fakeNow });
    const reloaded = repo(fake);
    const durable = (await reloaded.getRun(run.runId))!;
    expect(durable.effectRecovery?.map(entry => entry.outcome)).toEqual(["ALREADY_APPLIED", "RETRY_NEEDED"]);
    expect(residualEffects(durable).map(effect => effect.canonicalSkuId)).toEqual(["HONEY_BASE"]);
    await expect(reloaded.persistReconciliation({ runId: run.runId, expectedVersion: run.version - 1, outcomes: run.effectRecovery!, now: fakeNow })).rejects.toThrow("Reconciliation");
    run = await reloaded.persistReconciliation({ runId: run.runId, expectedVersion: run.version, outcomes: recoveryEntries(p, Object.fromEntries(p.effects.map(effect => [effectIdentity(effect), "DESIRED"])) as Record<string, RecoveryObservation>, fakeNow), now: fakeNow });
    await reloaded.completeReconciledRun(run.runId, run.version);
    expect((await repo(fake).getRun(run.runId))?.status).toBe("COMPLETED");
  });

  it("discovers expired execution by lease expiry before applying the bounded limit", async () => {
    const fake = new FakeFirestore();
    const adapter = repo(fake);
    const active = await adapter.acceptUpdate(input(12), [seed()]);
    const honeyTarget = resolveProductionTarget({ store: "PMS", sku: "HONEY_BASE", sheetName: "7 - 2026" });
    const expired = await adapter.acceptUpdate(input(13), [{ ...seed(), decision: { status: "READY", plan: { ...makePlan(), effects: [{ ...makePlan().effects[0], canonicalSkuId: "HONEY_BASE", target: honeyTarget }] } } }]);
    expect((await adapter.claimExecution(active.blockRunIds[0], "active", fakeNow, 60_000)).status).toBe("CLAIMED");
    expect((await adapter.claimExecution(expired.blockRunIds[0], "expired", fakeNow, 10)).status).toBe("CLAIMED");
    const found = await repo(fake).listExpiredExecutingRuns(new Date(fakeNow.getTime() + 20), 1);
    expect(found.map(run => run.runId)).toEqual([expired.blockRunIds[0]]);
    expect(await repo(fake).listExpiredExecutingRuns(fakeNow, 1)).toEqual([]);
  });
});
