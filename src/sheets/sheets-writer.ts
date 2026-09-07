import type { MutationEffect } from "../domains/business-types.js";
import type { SheetsReadApi } from "./sheets-reader.js";
import { assertAllowlistedTarget } from "./schema-guard.js";

export class SheetsWriteError extends Error {
  constructor(readonly classification: "RETRYABLE" | "FINAL" | "UNCERTAIN", message: string, readonly externalMutationOccurred: boolean, options?: ErrorOptions) { super(message, options); this.name = "SheetsWriteError"; }
}

type SheetsWriteApi = SheetsReadApi & {
  readonly spreadsheets: SheetsReadApi["spreadsheets"] & {
    readonly values: SheetsReadApi["spreadsheets"]["values"] & {
      readonly batchUpdate: (params: { readonly spreadsheetId: string; readonly requestBody: { readonly valueInputOption: "RAW"; readonly data: readonly { readonly range: string; readonly values: readonly (readonly unknown[])[] }[] } }) => Promise<unknown>;
      readonly batchClear: (params: { readonly spreadsheetId: string; readonly requestBody: { readonly ranges: readonly string[] } }) => Promise<unknown>;
    };
  };
};

export class SheetsWriter {
  constructor(private readonly api: SheetsWriteApi) {}

  async writeEffects(effects: readonly MutationEffect[]): Promise<void> {
    for (const effect of effects) assertAllowlistedTarget(effect.target);
    const workbookIds = new Set(effects.map(effect => effect.target.spreadsheetId));
    if (workbookIds.size > 1) {
      throw new SheetsWriteError("FINAL", "One business execution must target one workbook", false);
    }
    const sets = effects.filter(effect => effect.operation === "SET");
    const clears = effects.filter(effect => effect.operation === "CLEAR");
    let externalMutationOccurred = false;
    try {
      for (const group of groups(sets)) {
        await this.api.spreadsheets.values.batchUpdate({ spreadsheetId: group.spreadsheetId, requestBody: { valueInputOption: "RAW", data: group.effects.map(effect => ({ range: address(effect), values: [[effect.desiredValue]] })) } });
        externalMutationOccurred = true;
      }
      for (const group of groups(clears)) {
        await this.api.spreadsheets.values.batchClear({ spreadsheetId: group.spreadsheetId, requestBody: { ranges: group.effects.map(address) } });
        externalMutationOccurred = true;
      }
    } catch (error) {
      throw new SheetsWriteError(externalMutationOccurred ? "UNCERTAIN" : writeClassification(error), "Google Sheets mutation failed", externalMutationOccurred, { cause: error as Error });
    }
  }
}

function address(effect: MutationEffect): string { return `'${effect.target.sheetName.replace(/'/g, "''")}'!${effect.target.column}${effect.target.row}`; }
function groups(effects: readonly MutationEffect[]): readonly { readonly spreadsheetId: string; readonly effects: readonly MutationEffect[] }[] {
  const map = new Map<string, MutationEffect[]>();
  for (const effect of effects) { const list = map.get(effect.target.spreadsheetId) ?? []; list.push(effect); map.set(effect.target.spreadsheetId, list); }
  return [...map.entries()].map(([spreadsheetId, grouped]) => ({ spreadsheetId, effects: grouped }));
}
function writeClassification(error: unknown): "RETRYABLE" | "FINAL" | "UNCERTAIN" {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 400 || status === 401 || status === 403 || status === 404) return "FINAL";
  if (status === 429 || (typeof status === "number" && status >= 500) || ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"].includes((error as NodeJS.ErrnoException)?.code ?? "")) return "UNCERTAIN";
  return "UNCERTAIN";
}
