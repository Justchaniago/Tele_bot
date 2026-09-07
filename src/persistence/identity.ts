export function updateKey(botId: string, updateId: number): string {
  if (!botId.trim() || !Number.isSafeInteger(updateId) || updateId < 0) throw new Error("Invalid Telegram update identity");
  return `${botId}:${updateId}`;
}

export function blockRunId(key: string, blockIndex: number): string {
  if (!Number.isSafeInteger(blockIndex) || blockIndex < 0) throw new Error("Invalid command block index");
  return `${key}:block:${blockIndex}`;
}

