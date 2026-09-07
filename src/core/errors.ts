export type ErrorCategory =
  | "VALIDATION"
  | "CONFIGURATION"
  | "AUTHORIZATION"
  | "SCHEMA_MISMATCH"
  | "TRANSIENT_EXTERNAL"
  | "PERMANENT_EXTERNAL"
  | "CONFLICT"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    readonly category: ErrorCategory,
    message: string,
    readonly details?: Record<string, unknown>,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "AppError";
  }
}

export function toErrorRecord(error: unknown): Record<string, unknown> {
  if (error instanceof AppError) {
    return {
      name: error.name,
      category: error.category,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    };
  }
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { message: String(error) };
}
