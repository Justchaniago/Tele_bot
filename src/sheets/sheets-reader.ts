import { assertAllowlistedTarget, validateDailySoObservation, validateProductionWasteObservation } from "./schema-guard.js";
import type { DailySoObservation, ProductionWasteObservation, SheetWriteTarget } from "./contract-types.js";
import type { StoreId } from "../core/identifiers.js";
import { WORKBOOKS } from "./workbook-registry.js";
import type { MutationEffect, MutationPlan } from "../domains/business-types.js";

export type SheetsReadApi = {
  readonly spreadsheets: {
    readonly get: (params: { spreadsheetId: string; fields?: string }) => Promise<{ readonly data: { readonly sheets?: readonly { readonly properties?: { readonly title?: string; readonly hidden?: boolean } }[] } }>;
    readonly values: {
      readonly batchGet: (params: { spreadsheetId: string; ranges: readonly string[]; valueRenderOption?: string }) => Promise<{ readonly data: { readonly valueRanges?: readonly { readonly values?: readonly (readonly unknown[])[] }[] } }>;
    };
  };
};

export class SheetsReadError extends Error {
  constructor(readonly classification: "RETRYABLE" | "FINAL", message: string, options?: ErrorOptions) { super(message, options); this.name = "SheetsReadError"; }
}

export class SheetsReader {
  constructor(private readonly api: SheetsReadApi) {}

  async listSheetNames(store: StoreId, domain: "PRODUCTION" | "WASTE" | "DAILY_SO"): Promise<readonly string[]> {
    const spreadsheetId = domain === "DAILY_SO" ? WORKBOOKS[store].dailySo : WORKBOOKS[store].productionWaste;
    try {
      const result = await this.api.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(title,hidden))" });
      return (result.data.sheets ?? []).map(sheet => sheet.properties?.title).filter((title): title is string => Boolean(title));
    } catch (error) { throw new SheetsReadError(classification(error), "Failed to read spreadsheet tabs", { cause: error as Error }); }
  }

  async readEffectCurrent(effect: MutationEffect): Promise<unknown> {
    return this.readTargetCurrent(effect.target);
  }

  async readTargetCurrent(target: SheetWriteTarget): Promise<unknown> {
    const result = target.domain === "DAILY_SO"
      ? await this.readDailySoTarget(target)
      : await this.readProductionWasteTarget(target);
    return result.value;
  }

  async readProductionWasteTarget(target: SheetWriteTarget): Promise<{ readonly value: unknown; readonly observation: ProductionWasteObservation }> {
    assertAllowlistedTarget(target);
    const ranges = [cell(target.sheetName, target.assertions.markerCell as string), cell(target.sheetName, target.assertions.codeCell as string), cell(target.sheetName, target.assertions.labelCell as string), cell(target.sheetName, `${target.column}${target.row}`)];
    try {
      const response = await this.api.spreadsheets.values.batchGet({ spreadsheetId: target.spreadsheetId, ranges, valueRenderOption: "UNFORMATTED_VALUE" });
      const values = response.data.valueRanges ?? [];
      const observation: ProductionWasteObservation = {
        spreadsheetId: target.spreadsheetId, sheetName: target.sheetName,
        markerCell: target.assertions.markerCell as string, markerValue: String(scalar(values[0])),
        codeCell: target.assertions.codeCell as string, codeValue: String(scalar(values[1])),
        labelCell: target.assertions.labelCell as string, labelValue: String(scalar(values[2])),
        targetCell: `${target.column}${target.row}`, targetColumn: target.column
      };
      validateProductionWasteObservation(target, observation);
      return { value: scalar(values[3], null), observation };
    } catch (error) {
      if (error instanceof SheetsReadError) throw error;
      if (error instanceof Error && error.name === "AppError") throw error;
      throw new SheetsReadError(classification(error), "Failed to read Production/Waste target", { cause: error as Error });
    }
  }

  async readDailySoTarget(target: SheetWriteTarget): Promise<{ readonly value: unknown; readonly observation: DailySoObservation }> {
    assertAllowlistedTarget(target);
    const ranges = [cell(target.sheetName, "B3"), cell(target.sheetName, "A6"), cell(target.sheetName, "C6"), cell(target.sheetName, target.assertions.labelCell as string), cell(target.sheetName, target.assertions.uomCell as string), cell(target.sheetName, target.assertions.dayHeaderCell as string), cell(target.sheetName, `${target.column}${target.row}`)];
    try {
      const response = await this.api.spreadsheets.values.batchGet({ spreadsheetId: target.spreadsheetId, ranges, valueRenderOption: "UNFORMATTED_VALUE" });
      const values = response.data.valueRanges ?? [];
      const observation: DailySoObservation = {
        spreadsheetId: target.spreadsheetId, sheetName: target.sheetName,
        storeMarkerValue: String(scalar(values[0])), productHeaderValue: String(scalar(values[1])), quantityHeaderValue: String(scalar(values[2])),
        labelCell: target.assertions.labelCell as string, labelValue: String(scalar(values[3])),
        uomCell: target.assertions.uomCell as string, uomValue: String(scalar(values[4])),
        dayHeaderCell: target.assertions.dayHeaderCell as string, dayHeaderValue: Number(scalar(values[5])),
        targetCell: `${target.column}${target.row}`, targetColumn: target.column
      };
      validateDailySoObservation(target, observation);
      return { value: scalar(values[6], null), observation };
    } catch (error) {
      if (error instanceof SheetsReadError) throw error;
      if (error instanceof Error && error.name === "AppError") throw error;
      throw new SheetsReadError(classification(error), "Failed to read Daily SO target", { cause: error as Error });
    }
  }

  async readPlanCurrentValues(plan: MutationPlan): Promise<Readonly<Record<string, unknown>>> {
    const values: Record<string, unknown> = {};
    for (const effect of plan.effects) values[effect.canonicalSkuId] = await this.readEffectCurrent(effect);
    return values;
  }
}

function cell(sheetName: string, address: string): string { return `'${sheetName.replace(/'/g, "''")}'!${address}`; }
function scalar(valueRange: { readonly values?: readonly (readonly unknown[])[] } | undefined, fallback: unknown = ""): unknown { return valueRange?.values?.[0]?.[0] ?? fallback; }
function classification(error: unknown): "RETRYABLE" | "FINAL" {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 429 || (typeof status === "number" && status >= 500) || ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"].includes((error as NodeJS.ErrnoException)?.code ?? "") ? "RETRYABLE" : "FINAL";
}
