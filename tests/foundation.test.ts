import { describe, expect, it } from "vitest";
import { healthResponse } from "../src/app/health.js";
import { AppError, toErrorRecord } from "../src/core/errors.js";
import { createLogger } from "../src/observability/logger.js";

describe("V2 foundation", () => {
  it("returns process health without checking external services", () => {
    expect(healthResponse({ nodeEnv: "test", port: 8080, logLevel: "info" })).toEqual({
      status: "ok",
      service: "tele-auto-v2",
      environment: "test"
    });
  });

  it("serializes application errors", () => {
    expect(toErrorRecord(new AppError("SCHEMA_MISMATCH", "schema mismatch", { row: 10 }))).toMatchObject({
      category: "SCHEMA_MISMATCH",
      message: "schema mismatch"
    });
  });

  it("redacts secret-shaped logger fields", () => {
    const lines: string[] = [];
    createLogger("debug", line => lines.push(line)).info("config", {
      token: "secret-value",
      safe: "visible"
    });
    expect(lines[0]).not.toContain("secret-value");
    expect(lines[0]).toContain("[REDACTED]");
    expect(lines[0]).toContain("visible");
  });
});
