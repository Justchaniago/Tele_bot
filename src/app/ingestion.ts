import type { AppConfig } from "../config/env.js";
import type { StoreId } from "../core/identifiers.js";
import { segmentCommandBlocks } from "../parsing/parser.js";
import type { DurableStateRepository } from "../persistence/repository.js";
import type { AcceptUpdateInput, BlockRunSeed } from "../persistence/durable-types.js";
import type { WorkerWakeup } from "../runtime/worker-wakeup.js";
import { emitTelemetrySafely, stableTelemetryEventId, type OperationalTelemetry } from "../observability/neo-avo-telemetry.js";

export class WebhookInputError extends Error { constructor(message: string) { super(message); this.name = "WebhookInputError"; } }
export class WebhookAuthError extends Error { constructor(message: string) { super(message); this.name = "WebhookAuthError"; } }

type TelegramMessage = { readonly message_id?: number; readonly chat?: { readonly id?: number | string }; readonly from?: { readonly id?: number | string }; readonly text?: string };

export type TelegramUpdate = {
  readonly update_id: number;
  readonly message?: TelegramMessage;
  readonly edited_message?: TelegramMessage;
  readonly callback_query?: { readonly id?: string; readonly from?: { readonly id?: number | string }; readonly message?: { readonly message_id?: number; readonly chat?: { readonly id?: number | string } }; readonly data?: string };
};

export class IngestionService {
  constructor(private readonly repository: DurableStateRepository, private readonly config: AppConfig, private readonly now = () => new Date(), private readonly wakeup?: WorkerWakeup, private readonly telemetry?: OperationalTelemetry) {}

  async accept(update: TelegramUpdate): Promise<void> {
    const telegramMessage = update.message ?? update.edited_message;
    const identity = telegramMessage
      ? { chat: telegramMessage.chat?.id, user: telegramMessage.from?.id, message: telegramMessage.message_id, text: telegramMessage.text }
      : { chat: update.callback_query?.message?.chat?.id, user: update.callback_query?.from?.id, message: update.callback_query?.message?.message_id, text: undefined };
    if (identity.chat === undefined || identity.user === undefined) throw new WebhookInputError("Telegram update lacks trusted chat/user identity");
    const chatId = String(identity.chat); const userId = String(identity.user);
    const store = this.config.trustedTelegramChats?.[chatId];
    if (!store) throw new WebhookAuthError("Telegram chat is not configured");
    const input: AcceptUpdateInput = { botId: this.config.telegramBotId ?? "tele-auto-v2", updateId: update.update_id, chatId, userId, messageId: identity.message === undefined ? undefined : String(identity.message), receivedAt: this.now() };
    const seeds: BlockRunSeed[] = [];
    if (identity.text) for (const [blockIndex, block] of segmentCommandBlocks(identity.text).entries()) seeds.push({ blockIndex, store, domain: block.domain, rawBlockBody: block.body, initialStatus: "RECEIVED", decision: { status: "REQUIRES_CLARIFICATION", reasons: ["RECEIVED"] }, now: this.now() });
    const accepted = await this.repository.acceptUpdate(input, seeds);
    for (const seed of seeds) {
      const runId = `${accepted.updateKey}:block:${seed.blockIndex}`;
      emitTelemetrySafely(this.telemetry, {
        eventId: stableTelemetryEventId(runId, "tele_auto.run.received", 0),
        type: "tele_auto.run.received", occurredAt: seed.now, runId,
        store: seed.store, domain: seed.domain, status: "RECEIVED", severity: "INFO"
      });
    }
    const callback = update.callback_query?.data?.match(/^tele_auto_(confirm|clarify):(.+)$/);
    if (callback) {
      const interaction = { runId: callback[2], chatId, userId, now: this.now() };
      const result = callback[1] === "confirm"
        ? await this.repository.confirm(interaction)
        : await this.repository.clarify(interaction);
      if (callback[1] === "confirm" && (result.status === "ACCEPTED" || result.status === "ALREADY_ACCEPTED")) {
        if (this.wakeup) await this.wakeup.enqueue(accepted.updateKey);
      }
      return;
    }
    if (this.wakeup) await this.wakeup.enqueue(accepted.updateKey);
  }
}

export function validateTelegramUpdate(value: unknown): TelegramUpdate {
  if (!value || typeof value !== "object") throw new WebhookInputError("Telegram update must be an object");
  const update = value as Partial<TelegramUpdate>;
  if (!Number.isSafeInteger(update.update_id) || update.update_id! < 0) throw new WebhookInputError("Telegram update_id is invalid");
  if (!update.message && !update.edited_message && !update.callback_query) throw new WebhookInputError("Unsupported Telegram update");
  return update as TelegramUpdate;
}
