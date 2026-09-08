import type { DomainId } from "../core/identifiers.js";

export type QuantityValidation =
  | { readonly status: "VALID"; readonly value: number; readonly normalizedToken: string }
  | { readonly status: "INVALID"; readonly reason: "INVALID_QUANTITY"; readonly detail: string };

const DECIMAL = /^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;
const INTEGER = /^\d+$/;
const DAILY_SO_GROUPED_INTEGER = /^\d{1,3}(?:([.,])\d{3})(?:\1\d{3})*$/;

/** Domain business quantity policy. M3 remains responsible for token extraction. */
export function validateBusinessQuantity(domain: DomainId, lexicalQuantity: string): QuantityValidation {
  const token = lexicalQuantity.trim();
  if (!token || token === "NaN" || token === "Infinity" || token === "+Infinity" || token === "-Infinity") {
    return invalid("malformed or non-finite quantity");
  }
  if (domain === "DAILY_SO") {
    const grouped = DAILY_SO_GROUPED_INTEGER.test(token);
    if (!INTEGER.test(token) && !grouped) return invalid("Daily SO quantity must be a non-negative integer or thousands-grouped integer");
    const digits = token.replace(/[.,]/g, "");
    const value = Number(digits);
    if (!Number.isSafeInteger(value) || value < 0) return invalid("quantity is outside safe numeric representation");
    return { status: "VALID", value, normalizedToken: String(value) };
  }
  if (!DECIMAL.test(token)) return invalid("quantity must be a non-negative number in the domain format");
  const decimalSeparator = token.includes(",") ? "," : token.includes(".") ? "." : undefined;
  const fractionDigits = decimalSeparator ? token.length - token.lastIndexOf(decimalSeparator) - 1 : 0;
  if (fractionDigits > 2) return invalid("quantity exceeds two decimal places");
  const value = Number(token.replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    return invalid("quantity is outside safe numeric representation");
  }
  return { status: "VALID", value, normalizedToken: String(value) };
}

function invalid(detail: string): QuantityValidation {
  return { status: "INVALID", reason: "INVALID_QUANTITY", detail };
}
