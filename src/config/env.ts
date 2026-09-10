export type NodeEnvironment = "development" | "test" | "production";
export type LogLevel = "debug" | "info" | "warn" | "error";
export const V2_GCP_PROJECT_ID = "cluster-01-core-prod" as const;
export const V2_FIRESTORE_DATABASE_ID = "(default)" as const;
export const V2_FIRESTORE_LOCATION = "asia-southeast2" as const;
export const V2_RUNTIME_SERVICE_ACCOUNT = "tele-auto-runtime@cluster-01-core-prod.iam.gserviceaccount.com" as const;
export const V2_VERTEX_AI_LOCATION = "global" as const;
export const V2_VERTEX_AI_MODEL = "gemini-3.1-flash-lite" as const;
export const NEO_AVO_PROJECT_ID = "tele-auto" as const;
export const NEO_AVO_ENVIRONMENT = "production" as const;

export type AppConfig = {
  nodeEnv: NodeEnvironment;
  port: number;
  logLevel: LogLevel;
  gcpProjectId?: string;
  runtimeServiceAccount?: string;
  firestoreProjectId?: typeof V2_GCP_PROJECT_ID;
  firestoreDatabaseId?: typeof V2_FIRESTORE_DATABASE_ID;
  firestoreLocation?: typeof V2_FIRESTORE_LOCATION;
  telegramBotId?: string;
  telegramBotToken?: string;
  telegramWebhookSecret?: string;
  workerAuthToken?: string;
  trustedTelegramChats?: Readonly<Record<string, "PMS" | "TP6">>;
  workerMaxRuns?: number;
  executionLeaseMs?: number;
  workerWakeupEnabled?: boolean;
  cloudTasksProjectId?: typeof V2_GCP_PROJECT_ID;
  cloudTasksLocation?: typeof V2_FIRESTORE_LOCATION;
  cloudTasksQueue?: string;
  workerTargetUrl?: string;
  vertexAiProjectId?: typeof V2_GCP_PROJECT_ID;
  vertexAiLocation?: typeof V2_VERTEX_AI_LOCATION;
  vertexAiModel?: typeof V2_VERTEX_AI_MODEL;
  vertexAiTimeoutMs?: number;
  neoAvoEnabled?: boolean;
  neoAvoBaseUrl?: string;
  neoAvoProjectId?: typeof NEO_AVO_PROJECT_ID;
  neoAvoEnvironment?: typeof NEO_AVO_ENVIRONMENT;
  neoAvoApiToken?: string;
  neoAvoTimeoutMs?: number;
};

export class ConfigurationError extends Error {
  readonly code = "CONFIGURATION";
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

const levels = new Set<LogLevel>(["debug", "info", "warn", "error"]);
const environments = new Set<NodeEnvironment>(["development", "test", "production"]);

function optionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value?.trim() || fallback);
  if (!Number.isInteger(parsed) || parsed < 1) throw new ConfigurationError(`${name} must be a positive integer`);
  return parsed;
}

function booleanValue(value: string | undefined, fallback: boolean): boolean { return value === undefined ? fallback : value.trim().toLowerCase() === "true"; }

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = (env.NODE_ENV?.trim() || "development") as NodeEnvironment;
  if (!environments.has(nodeEnv)) {
    throw new ConfigurationError("NODE_ENV must be development, test, or production");
  }

  const rawPort = env.PORT?.trim() || "8080";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError("PORT must be an integer between 1 and 65535");
  }

  const logLevel = (env.LOG_LEVEL?.trim() || "info") as LogLevel;
  if (!levels.has(logLevel)) {
    throw new ConfigurationError("LOG_LEVEL must be debug, info, warn, or error");
  }

  const configuredProject = optionalString(env.GCP_PROJECT_ID);
  if (configuredProject && configuredProject !== V2_GCP_PROJECT_ID) {
    throw new ConfigurationError(`GCP_PROJECT_ID must be ${V2_GCP_PROJECT_ID} for Tele Auto v2`);
  }
  const configuredRuntimeAccount = optionalString(env.GCP_RUNTIME_SERVICE_ACCOUNT);
  if (configuredRuntimeAccount && configuredRuntimeAccount !== V2_RUNTIME_SERVICE_ACCOUNT) {
    throw new ConfigurationError(`GCP_RUNTIME_SERVICE_ACCOUNT must be ${V2_RUNTIME_SERVICE_ACCOUNT} for Tele Auto v2`);
  }

  const telegramBotId = optionalString(env.TELEGRAM_BOT_ID) || "tele-auto-v2";
  const chats: Record<string, "PMS" | "TP6"> = {};
  const pmsChat = optionalString(env.TELEGRAM_CHAT_ID_PMS);
  const tp6Chat = optionalString(env.TELEGRAM_CHAT_ID_TP6);
  if (pmsChat) chats[pmsChat] = "PMS";
  if (tp6Chat) {
    if (chats[tp6Chat] && chats[tp6Chat] !== "TP6") throw new ConfigurationError("Telegram chat cannot map to multiple stores");
    chats[tp6Chat] = "TP6";
  }

  const workerWakeupEnabled = booleanValue(env.WORKER_WAKEUP_ENABLED, true);
  if (nodeEnv === "production" && !workerWakeupEnabled) throw new ConfigurationError("WORKER_WAKEUP_ENABLED must remain enabled in production");
  const workerAuthToken = optionalString(env.WORKER_AUTH_TOKEN);
  if (nodeEnv === "production" && workerWakeupEnabled && !workerAuthToken) throw new ConfigurationError("WORKER_AUTH_TOKEN is required when Cloud Tasks wakeup is enabled");
  const vertexAiProjectId = optionalString(env.VERTEX_AI_PROJECT_ID);
  if (vertexAiProjectId && vertexAiProjectId !== V2_GCP_PROJECT_ID) throw new ConfigurationError(`VERTEX_AI_PROJECT_ID must be ${V2_GCP_PROJECT_ID} for Tele Auto v2`);
  const vertexAiLocation = optionalString(env.VERTEX_AI_LOCATION);
  if (vertexAiLocation && vertexAiLocation !== V2_VERTEX_AI_LOCATION) throw new ConfigurationError(`VERTEX_AI_LOCATION must be ${V2_VERTEX_AI_LOCATION} for Tele Auto v2`);
  const vertexAiModel = optionalString(env.VERTEX_AI_MODEL);
  if (vertexAiModel && vertexAiModel !== V2_VERTEX_AI_MODEL) throw new ConfigurationError(`VERTEX_AI_MODEL must be ${V2_VERTEX_AI_MODEL} for Tele Auto v2`);
  const neoAvoEnabled = booleanValue(env.NEO_AVO_ENABLED, false);
  const neoAvoBaseUrl = optionalString(env.NEO_AVO_BASE_URL);
  const neoAvoProjectId = optionalString(env.NEO_AVO_PROJECT_ID);
  if (neoAvoProjectId && neoAvoProjectId !== NEO_AVO_PROJECT_ID) throw new ConfigurationError(`NEO_AVO_PROJECT_ID must be ${NEO_AVO_PROJECT_ID}`);
  const neoAvoEnvironment = optionalString(env.NEO_AVO_ENVIRONMENT);
  if (neoAvoEnvironment && neoAvoEnvironment !== NEO_AVO_ENVIRONMENT) throw new ConfigurationError(`NEO_AVO_ENVIRONMENT must be ${NEO_AVO_ENVIRONMENT}`);
  const neoAvoApiToken = optionalString(env.NEO_AVO_API_TOKEN);
  if (nodeEnv === "production" && neoAvoEnabled && (!neoAvoBaseUrl || !neoAvoApiToken)) throw new ConfigurationError("NEO_AVO_BASE_URL and NEO_AVO_API_TOKEN are required when Neo AVO telemetry is enabled");
  return {
    nodeEnv,
    port,
    logLevel,
    gcpProjectId: configuredProject,
    runtimeServiceAccount: configuredRuntimeAccount,
    firestoreProjectId: V2_GCP_PROJECT_ID,
    firestoreDatabaseId: V2_FIRESTORE_DATABASE_ID,
    firestoreLocation: V2_FIRESTORE_LOCATION,
    telegramBotId,
    telegramBotToken: optionalString(env.TELEGRAM_BOT_TOKEN),
    telegramWebhookSecret: optionalString(env.TELEGRAM_WEBHOOK_SECRET),
    workerAuthToken,
    trustedTelegramChats: Object.freeze(chats),
    workerMaxRuns: positiveInteger(env.WORKER_MAX_RUNS, 10, "WORKER_MAX_RUNS"),
    executionLeaseMs: positiveInteger(env.EXECUTION_LEASE_MS, 60000, "EXECUTION_LEASE_MS"),
    workerWakeupEnabled,
    cloudTasksProjectId: V2_GCP_PROJECT_ID,
    cloudTasksLocation: V2_FIRESTORE_LOCATION,
    cloudTasksQueue: optionalString(env.CLOUD_TASKS_QUEUE),
    workerTargetUrl: optionalString(env.WORKER_TARGET_URL),
    vertexAiProjectId: V2_GCP_PROJECT_ID,
    vertexAiLocation: V2_VERTEX_AI_LOCATION,
    vertexAiModel: V2_VERTEX_AI_MODEL,
    vertexAiTimeoutMs: positiveInteger(env.VERTEX_AI_TIMEOUT_MS, 8000, "VERTEX_AI_TIMEOUT_MS"),
    neoAvoEnabled,
    neoAvoBaseUrl,
    neoAvoProjectId: NEO_AVO_PROJECT_ID,
    neoAvoEnvironment: NEO_AVO_ENVIRONMENT,
    neoAvoApiToken,
    neoAvoTimeoutMs: positiveInteger(env.NEO_AVO_TIMEOUT_MS, 1000, "NEO_AVO_TIMEOUT_MS")
  };
}
