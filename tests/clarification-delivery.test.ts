import { describe, expect, it } from "vitest";
import { WorkerService } from "../src/app/worker-service.js";
import { InMemoryDurableStateRepository } from "../src/persistence/repository.js";
import { createLogger } from "../src/observability/logger.js";
import type { SheetsReader } from "../src/sheets/sheets-reader.js";
import type { SheetsWriter } from "../src/sheets/sheets-writer.js";
import { TelegramDeliveryError, type TelegramNotifier } from "../src/telegram/notifier.js";

const now = new Date("2026-09-07T16:00:00.000Z");

function input() {
  return {
    botId: "tele-auto-v2", updateId: 7001, chatId: "tp6-chat", userId: "staff-1",
    messageId: "message-1", receivedAt: now
  };
}

function dependencies(notifier: TelegramNotifier) {
  const reader = { listSheetNames: async () => ["7 - 2026"], readTargetCurrent: async () => null, readEffectCurrent: async () => null } as unknown as SheetsReader;
  let writes = 0;
  const writer = { writeEffects: async () => { writes += 1; } } as unknown as SheetsWriter;
  return { reader, writer, writes: () => writes, notifier };
}

async function seed(repo: InMemoryDurableStateRepository) {
  const update = await repo.acceptUpdate(input(), [{
    blockIndex: 0, store: "TP6", domain: "PRODUCTION", rawBlockBody: "07-09-2026",
    initialStatus: "RECEIVED", decision: { status: "REQUIRES_CLARIFICATION", reasons: ["MISSING_INPUT"] }, now
  }]);
  return update.blockRunIds[0];
}

describe("durable clarification delivery", () => {
  it("delivers date-only Production clarification once and never writes Sheets", async () => {
    const repo = new InMemoryDurableStateRepository();
    const sent: string[] = []; const edits: string[] = [];
    const deps = dependencies({ send: async (_chat, text) => { sent.push(text); return "primary-1"; }, edit: async (_chat, _id, text) => { edits.push(text); } });
    const worker = new WorkerService(repo, deps.reader, deps.writer, createLogger("debug", () => undefined), deps.notifier, () => now);
    const runId = await seed(repo);

    await worker.drain(10);
    await worker.drain(10);

    const run = await repo.getRun(runId);
    expect(run).toMatchObject({ status: "NEEDS_CLARIFICATION", date: "2026-09-07", store: "TP6", domain: "PRODUCTION" });
    expect(run?.pendingInteraction).toMatchObject({ kind: "CLARIFICATION", chatId: "tp6-chat", userId: "staff-1" });
    expect(run?.clarificationDelivery?.state).toBe("DELIVERED");
    expect(sent).toHaveLength(1);
    expect(edits).toHaveLength(2);
    expect(edits[1]).toContain("Data produksi untuk 2026-09-07 belum diisi.");
    expect(deps.writes()).toBe(0);
  });

  it("persists a failed delivery without making the run executable", async () => {
    const repo = new InMemoryDurableStateRepository();
    const deps = dependencies({ send: async (_chat, text) => { if (text.startsWith("Data produksi")) throw new Error("permanent Telegram failure"); return "primary-1"; }, edit: async () => { throw new Error("permanent Telegram failure"); } });
    const worker = new WorkerService(repo, deps.reader, deps.writer, createLogger("debug", () => undefined), deps.notifier, () => now);
    const runId = await seed(repo);

    await worker.drain(10);

    const run = await repo.getRun(runId);
    expect(run?.status).toBe("NEEDS_CLARIFICATION");
    expect(run?.clarificationDelivery?.state).toBe("FAILED_FINAL");
    expect(deps.writes()).toBe(0);
  });

  it("allows a classified transient delivery failure to be retried durably", async () => {
    const repo = new InMemoryDurableStateRepository();
    let clarificationAttempts = 0;
    const sent: string[] = [];
    let editAttempts = 0;
    const deps = dependencies({ send: async (_chat, text) => {
      if (text.startsWith("Data produksi")) { clarificationAttempts += 1; if (clarificationAttempts === 1) throw new TelegramDeliveryError("temporary", "RETRYABLE"); }
      sent.push(text);
      return "primary-1";
    }, edit: async () => { editAttempts += 1; if (editAttempts === 2) throw new TelegramDeliveryError("temporary", "RETRYABLE"); } });
    const worker = new WorkerService(repo, deps.reader, deps.writer, createLogger("debug", () => undefined), deps.notifier, () => now);
    const runId = await seed(repo);

    await worker.drain(10);
    expect((await repo.getRun(runId))?.clarificationDelivery?.state).toBe("FAILED_RETRYABLE");
    await worker.drain(10);
    expect((await repo.getRun(runId))?.clarificationDelivery?.state).toBe("DELIVERED");
    expect(sent).toHaveLength(1);
    expect(deps.writes()).toBe(0);
  });

  it("uses one primary bubble through received, processing, and success", async () => {
    const repo = new InMemoryDurableStateRepository();
    const sent: string[] = []; const edits: string[] = [];
    const deps = dependencies({ send: async (_chat, text) => { sent.push(text); return "primary-1"; }, edit: async (_chat, _id, text) => { edits.push(text); } });
    const worker = new WorkerService(repo, deps.reader, deps.writer, createLogger("debug", () => undefined), deps.notifier, () => now);
    const update = await repo.acceptUpdate({ ...input(), updateId: 7002 }, [{ blockIndex: 0, store: "TP6", domain: "PRODUCTION", rawBlockBody: "07-09-2026\npearl 3", initialStatus: "RECEIVED", decision: { status: "REQUIRES_CLARIFICATION", reasons: ["RECEIVED"] }, now }]);

    await worker.drain(10);

    expect(await repo.getRun(update.blockRunIds[0])).toMatchObject({ status: "COMPLETED" });
    expect(sent).toHaveLength(1);
    expect(edits[0]).toContain("Input sedang diproses");
    expect(edits.at(-1)).toContain("Berhasil diproses");
    expect((await repo.getUpdate(update.updateKey))?.primaryStatusMessage).toMatchObject({ messageId: "primary-1", state: "SUCCESS", delivery: "DELIVERED" });
  });

  it("edits the same primary bubble for a confirmation request", async () => {
    const repo = new InMemoryDurableStateRepository();
    const sent: string[] = []; const edits: string[] = [];
    const deps = dependencies({ send: async (_chat, text) => { sent.push(text); return "primary-2"; }, edit: async (_chat, _id, text) => { edits.push(text); } });
    const worker = new WorkerService(repo, deps.reader, deps.writer, createLogger("debug", () => undefined), deps.notifier, () => now);
    const update = await repo.acceptUpdate({ ...input(), updateId: 7003 }, [{ blockIndex: 0, store: "TP6", domain: "PRODUCTION", rawBlockBody: "07-09-2026\npearl 5", initialStatus: "RECEIVED", decision: { status: "REQUIRES_CLARIFICATION", reasons: ["RECEIVED"] }, now }]);
    const originalRead = deps.reader.readTargetCurrent;
    (deps.reader as unknown as { readTargetCurrent: () => Promise<unknown> }).readTargetCurrent = async () => 2;

    await worker.drain(10);

    expect(await repo.getRun(update.blockRunIds[0])).toMatchObject({ status: "AWAITING_CONFIRMATION" });
    expect(sent).toHaveLength(1);
    expect(edits.at(-1)).toContain("Perlu konfirmasi");
    (deps.reader as unknown as { readTargetCurrent: typeof originalRead }).readTargetCurrent = originalRead;
  });

  it("uses one bounded fallback send when a terminal edit fails", async () => {
    const repo = new InMemoryDurableStateRepository();
    const sent: string[] = []; const edits: string[] = [];
    const deps = dependencies({ send: async (_chat, text) => { sent.push(text); return `message-${sent.length}`; }, edit: async (_chat, _id, text) => { edits.push(text); if (text.includes("Berhasil")) throw new TelegramDeliveryError("edit unavailable", "FINAL"); } });
    const worker = new WorkerService(repo, deps.reader, deps.writer, createLogger("debug", () => undefined), deps.notifier, () => now);
    const update = await repo.acceptUpdate({ ...input(), updateId: 7004 }, [{ blockIndex: 0, store: "TP6", domain: "PRODUCTION", rawBlockBody: "07-09-2026\npearl 3", initialStatus: "RECEIVED", decision: { status: "REQUIRES_CLARIFICATION", reasons: ["RECEIVED"] }, now }]);

    await worker.drain(10);
    await worker.drain(10);

    expect(await repo.getRun(update.blockRunIds[0])).toMatchObject({ status: "COMPLETED" });
    expect(sent.filter(text => text.includes("Berhasil"))).toHaveLength(1);
    expect((await repo.getUpdate(update.updateKey))?.primaryStatusMessage).toMatchObject({ state: "SUCCESS", delivery: "DELIVERED" });
  });

  it("does not rediscover delivered clarification, but discovers retryable delivery", async () => {
    const repo = new InMemoryDurableStateRepository();
    const runId = await seed(repo);
    const replanned = await repo.replanRun(runId, { status: "REQUIRES_CLARIFICATION", reasons: ["MISSING_INPUT"] }, 0, now, { date: "2026-09-07" });
    const claim = await repo.claimClarificationDelivery(runId, now);
    expect(claim.status).toBe("CLAIMED");
    if (claim.status !== "CLAIMED") return;
    await repo.recordClarificationDelivery(runId, claim.run.version, "DELIVERED", now);
    expect((await repo.listRunnableRuns(10)).some(run => run.runId === runId)).toBe(false);
    expect(replanned.date).toBe("2026-09-07");
  });

  it("reclaims stale clarification delivery claims and expires old interactions", async () => {
    const repo = new InMemoryDurableStateRepository();
    const runId = await seed(repo);
    await repo.replanRun(runId, { status: "REQUIRES_CLARIFICATION", reasons: ["MISSING_INPUT"] }, 0, now, { date: "2026-09-07" });
    const first = await repo.claimClarificationDelivery(runId, now);
    expect(first.status).toBe("CLAIMED");
    const second = await repo.claimClarificationDelivery(runId, new Date(now.getTime() + 121_000));
    expect(second.status).toBe("CLAIMED");
    const expired = await repo.claimClarificationDelivery(runId, new Date(now.getTime() + 16 * 60_000));
    expect(expired.status).toBe("NOT_CLAIMABLE");
    expect((await repo.getRun(runId))?.status).toBe("FAILED_FINAL");
  });
});
