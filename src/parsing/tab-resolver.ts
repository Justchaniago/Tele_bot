export type DateTabResolution =
  | { readonly status: "RESOLVED"; readonly sheetName: string }
  | { readonly status: "UNKNOWN"; readonly candidates: readonly string[] }
  | { readonly status: "AMBIGUOUS"; readonly candidates: readonly string[] };

function normalizeYear(raw: string): number {
  return raw.length === 2 ? 2000 + Number(raw) : Number(raw);
}

export function resolveDateTab(input: {
  readonly day: number;
  readonly year: number;
  readonly availableSheetNames: readonly string[];
}): DateTabResolution {
  if (!Number.isInteger(input.day) || input.day < 1 || input.day > 31 || !Number.isInteger(input.year)) {
    return { status: "UNKNOWN", candidates: [] };
  }
  const candidates = input.availableSheetNames.filter(name => {
    const match = /^\s*(\d{1,2})\s*-\s*(\d{2}|\d{4})\s*$/.exec(name);
    return Boolean(match && Number(match[1]) === input.day && normalizeYear(match[2]) === input.year);
  });
  if (candidates.length === 1) return { status: "RESOLVED", sheetName: candidates[0] };
  if (candidates.length === 0) return { status: "UNKNOWN", candidates };
  return { status: "AMBIGUOUS", candidates };
}
