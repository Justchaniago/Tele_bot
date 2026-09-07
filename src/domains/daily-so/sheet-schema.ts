import type { DailySoSkuId, StoreId } from "../../core/identifiers.js";
import type { DailySoColumn, DailySoTargetDescriptor } from "../../sheets/contract-types.js";

export const DAILY_SO_SHEET_NAME = "Sheet1";
export const DAILY_SO_COLUMNS: readonly DailySoColumn[] = Object.freeze([
  "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P",
  "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD",
  "AE", "AF"
]);

const dailyEntries: readonly DailySoTargetDescriptor[] = ([
  ["Y16_G1_MEDIUM_CUP", 8, "GONG CHA Y16 CUPS-G1 (MEDIUM)"],
  ["Y22_G1_LARGE_CUP", 9, "GONG CHA Y22 CUPS-G1 (LARGE)"],
  ["Y12_G1_SMALL_CUP", 10, "GONG CHA Y12 CUPS-G1 (SMALL)"],
  ["PAPER_CUP_16OZ", 11, "GONG CHA PAPER CUP - 16OZ"],
  ["RAISED_COVER", 12, "RAISED COVER"],
  ["PAPER_CUP_LID", 13, "GONG CHA PAPER CUP LID"],
  ["MILLAC_GOLD_1LT", 14, "WHIP CREAM - MILLAC GOLD 1LT "],
  ["FRESH_MILK_DIAMOND_946ML", 15, "FRESH MILK -  PLAIN DIAMOND 946ML"],
  ["Y16_LOCAL_MEDIUM_CUP", 16, "GONG CHA Y16 CUPS LOCAL (MEDIUM)"],
  ["HARRY_POTTER_CUP", 17, "HARRY POTTER CUP"]
] as const).map(([canonicalSkuId, row, expectedLabel]) => Object.freeze({
  canonicalSkuId: canonicalSkuId as DailySoSkuId,
  row,
  expectedLabel,
  expectedUom: "PCS" as const,
  labelColumn: "A" as const,
  uomColumn: "B" as const,
  writeColumns: DAILY_SO_COLUMNS
}));

function asMap(entries: readonly DailySoTargetDescriptor[]) {
  return Object.freeze(Object.fromEntries(entries.map(entry => [entry.canonicalSkuId, entry]))) as Readonly<Record<DailySoSkuId, DailySoTargetDescriptor>>;
}

const dailySoMap = asMap(dailyEntries);

export const DAILY_SO_SCHEMAS: Readonly<Record<StoreId, Readonly<Record<DailySoSkuId, DailySoTargetDescriptor>>>> = Object.freeze({
  PMS: dailySoMap,
  TP6: dailySoMap
});

export const DAILY_SO_SKU_COUNT = dailyEntries.length;

export function dayToColumn(day: number): DailySoColumn {
  if (!Number.isInteger(day) || day < 1 || day > DAILY_SO_COLUMNS.length) {
    throw new RangeError("Daily SO day must be an integer from 1 through 30");
  }
  return DAILY_SO_COLUMNS[day - 1];
}
