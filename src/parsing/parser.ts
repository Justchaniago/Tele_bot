import type { CanonicalSkuId, DomainId } from "../core/identifiers.js";
import { validateAiSkuResponse, type AiSkuResolver } from "./ai-fallback.js";
import { classifyTemporalDate, parseBusinessDate, type CalendarDate, type TemporalClassification } from "./date-safety.js";
import { candidatesForDomain, resolveSku, type SkuResolution } from "./sku-resolver.js";
import { resolveDateTab } from "./tab-resolver.js";
import { normalizeText } from "./vocabulary.js";

export type ParseReason =
  | "MISSING_DOMAIN"
  | "MISSING_INPUT"
  | "MISSING_DATE"
  | "MISSING_QUANTITY"
  | "AMBIGUOUS_SKU"
  | "UNKNOWN_SKU"
  | "MALFORMED_QUANTITY"
  | "CONFLICTING_DUPLICATE"
  | "INVALID_DATE"
  | "FUTURE_DATE"
  | "AMBIGUOUS_TAB";

export type ParsedItem = {
  readonly rawLine: string;
  readonly rawTerm: string;
  readonly normalizedTerm: string;
  readonly canonicalSkuId?: CanonicalSkuId;
  readonly quantityToken?: string;
  readonly quantityValue?: number;
  readonly resolver?: "EXACT_CANONICAL" | "EXACT_ALIAS" | "FUZZY" | "AI_FALLBACK";
  readonly confidence?: number;
  readonly status: "RESOLVED" | "AMBIGUOUS" | "UNKNOWN" | "NEEDS_CLARIFICATION" | "MALFORMED_QUANTITY";
  readonly candidates?: readonly CanonicalSkuId[];
};

export type DuplicateOutcome = {
  readonly canonicalSkuId: CanonicalSkuId;
  readonly status: "DEDUPLICABLE" | "CONFLICT";
  readonly itemIndexes: readonly number[];
};

export type ParsedCommandBlock = {
  readonly domain: DomainId;
  readonly rawBody: string;
  readonly rawDate?: string;
  readonly normalizedDate?: CalendarDate;
  readonly temporalClassification: TemporalClassification;
  readonly items: readonly ParsedItem[];
  readonly duplicates: readonly DuplicateOutcome[];
  readonly status: "NEEDS_INPUT" | "PARSE_READY" | "NEEDS_CLARIFICATION";
  readonly clarificationReasons: readonly ParseReason[];
  readonly tabName?: string;
};

export type ParsedMessage = {
  readonly blocks: readonly ParsedCommandBlock[];
  readonly status: "PARSE_READY" | "PARTIAL" | "NEEDS_CLARIFICATION";
  readonly clarificationReasons: readonly ParseReason[];
};

export type ParseOptions = {
  readonly now: Date;
  readonly availableSheetNames?: readonly string[];
  readonly aiResolver?: AiSkuResolver;
};

const commandDomains: Readonly<Record<string, DomainId>> = Object.freeze({
  "/produksi": "PRODUCTION",
  "/waste": "WASTE",
  "/dailyso": "DAILY_SO"
});

type CommandSegment = { readonly domain: DomainId; readonly body: string };

export function segmentCommandBlocks(raw: string): readonly CommandSegment[] {
  const lines = raw.replace(/\r/g, "").split("\n");
  const segments: { domain: DomainId; lines: string[] }[] = [];
  let current: { domain: DomainId; lines: string[] } | undefined;
  for (const line of lines) {
    const command = commandDomains[line.trim().toLowerCase()];
    if (command) {
      current = { domain: command, lines: [] };
      segments.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return segments.map(segment => ({ domain: segment.domain, body: segment.lines.join("\n").trim() }));
}

function quantityFromLine(line: string): {
  term: string;
  quantityToken?: string;
  quantityValue?: number;
  malformedQuantity?: string;
} {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 2) return { term: line.trim() };
  const last = tokens[tokens.length - 1];
  const numericPattern = /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;
  if (numericPattern.test(last)) {
    return {
      term: tokens.slice(0, -1).join(" "),
      quantityToken: last,
      quantityValue: Number(last.replace(",", "."))
    };
  }
  if (/^[+-]?(?:\d|[.,])/.test(last)) {
    return { term: tokens.slice(0, -1).join(" "), malformedQuantity: last };
  }
  return { term: line.trim() };
}

function resolutionToItem(
  rawLine: string,
  rawTerm: string,
  quantity: ReturnType<typeof quantityFromLine>,
  resolution: SkuResolution
): ParsedItem {
  const base = {
    rawLine,
    rawTerm,
    normalizedTerm: normalizeText(rawTerm),
    ...(quantity.quantityToken
      ? { quantityToken: quantity.quantityToken, quantityValue: quantity.quantityValue }
      : quantity.malformedQuantity ? { quantityToken: quantity.malformedQuantity } : {})
  };
  if (quantity.malformedQuantity) {
    return { ...base, status: "MALFORMED_QUANTITY" };
  }
  if (resolution.status === "RESOLVED") {
    return {
      ...base,
      canonicalSkuId: resolution.canonicalSkuId,
      resolver: resolution.resolver,
      confidence: resolution.confidence,
      status: quantity.quantityToken ? "RESOLVED" : "NEEDS_CLARIFICATION"
    };
  }
  if (resolution.status === "AMBIGUOUS") {
    return { ...base, status: "AMBIGUOUS", candidates: resolution.candidates };
  }
  return { ...base, status: "UNKNOWN" };
}

async function resolveTerm(
  rawLine: string,
  rawTerm: string,
  quantity: ReturnType<typeof quantityFromLine>,
  domain: DomainId,
  aiResolver?: AiSkuResolver
): Promise<ParsedItem> {
  const local = resolveSku(rawTerm, domain);
  if (local.status !== "UNKNOWN" || !aiResolver) return resolutionToItem(rawLine, rawTerm, quantity, local);

  const candidates = candidatesForDomain(domain).map(entry => entry.canonicalSkuId);
  try {
    const aiResult = validateAiSkuResponse(await aiResolver.resolve({
      domain,
      normalizedTerm: normalizeText(rawTerm),
      candidates
    }), candidates);
    if (aiResult.status === "RESOLVED") {
      const item = resolutionToItem(rawLine, rawTerm, quantity, {
        status: "RESOLVED",
        canonicalSkuId: aiResult.canonicalSkuId,
        resolver: "EXACT_CANONICAL"
      });
      return { ...item, resolver: "AI_FALLBACK" };
    }
    if (aiResult.status === "AMBIGUOUS") {
      return {
        rawLine,
        rawTerm,
        normalizedTerm: normalizeText(rawTerm),
        ...(quantity.quantityToken
          ? { quantityToken: quantity.quantityToken, quantityValue: quantity.quantityValue }
          : quantity.malformedQuantity ? { quantityToken: quantity.malformedQuantity } : {}),
        status: "AMBIGUOUS",
        candidates: aiResult.candidates
      };
    }
  } catch {
    // Provider failure becomes safe UNKNOWN below.
  }
  return {
    rawLine,
    rawTerm,
    normalizedTerm: normalizeText(rawTerm),
    ...(quantity.quantityToken
      ? { quantityToken: quantity.quantityToken, quantityValue: quantity.quantityValue }
      : quantity.malformedQuantity ? { quantityToken: quantity.malformedQuantity } : {}),
    status: "UNKNOWN"
  };
}

function duplicateOutcomes(items: readonly ParsedItem[]): readonly DuplicateOutcome[] {
  const grouped = new Map<CanonicalSkuId, number[]>();
  items.forEach((item, index) => {
    if (item.status === "RESOLVED" && item.canonicalSkuId) {
      const indexes = grouped.get(item.canonicalSkuId) ?? [];
      indexes.push(index);
      grouped.set(item.canonicalSkuId, indexes);
    }
  });
  return [...grouped.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([canonicalSkuId, itemIndexes]) => {
      const values = itemIndexes.map(index => items[index].quantityValue);
      return {
        canonicalSkuId,
        itemIndexes,
        status: values.every(value => value === values[0]) ? "DEDUPLICABLE" : "CONFLICT"
      };
    });
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

export async function parseCommandBlock(
  input: { readonly domain: DomainId; readonly body: string },
  options: ParseOptions
): Promise<ParsedCommandBlock> {
  const lines = input.body.split("\n").map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return {
      domain: input.domain,
      rawBody: input.body,
      temporalClassification: "INVALID",
      items: [],
      duplicates: [],
      status: "NEEDS_INPUT",
      clarificationReasons: ["MISSING_INPUT"]
    };
  }

  const rawDate = lines[0];
  const parsedDate = parseBusinessDate(rawDate);
  if (parsedDate.status === "INVALID") {
    const missingDate = !/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(rawDate);
    return {
      domain: input.domain,
      rawBody: input.body,
      rawDate,
      temporalClassification: "INVALID",
      items: [],
      duplicates: [],
      status: "NEEDS_CLARIFICATION",
      clarificationReasons: [missingDate ? "MISSING_DATE" : "INVALID_DATE"]
    };
  }

  const temporalClassification = classifyTemporalDate(parsedDate.date, options.now);
  const reasons: ParseReason[] = temporalClassification === "FUTURE" ? ["FUTURE_DATE"] : [];
  let tabName: string | undefined;
  if ((input.domain === "PRODUCTION" || input.domain === "WASTE") && options.availableSheetNames) {
    const tab = resolveDateTab({
      day: parsedDate.date.day,
      year: parsedDate.date.year,
      availableSheetNames: options.availableSheetNames
    });
    if (tab.status === "RESOLVED") tabName = tab.sheetName;
    else reasons.push("AMBIGUOUS_TAB");
  }

  const items = await Promise.all(lines.slice(1).map(async line => {
    const quantity = quantityFromLine(line);
    return resolveTerm(line, quantity.term, quantity, input.domain, options.aiResolver);
  }));
  if (items.length === 0) reasons.push("MISSING_INPUT");
  items.forEach(item => {
    if (item.status === "NEEDS_CLARIFICATION") reasons.push("MISSING_QUANTITY");
    if (item.status === "AMBIGUOUS") reasons.push("AMBIGUOUS_SKU");
    if (item.status === "UNKNOWN") reasons.push("UNKNOWN_SKU");
    if (item.status === "MALFORMED_QUANTITY") reasons.push("MALFORMED_QUANTITY");
  });
  const duplicates = duplicateOutcomes(items);
  if (duplicates.some(item => item.status === "CONFLICT")) reasons.push("CONFLICTING_DUPLICATE");
  const uniqueReasons = unique(reasons);
  return {
    domain: input.domain,
    rawBody: input.body,
    rawDate,
    normalizedDate: parsedDate.date,
    temporalClassification,
    items,
    duplicates,
    status: uniqueReasons.length === 0 ? "PARSE_READY" : "NEEDS_CLARIFICATION",
    clarificationReasons: uniqueReasons,
    ...(tabName ? { tabName } : {})
  };
}

export async function parseCommandMessage(raw: string, options: ParseOptions): Promise<ParsedMessage> {
  const segments = segmentCommandBlocks(raw);
  if (segments.length === 0) {
    return { blocks: [], status: "NEEDS_CLARIFICATION", clarificationReasons: ["MISSING_DOMAIN"] };
  }
  const blocks = await Promise.all(segments.map(segment => parseCommandBlock(segment, options)));
  const clarificationReasons = unique(blocks.flatMap(block => block.clarificationReasons));
  return {
    blocks,
    status: blocks.every(block => block.status === "PARSE_READY") ? "PARSE_READY" : "PARTIAL",
    clarificationReasons
  };
}
