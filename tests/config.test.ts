import { describe, expect, it } from "vitest";
import { ConfigurationError, loadConfig } from "../src/config/env.js";

describe("loadConfig", () => {
  it("loads safe local defaults without external credentials", () => {
    expect(loadConfig({ NODE_ENV: "test" })).toMatchObject({
      nodeEnv: "test",
      port: 8080,
      logLevel: "info",
      gcpProjectId: undefined,
      runtimeServiceAccount: undefined
    });
  });

  it("validates port and log level", () => {
    expect(() => loadConfig({ PORT: "0" })).toThrow(ConfigurationError);
    expect(() => loadConfig({ LOG_LEVEL: "trace" })).toThrow(ConfigurationError);
  });

  it("rejects legacy Firestore project configuration", () => {
    expect(() => loadConfig({ GCP_PROJECT_ID: "legacy-project" })).toThrow("tele-auto-v2-prod");
  });

  it("requires worker token for production Cloud Tasks wakeup", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow("WORKER_AUTH_TOKEN");
    expect(loadConfig({ NODE_ENV: "production", WORKER_AUTH_TOKEN: "secret" }).workerAuthToken).toBe("secret");
  });
});
