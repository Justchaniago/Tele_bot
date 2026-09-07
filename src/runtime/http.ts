import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AppConfig } from "../config/env.js";
import { healthResponse } from "../app/health.js";
import type { Logger } from "../observability/logger.js";
import { IngestionService, WebhookAuthError, validateTelegramUpdate } from "../app/ingestion.js";
import type { WorkerService } from "../app/worker-service.js";

export type HttpRuntimeDependencies = { readonly ingestion?: Pick<IngestionService, "accept">; readonly worker?: Pick<WorkerService, "drain"> };

export function createHttpHandler(config: AppConfig, logger: Logger, dependencies: HttpRuntimeDependencies = {}) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    if (request.url === "/healthz" || request.url === "/readyz") {
      response.statusCode = 200;
      response.end(JSON.stringify(healthResponse(config)));
      return;
    }
    if (request.method === "POST" && request.url === "/telegram/webhook") {
      if (!config.telegramWebhookSecret || request.headers["x-telegram-bot-api-secret-token"] !== config.telegramWebhookSecret) { response.statusCode = 401; response.end(JSON.stringify({ status: "unauthorized" })); return; }
      if (!dependencies.ingestion) { response.statusCode = 503; response.end(JSON.stringify({ status: "ingestion_unavailable" })); return; }
      try { await dependencies.ingestion.accept(validateTelegramUpdate(await readJson(request))); response.statusCode = 200; response.end(JSON.stringify({ status: "accepted" })); }
      catch (error) { response.statusCode = error instanceof WebhookAuthError ? 403 : error instanceof Error && error.name === "WebhookInputError" ? 400 : 503; response.end(JSON.stringify({ status: response.statusCode === 503 ? "retryable_failure" : "rejected" })); }
      return;
    }
    if (request.method === "POST" && request.url === "/internal/worker/drain") {
      if (!config.workerAuthToken || request.headers["x-tele-auto-worker-token"] !== config.workerAuthToken) { response.statusCode = 401; response.end(JSON.stringify({ status: "unauthorized" })); return; }
      if (!dependencies.worker) { response.statusCode = 503; response.end(JSON.stringify({ status: "worker_unavailable" })); return; }
      try { const count = await dependencies.worker.drain(config.workerMaxRuns ?? 10); response.statusCode = 200; response.end(JSON.stringify({ status: "ok", processed: count })); }
      catch (error) { logger.error("Worker drain failed", error); response.statusCode = 503; response.end(JSON.stringify({ status: "retryable_failure" })); }
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ status: "not_found" }));
    logger.debug("HTTP route not found", { path: request.url });
  };
}

export function createHttpServer(config: AppConfig, logger: Logger, dependencies: HttpRuntimeDependencies = {}): Server {
  return createServer((request, response) => { void createHttpHandler(config, logger, dependencies)(request, response); });
}

export function startHttpServer(config: AppConfig, logger: Logger, dependencies: HttpRuntimeDependencies = {}): Server {
  const server = createHttpServer(config, logger, dependencies);
  server.listen(config.port, () => logger.info("V2 HTTP runtime listening", { port: config.port }));
  return server;
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => { let body = ""; request.setEncoding("utf8"); request.on("data", chunk => { body += chunk; if (body.length > 262144) reject(new Error("Request body too large")); }); request.on("end", () => { try { resolve(JSON.parse(body)); } catch { reject(new Error("Invalid JSON")); } }); request.on("error", reject); });
}
