import { AppError } from "../core/errors.js";
import type { CanonicalSkuId, DomainId, StoreId } from "../core/identifiers.js";
import type { ParsedCommandBlock, ParsedItem } from "../parsing/parser.js";
import { assertAllowlistedTarget } from "../sheets/schema-guard.js";
import type { SheetWriteTarget } from "../sheets/contract-types.js";
import { DAILY_SO_SCHEMAS } from "./daily-so/sheet-schema.js";
import { validateBusinessQuantity } from "./quantity-policy.js";
import type {
  BusinessObservation,
  BusinessPlanResult,
  CorrectionRequest,
  EffectProvenance,
  ExistingBusinessValue,
  MutationEffect,
  MutationOperation,
  MutationPlan,
  NoOpEffect,
  QuantityAssessment,
  ResolvedBusinessItem,
  SkippedSku
} from "./business-types.js";

export function normalizeExistingValue(value: unknown): ExistingBusinessValue {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim())) {
    const number = Number(value.trim());
    if (Number.isFinite(number)) return number;
  }
  throw new AppError("INTERNAL", "Unexpected observed business value");
}

export function validateObservedEnvelope(
  store: StoreId,
  domain: DomainId,
  observed: BusinessObservation
): void {
  if (observed.store !== store || observed.domain !== domain) {
    throw new AppError("INTERNAL", "Observed store or domain mismatch");
  }
}

export function validateTarget(
  store: StoreId,
  domain: DomainId,
  sku: CanonicalSkuId,
  target: SheetWriteTarget
): void {
  if (target.store !== store || target.domain !== domain || target.canonicalSkuId !== sku) {
    throw new AppError("SCHEMA_MISMATCH", "Business target store, domain, or SKU mismatch");
  }
  assertAllowlistedTarget(target);
}

function quantityForItem(
  domain: DomainId,
  index: number,
  item: ParsedItem,
  assessments: Readonly<Record<number, QuantityAssessment>> | undefined
): number | "INVALID_QUANTITY" | "QUANTITY_POLICY_UNRESOLVED" {
  if (!item.quantityToken) return "INVALID_QUANTITY";
  const validation = validateBusinessQuantity(domain, item.quantityToken);
  if (validation.status === "INVALID") return "INVALID_QUANTITY";
  const assessment = assessments?.[index];
  if (assessment && (assessment.status !== "APPROVED" || assessment.token !== item.quantityToken || assessment.value !== validation.value)) return "QUANTITY_POLICY_UNRESOLVED";
  return validation.value;
}

export function resolveBusinessItems(
  block: ParsedCommandBlock,
  store: StoreId,
  domain: DomainId,
  targets: Readonly<Record<string, SheetWriteTarget>>,
  assessments?: Readonly<Record<number, QuantityAssessment>>
): { items: readonly ResolvedBusinessItem[]; skippedItems: readonly SkippedSku[]; clarificationReasons: readonly string[] } {
  const reasons: string[] = [];
  const skippedItems: SkippedSku[] = [];
  if (block.status !== "PARSE_READY") reasons.push(...block.clarificationReasons.filter(reason => reason !== "UNKNOWN_SKU" && reason !== "AMBIGUOUS_SKU"));
  if (block.domain !== domain) reasons.push("DOMAIN_MISMATCH");
  if (!block.normalizedDate) reasons.push("MISSING_DATE");
  if (block.temporalClassification === "INVALID") reasons.push("INVALID_DATE");
  if (block.temporalClassification === "FUTURE") reasons.push("FUTURE_DATE");
  const items: ResolvedBusinessItem[] = [];
  const seen = new Set<CanonicalSkuId>();
  block.items.forEach((item, index) => {
    if (item.status !== "RESOLVED" || !item.canonicalSkuId) {
      if (item.status === "UNKNOWN" || item.status === "AMBIGUOUS" || item.status === "IGNORED") {
        skippedItems.push({ rawTerm: item.rawTerm, reason: item.status === "UNKNOWN" ? "UNKNOWN_SKU" : item.status === "AMBIGUOUS" ? "AMBIGUOUS_SKU" : "IGNORED_SKU", ...(item.status === "AMBIGUOUS" ? { candidates: item.candidates } : {}) });
      } else reasons.push(item.status);
      return;
    }
    if (seen.has(item.canonicalSkuId)) {
      const duplicate = block.duplicates.find(entry => entry.canonicalSkuId === item.canonicalSkuId);
      if (duplicate?.status === "CONFLICT") reasons.push("CONFLICTING_DUPLICATE");
      return;
    }
    seen.add(item.canonicalSkuId);
    const quantity = quantityForItem(domain, index, item, assessments);
    if (quantity === "INVALID_QUANTITY" || quantity === "QUANTITY_POLICY_UNRESOLVED") {
      reasons.push(quantity);
      return;
    }
    const target = targets[item.canonicalSkuId];
    if (!target) {
      reasons.push("TARGET_NOT_ALLOWLISTED");
      return;
    }
    try {
      validateTarget(store, domain, item.canonicalSkuId, target);
    } catch {
      reasons.push("TARGET_NOT_ALLOWLISTED");
      return;
    }
    items.push({
      item,
      canonicalSkuId: item.canonicalSkuId,
      quantity,
      provenance: "USER_EXPLICIT",
      target
    });
  });
  return { items, skippedItems, clarificationReasons: [...new Set(reasons)] };
}

export function operationFor(value: ExistingBusinessValue): MutationOperation {
  return value === null ? "CLEAR" : "SET";
}

export function buildPlan(
  store: StoreId,
  domain: DomainId,
  date: string,
  effects: readonly MutationEffect[],
  noOps: readonly NoOpEffect[],
  corrections: readonly CorrectionRequest[],
  executable: boolean,
  skippedItems: readonly SkippedSku[] = []
): MutationPlan {
  return Object.freeze({
    store,
    domain,
    date,
    effects: Object.freeze([...effects]),
    noOps: Object.freeze([...noOps]),
    corrections: Object.freeze([...corrections]),
    skippedItems: Object.freeze([...skippedItems]),
    executable
  });
}

export function resultFromPlan(plan: MutationPlan): BusinessPlanResult {
  if (plan.corrections.length > 0) return { status: "REQUIRES_CONFIRMATION", plan };
  if (plan.effects.length === 0) return { status: "NO_OP", plan };
  return { status: "READY", plan };
}

export function validateObservedValue(
  observed: BusinessObservation,
  sku: CanonicalSkuId
): ExistingBusinessValue | "MISSING" {
  if (!Object.prototype.hasOwnProperty.call(observed.values, sku)) return "MISSING";
  return normalizeExistingValue(observed.values[sku]);
}

export function dateForBlock(block: ParsedCommandBlock): string | undefined {
  return block.normalizedDate?.iso;
}

export function clarificationResult(reasons: readonly string[]): BusinessPlanResult {
  return { status: "REQUIRES_CLARIFICATION", reasons: [...new Set(reasons)] };
}

export function inconsistentResult(reason: string): BusinessPlanResult {
  return { status: "INCONSISTENT_STATE", reason };
}

export function planProductionWaste(
  input: import("./business-types.js").BusinessPlanningInput,
  domain: "PRODUCTION" | "WASTE"
): BusinessPlanResult {
  try {
    validateObservedEnvelope(input.store, domain, input.observed);
  } catch {
    return inconsistentResult("Observed store or domain mismatch");
  }
  const date = dateForBlock(input.block);
  const resolved = resolveBusinessItems(input.block, input.store, domain, input.targets, input.quantityAssessments);
  const reasons = date ? resolved.clarificationReasons : [...resolved.clarificationReasons, "MISSING_DATE"];
  if (reasons.length > 0) return clarificationResult(reasons);
  if (resolved.items.length === 0 && resolved.skippedItems.length > 0) return clarificationResult(["NO_RECOGNIZED_SKU"]);

  const effects: MutationEffect[] = [];
  const noOps: NoOpEffect[] = [];
  const corrections: CorrectionRequest[] = [];
  for (const item of resolved.items) {
    let existing: ExistingBusinessValue | "MISSING";
    try { existing = validateObservedValue(input.observed, item.canonicalSkuId); }
    catch { return inconsistentResult("Unexpected observed business value"); }
    if (existing === "MISSING") return inconsistentResult("Observed target value missing");
    const desiredValue = item.quantity === 0 ? null : item.quantity;
    const operation = operationFor(desiredValue);
    if (existing === desiredValue) {
      noOps.push({ store: input.store, domain, date: date!, canonicalSkuId: item.canonicalSkuId, target: item.target, existingValue: existing, desiredValue, provenance: item.provenance });
      continue;
    }
    const effect = { store: input.store, domain, date: date!, canonicalSkuId: item.canonicalSkuId, target: item.target, expectedOldValue: existing, desiredValue, operation, provenance: item.provenance };
    effects.push(effect);
    const requiresCorrectionConfirmation = existing !== null;
    const requiresProductionPearlConfirmation = domain === "PRODUCTION"
      && item.canonicalSkuId === "PEARL_BASE"
      && item.quantity > 3;
    if (requiresCorrectionConfirmation || requiresProductionPearlConfirmation) {
      corrections.push({ store: input.store, domain, date: date!, canonicalSkuId: item.canonicalSkuId, target: item.target, oldValue: existing, proposedValue: desiredValue, operation });
    }
  }
  return resultFromPlan(buildPlan(input.store, domain, date!, effects, noOps, corrections, corrections.length === 0, resolved.skippedItems));
}

export function expectedTargetSkus(store: StoreId): readonly CanonicalSkuId[] {
  return Object.keys(DAILY_SO_SCHEMAS[store]) as CanonicalSkuId[];
}
