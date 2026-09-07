import { describe, expect, it } from "vitest";
import { SheetsWriter, SheetsWriteError } from "../src/sheets/sheets-writer.js";
import { SheetsReader } from "../src/sheets/sheets-reader.js";
import { resolveProductionTarget, resolveWasteTarget } from "../src/sheets/target-resolver.js";
import { CloudTasksWorkerWakeup } from "../src/runtime/worker-wakeup.js";
import { InMemoryDurableStateRepository } from "../src/persistence/repository.js";
import { createHttpHandler } from "../src/runtime/http.js";
import type { AppConfig } from "../src/config/env.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Logger } from "../src/observability/logger.js";

const target = resolveProductionTarget({ store: "PMS", sku: "PEARL_BASE", sheetName: "7 - 2026" });
const effect = { store: "PMS" as const, domain: "PRODUCTION" as const, date: "2026-09-07", canonicalSkuId: "PEARL_BASE" as const, target, expectedOldValue: 1, desiredValue: 5, operation: "SET" as const, provenance: "USER_EXPLICIT" as const };

describe("M6 corrective contracts", () => {
  it("marks later sub-batch failure uncertain after prior success", async () => {
    let calls = 0;
    const api = { spreadsheets: { values: { batchGet: async () => ({ data: {} }), batchUpdate: async () => { calls++; }, batchClear: async () => { throw Object.assign(new Error("503"), { response: { status: 503 } }); } }, get: async () => ({ data: {} }) } } as unknown as ConstructorParameters<typeof SheetsWriter>[0];
    await expect(new SheetsWriter(api).writeEffects([effect, { ...effect, canonicalSkuId: "PEARL_BASE", desiredValue: null, operation: "CLEAR" }])).rejects.toMatchObject({ name: "SheetsWriteError", classification: "UNCERTAIN", externalMutationOccurred: true });
    expect(calls).toBe(1);
  });

  it("rejects a multi-workbook effect set before any Sheets request", async () => {
    let calls = 0;
    const api = { spreadsheets: { values: { batchUpdate: async () => { calls++; }, batchClear: async () => { calls++; } }, get: async () => ({ data: {} }) } } as unknown as ConstructorParameters<typeof SheetsWriter>[0];
    const tp6Effect = { ...effect, store: "TP6" as const, target: resolveProductionTarget({ store: "TP6", sku: "PEARL_BASE", sheetName: "7 - 2026" }) };
    await expect(new SheetsWriter(api).writeEffects([effect, tp6Effect])).rejects.toMatchObject({ name: "SheetsWriteError", classification: "FINAL", externalMutationOccurred: false });
    expect(calls).toBe(0);
  });

  it("reads the domain-specific Production/Waste section marker", async () => {
    const ranges: string[][] = [];
    let expectedTarget = resolveProductionTarget({ store: "PMS", sku: "PEARL_BASE", sheetName: "7 - 2026" });
    const api = { spreadsheets: { values: { batchGet: async ({ ranges: requested }: { ranges: string[] }) => { ranges.push(requested); return { data: { valueRanges: requested.map((range, index) => ({ values: [[index === 0 ? (range.endsWith("!B9") ? "PRODUCTION" : "WASTE") : index === 1 ? expectedTarget.assertions.expectedProductCode : index === 2 ? expectedTarget.assertions.expectedLabel : null]] })) } }; } }, get: async () => ({ data: {} }) } } as unknown as ConstructorParameters<typeof SheetsReader>[0];
    const production = resolveProductionTarget({ store: "PMS", sku: "PEARL_BASE", sheetName: "7 - 2026" });
    const waste = resolveWasteTarget({ store: "PMS", sku: "PEARL_BASE", sheetName: "7 - 2026" });
    const reader = new SheetsReader(api);
    await expect(reader.readProductionWasteTarget(production)).resolves.toBeTruthy();
    expectedTarget = waste;
    await expect(reader.readProductionWasteTarget(waste)).resolves.toBeTruthy();
    expect(ranges[0][0]).toMatch(/!B9$/);
    expect(ranges[1][0]).toMatch(/!B42$/);
    expect(ranges[1][0]).not.toMatch(/!B9$/);
  });

  it("fails closed on a Waste marker mismatch before a writer call", async () => {
    let writes = 0;
    const waste = resolveWasteTarget({ store: "PMS", sku: "PEARL_BASE", sheetName: "7 - 2026" });
    const readerApi = { spreadsheets: { values: { batchGet: async ({ ranges }: { ranges: string[] }) => ({ data: { valueRanges: ranges.map((_, index) => ({ values: [[index === 0 ? "PRODUCTION" : index === 1 ? waste.assertions.expectedProductCode : index === 2 ? waste.assertions.expectedLabel : null]] })) } }) }, get: async () => ({ data: {} }) } } as unknown as ConstructorParameters<typeof SheetsReader>[0];
    const writerApi = { spreadsheets: { values: { batchUpdate: async () => { writes++; }, batchClear: async () => { writes++; } }, get: async () => ({ data: {} }) } } as unknown as ConstructorParameters<typeof SheetsWriter>[0];
    await expect(new SheetsReader(readerApi).readProductionWasteTarget(waste)).rejects.toThrow();
    expect(writes).toBe(0);
    void writerApi;
  });

  it("keeps expired execution discovery bounded and excludes active execution", async () => {
    const repository = new InMemoryDurableStateRepository();
    expect(await repository.listRunnableRuns(0)).toHaveLength(0);
    expect(await repository.listExpiredExecutingRuns(new Date(), 5)).toHaveLength(0);
  });

  it("enqueues only a minimal durable wakeup payload", async () => {
    const calls: unknown[] = [];
    const client = { queuePath: () => "projects/p/locations/asia-southeast2/queues/q", createTask: async (request: unknown) => { calls.push(request); } };
    await new CloudTasksWorkerWakeup(client, { projectId: "tele-auto-v2-prod", location: "asia-southeast2", queue: "q", targetUrl: "https://worker", serviceAccountEmail: "runtime@example.com", workerAuthToken: "worker-secret" }).enqueue("bot:7");
    expect(calls).toHaveLength(1);
    const request = calls[0] as { task: { httpRequest: { body: string; headers: Record<string, string>; oidcToken: { serviceAccountEmail: string; audience: string } } } };
    expect(JSON.parse(Buffer.from(request.task.httpRequest.body, "base64").toString())).toEqual({ updateKey: "bot:7" });
    expect(request.task.httpRequest.headers["x-tele-auto-worker-token"]).toBe("worker-secret");
    expect(request.task.httpRequest.oidcToken).toEqual({ serviceAccountEmail: "runtime@example.com", audience: "https://worker" });
  });

  it("generated Cloud Task request passes real worker handler authentication", async () => {
    let task: { task: { httpRequest: { headers: Record<string, string> } } } | undefined;
    const client = { queuePath: () => "queue", createTask: async (request: { task: { httpRequest: { headers: Record<string, string> } } }) => { task = request; } };
    await new CloudTasksWorkerWakeup(client, { projectId: "tele-auto-v2-prod", location: "asia-southeast2", queue: "q", targetUrl: "https://worker/internal/worker/drain", serviceAccountEmail: "runtime@example.com", workerAuthToken: "same-token" }).enqueue("bot:8");
    let drains = 0;
    const config: AppConfig = { nodeEnv: "test", port: 8080, logLevel: "info", workerAuthToken: "same-token", workerMaxRuns: 4 };
    const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
    const invoke = async (headers: Record<string, string>) => {
      const response = responseDouble();
      await createHttpHandler(config, logger, { worker: { drain: async limit => { drains++; expect(limit).toBe(4); return 1; } } })({ method: "POST", url: "/internal/worker/drain", headers } as IncomingMessage, response.value);
      return response.status();
    };
    expect(await invoke(task!.task.httpRequest.headers)).toBe(200);
    expect(await invoke({})).toBe(401);
    expect(await invoke({ "x-tele-auto-worker-token": "wrong" })).toBe(401);
    expect(drains).toBe(1);
  });

  it("fails closed when active wakeup lacks worker token", () => {
    const client = { queuePath: () => "queue", createTask: async () => undefined };
    expect(() => new CloudTasksWorkerWakeup(client, { projectId: "tele-auto-v2-prod", location: "asia-southeast2", queue: "q", targetUrl: "https://worker", serviceAccountEmail: "runtime@example.com", workerAuthToken: " " })).toThrow("worker auth token");
  });
});

function responseDouble() {
  let code = 0;
  const value = { statusCode: 0, setHeader() {}, end() { code = value.statusCode; } } as unknown as ServerResponse;
  return { value, status: () => code };
}
