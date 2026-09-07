import type { AppConfig } from "../config/env.js";

export type HealthResponse = {
  status: "ok";
  service: "tele-auto-v2";
  environment: AppConfig["nodeEnv"];
};

export function healthResponse(config: AppConfig): HealthResponse {
  return { status: "ok", service: "tele-auto-v2", environment: config.nodeEnv };
}
