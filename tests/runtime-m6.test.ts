import { describe, expect, it } from "vitest";
import { IngestionService, validateTelegramUpdate } from "../src/app/ingestion.js";
import { InMemoryDurableStateRepository } from "../src/persistence/repository.js";
import type { AppConfig } from "../src/config/env.js";
import { resolveProductionTarget } from "../src/sheets/target-resolver.js";

const config: AppConfig = { nodeEnv: "test", port: 8080, logLevel: "info", telegramBotId: "test-bot", trustedTelegramChats: { "10": "PMS" }, workerMaxRuns: 2, executionLeaseMs: 1000 };
const target = resolveProductionTarget({ store: "PMS", sku: "PEARL_BASE", sheetName: "7 - 2026" });

class OrderedRepository extends InMemoryDurableStateRepository {
  readonly events: string[] = [];
  override async confirm(input: Parameters<InMemoryDurableStateRepository["confirm"]>[0]) {
    this.events.push("confirm:start");
    const result = await super.confirm(input);
    this.events.push("confirm:end");
    return result;
  }
}

describe("M6 webhook acceptance", () => {
  it("durably accepts duplicate update once and creates deterministic block runs", async () => {
    const repository = new InMemoryDurableStateRepository();
    const service = new IngestionService(repository, config, () => new Date("2026-09-07T00:00:00Z"));
    const update = validateTelegramUpdate({ update_id: 77, message: { message_id: 4, chat: { id: 10 }, from: { id: 20 }, text: "/produksi\n07-09-2026\npearl 5\n\n/waste\n07-09-2026\npearl 1" } });
    const first = await service.accept(update); await service.accept(update);
    const stored = await repository.getUpdate("test-bot:77");
    expect(first).toBeUndefined();
    expect(stored?.blockRunIds).toEqual(["test-bot:77:block:0", "test-bot:77:block:1"]);
    expect((await repository.getRun(stored!.blockRunIds[0]))?.store).toBe("PMS");
  });

  it("accepts an edited PMS group command through the same trusted-store path", async () => {
    const repository = new InMemoryDurableStateRepository();
    let wakeups = 0;
    const service = new IngestionService(repository, config, () => new Date("2026-09-08T00:00:00Z"), { enqueue: async () => { wakeups++; } });
    const update = validateTelegramUpdate({ update_id: 119, edited_message: { message_id: 41, chat: { id: 10 }, from: { id: 20 }, text: "/produksi\n07-09-2026\npearl: 0.3" } });

    await service.accept(update);
    await service.accept(update);

    const stored = await repository.getUpdate("test-bot:119");
    expect(stored).toMatchObject({ chatId: "10", userId: "20", messageId: "41" });
    expect(stored?.blockRunIds).toEqual(["test-bot:119:block:0"]);
    expect(await repository.getRun("test-bot:119:block:0")).toMatchObject({ store: "PMS", domain: "PRODUCTION", status: "RECEIVED" });
    expect(wakeups).toBe(2);
  });

  it("does not let message text choose store", async () => {
    const repository = new InMemoryDurableStateRepository();
    const service = new IngestionService(repository, config);
    await expect(service.accept(validateTelegramUpdate({ update_id: 1, message: { chat: { id: 999 }, from: { id: 20 }, text: "/waste" } }))).rejects.toThrow("not configured");
    expect(await repository.getUpdate("test-bot:1")).toBeUndefined();
  });

  it("keeps durable acceptance when wakeup fails and retries wakeup without duplicate run", async () => {
    const repository = new InMemoryDurableStateRepository();
    let attempts = 0;
    const wakeup = { enqueue: async () => { attempts++; if (attempts === 1) throw new Error("task enqueue failed"); } };
    const service = new IngestionService(repository, config, () => new Date("2026-09-07T00:00:00Z"), wakeup);
    const update = validateTelegramUpdate({ update_id: 88, message: { message_id: 5, chat: { id: 10 }, from: { id: 20 }, text: "/produksi\n07-09-2026\npearl 5" } });
    await expect(service.accept(update)).rejects.toThrow("task enqueue failed");
    expect((await repository.getUpdate("test-bot:88"))?.blockRunIds).toEqual(["test-bot:88:block:0"]);
    await service.accept(update);
    expect((await repository.getUpdate("test-bot:88"))?.blockRunIds).toEqual(["test-bot:88:block:0"]);
    expect(attempts).toBe(2);
  });

  it("transitions confirmation durably before publishing its wakeup", async () => {
    const repository = new OrderedRepository();
    const pending = await repository.acceptUpdate({ botId: "test-bot", updateId: 90, chatId: "10", userId: "20", receivedAt: new Date("2026-09-07T00:00:00Z") }, [{
      blockIndex: 0, store: "PMS", domain: "PRODUCTION", now: new Date("2026-09-07T00:00:00Z"),
      decision: { status: "REQUIRES_CONFIRMATION", plan: { store: "PMS", domain: "PRODUCTION", date: "2026-09-07", effects: [], noOps: [], corrections: [{ store: "PMS", domain: "PRODUCTION", date: "2026-09-07", canonicalSkuId: "PEARL_BASE", target, oldValue: 2, proposedValue: 5, operation: "SET" }], executable: false } }
    }]);
    const wakeup = { enqueue: async () => { repository.events.push("enqueue"); expect((await repository.getRun(pending.blockRunIds[0]))?.status).toBe("READY"); } };
    await new IngestionService(repository, config, () => new Date("2026-09-07T00:00:00Z"), wakeup).accept(validateTelegramUpdate({ update_id: 91, callback_query: { from: { id: 20 }, message: { chat: { id: 10 } }, data: `tele_auto_confirm:${pending.blockRunIds[0]}` } }));
    expect(repository.events).toEqual(["confirm:start", "confirm:end", "enqueue"]);
  });

  it("keeps READY state when confirmation wakeup enqueue fails and retries idempotently", async () => {
    const repository = new InMemoryDurableStateRepository();
    const pending = await repository.acceptUpdate({ botId: "test-bot", updateId: 92, chatId: "10", userId: "20", receivedAt: new Date("2026-09-07T00:00:00Z") }, [{
      blockIndex: 0, store: "PMS", domain: "PRODUCTION", now: new Date("2026-09-07T00:00:00Z"),
      decision: { status: "REQUIRES_CONFIRMATION", plan: { store: "PMS", domain: "PRODUCTION", date: "2026-09-07", effects: [], noOps: [], corrections: [{ store: "PMS", domain: "PRODUCTION", date: "2026-09-07", canonicalSkuId: "PEARL_BASE", target, oldValue: 2, proposedValue: 5, operation: "SET" }], executable: false } }
    }]);
    let attempts = 0;
    const wakeup = { enqueue: async () => { attempts++; if (attempts === 1) throw new Error("wakeup unavailable"); } };
    const callback = validateTelegramUpdate({ update_id: 93, callback_query: { from: { id: 20 }, message: { chat: { id: 10 } }, data: `tele_auto_confirm:${pending.blockRunIds[0]}` } });
    await expect(new IngestionService(repository, config, () => new Date("2026-09-07T00:00:00Z"), wakeup).accept(callback)).rejects.toThrow("wakeup unavailable");
    expect((await repository.getRun(pending.blockRunIds[0]))?.status).toBe("READY");
    await new IngestionService(repository, config, () => new Date("2026-09-07T00:00:00Z"), wakeup).accept(callback);
    expect(attempts).toBe(2);
  });
});
