import type { ErrorCategory } from "../core/errors.js";

export type RetryClass = "RETRYABLE" | "FINAL";

export function classifyRetry(category: ErrorCategory | "TIMEOUT" | "RATE_LIMITED" | "TEMPORARY_SHEETS" | "TEMPORARY_TELEGRAM" | "TEMPORARY_VERTEX"): RetryClass {
  return ["TRANSIENT_EXTERNAL", "TIMEOUT", "RATE_LIMITED", "TEMPORARY_SHEETS", "TEMPORARY_TELEGRAM", "TEMPORARY_VERTEX"].includes(category)
    ? "RETRYABLE" : "FINAL";
}

