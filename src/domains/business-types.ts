import type { CanonicalSkuId, DomainId, StoreId } from "../core/identifiers.js";
import type { ParsedCommandBlock, ParsedItem } from "../parsing/parser.js";
import type { SheetWriteTarget } from "../sheets/contract-types.js";

export type ExistingBusinessValue = number | null;
export type SnapshotState = "NOT_ESTABLISHED" | "ESTABLISHED";
export type MutationOperation = "SET" | "CLEAR";
export type EffectProvenance = "USER_EXPLICIT" | "AUTO_FILL_MISSING";

export type QuantityAssessment =
  | { readonly status: "APPROVED"; readonly token: string; readonly value: number }
  | { readonly status: "UNRESOLVED"; readonly token: string; readonly reason: string };

export type BusinessObservation = {
  readonly store: StoreId;
  readonly domain: DomainId;
  readonly values: Readonly<Record<string, unknown>>;
  readonly snapshotState?: SnapshotState;
};

export type MutationEffect = {
  readonly store: StoreId;
  readonly domain: DomainId;
  readonly date: string;
  readonly canonicalSkuId: CanonicalSkuId;
  readonly target: SheetWriteTarget;
  readonly expectedOldValue: ExistingBusinessValue;
  readonly desiredValue: ExistingBusinessValue;
  readonly operation: MutationOperation;
  readonly provenance: EffectProvenance;
};

export type NoOpEffect = {
  readonly store: StoreId;
  readonly domain: DomainId;
  readonly date: string;
  readonly canonicalSkuId: CanonicalSkuId;
  readonly target: SheetWriteTarget;
  readonly existingValue: ExistingBusinessValue;
  readonly desiredValue: ExistingBusinessValue;
  readonly provenance: EffectProvenance;
};

export type CorrectionRequest = {
  readonly store: StoreId;
  readonly domain: DomainId;
  readonly date: string;
  readonly canonicalSkuId: CanonicalSkuId;
  readonly target: SheetWriteTarget;
  readonly oldValue: ExistingBusinessValue;
  readonly proposedValue: ExistingBusinessValue;
  readonly operation: MutationOperation;
};

export type SkippedSku = {
  readonly rawTerm: string;
  readonly reason: "UNKNOWN_SKU" | "AMBIGUOUS_SKU" | "IGNORED_SKU";
  readonly candidates?: readonly CanonicalSkuId[];
};

export type MutationPlan = {
  readonly store: StoreId;
  readonly domain: DomainId;
  readonly date: string;
  readonly effects: readonly MutationEffect[];
  readonly noOps: readonly NoOpEffect[];
  readonly corrections: readonly CorrectionRequest[];
  readonly skippedItems?: readonly SkippedSku[];
  readonly executable: boolean;
};

export type BusinessPlanResult =
  | { readonly status: "READY"; readonly plan: MutationPlan }
  | { readonly status: "NO_OP"; readonly plan: MutationPlan }
  | { readonly status: "REQUIRES_CONFIRMATION"; readonly plan: MutationPlan }
  | { readonly status: "REQUIRES_CLARIFICATION"; readonly reasons: readonly string[] }
  | { readonly status: "REJECTED"; readonly reason: string }
  | { readonly status: "INCONSISTENT_STATE"; readonly reason: string };

export type BusinessPlanningInput = {
  readonly store: StoreId;
  readonly block: ParsedCommandBlock;
  readonly targets: Readonly<Record<string, SheetWriteTarget>>;
  readonly observed: BusinessObservation;
  readonly quantityAssessments?: Readonly<Record<number, QuantityAssessment>>;
};

export type ResolvedBusinessItem = {
  readonly item: ParsedItem;
  readonly canonicalSkuId: CanonicalSkuId;
  readonly quantity: number;
  readonly provenance: EffectProvenance;
  readonly target: SheetWriteTarget;
};
