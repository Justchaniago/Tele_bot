export interface TelegramNotifier {
  send(chatId: string, text: string): Promise<string | void>;
  edit?(chatId: string, messageId: string, text: string): Promise<void>;
}
export class TelegramDeliveryError extends Error { constructor(message: string, readonly classification: "RETRYABLE" | "FINAL" = "RETRYABLE") { super(message); this.name = "TelegramDeliveryError"; } }
export class TelegramApiNotifier implements TelegramNotifier {
  constructor(private readonly token: string) {}
  async send(chatId: string, text: string): Promise<string | void> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }) });
      if (!response.ok) throw new TelegramDeliveryError(`Telegram delivery failed (${response.status})`, response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404 ? "FINAL" : "RETRYABLE");
      const payload = await response.json() as { readonly ok?: boolean; readonly result?: { readonly message_id?: number } };
      return payload.result?.message_id === undefined ? undefined : String(payload.result.message_id);
    } catch (error) {
      if (error instanceof TelegramDeliveryError) throw error;
      throw new TelegramDeliveryError("Telegram transport failed", "RETRYABLE");
    }
  }

  async edit(chatId: string, messageId: string, text: string): Promise<void> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/editMessageText`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }) });
      if (!response.ok) throw new TelegramDeliveryError(`Telegram edit failed (${response.status})`, response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404 ? "FINAL" : "RETRYABLE");
    } catch (error) {
      if (error instanceof TelegramDeliveryError) throw error;
      throw new TelegramDeliveryError("Telegram edit transport failed", "RETRYABLE");
    }
  }
}
