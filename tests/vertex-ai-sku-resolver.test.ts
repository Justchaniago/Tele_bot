import { describe, expect, it } from "vitest";
import { VertexAiSkuResolver } from "../src/parsing/vertex-ai-sku-resolver.js";
import { parseCommandBlock } from "../src/parsing/parser.js";
import type { GenerateContentResponse } from "@google/genai";

function fakeVertex(response: unknown, calls: { count: number; request?: unknown } = { count: 0 }) {
  return {
    calls,
    client: { models: { generateContent: async (request: unknown) => { calls.count++; calls.request = request; return response as GenerateContentResponse; } } }
  } as { calls: { count: number; request?: unknown }; client: ConstructorParameters<typeof VertexAiSkuResolver>[1] };
}

const baseConfig = { projectId: "tele-auto-v2-prod", location: "global", model: "gemini-3.1-flash-lite", timeoutMs: 100 };

describe("VertexAiSkuResolver", () => {
  it("accepts only an allowed candidate from structured JSON", async () => {
    const fake = fakeVertex({ text: '{"status":"RESOLVED","candidateSkuId":"PEARL_BASE"}' });
    const result = await new VertexAiSkuResolver(baseConfig, fake.client).resolve({ domain: "PRODUCTION", normalizedTerm: "pearlish", candidates: ["PEARL_BASE"] });
    expect(result).toEqual({ status: "RESOLVED", candidateSkuId: "PEARL_BASE" });
    expect((fake.calls.request as { config: { responseMimeType: string; responseJsonSchema: unknown; temperature: number } }).config).toMatchObject({ responseMimeType: "application/json", temperature: 0 });
  });

  it("rejects invented and malformed provider output", async () => {
    const invented = fakeVertex({ text: '{"status":"RESOLVED","candidateSkuId":"NOT_REGISTERED"}' });
    const malformed = fakeVertex({ text: "not json" });
    const input = { domain: "PRODUCTION" as const, normalizedTerm: "unknownish", candidates: ["PEARL_BASE"] as const };
    expect(await new VertexAiSkuResolver(baseConfig, invented.client).resolve(input)).toEqual({ status: "UNKNOWN" });
    expect(await new VertexAiSkuResolver(baseConfig, malformed.client).resolve(input)).toEqual({ status: "UNKNOWN" });
  });

  it("preserves ambiguous and provider failure as safe unresolved results", async () => {
    const ambiguous = fakeVertex({ text: '{"status":"AMBIGUOUS"}' });
    const failing = { client: { models: { generateContent: async () => { throw new Error("temporary Vertex failure"); } } } } as unknown as ConstructorParameters<typeof VertexAiSkuResolver>[1];
    const input = { domain: "PRODUCTION" as const, normalizedTerm: "unclear", candidates: ["PEARL_BASE", "PUDDING_BASE"] as const };
    expect(await new VertexAiSkuResolver(baseConfig, ambiguous.client).resolve(input)).toEqual({ status: "AMBIGUOUS" });
    expect(await new VertexAiSkuResolver(baseConfig, failing).resolve(input)).toEqual({ status: "UNKNOWN" });
  });

  it("aborts provider request at configured timeout", async () => {
    const client = { models: { generateContent: ({ config }: { config: { abortSignal: AbortSignal } }) => new Promise<GenerateContentResponse>((_, reject) => config.abortSignal.addEventListener("abort", () => reject(new Error("aborted")))) } } as unknown as ConstructorParameters<typeof VertexAiSkuResolver>[1];
    const result = await new VertexAiSkuResolver({ ...baseConfig, timeoutMs: 5 }, client).resolve({ domain: "PRODUCTION", normalizedTerm: "unclear", candidates: ["PEARL_BASE"] });
    expect(result).toEqual({ status: "UNKNOWN" });
  });

  it("does not invoke Vertex for deterministic exact resolution or deterministic ambiguity", async () => {
    const fake = fakeVertex({ text: '{"status":"RESOLVED","candidateSkuId":"PEARL_BASE"}' });
    const exact = await parseCommandBlock({ domain: "PRODUCTION", body: "07-09-2026\npearl 4" }, { now: new Date("2026-09-07T00:00:00Z"), aiResolver: new VertexAiSkuResolver(baseConfig, fake.client) });
    const ambiguous = await parseCommandBlock({ domain: "DAILY_SO", body: "07-09-2026\nmedium 4" }, { now: new Date("2026-09-07T00:00:00Z"), aiResolver: new VertexAiSkuResolver(baseConfig, fake.client) });
    expect(exact.items[0].resolver).toBe("EXACT_ALIAS");
    expect(ambiguous.items[0].status).toBe("AMBIGUOUS");
    expect(fake.calls.count).toBe(0);
  });
});
