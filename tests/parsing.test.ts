import { describe, expect, it, vi } from "vitest";
import { validateAiSkuResponse } from "../src/parsing/ai-fallback.js";
import { classifyTemporalDate, parseBusinessDate } from "../src/parsing/date-safety.js";
import { parseCommandBlock, parseCommandMessage, segmentCommandBlocks } from "../src/parsing/parser.js";
import { resolveSku } from "../src/parsing/sku-resolver.js";
import { resolveDateTab } from "../src/parsing/tab-resolver.js";
import { normalizeText } from "../src/parsing/vocabulary.js";

const now = new Date("2026-09-07T05:00:00.000Z");

function validDate(raw: string) {
  const result = parseBusinessDate(raw);
  if (result.status !== "VALID") throw new Error("test date must be valid");
  return result.date;
}

describe("commands and normalization", () => {
  it("accepts only the three exact domain commands", () => {
    expect(segmentCommandBlocks("/produksi\n07-09-2026\npearl 4")).toHaveLength(1);
    expect(segmentCommandBlocks("/produksi\n07-09-2026\npearl 4")[0].domain).toBe("PRODUCTION");
    expect(segmentCommandBlocks("/waste\n07-09-2026\npearl 1")).toHaveLength(1);
    expect(segmentCommandBlocks("/waste\n07-09-2026\npearl 1")[0].domain).toBe("WASTE");
    expect(segmentCommandBlocks("/dailyso\n07-09-2026\nlarge 20")).toHaveLength(1);
    expect(segmentCommandBlocks("/dailyso\n07-09-2026\nlarge 20")[0].domain).toBe("DAILY_SO");
    expect(segmentCommandBlocks("/prod\n07-09-2026\npearl 4")).toHaveLength(0);
    expect(segmentCommandBlocks("/production\n07-09-2026\npearl 4")).toHaveLength(0);
    expect(segmentCommandBlocks("/wast\n07-09-2026\npearl 4")).toHaveLength(0);
    expect(segmentCommandBlocks("/so\n07-09-2026\npearl 4")).toHaveLength(0);
    expect(segmentCommandBlocks("/daily-so\n07-09-2026\npearl 4")).toHaveLength(0);
    expect(segmentCommandBlocks("pearl 4")).toHaveLength(0);
  });

  it("preserves qualifiers while normalizing harmless formatting", () => {
    expect(normalizeText("  GONG CHA Y16 CUPS-G1 (MEDIUM)  ")).toBe("gong cha y16 cups g1 medium");
    expect(normalizeText("medium lokal")).toBe("medium lokal");
    expect(normalizeText("Pearl:")).toBe("pearl");
  });

  it("accepts a colon between an SKU and its quantity", async () => {
    const result = await parseCommandBlock({
      domain: "PRODUCTION",
      body: "07-09-2026\nPearl: 0.3"
    }, { now });

    expect(result.status).toBe("PARSE_READY");
    expect(result.items[0]).toMatchObject({
      canonicalSkuId: "PEARL_BASE",
      quantityValue: 0.3,
      status: "RESOLVED"
    });
  });

  it("resolves the controlled Production smoke vocabulary with colon separators", async () => {
    const result = await parseCommandBlock({
      domain: "PRODUCTION",
      body: "07.09.2026\nPearl: 0.3\nEgt: 25\nGt lokal: 25\nOt: 25\nMilk coffee: 120\nPistachio foam: 20"
    }, { now });

    expect(result.status).toBe("PARSE_READY");
    expect(result.items.every(item => item.status === "RESOLVED")).toBe(true);
    expect(result.items.map(item => item.canonicalSkuId)).toEqual([
      "PEARL_BASE",
      "EARL_GREY_TEA_BASE",
      "GREEN_TEA_LOCAL_BASE",
      "OOLONG_TEA_BASE",
      "MILK_COFFEE_BASE",
      "PISTACHIO_MILK_FOAM_BASE"
    ]);
  });

  it("segments independent command blocks and retains empty context", async () => {
    const result = await parseCommandMessage(
      "/produksi\n07-09-2026\npearl 4\n\n/waste\n07-09-2026\nunknown 1\n\n/dailyso\n",
      { now }
    );
    expect(result.blocks).toHaveLength(3);
    expect(result.blocks[0].status).toBe("PARSE_READY");
    expect(result.blocks[1].status).toBe("NEEDS_CLARIFICATION");
    expect(result.blocks[1].domain).toBe("WASTE");
    expect(result.blocks[2]).toMatchObject({
      domain: "DAILY_SO",
      status: "NEEDS_INPUT",
      clarificationReasons: ["MISSING_INPUT"]
    });
    expect(result.blocks[2].domain).not.toBeUndefined();
    await expect(parseCommandMessage("plain text", { now })).resolves.toMatchObject({
      status: "NEEDS_CLARIFICATION",
      clarificationReasons: ["MISSING_DOMAIN"]
    });
  });
});

describe("domain vocabulary resolution", () => {
  it("resolves canonical terms and aliases only inside selected domain", () => {
    expect(resolveSku("PEARL_BASE", "PRODUCTION")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "PEARL_BASE",
      resolver: "EXACT_CANONICAL"
    });
    expect(resolveSku("freshmilk", "DAILY_SO")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "FRESH_MILK_DIAMOND_946ML",
      resolver: "EXACT_ALIAS"
    });
    expect(resolveSku("freshmilk", "PRODUCTION").status).toBe("UNKNOWN");
    expect(resolveSku("medium", "DAILY_SO")).toMatchObject({
      status: "AMBIGUOUS",
      candidates: ["Y16_G1_MEDIUM_CUP", "Y16_LOCAL_MEDIUM_CUP"]
    });
    expect(resolveSku("medium g1", "DAILY_SO")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "Y16_G1_MEDIUM_CUP"
    });
    expect(resolveSku("medium lokal", "DAILY_SO")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "Y16_LOCAL_MEDIUM_CUP"
    });
    expect(resolveSku("black tea", "PRODUCTION").status).toBe("AMBIGUOUS");
    expect(resolveSku("pudding", "PRODUCTION").status).toBe("AMBIGUOUS");
  });

  it("handles conservative fuzzy outcomes", () => {
    expect(resolveSku("hary potter cup", "DAILY_SO")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "HARRY_POTTER_CUP",
      resolver: "FUZZY"
    });
    expect(resolveSku("raisd cover", "DAILY_SO")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "RAISED_COVER",
      resolver: "FUZZY"
    });
    expect(resolveSku("xyzzy", "DAILY_SO").status).toBe("UNKNOWN");
    expect(resolveSku("black tea base l", "PRODUCTION").status).toBe("AMBIGUOUS");
  });

  it("never invents partial local or G1 qualifiers", () => {
    const ambiguous = [
      ["green tea l", "GREEN_TEA_BASE", "GREEN_TEA_LOCAL_BASE"],
      ["black tea l", "BLACK_TEA_BASE", "BLACK_TEA_LOCAL_BASE"],
      ["milk tea l", "MILK_TEA_BASE", "MILK_TEA_LOCAL_BASE"],
      ["earl grey l", "EARL_GREY_TEA_BASE", "EARL_GREY_TEA_LOCAL_BASE"]
    ] as const;
    for (const [query] of ambiguous) {
      expect(resolveSku(query, "PRODUCTION").status, query).toBe("AMBIGUOUS");
    }
    expect(resolveSku("green tea local", "PRODUCTION")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "GREEN_TEA_LOCAL_BASE"
    });
    expect(resolveSku("green tea lokal", "PRODUCTION")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "GREEN_TEA_LOCAL_BASE"
    });
    expect(resolveSku("black tea local", "PRODUCTION")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "BLACK_TEA_LOCAL_BASE"
    });
    expect(resolveSku("milk tea local", "PRODUCTION")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "MILK_TEA_LOCAL_BASE"
    });
    expect(resolveSku("earl grey local", "PRODUCTION").status).toBe("AMBIGUOUS");
    expect(resolveSku("green tea locl", "PRODUCTION")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "GREEN_TEA_LOCAL_BASE"
    });
    expect(resolveSku("medium", "DAILY_SO").status).toBe("AMBIGUOUS");
    expect(resolveSku("medium g1", "DAILY_SO")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "Y16_G1_MEDIUM_CUP"
    });
    expect(resolveSku("medium g", "DAILY_SO").status).toBe("AMBIGUOUS");
    expect(resolveSku("medium l", "DAILY_SO").status).not.toBe("RESOLVED");
    expect(resolveSku("medium local", "DAILY_SO")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "Y16_LOCAL_MEDIUM_CUP"
    });
    expect(resolveSku("medium lokal", "DAILY_SO")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "Y16_LOCAL_MEDIUM_CUP"
    });
    expect(resolveSku("medium locl", "DAILY_SO")).toMatchObject({
      status: "RESOLVED",
      canonicalSkuId: "Y16_LOCAL_MEDIUM_CUP"
    });
  });
});

describe("AI fallback contract", () => {
  it("enforces candidate allowlist and malformed/provider-safe outcomes", () => {
    const candidates = ["PEARL_BASE", "PUDDING_BASE"] as const;
    expect(validateAiSkuResponse({ status: "RESOLVED", candidateSkuId: "PEARL_BASE" }, candidates)).toEqual({
      status: "RESOLVED",
      canonicalSkuId: "PEARL_BASE"
    });
    expect(validateAiSkuResponse({ status: "RESOLVED", candidateSkuId: "HARRY_POTTER_CUP" }, candidates)).toMatchObject({
      status: "UNKNOWN",
      reason: "AI_CANDIDATE_OUTSIDE_ALLOWLIST"
    });
    expect(validateAiSkuResponse({ nonsense: true }, candidates)).toMatchObject({
      status: "UNKNOWN",
      reason: "MALFORMED_AI_RESPONSE"
    });
    expect(validateAiSkuResponse({ status: "AMBIGUOUS" }, candidates)).toMatchObject({
      status: "AMBIGUOUS",
      candidates
    });
  });

  it("does not invoke AI for deterministic exact input and fails safe when unavailable", async () => {
    const resolve = vi.fn().mockRejectedValue(new Error("offline"));
    const exact = await parseCommandBlock({ domain: "PRODUCTION", body: "07-09-2026\npearl 4" }, { now, aiResolver: { resolve } });
    expect(exact.status).toBe("PARSE_READY");
    expect(resolve).not.toHaveBeenCalled();
    const unknown = await parseCommandBlock({ domain: "DAILY_SO", body: "07-09-2026\nunknown 4" }, { now, aiResolver: { resolve } });
    expect(unknown.items[0].status).toBe("UNKNOWN");
    const ambiguous = await parseCommandBlock({ domain: "DAILY_SO", body: "07-09-2026\nmedium 4" }, { now, aiResolver: { resolve } });
    expect(ambiguous.items[0].status).toBe("AMBIGUOUS");
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});

describe("quantity and duplicate outcomes", () => {
  it("keeps zero, missing, malformed, and duplicate conflicts distinct", async () => {
    const result = await parseCommandBlock({
      domain: "PRODUCTION",
      body: "07-09-2026\npearl 0\npearl 0\npearl 1\nblack tea 10abc"
    }, { now });
    expect(result.items[0]).toMatchObject({ quantityToken: "0", quantityValue: 0, status: "RESOLVED" });
    expect(result.items[1].status).toBe("RESOLVED");
    expect(result.items[2].status).toBe("RESOLVED");
    expect(result.items[3].status).toBe("MALFORMED_QUANTITY");
    expect(result.duplicates).toContainEqual({
      canonicalSkuId: "PEARL_BASE",
      status: "CONFLICT",
      itemIndexes: [0, 1, 2]
    });
    expect(result.clarificationReasons).toContain("MALFORMED_QUANTITY");
    expect(result.clarificationReasons).toContain("CONFLICTING_DUPLICATE");
    const same = await parseCommandBlock({ domain: "PRODUCTION", body: "07-09-2026\npearl 0\npearl 0" }, { now });
    expect(same.duplicates).toContainEqual({
      canonicalSkuId: "PEARL_BASE",
      status: "DEDUPLICABLE",
      itemIndexes: [0, 1]
    });
  });

  it("requires quantity after canonical SKU resolution", async () => {
    const result = await parseCommandBlock({ domain: "PRODUCTION", body: "07-09-2026\npearl" }, { now });
    expect(result.items[0]).toMatchObject({ canonicalSkuId: "PEARL_BASE", status: "NEEDS_CLARIFICATION" });
    expect(result.clarificationReasons).toContain("MISSING_QUANTITY");
  });

  it("reports missing date without inventing one", async () => {
    const result = await parseCommandBlock({ domain: "DAILY_SO", body: "pearl 4" }, { now });
    expect(result).toMatchObject({ status: "NEEDS_CLARIFICATION", clarificationReasons: ["MISSING_DATE"] });
    expect(result.normalizedDate).toBeUndefined();
  });

  it("does not turn Daily SO day arithmetic into month authority", async () => {
    const result = await parseCommandBlock({ domain: "DAILY_SO", body: "07-10-2026\nlarge 20" }, { now });
    expect(result.normalizedDate?.iso).toBe("2026-10-07");
    expect(result.tabName).toBeUndefined();
    expect(result.items[0].canonicalSkuId).toBe("Y22_G1_LARGE_CUP");
  });
});

describe("date safety", () => {
  it("parses day-first dates and validates calendar days", () => {
    expect(parseBusinessDate("07-09-2026")).toMatchObject({ status: "VALID", date: { iso: "2026-09-07" } });
    expect(parseBusinessDate("07.09.26")).toMatchObject({ status: "VALID", date: { year: 2026 } });
    expect(parseBusinessDate("29/02/2024").status).toBe("VALID");
    expect(parseBusinessDate("31-02-2026").status).toBe("INVALID");
    expect(validDate("09-07-2026").iso).toBe("2026-07-09");
  });

  it("classifies WIB today, historical, future, and exact late-closing boundary", () => {
    const previous = validDate("06-09-2026");
    const today = validDate("07-09-2026");
    const future = validDate("08-09-2026");
    expect(classifyTemporalDate(today, now)).toBe("TODAY");
    expect(classifyTemporalDate(future, now)).toBe("FUTURE");
    expect(classifyTemporalDate(previous, new Date("2026-09-06T19:59:59Z"))).toBe("NORMAL_LATE_CLOSING");
    expect(classifyTemporalDate(previous, new Date("2026-09-06T20:00:00Z"))).toBe("NORMAL_LATE_CLOSING");
    expect(classifyTemporalDate(previous, new Date("2026-09-06T20:00:01Z"))).toBe("HISTORICAL");
    expect(classifyTemporalDate(previous, new Date("2026-09-07T05:00:00Z"))).toBe("HISTORICAL");
  });

  it("classifies against WIB, independent of host timezone", () => {
    const target = validDate("07-09-2026");
    expect(classifyTemporalDate(target, new Date("2026-09-06T17:00:00Z"))).toBe("TODAY");
  });
});

describe("Production/Waste date tabs", () => {
  it("accepts verified spacing variants and ignores summary tabs", () => {
    expect(resolveDateTab({ day: 1, year: 2026, availableSheetNames: ["SUMMARY W1", "1 - 2026"] })).toEqual({
      status: "RESOLVED",
      sheetName: "1 - 2026"
    });
    expect(resolveDateTab({ day: 11, year: 2026, availableSheetNames: ["11 -2026"] })).toMatchObject({
      status: "RESOLVED",
      sheetName: "11 -2026"
    });
    expect(resolveDateTab({ day: 26, year: 2026, availableSheetNames: ["26 -2026"] }).status).toBe("RESOLVED");
  });

  it("fails closed on zero or multiple structural matches", () => {
    expect(resolveDateTab({ day: 7, year: 2026, availableSheetNames: ["SUMMARY W1"] })).toMatchObject({ status: "UNKNOWN" });
    expect(resolveDateTab({ day: 7, year: 2026, availableSheetNames: ["7 - 2026", "7-2026"] })).toMatchObject({
      status: "AMBIGUOUS",
      candidates: ["7 - 2026", "7-2026"]
    });
  });
});
