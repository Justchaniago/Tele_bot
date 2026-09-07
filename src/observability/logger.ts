import type { LogLevel } from "../config/env.js";
import { toErrorRecord } from "../core/errors.js";

const rank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const secretKey = /(token|secret|password|private.?key|credential|authorization)/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      secretKey.test(key) ? "[REDACTED]" : sanitize(item)
    ]));
  }
  return value;
}

export type Logger = {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: unknown, context?: Record<string, unknown>): void;
};

export function createLogger(level: LogLevel, write = (line: string) => console.log(line)): Logger {
  const emit = (current: LogLevel, message: string, context?: Record<string, unknown>) => {
    if (rank[current] < rank[level]) return;
    const safeContext = sanitize(context ?? {}) as Record<string, unknown>;
    write(JSON.stringify({
      time: new Date().toISOString(),
      level: current,
      message,
      ...safeContext
    }));
  };
  return {
    debug: (message, context) => emit("debug", message, context),
    info: (message, context) => emit("info", message, context),
    warn: (message, context) => emit("warn", message, context),
    error: (message, error, context) => emit("error", message, {
      ...(context ?? {}),
      error: error ? toErrorRecord(error) : undefined
    })
  };
}
