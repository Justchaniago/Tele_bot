import { describe, expect, it } from "vitest";
import { parseCommandBlock } from "../src/parsing/parser.js";
import { resolveDailySoTarget, resolveProductionTarget, resolveWasteTarget } from "../src/sheets/target-resolver.js";
import { DAILY_SO_SCHEMAS } from "../src/domains/daily-so/sheet-schema.js";
import { planProduction } from "../src/domains/production/business.js";
import { planWaste } from "../src/domains/waste/business.js";
import { planDailySo } from "../src/domains/daily-so/business.js";
import { validateBusinessQuantity } from "../src/domains/quantity-policy.js";
import type { BusinessObservation, BusinessPlanningInput, QuantityAssessment } from "../src/domains/business-types.js";

const now = new Date("2026-09-07T05:00:00.000Z");
const date = "07-09-2026";

async function block(domain: "PRODUCTION" | "WASTE" | "DAILY_SO", body: string) {
  return parseCommandBlock({ domain, body }, { now, availableSheetNames: ["1 - 2026", "7 - 2026"] });
}

function assessments(parsed: Awaited<ReturnType<typeof block>>): Record<number, QuantityAssessment> {
  return Object.fromEntries(parsed.items.map((item, index) => [index, {
    status: "APPROVED", token: item.quantityToken!, value: item.quantityValue!
  }])) as Record<number, QuantityAssessment>;
}

function pwTarget(domain: "PRODUCTION" | "WASTE", sku: "PEARL_BASE" | "HONEY_BASE", rowSheet = "7 - 2026") {
  return domain === "PRODUCTION"
    ? resolveProductionTarget({ store: "PMS", sku, sheetName: rowSheet })
    : resolveWasteTarget({ store: "PMS", sku, sheetName: rowSheet });
}

function pwInput(parsed: Awaited<ReturnType<typeof block>>, domain: "PRODUCTION" | "WASTE", values: Record<string, unknown>, targetSkus = ["PEARL_BASE"]): BusinessPlanningInput {
  const targets = Object.fromEntries(targetSkus.map(sku => [sku, pwTarget(domain, sku as "PEARL_BASE" | "HONEY_BASE")])) as BusinessPlanningInput["targets"];
  const observed: BusinessObservation = { store: "PMS", domain, values };
  return { store: "PMS", block: parsed, targets, observed, quantityAssessments: assessments(parsed) };
}

describe("Production and Waste business semantics", () => {
  it.each([["PRODUCTION", planProduction], ["WASTE", planWaste]] as const)("%s uses SET/CLEAR, correction, no accumulation", async (domain, planner) => {
    const fresh = await block(domain, `${date}\npearl 3`);
    const ready = planner(pwInput(fresh, domain, { PEARL_BASE: null }));
    expect(ready.status).toBe("READY");
    if (ready.status === "READY") expect(ready.plan.effects[0]).toMatchObject({ desiredValue: 3, operation: "SET" });

    const same = planner(pwInput(fresh, domain, { PEARL_BASE: 3 }));
    expect(same.status).toBe("NO_OP");
    const correction = planner(pwInput(await block(domain, `${date}\npearl 3`), domain, { PEARL_BASE: 5 }));
    expect(correction.status).toBe("REQUIRES_CONFIRMATION");
    if (correction.status === "REQUIRES_CONFIRMATION") expect(correction.plan.effects[0]).toMatchObject({ desiredValue: 3, operation: "SET" });
    if (correction.status === "REQUIRES_CONFIRMATION") expect(correction.plan.executable).toBe(false);

    const clear = planner(pwInput(await block(domain, `${date}\npearl 0`), domain, { PEARL_BASE: 5 }));
    expect(clear.status).toBe("REQUIRES_CONFIRMATION");
    if (clear.status === "REQUIRES_CONFIRMATION") expect(clear.plan.effects[0]).toMatchObject({ desiredValue: null, operation: "CLEAR" });
    const blankZero = planner(pwInput(await block(domain, `${date}\npearl 0`), domain, { PEARL_BASE: null }));
    expect(blankZero.status).toBe("NO_OP");
    const numericZero = planner(pwInput(await block(domain, `${date}\npearl 0`), domain, { PEARL_BASE: 0 }));
    expect(numericZero.status).toBe("REQUIRES_CONFIRMATION");
    if (numericZero.status === "REQUIRES_CONFIRMATION") expect(numericZero.plan.effects[0]).toMatchObject({ desiredValue: null, operation: "CLEAR" });
    const zeroToValue = planner(pwInput(await block(domain, `${date}\npearl 3`), domain, { PEARL_BASE: 0 }));
    expect(zeroToValue.status).toBe("REQUIRES_CONFIRMATION");
  });

  it("omits P/W SKUs and never accumulates", async () => {
    const parsed = await block("PRODUCTION", `${date}\npearl 3`);
    const result = planProduction(pwInput(parsed, "PRODUCTION", { PEARL_BASE: null }));
    expect(result.status).toBe("READY");
    if (result.status === "READY") expect(result.plan.effects).toHaveLength(1);
    const correction = planProduction(pwInput(await block("PRODUCTION", `${date}\npearl 3`), "PRODUCTION", { PEARL_BASE: 5 }));
    if (correction.status === "REQUIRES_CONFIRMATION") expect(correction.plan.effects[0].desiredValue).toBe(3);
  });

  it("requires confirmation for Production Pearl above 3 kg, including a blank target", async () => {
    const parsed = await block("PRODUCTION", `${date}\npearl 3.01`);
    const result = planProduction(pwInput(parsed, "PRODUCTION", { PEARL_BASE: null }));

    expect(result.status).toBe("REQUIRES_CONFIRMATION");
    if (result.status === "REQUIRES_CONFIRMATION") {
      expect(result.plan.effects[0]).toMatchObject({ desiredValue: 3.01, operation: "SET", expectedOldValue: null });
      expect(result.plan.corrections[0]).toMatchObject({ oldValue: null, proposedValue: 3.01 });
      expect(result.plan.executable).toBe(false);
    }
  });

  it("does not apply the Pearl guard to Waste or values at 3 kg", async () => {
    const productionAtThreshold = await block("PRODUCTION", `${date}\npearl 3`);
    expect(planProduction(pwInput(productionAtThreshold, "PRODUCTION", { PEARL_BASE: null })).status).toBe("READY");

    const wasteAboveThreshold = await block("WASTE", `${date}\npearl 3.01`);
    expect(planWaste(pwInput(wasteAboveThreshold, "WASTE", { PEARL_BASE: null })).status).toBe("READY");
  });

  it("skips unresolved SKU lines while retaining valid Production effects", async () => {
    const parsed = await block("PRODUCTION", `${date}\npearl 2\nnot a real sku 7`);
    const result = planProduction(pwInput(parsed, "PRODUCTION", { PEARL_BASE: null }));

    expect(result.status).toBe("READY");
    if (result.status === "READY") {
      expect(result.plan.effects).toHaveLength(1);
      expect(result.plan.effects[0].canonicalSkuId).toBe("PEARL_BASE");
      expect(result.plan.skippedItems).toEqual([{ rawTerm: "not a real sku", reason: "UNKNOWN_SKU" }]);
    }
  });

  it("holds whole mixed block when one line needs correction", async () => {
    const parsed = await block("PRODUCTION", `${date}\npearl 3\nhoney base 3`);
    const result = planProduction(pwInput(parsed, "PRODUCTION", { PEARL_BASE: null, HONEY_BASE: 2 }, ["PEARL_BASE", "HONEY_BASE"]));
    expect(result.status).toBe("REQUIRES_CONFIRMATION");
    if (result.status === "REQUIRES_CONFIRMATION") {
      expect(result.plan.effects).toHaveLength(2);
      expect(result.plan.executable).toBe(false);
    }
  });

  it("rejects cross-domain target substitution and malformed observed values", async () => {
    const parsed = await block("PRODUCTION", `${date}\npearl 4`);
    const crossTarget = pwTarget("WASTE", "PEARL_BASE");
    const cross = planProduction({ ...pwInput(parsed, "PRODUCTION", { PEARL_BASE: null }), targets: { PEARL_BASE: crossTarget } });
    expect(cross.status).toBe("REQUIRES_CLARIFICATION");
    const malformed = planProduction(pwInput(parsed, "PRODUCTION", { PEARL_BASE: "5abc" }));
    expect(malformed.status).toBe("INCONSISTENT_STATE");
  });
});

function dailyTargets() {
  return Object.fromEntries(Object.keys(DAILY_SO_SCHEMAS.PMS).map(sku => [sku, resolveDailySoTarget({ store: "PMS", sku: sku as keyof typeof DAILY_SO_SCHEMAS.PMS, day: 1 })]));
}

function dailyInput(parsed: Awaited<ReturnType<typeof block>>, values: Record<string, unknown>, snapshotState: "NOT_ESTABLISHED" | "ESTABLISHED"): BusinessPlanningInput {
  return { store: "PMS", block: parsed, targets: dailyTargets(), observed: { store: "PMS", domain: "DAILY_SO", values, snapshotState }, quantityAssessments: assessments(parsed) };
}

describe("Daily SO business semantics", () => {
  it("first snapshot plans exactly ten values, including auto-zero provenance", async () => {
    const parsed = await block("DAILY_SO", `${date}\nfreshmilk 5\nlarge 20`);
    const values = Object.fromEntries(Object.keys(DAILY_SO_SCHEMAS.PMS).map(sku => [sku, null]));
    const result = planDailySo(dailyInput(parsed, values, "NOT_ESTABLISHED"));
    expect(result.status).toBe("READY");
    if (result.status === "READY") {
      expect(result.plan.effects).toHaveLength(10);
      expect(result.plan.effects.find(e => e.canonicalSkuId === "FRESH_MILK_DIAMOND_946ML")).toMatchObject({ desiredValue: 5, provenance: "USER_EXPLICIT" });
      expect(result.plan.effects.find(e => e.canonicalSkuId === "Y22_G1_LARGE_CUP")).toMatchObject({ desiredValue: 20, provenance: "USER_EXPLICIT" });
      expect(result.plan.effects.find(e => e.canonicalSkuId === "HARRY_POTTER_CUP")).toMatchObject({ desiredValue: 0, provenance: "AUTO_FILL_MISSING" });
      expect(result.plan.effects.filter(e => e.provenance === "AUTO_FILL_MISSING")).toHaveLength(8);
    }
  });

  it("keeps explicit zero distinct from auto-fill", async () => {
    const parsed = await block("DAILY_SO", `${date}\nfreshmilk 0`);
    const values = Object.fromEntries(Object.keys(DAILY_SO_SCHEMAS.PMS).map(sku => [sku, null]));
    const result = planDailySo(dailyInput(parsed, values, "NOT_ESTABLISHED"));
    expect(result.status).toBe("READY");
    if (result.status === "READY") {
      expect(result.plan.effects.find(e => e.canonicalSkuId === "FRESH_MILK_DIAMOND_946ML")?.provenance).toBe("USER_EXPLICIT");
      expect(result.plan.effects.filter(e => e.provenance === "AUTO_FILL_MISSING")).toHaveLength(9);
    }
  });

  it("subsequent submission touches explicit SKU only and confirms correction", async () => {
    const parsed = await block("DAILY_SO", `${date}\nfreshmilk 8`);
    const values: Record<string, unknown> = Object.fromEntries(Object.keys(DAILY_SO_SCHEMAS.PMS).map(sku => [sku, 0]));
    values.FRESH_MILK_DIAMOND_946ML = 5;
    values.Y22_G1_LARGE_CUP = 20;
    const result = planDailySo(dailyInput(parsed, values, "ESTABLISHED"));
    expect(result.status).toBe("REQUIRES_CONFIRMATION");
    if (result.status === "REQUIRES_CONFIRMATION") {
      expect(result.plan.effects).toHaveLength(1);
      expect(result.plan.effects[0].canonicalSkuId).toBe("FRESH_MILK_DIAMOND_946ML");
    }
    const noop = planDailySo(dailyInput(await block("DAILY_SO", `${date}\nfreshmilk 5`), values, "ESTABLISHED"));
    expect(noop.status).toBe("NO_OP");
  });

  it("fails closed on snapshot inconsistency", async () => {
    const parsed = await block("DAILY_SO", `${date}\nfreshmilk 5`);
    const meaningful: Record<string, unknown> = Object.fromEntries(Object.keys(DAILY_SO_SCHEMAS.PMS).map(sku => [sku, null]));
    meaningful.FRESH_MILK_DIAMOND_946ML = 5;
    expect(planDailySo(dailyInput(parsed, meaningful, "NOT_ESTABLISHED")).status).toBe("INCONSISTENT_STATE");
    const blank: Record<string, unknown> = Object.fromEntries(Object.keys(DAILY_SO_SCHEMAS.PMS).map(sku => [sku, 0]));
    blank.FRESH_MILK_DIAMOND_946ML = null;
    expect(planDailySo(dailyInput(parsed, blank, "ESTABLISHED")).status).toBe("INCONSISTENT_STATE");
  });
});

describe("M4 parser and date gates", () => {
  it("applies frozen domain quantity policy", () => {
    for (const token of ["0", "5", "1.5", "1,5", "0.25", "12.75"]) {
      expect(validateBusinessQuantity("PRODUCTION", token).status).toBe("VALID");
      expect(validateBusinessQuantity("WASTE", token).status).toBe("VALID");
    }
    for (const token of ["-1", "-0.5", "1.234", "1,234", "1.230", "NaN", "Infinity", "bad"]) {
      expect(validateBusinessQuantity("PRODUCTION", token).status).toBe("INVALID");
    }
    for (const token of ["0", "1", "5", "125"]) expect(validateBusinessQuantity("DAILY_SO", token).status).toBe("VALID");
    expect(validateBusinessQuantity("DAILY_SO", "1.900")).toMatchObject({ status: "VALID", value: 1900, normalizedToken: "1900" });
    expect(validateBusinessQuantity("DAILY_SO", "2,500")).toMatchObject({ status: "VALID", value: 2500, normalizedToken: "2500" });
    expect(validateBusinessQuantity("DAILY_SO", "1.000.000")).toMatchObject({ status: "VALID", value: 1000000 });
    for (const token of ["-1", "1.5", "1,5", "0.5", "2.00", "NaN", "Infinity", "bad"]) {
      expect(validateBusinessQuantity("DAILY_SO", token).status).toBe("INVALID");
    }
    for (const token of ["1,23", "1,234.567", "1.234,567", "1.2345"]) {
      expect(validateBusinessQuantity("DAILY_SO", token).status).toBe("INVALID");
    }
  });

  it("holds whole block for invalid business quantities", async () => {
    const values = { PEARL_BASE: null };
    const production = await block("PRODUCTION", `${date}\npearl 5\nhoney base -2`);
    const productionResult = planProduction(pwInput(production, "PRODUCTION", { PEARL_BASE: null, HONEY_BASE: null }, ["PEARL_BASE", "HONEY_BASE"]));
    expect(productionResult.status).toBe("REQUIRES_CLARIFICATION");
    if (productionResult.status === "REQUIRES_CLARIFICATION") expect(productionResult.reasons).toContain("INVALID_QUANTITY");

    const daily = await block("DAILY_SO", `${date}\nfreshmilk 5\nlarge 1.5`);
    const dailyValues = Object.fromEntries(Object.keys(DAILY_SO_SCHEMAS.PMS).map(sku => [sku, null]));
    const dailyResult = planDailySo(dailyInput(daily, dailyValues, "NOT_ESTABLISHED"));
    expect(dailyResult.status).toBe("REQUIRES_CLARIFICATION");
    if (dailyResult.status === "REQUIRES_CLARIFICATION") expect(dailyResult.reasons).toContain("INVALID_QUANTITY");
  });

  it("blocks unresolved parser outcomes and quantity policy", async () => {
    const values = Object.fromEntries(Object.keys(DAILY_SO_SCHEMAS.PMS).map(sku => [sku, null]));
    for (const body of [`${date}\nmedium 4`, `${date}\nnot-a-sku 4`, `${date}\nfreshmilk 10abc`, `${date}\npearl 1\npearl 2`]) {
      const parsed = await block("DAILY_SO", body);
      const result = planDailySo(dailyInput(parsed, values, "NOT_ESTABLISHED"));
      expect(result.status).toBe("REQUIRES_CLARIFICATION");
    }
    const blankQuantity = await block("DAILY_SO", `${date}\nfreshmilk`);
    expect(planDailySo(dailyInput(blankQuantity, values, "NOT_ESTABLISHED")).status).toBe("READY");
  });

  it("supports historical planning, blocks future and invalid dates", async () => {
    const values = { PEARL_BASE: null };
    const historical = await block("PRODUCTION", "01-09-2026\npearl 3");
    expect(planProduction(pwInput(historical, "PRODUCTION", values)).status).toBe("READY");
    const future = await block("PRODUCTION", "08-09-2026\npearl 3");
    expect(planProduction(pwInput(future, "PRODUCTION", values)).status).toBe("REQUIRES_CLARIFICATION");
    const invalid = await block("PRODUCTION", "31-02-2026\npearl 3");
    expect(planProduction(pwInput(invalid, "PRODUCTION", values)).status).toBe("REQUIRES_CLARIFICATION");
  });
});
