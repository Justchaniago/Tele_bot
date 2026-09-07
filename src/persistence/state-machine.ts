import type { RunStatus } from "./durable-types.js";

const allowed: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  RECEIVED: ["PARSED", "NEEDS_CLARIFICATION", "FAILED_RETRYABLE", "FAILED_FINAL", "REJECTED"],
  PARSED: ["PLANNED", "NEEDS_CLARIFICATION", "FAILED_FINAL", "REJECTED"],
  NEEDS_CLARIFICATION: ["PARSED", "FAILED_FINAL", "REJECTED"],
  PLANNED: ["READY", "AWAITING_CONFIRMATION", "NEEDS_CLARIFICATION", "COMPLETED", "FAILED_FINAL", "REJECTED"],
  AWAITING_CONFIRMATION: ["READY", "FAILED_FINAL"],
  READY: ["EXECUTING", "COMPLETED", "FAILED_FINAL"],
  EXECUTING: ["COMPLETED", "EFFECT_UNCERTAIN", "FAILED_RETRYABLE", "FAILED_FINAL"],
  EFFECT_UNCERTAIN: ["READY", "EXECUTING", "COMPLETED", "FAILED_FINAL"],
  COMPLETED: [],
  FAILED_RETRYABLE: ["READY", "FAILED_FINAL"],
  FAILED_FINAL: [],
  REJECTED: []
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return allowed[from].includes(to);
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) throw new Error(`Illegal run transition: ${from} -> ${to}`);
}
