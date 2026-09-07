import type { BusinessPlanResult, BusinessPlanningInput, MutationEffect, NoOpEffect, CorrectionRequest, ExistingBusinessValue } from "../business-types.js";
import { DAILY_SO_SCHEMAS } from "./sheet-schema.js";
import {
  buildPlan,
  clarificationResult,
  dateForBlock,
  expectedTargetSkus,
  resultFromPlan,
  resolveBusinessItems,
  validateObservedEnvelope,
  validateObservedValue,
  validateTarget,
  inconsistentResult
} from "../business-helpers.js";

export function planDailySo(input: BusinessPlanningInput): BusinessPlanResult {
  const domain = "DAILY_SO" as const;
  try { validateObservedEnvelope(input.store, domain, input.observed); }
  catch { return inconsistentResult("Observed store or domain mismatch"); }
  const date = dateForBlock(input.block);
  if (!date) return clarificationResult(["MISSING_DATE"]);
  const schemaSkus = expectedTargetSkus(input.store);
  if (Object.keys(input.targets).length !== schemaSkus.length || schemaSkus.some(sku => !input.targets[sku])) {
    return inconsistentResult("Daily SO target set is incomplete");
  }
  for (const sku of schemaSkus) {
    try { validateTarget(input.store, domain, sku, input.targets[sku]); }
    catch { return inconsistentResult("Daily SO target is not allowlisted"); }
  }
  if (!input.observed.snapshotState) return inconsistentResult("Daily SO snapshot state is required");

  const resolved = resolveBusinessItems(input.block, input.store, domain, input.targets, input.quantityAssessments);
  if (resolved.clarificationReasons.length > 0) return clarificationResult(resolved.clarificationReasons);

  const observed = new Map<string, ExistingBusinessValue>();
  for (const sku of schemaSkus) {
    try {
      const value = validateObservedValue(input.observed, sku);
      if (value === "MISSING") return inconsistentResult("Daily SO observed target value missing");
      observed.set(sku, value);
    } catch { return inconsistentResult("Unexpected observed Daily SO value"); }
  }

  if (input.observed.snapshotState === "NOT_ESTABLISHED") {
    if ([...observed.values()].some(value => value !== null)) {
      return inconsistentResult("Unestablished Daily SO snapshot contains values");
    }
    const provided = new Map(resolved.items.map(item => [item.canonicalSkuId, item]));
    const effects: MutationEffect[] = schemaSkus.map(sku => {
      const item = provided.get(sku);
      return {
        store: input.store, domain, date, canonicalSkuId: sku, target: input.targets[sku],
        expectedOldValue: null,
        desiredValue: item ? item.quantity : 0,
        operation: "SET",
        provenance: item ? "USER_EXPLICIT" : "AUTO_FILL_MISSING"
      };
    });
    return resultFromPlan(buildPlan(input.store, domain, date, effects, [], [], true));
  }

  if ([...observed.values()].some(value => value === null)) {
    return inconsistentResult("Established Daily SO snapshot contains blank values");
  }
  const effects: MutationEffect[] = [];
  const noOps: NoOpEffect[] = [];
  const corrections: CorrectionRequest[] = [];
  for (const item of resolved.items) {
    const existing = observed.get(item.canonicalSkuId);
    if (existing === undefined) return inconsistentResult("Daily SO observed target value missing");
    if (existing === item.quantity) {
      noOps.push({ store: input.store, domain, date, canonicalSkuId: item.canonicalSkuId, target: item.target, existingValue: existing, desiredValue: item.quantity, provenance: "USER_EXPLICIT" });
      continue;
    }
    effects.push({ store: input.store, domain, date, canonicalSkuId: item.canonicalSkuId, target: item.target, expectedOldValue: existing, desiredValue: item.quantity, operation: "SET", provenance: "USER_EXPLICIT" });
    corrections.push({ store: input.store, domain, date, canonicalSkuId: item.canonicalSkuId, target: item.target, oldValue: existing, proposedValue: item.quantity, operation: "SET" });
  }
  return resultFromPlan(buildPlan(input.store, domain, date, effects, noOps, corrections, corrections.length === 0));
}

export const DAILY_SO_TARGET_COUNT = Object.keys(DAILY_SO_SCHEMAS.PMS).length;
