import { AppError } from "../core/errors.js";
import type { CanonicalSkuId, DailySoSkuId, DomainId, ProductionWasteSkuId, StoreId } from "../core/identifiers.js";
import { DAILY_SO_SCHEMAS, DAILY_SO_SHEET_NAME, dayToColumn } from "../domains/daily-so/sheet-schema.js";
import { PRODUCTION_SCHEMAS } from "../domains/production/sheet-schema.js";
import { WASTE_SCHEMAS } from "../domains/waste/sheet-schema.js";
import type { SheetWriteTarget } from "./contract-types.js";
import { WORKBOOKS } from "./workbook-registry.js";

function fail(message: string): never {
  throw new AppError("VALIDATION", message);
}

function requireSheetName(sheetName: string): string {
  if (!sheetName.trim()) fail("A pre-resolved sheet name is required");
  return sheetName;
}

export function resolveProductionTarget(input: {
  store: StoreId;
  sku: ProductionWasteSkuId;
  sheetName: string;
}): SheetWriteTarget {
  const descriptor = PRODUCTION_SCHEMAS[input.store]?.[input.sku];
  if (!descriptor) fail("Unknown Production store or canonical SKU");
  const sheetName = requireSheetName(input.sheetName);
  return {
    store: input.store,
    domain: "PRODUCTION",
    spreadsheetId: WORKBOOKS[input.store].productionWaste,
    sheetName,
    row: descriptor.row,
    column: descriptor.writeColumn,
    canonicalSkuId: descriptor.canonicalSkuId,
    assertions: {
      markerCell: descriptor.section.markerCell,
      markerValue: descriptor.section.expectedValue,
      codeCell: `A${descriptor.row}`,
      expectedProductCode: descriptor.expectedProductCode,
      labelCell: `B${descriptor.row}`,
      expectedLabel: descriptor.expectedLabel,
      allowedColumn: descriptor.writeColumn
    }
  };
}

export function resolveWasteTarget(input: {
  store: StoreId;
  sku: ProductionWasteSkuId;
  sheetName: string;
}): SheetWriteTarget {
  const descriptor = WASTE_SCHEMAS[input.store]?.[input.sku];
  if (!descriptor) fail("Unknown Waste store or canonical SKU");
  const sheetName = requireSheetName(input.sheetName);
  return {
    store: input.store,
    domain: "WASTE",
    spreadsheetId: WORKBOOKS[input.store].productionWaste,
    sheetName,
    row: descriptor.row,
    column: descriptor.writeColumn,
    canonicalSkuId: descriptor.canonicalSkuId,
    assertions: {
      markerCell: descriptor.section.markerCell,
      markerValue: descriptor.section.expectedValue,
      codeCell: `A${descriptor.row}`,
      expectedProductCode: descriptor.expectedProductCode,
      labelCell: `B${descriptor.row}`,
      expectedLabel: descriptor.expectedLabel,
      allowedColumn: descriptor.writeColumn
    }
  };
}

export function resolveDailySoTarget(input: {
  store: StoreId;
  sku: DailySoSkuId;
  day: number;
}): SheetWriteTarget {
  const descriptor = DAILY_SO_SCHEMAS[input.store]?.[input.sku];
  if (!descriptor) fail("Unknown Daily SO store or canonical SKU");
  const column = dayToColumn(input.day);
  return {
    store: input.store,
    domain: "DAILY_SO",
    spreadsheetId: WORKBOOKS[input.store].dailySo,
    sheetName: DAILY_SO_SHEET_NAME,
    row: descriptor.row,
    column,
    canonicalSkuId: descriptor.canonicalSkuId,
    assertions: {
      storeMarkerCell: "B3",
      expectedStoreMarker: input.store === "PMS" ? "GC-PMS" : "GC-TP6",
      productHeaderCell: "A6",
      productHeaderValue: "NAMA PRODUK",
      quantityHeaderCell: "C6",
      quantityHeaderValue: "QTY",
      labelCell: `A${descriptor.row}`,
      expectedLabel: descriptor.expectedLabel,
      uomCell: `B${descriptor.row}`,
      expectedUom: descriptor.expectedUom,
      dayHeaderCell: `${column}7`,
      expectedDay: input.day,
      allowedColumn: column
    }
  };
}

export function resolveTarget(input: {
  store: StoreId;
  domain: DomainId;
  sku: CanonicalSkuId;
  sheetName?: string;
  day?: number;
}): SheetWriteTarget {
  if (input.domain === "PRODUCTION") {
    if (!input.sheetName) fail("Production requires a pre-resolved sheet name");
    return resolveProductionTarget({
      store: input.store,
      sku: input.sku as ProductionWasteSkuId,
      sheetName: input.sheetName
    });
  }
  if (input.domain === "WASTE") {
    if (!input.sheetName) fail("Waste requires a pre-resolved sheet name");
    return resolveWasteTarget({
      store: input.store,
      sku: input.sku as ProductionWasteSkuId,
      sheetName: input.sheetName
    });
  }
  if (input.day === undefined) fail("Daily SO requires a validated day");
  return resolveDailySoTarget({
    store: input.store,
    sku: input.sku as DailySoSkuId,
    day: input.day
  });
}
