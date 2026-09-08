import type { CanonicalSkuId, DomainId } from "../core/identifiers.js";

export type AiSkuResponse = {
  readonly status: "RESOLVED" | "AMBIGUOUS" | "UNKNOWN";
  readonly candidateSkuId?: string;
};

export type AiSkuResolver = {
  resolve(input: {
    readonly domain: DomainId;
    readonly normalizedTerm: string;
    readonly candidates: readonly CanonicalSkuId[];
    readonly candidateContext?: readonly {
      readonly canonicalSkuId: CanonicalSkuId;
      readonly canonicalName: string;
      readonly aliases: readonly string[];
    }[];
  }): Promise<AiSkuResponse>;
};

export type ValidatedAiResolution =
  | { readonly status: "RESOLVED"; readonly canonicalSkuId: CanonicalSkuId }
  | { readonly status: "AMBIGUOUS"; readonly candidates: readonly CanonicalSkuId[] }
  | { readonly status: "UNKNOWN"; readonly reason: string };

export function validateAiSkuResponse(
  response: unknown,
  candidates: readonly CanonicalSkuId[]
): ValidatedAiResolution {
  if (!response || typeof response !== "object") return { status: "UNKNOWN", reason: "MALFORMED_AI_RESPONSE" };
  const value = response as Partial<AiSkuResponse>;
  if (value.status === "AMBIGUOUS") return { status: "AMBIGUOUS", candidates };
  if (value.status === "UNKNOWN") return { status: "UNKNOWN", reason: "AI_UNKNOWN" };
  if (value.status !== "RESOLVED" || typeof value.candidateSkuId !== "string") {
    return { status: "UNKNOWN", reason: "MALFORMED_AI_RESPONSE" };
  }
  if (!candidates.includes(value.candidateSkuId as CanonicalSkuId)) {
    return { status: "UNKNOWN", reason: "AI_CANDIDATE_OUTSIDE_ALLOWLIST" };
  }
  return { status: "RESOLVED", canonicalSkuId: value.candidateSkuId as CanonicalSkuId };
}
