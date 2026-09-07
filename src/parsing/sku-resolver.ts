import type { CanonicalSkuId, DomainId } from "../core/identifiers.js";
import { normalizeText, VOCABULARY, type VocabularyEntry } from "./vocabulary.js";

export type SkuResolution =
  | { readonly status: "RESOLVED"; readonly canonicalSkuId: CanonicalSkuId; readonly resolver: "EXACT_CANONICAL" | "EXACT_ALIAS" | "FUZZY"; readonly confidence?: number }
  | { readonly status: "AMBIGUOUS"; readonly candidates: readonly CanonicalSkuId[]; readonly confidence?: number }
  | { readonly status: "UNKNOWN" };

export function candidatesForDomain(domain: DomainId): readonly VocabularyEntry[] {
  return VOCABULARY.filter(entry => entry.domains.includes(domain));
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = left[i - 1] === right[j - 1]
        ? diagonal
        : 1 + Math.min(diagonal, previous[j], previous[j - 1]);
      diagonal = above;
    }
  }
  return previous[right.length];
}

function similarity(left: string, right: string): number {
  const length = Math.max(left.length, right.length);
  return length === 0 ? 1 : 1 - levenshtein(left, right) / length;
}

const qualifierTokens: Readonly<Record<string, readonly string[]>> = {
  LOCAL: ["local", "lokal", "locl"],
  BASE: ["base", "bas"],
  G1: ["g1"],
  MILK: ["milk"],
  TEA: ["tea"],
  BLACK: ["black"],
  VARIETY: ["variety", "beragam"],
  FOAM: ["foam"],
  CHEESE: ["cheese"],
  CAKE: ["cake"]
};

function queryHasQualifier(query: string, qualifier: string): boolean {
  const accepted = qualifierTokens[qualifier] ?? [qualifier.toLowerCase()];
  return normalizeText(query).split(" ").some(token => accepted.includes(token));
}

function hasPartialQualifier(query: string, siblings: readonly VocabularyEntry[]): boolean {
  const tokens = normalizeText(query).split(" ");
  return (tokens.includes("l") && siblings.some(entry => entry.qualifiers.includes("LOCAL")))
    || (tokens.includes("g") && siblings.some(entry => entry.qualifiers.includes("G1")));
}

function siblingEntries(entries: readonly VocabularyEntry[]): Map<string, VocabularyEntry[]> {
  const families = new Map<string, VocabularyEntry[]>();
  for (const entry of entries) {
    const family = families.get(entry.family) ?? [];
    family.push(entry);
    families.set(entry.family, family);
  }
  return families;
}

function exactCandidates(input: string, domain: DomainId): { entries: VocabularyEntry[]; alias: boolean } {
  const normalized = normalizeText(input);
  const entries = candidatesForDomain(domain).filter(entry => {
    const canonicalId = normalizeText(entry.canonicalSkuId);
    const canonicalName = normalizeText(entry.canonicalName);
    return canonicalId === normalized
      || canonicalName === normalized
      || entry.aliases.some(alias => normalizeText(alias) === normalized);
  });
  const alias = entries.some(entry => entry.aliases.some(alias => normalizeText(alias) === normalized));
  return { entries, alias };
}

export function resolveSku(input: string, domain: DomainId): SkuResolution {
  const exact = exactCandidates(input, domain);
  if (exact.entries.length === 1) {
    return {
      status: "RESOLVED",
      canonicalSkuId: exact.entries[0].canonicalSkuId,
      resolver: exact.alias ? "EXACT_ALIAS" : "EXACT_CANONICAL"
    };
  }
  if (exact.entries.length > 1) {
    return { status: "AMBIGUOUS", candidates: exact.entries.map(entry => entry.canonicalSkuId) };
  }

  const normalized = normalizeText(input);
  if (!normalized) return { status: "UNKNOWN" };
  const entries = candidatesForDomain(domain);
  const families = siblingEntries(entries);
  const allowedEntries = entries.filter(entry => {
    const siblings = families.get(entry.family) ?? [];
    if (siblings.length < 2) return true;
    if (hasPartialQualifier(normalized, siblings)) return true;
    const eligible = siblings.filter(sibling =>
      sibling.qualifiers.length > 0
      && sibling.qualifiers.every(qualifier => queryHasQualifier(normalized, qualifier))
    );
    return eligible.length === 1 ? eligible[0].canonicalSkuId === entry.canonicalSkuId : true;
  });
  const scored = allowedEntries
    .map(entry => {
      const terms = [entry.canonicalName, entry.canonicalSkuId, ...entry.aliases];
      const confidence = Math.max(...terms.map(term => similarity(normalized, normalizeText(term))));
      return { entry, confidence };
    })
    .sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.confidence < 0.78) return { status: "UNKNOWN" };
  const bestSiblings = families.get(best.entry.family) ?? [];
  const bestFamilyIsProtected = bestSiblings.length > 1;
  const partialQualifier = hasPartialQualifier(normalized, bestSiblings);
  const bestFamilyHasUniqueQualifier = bestSiblings.filter(sibling =>
    sibling.qualifiers.length > 0
    && sibling.qualifiers.every(qualifier => queryHasQualifier(normalized, qualifier))
  ).length === 1;
  if (bestFamilyIsProtected && (partialQualifier || !bestFamilyHasUniqueQualifier)) {
    return {
      status: "AMBIGUOUS",
      candidates: bestSiblings.map(entry => entry.canonicalSkuId),
      confidence: best.confidence
    };
  }
  if (second && best.confidence - second.confidence < 0.10) {
    return {
      status: "AMBIGUOUS",
      candidates: scored.filter(item => best.confidence - item.confidence < 0.10).map(item => item.entry.canonicalSkuId),
      confidence: best.confidence
    };
  }
  return { status: "RESOLVED", canonicalSkuId: best.entry.canonicalSkuId, resolver: "FUZZY", confidence: best.confidence };
}
