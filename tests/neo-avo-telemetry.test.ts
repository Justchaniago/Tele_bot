import { describe, expect, it, vi } from "vitest";
import { NeoAvoTelemetry, emitTelemetrySafely, stableTelemetryEventId } from "../src/observability/neo-avo-telemetry.js";
import { createLogger } from "../src/observability/logger.js";
import { WorkerService } from "../src/app/worker-service.js";
import { InMemoryDurableStateRepository } from "../src/persistence/repository.js";
import { resolveProductionTarget } from "../src/sheets/target-resolver.js";
import type { SheetsReader } from "../src/sheets/sheets-reader.js";
import type { SheetsWriter } from "../src/sheets/sheets-writer.js";

describe("Neo AVO telemetry boundary", () => {
  it("posts the canonical bounded event envelope with dedicated auth", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    const telemetry = new NeoAvoTelemetry({ enabled: true, baseUrl: "https://neo.example/", projectId: "tele-auto", environment: "production", apiToken: "project-token", timeoutMs: 1000, fetchImpl });

    await telemetry.emit({
      eventId: stableTelemetryEventId("run-1", "tele_auto.run.completed", 4),
      type: "tele_auto.run.completed", runId: "run-1", store: "PMS", domain: "DAILY_SO",
      status: "COMPLETED", severity: "INFO", executionPhase: "WRITE_CONFIRMED"
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://neo.example/api/v1/events");
    expect(request.headers).toMatchObject({
      authorization: "Bearer project-token",
      "x-neo-avo-environment": "production",
      "content-type": "application/json"
    });
    const body = JSON.parse(String(request.body));
    expect(body).toEqual({ events: [{
      schemaVersion: 1,
      eventId: "tele-auto:run-1:tele_auto.run.completed:4",
      projectId: "tele-auto",
      environment: "production",
      type: "tele_auto.run.completed",
      occurredAt: expect.any(String),
      data: { runId: "run-1", store: "PMS", domain: "DAILY_SO", status: "COMPLETED", severity: "INFO", executionPhase: "WRITE_CONFIRMED" }
    }] });
  });

  it("isolates provider failure from the application caller", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("provider unavailable"));
    const telemetry = new NeoAvoTelemetry({ enabled: true, baseUrl: "https://neo.example", projectId: "tele-auto", environment: "production", apiToken: "project-token", timeoutMs: 1000, fetchImpl });
    const warnings: string[] = [];
    const logger = createLogger("warn", line => warnings.push(line));

    expect(() => emitTelemetrySafely(telemetry, { eventId: "event-1", type: "tele_auto.run.received" }, logger)).not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(warnings.join("\n")).toContain("Neo AVO telemetry delivery failed");
  });

  it("retries one temporary provider failure but not a permanent client error", async () => {
    const temporaryFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const temporary = new NeoAvoTelemetry({ enabled: true, baseUrl: "https://neo.example", projectId: "tele-auto", environment: "production", apiToken: "project-token", timeoutMs: 1000, fetchImpl: temporaryFetch });
    await temporary.emit({ eventId: "event-503", type: "tele_auto.run.failed" });
    expect(temporaryFetch).toHaveBeenCalledTimes(2);

    const permanentFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    const permanent = new NeoAvoTelemetry({ enabled: true, baseUrl: "https://neo.example", projectId: "tele-auto", environment: "production", apiToken: "project-token", timeoutMs: 1000, fetchImpl: permanentFetch });
    await expect(permanent.emit({ eventId: "event-401", type: "tele_auto.run.failed" })).rejects.toThrow("401");
    expect(permanentFetch).toHaveBeenCalledTimes(1);
  });

  it("can be disabled without making a provider request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const telemetry = new NeoAvoTelemetry({ enabled: false, projectId: "tele-auto", environment: "production", timeoutMs: 1000, fetchImpl });
    await expect(telemetry.emit({ eventId: "event-1", type: "tele_auto.run.processing" })).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not alter business completion when the provider is unavailable", async () => {
    const telemetry = new NeoAvoTelemetry({ enabled: true, baseUrl: "https://neo.example", projectId: "tele-auto", environment: "production", apiToken: "project-token", timeoutMs: 1000, fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new Error("unavailable")) });
    const repository = new InMemoryDurableStateRepository();
    const target = resolveProductionTarget({ store: "PMS", sku: "PEARL_BASE", sheetName: "7 - 2026" });
    const update = await repository.acceptUpdate({ botId: "bot", updateId: 9001, chatId: "chat", userId: "user", receivedAt: new Date("2026-09-08T00:00:00Z") }, [{
      blockIndex: 0, store: "PMS", domain: "PRODUCTION", now: new Date("2026-09-08T00:00:00Z"),
      decision: { status: "READY", plan: { store: "PMS", domain: "PRODUCTION", date: "2026-09-08", executable: true, noOps: [], corrections: [], effects: [{ store: "PMS", domain: "PRODUCTION", date: "2026-09-08", canonicalSkuId: "PEARL_BASE", target, expectedOldValue: null, desiredValue: 5, operation: "SET", provenance: "USER_EXPLICIT" }] } }
    }]);
    let writes = 0;
    const reader = { readEffectCurrent: async () => null } as unknown as SheetsReader;
    const writer = { writeEffects: async () => { writes++; } } as unknown as SheetsWriter;
    const worker = new WorkerService(repository, reader, writer, createLogger("error", () => undefined), undefined, () => new Date("2026-09-08T00:00:00Z"), 1000, undefined, telemetry);

    await worker.drain(10);

    expect((await repository.getRun(update.blockRunIds[0]))?.status).toBe("COMPLETED");
    expect(writes).toBe(1);
  });
});
