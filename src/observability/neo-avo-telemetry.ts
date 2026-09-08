import type { Logger } from "./logger.js";

export type TeleAutoEventType =
  | "tele_auto.run.received"
  | "tele_auto.run.processing"
  | "tele_auto.run.needs_clarification"
  | "tele_auto.run.awaiting_confirmation"
  | "tele_auto.run.completed"
  | "tele_auto.run.failed"
  | "tele_auto.run.effect_uncertain"
  | "tele_auto.worker.recovery"
  | "tele_auto.telegram.delivery_failed"
  | "tele_auto.sheets.schema_mismatch";

export type TelemetryEvent = {
  readonly eventId: string;
  readonly type: TeleAutoEventType;
  readonly occurredAt?: Date;
  readonly runId?: string;
  readonly store?: "PMS" | "TP6";
  readonly domain?: "PRODUCTION" | "WASTE" | "DAILY_SO";
  readonly status?: string;
  readonly severity?: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  readonly executionPhase?: string;
  readonly errorCode?: string;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
};

export type OperationalTelemetry = {
  emit(event: TelemetryEvent): Promise<void>;
};

export type NeoAvoTelemetryConfig = {
  readonly enabled: boolean;
  readonly baseUrl?: string;
  readonly projectId: string;
  readonly environment: string;
  readonly apiToken?: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
};

/** Non-authoritative Tele Auto -> Neo AVO event transport. */
export class NeoAvoTelemetry implements OperationalTelemetry {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: NeoAvoTelemetryConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async emit(event: TelemetryEvent): Promise<void> {
    if (!this.config.enabled) return;
    if (!this.config.baseUrl || !this.config.apiToken) throw new Error("Neo AVO telemetry is enabled but not configured");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}/api/v1/events`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.apiToken}`,
            "x-neo-avo-environment": this.config.environment
          },
          body: JSON.stringify({ events: [toCanonicalEvent(event, this.config.projectId, this.config.environment)] }),
          signal: controller.signal
        });
        if (response.ok) return;
        if (!retryableStatus(response.status) || attempt === 1) throw new Error(`Neo AVO telemetry rejected (${response.status})`);
      } catch (error) {
        if (attempt === 1 || !retryableTransportError(error)) throw error;
      } finally {
        clearTimeout(timer);
      }
    }
  }
}

export function createNoopTelemetry(): OperationalTelemetry {
  return { emit: async () => undefined };
}

/** Fire-and-forget telemetry with bounded provider work and no business coupling. */
export function emitTelemetrySafely(telemetry: OperationalTelemetry | undefined, event: TelemetryEvent, logger?: Logger): void {
  if (!telemetry) return;
  void telemetry.emit(event).catch(() => {
    logger?.warn("Neo AVO telemetry delivery failed", {
      eventId: event.eventId,
      eventType: event.type,
      outcome: "DELIVERY_FAILED"
    });
  });
}

export function stableTelemetryEventId(subjectId: string, eventType: TeleAutoEventType, version: number): string {
  return `tele-auto:${subjectId}:${eventType}:${version}`;
}

function toCanonicalEvent(event: TelemetryEvent, projectId: string, environment: string) {
  return {
    schemaVersion: 1,
    eventId: event.eventId,
    projectId,
    environment,
    type: event.type,
    occurredAt: (event.occurredAt ?? new Date()).toISOString(),
    data: {
      ...(event.runId ? { runId: event.runId } : {}),
      ...(event.store ? { store: event.store } : {}),
      ...(event.domain ? { domain: event.domain } : {}),
      ...(event.status ? { status: event.status } : {}),
      ...(event.severity ? { severity: event.severity } : {}),
      ...(event.executionPhase ? { executionPhase: event.executionPhase } : {}),
      ...(event.errorCode ? { errorCode: event.errorCode } : {}),
      ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
      ...(event.metadata ? { metadata: event.metadata } : {})
    }
  };
}

function retryableStatus(status: number): boolean { return status === 429 || status >= 500; }
function retryableTransportError(error: unknown): boolean { return error instanceof Error && (error.name === "AbortError" || error.name === "TypeError" || error.message === "provider unavailable" || error.message === "network timeout"); }
