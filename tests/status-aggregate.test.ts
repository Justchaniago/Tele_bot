import { describe, expect, it } from "vitest";
import { aggregateStatus } from "../src/app/status-aggregate.js";
import { InMemoryDurableStateRepository } from "../src/persistence/repository.js";
import type { DurableRun } from "../src/persistence/durable-types.js";

const now = new Date("2026-09-08T00:00:00.000Z");

function run(status: DurableRun["status"], blockIndex: number, domain: DurableRun["domain"]): DurableRun {
  return {
    runId: `update:block:${blockIndex}`, updateKey: "update", blockIndex, status, version: 1,
    store: "TP6", domain, decisionStatus: status === "COMPLETED" ? "NO_OP" : "REQUIRES_CLARIFICATION",
    date: "2026-09-07", conflictScopes: [], snapshotEstablishment: false,
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
    ...(status === "NEEDS_CLARIFICATION" ? { pendingInteraction: { kind: "CLARIFICATION" as const, chatId: "chat", userId: "user", expiresAt: new Date(now.getTime() + 900000).toISOString() } } : {})
  };
}

describe("update-level primary status aggregation", () => {
  it("never shows success while a sibling is active", () => {
    const result = aggregateStatus([run("COMPLETED", 0, "PRODUCTION"), run("EXECUTING", 1, "WASTE")]);
    expect(result.state).toBe("PROCESSING");
    expect(result.text).toContain("Produksi: Berhasil");
    expect(result.text).toContain("Waste: Sedang diproses");
  });

  it("retains actionable details for multiple sibling interactions", () => {
    const result = aggregateStatus([run("NEEDS_CLARIFICATION", 0, "PRODUCTION"), run("AWAITING_CONFIRMATION", 1, "WASTE")]);
    expect(result.state).toBe("NEEDS_INFORMATION");
    expect(result.text).toContain("Produksi: Perlu informasi");
    expect(result.text).toContain("Waste: Perlu konfirmasi");
    expect(result.text).toContain("Data produksi");
    expect(result.text).toContain("Selesaikan input ini terlebih dahulu");
  });

  it("renders a terminal mixed summary without exposing FSM names", () => {
    const result = aggregateStatus([run("COMPLETED", 0, "PRODUCTION"), run("FAILED_FINAL", 1, "WASTE"), run("COMPLETED", 2, "DAILY_SO")]);
    expect(result.state).toBe("SUCCESS");
    expect(result.text).toContain("Proses selesai.");
    expect(result.text).toContain("Waste: Gagal");
    expect(result.text).not.toContain("FAILED_FINAL");
  });
});

describe("primary status durable claim safety", () => {
  it("reclaims only stale in-flight claims", async () => {
    const repo = new InMemoryDurableStateRepository();
    const update = await repo.acceptUpdate({ botId: "bot", updateId: 9001, chatId: "chat", userId: "user", receivedAt: now });
    expect((await repo.claimPrimaryStatus(update.updateKey, "PROCESSING", "fp-1", now)).status).toBe("CLAIMED");
    expect((await repo.claimPrimaryStatus(update.updateKey, "PROCESSING", "fp-1", new Date(now.getTime() + 119999))).status).toBe("NOT_CLAIMABLE");
    expect((await repo.claimPrimaryStatus(update.updateKey, "PROCESSING", "fp-1", new Date(now.getTime() + 120001))).status).toBe("CLAIMED");
  });

  it("publishes changed aggregate content even when high-level state is unchanged", async () => {
    const repo = new InMemoryDurableStateRepository();
    const update = await repo.acceptUpdate({ botId: "bot", updateId: 9002, chatId: "chat", userId: "user", receivedAt: now });
    const first = await repo.claimPrimaryStatus(update.updateKey, "PROCESSING", "fp-1", now);
    expect(first.status).toBe("CLAIMED");
    await repo.recordPrimaryStatus(update.updateKey, first.status === "CLAIMED" ? first.update.version : 0, "PROCESSING", "fp-1", "DELIVERED", now, "message-1");
    expect((await repo.claimPrimaryStatus(update.updateKey, "PROCESSING", "fp-2", new Date(now.getTime() + 1))).status).toBe("CLAIMED");
  });
});
