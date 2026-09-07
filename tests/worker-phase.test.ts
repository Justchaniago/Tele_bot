import { describe, expect, it } from "vitest";
import { WorkerService } from "../src/app/worker-service.js";
import { InMemoryDurableStateRepository } from "../src/persistence/repository.js";
import { SheetsReadError } from "../src/sheets/sheets-reader.js";
import { resolveProductionTarget } from "../src/sheets/target-resolver.js";
import type { SheetsReader } from "../src/sheets/sheets-reader.js";
import type { SheetsWriter } from "../src/sheets/sheets-writer.js";
import { createLogger } from "../src/observability/logger.js";

const now = new Date("2026-09-08T00:00:00.000Z");
const target = resolveProductionTarget({ store: "PMS", sku: "PEARL_BASE", sheetName: "7 - 2026" });

describe("worker external-effect boundary", () => {
  it("does not classify a pre-write Sheets read failure as uncertain", async () => {
    const repo = new InMemoryDurableStateRepository();
    const update = await repo.acceptUpdate({ botId: "bot", updateId: 8100, chatId: "chat", userId: "user", receivedAt: now }, [{
      blockIndex: 0, store: "PMS", domain: "PRODUCTION", now,
      decision: { status: "READY", plan: { store: "PMS", domain: "PRODUCTION", date: "2026-09-08", executable: true, noOps: [], corrections: [], effects: [{ store: "PMS", domain: "PRODUCTION", date: "2026-09-08", canonicalSkuId: "PEARL_BASE", target, expectedOldValue: null, desiredValue: 5, operation: "SET", provenance: "USER_EXPLICIT" }] } }
    }]);
    let writes = 0;
    const reader = { readEffectCurrent: async () => { throw new SheetsReadError("FINAL", "schema read failed"); } } as unknown as SheetsReader;
    const writer = { writeEffects: async () => { writes += 1; } } as unknown as SheetsWriter;
    const worker = new WorkerService(repo, reader, writer, createLogger("error", () => undefined), undefined, () => now);
    await worker.drain(10);
    expect((await repo.getRun(update.blockRunIds[0]))?.status).toBe("FAILED_FINAL");
    expect((await repo.getRun(update.blockRunIds[0]))?.effectRecovery).toBeUndefined();
    expect(writes).toBe(0);
  });
});
