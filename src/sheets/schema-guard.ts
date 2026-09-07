import { AppError } from "../core/errors.js";
import type { DailySoSkuId, ProductionWasteSkuId } from "../core/identifiers.js";
import type { DailySoObservation, ProductionWasteObservation, SheetWriteTarget } from "./contract-types.js";
import { DAILY_SO_COLUMNS, DAILY_SO_SCHEMAS } from "../domains/daily-so/sheet-schema.js";
import { PRODUCTION_SCHEMAS } from "../domains/production/sheet-schema.js";
import { WASTE_SCHEMAS } from "../domains/waste/sheet-schema.js";
import { WORKBOOKS } from "./workbook-registry.js";

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function mismatch(message: string): never {
  throw new AppError("SCHEMA_MISMATCH", message);
}

function expect(condition: boolean, message: string): void {
  if (!condition) mismatch(message);
}

export function assertAllowlistedTarget(target: SheetWriteTarget): void {
  if (target.domain === "PRODUCTION" || target.domain === "WASTE") {
    const map = target.domain === "PRODUCTION" ? PRODUCTION_SCHEMAS : WASTE_SCHEMAS;
    const descriptor = map[target.store]?.[target.canonicalSkuId as ProductionWasteSkuId];
    expect(Boolean(descriptor), "Canonical SKU is not allowlisted for domain");
    expect(target.spreadsheetId === WORKBOOKS[target.store].productionWaste, "Target workbook is not allowlisted");
    expect(target.column === "D", "Target column is not allowlisted");
    expect(target.row === descriptor.row, "Target row is not allowlisted");
    expect(String(target.assertions.markerCell) === descriptor.section.markerCell, "Target section is not allowlisted");
    expect(String(target.assertions.labelCell) === `B${descriptor.row}`, "Target label cell is not allowlisted");
    return;
  }

  const descriptor = DAILY_SO_SCHEMAS[target.store]?.[target.canonicalSkuId as DailySoSkuId];
  expect(Boolean(descriptor), "Canonical SKU is not allowlisted for Daily SO");
  expect(target.spreadsheetId === WORKBOOKS[target.store].dailySo, "Target workbook is not allowlisted");
  expect(target.sheetName === "Sheet1", "Target worksheet is not allowlisted");
  expect(descriptor.row === target.row, "Daily SO target row is not allowlisted");
  expect(DAILY_SO_COLUMNS.includes(target.column as never), "Daily SO target column is not allowlisted");
}

export function validateProductionWasteObservation(
  target: SheetWriteTarget,
  observed: ProductionWasteObservation
): void {
  assertAllowlistedTarget(target);
  expect(target.domain === "PRODUCTION" || target.domain === "WASTE", "Not a Production/Waste target");
  const a = target.assertions;
  expect(observed.spreadsheetId === target.spreadsheetId, "Workbook mismatch");
  expect(observed.sheetName === target.sheetName, "Worksheet mismatch");
  expect(observed.markerCell === a.markerCell, "Section marker cell mismatch");
  expect(observed.markerValue === a.markerValue, "Section marker value mismatch");
  expect(observed.codeCell === a.codeCell, "Product code cell mismatch");
  expect(observed.codeValue === a.expectedProductCode, "Product code mismatch");
  expect(observed.labelCell === a.labelCell, "Label cell mismatch");
  expect(normalizeLabel(observed.labelValue) === normalizeLabel(String(a.expectedLabel)), "SKU label mismatch");
  expect(observed.targetCell === `${target.column}${target.row}`, "Target cell mismatch");
  expect(observed.targetColumn === target.column && target.column === "D", "Write column not allowlisted");
}

export function validateDailySoObservation(
  target: SheetWriteTarget,
  observed: DailySoObservation
): void {
  assertAllowlistedTarget(target);
  expect(target.domain === "DAILY_SO", "Not a Daily SO target");
  const a = target.assertions;
  expect(observed.spreadsheetId === target.spreadsheetId, "Workbook mismatch");
  expect(observed.sheetName === "Sheet1", "Daily SO worksheet mismatch");
  expect(observed.storeMarkerValue === a.expectedStoreMarker, "Store marker mismatch");
  expect(observed.productHeaderValue === "NAMA PRODUK", "Product header mismatch");
  expect(observed.quantityHeaderValue === "QTY", "Quantity header mismatch");
  expect(observed.labelCell === a.labelCell, "SKU label cell mismatch");
  expect(normalizeLabel(observed.labelValue) === normalizeLabel(String(a.expectedLabel)), "SKU label mismatch");
  expect(observed.uomCell === a.uomCell && observed.uomValue === "PCS", "SKU UOM mismatch");
  expect(observed.dayHeaderCell === a.dayHeaderCell, "Day header cell mismatch");
  expect(observed.dayHeaderValue === a.expectedDay, "Day header value mismatch");
  expect(observed.targetCell === `${target.column}${target.row}`, "Target cell mismatch");
  expect(observed.targetColumn === target.column && target.column !== "A" && target.column !== "B", "Daily SO column not allowlisted");
  expect(target.row >= 8 && target.row <= 17, "Daily SO row not allowlisted");
}

export function validateSchemaObservation(
  target: SheetWriteTarget,
  observed: ProductionWasteObservation | DailySoObservation
): void {
  if (target.domain === "DAILY_SO") {
    validateDailySoObservation(target, observed as DailySoObservation);
    return;
  }
  validateProductionWasteObservation(target, observed as ProductionWasteObservation);
}
