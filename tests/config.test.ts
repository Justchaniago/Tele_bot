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
    expect(() => loadConfig({ GCP_PROJECT_ID: "legacy-project" })).toThrow("cluster-01-core-prod");
  });

  it("requires worker token for production Cloud Tasks wakeup", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow("WORKER_AUTH_TOKEN");
    expect(loadConfig({ NODE_ENV: "production", WORKER_AUTH_TOKEN: "secret" }).workerAuthToken).toBe("secret");
  });

  it("requires complete Neo AVO configuration when telemetry is enabled", () => {
    expect(() => loadConfig({ NODE_ENV: "production", WORKER_AUTH_TOKEN: "worker", NEO_AVO_ENABLED: "true" })).toThrow("NEO_AVO_BASE_URL");
    expect(loadConfig({ NODE_ENV: "production", WORKER_AUTH_TOKEN: "worker", NEO_AVO_ENABLED: "true", NEO_AVO_BASE_URL: "https://neo.example", NEO_AVO_API_TOKEN: "project-token" })).toMatchObject({
      neoAvoEnabled: true, neoAvoBaseUrl: "https://neo.example", neoAvoProjectId: "tele-auto", neoAvoEnvironment: "production"
    });
  });
});
