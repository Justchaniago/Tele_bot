import { describe, expect, it } from "vitest";
import { AppError } from "../src/core/errors.js";
import { DAILY_SO_SCHEMAS, DAILY_SO_SKU_COUNT, dayToColumn } from "../src/domains/daily-so/sheet-schema.js";
import { PRODUCTION_SCHEMAS, PRODUCTION_SKU_COUNT } from "../src/domains/production/sheet-schema.js";
import { WASTE_SCHEMAS, WASTE_SKU_COUNT } from "../src/domains/waste/sheet-schema.js";
import { validateDailySoObservation, validateProductionWasteObservation } from "../src/sheets/schema-guard.js";
import { resolveDailySoTarget, resolveProductionTarget, resolveWasteTarget } from "../src/sheets/target-resolver.js";
import { WORKBOOKS } from "../src/sheets/workbook-registry.js";
import type { DailySoObservation, ProductionWasteObservation } from "../src/sheets/contract-types.js";

function expectSchemaMismatch(action: () => void): void {
  expect(action).toThrowError(AppError);
  try {
    action();
  } catch (error) {
    expect((error as AppError).category).toBe("SCHEMA_MISMATCH");
  }
}

function productionObservation(target: ReturnType<typeof resolveProductionTarget>): ProductionWasteObservation {
  const a = target.assertions;
  return {
    spreadsheetId: target.spreadsheetId,
    sheetName: target.sheetName,
    markerCell: String(a.markerCell),
    markerValue: String(a.markerValue),
    codeCell: String(a.codeCell),
    codeValue: String(a.expectedProductCode),
    labelCell: String(a.labelCell),
    labelValue: String(a.expectedLabel),
    targetCell: `D${target.row}`,
    targetColumn: "D"
  };
}

function dailyObservation(target: ReturnType<typeof resolveDailySoTarget>): DailySoObservation {
  const a = target.assertions;
  return {
    spreadsheetId: target.spreadsheetId,
    sheetName: target.sheetName,
    storeMarkerValue: String(a.expectedStoreMarker),
    productHeaderValue: "NAMA PRODUK",
    quantityHeaderValue: "QTY",
    labelCell: String(a.labelCell),
    labelValue: String(a.expectedLabel),
    uomCell: String(a.uomCell),
    uomValue: "PCS",
    dayHeaderCell: String(a.dayHeaderCell),
    dayHeaderValue: Number(a.expectedDay),
    targetCell: `${target.column}${target.row}`,
    targetColumn: target.column
  };
}

describe("fixed Production and Waste schemas", () => {
  it("contains complete independent maps", () => {
    expect(PRODUCTION_SKU_COUNT).toBe(31);
    expect(WASTE_SKU_COUNT).toBe(31);
    expect(Object.keys(PRODUCTION_SCHEMAS.PMS)).toHaveLength(31);
    expect(Object.keys(PRODUCTION_SCHEMAS.TP6)).toHaveLength(31);
    expect(Object.keys(WASTE_SCHEMAS.PMS)).toHaveLength(31);
    expect(Object.keys(WASTE_SCHEMAS.TP6)).toHaveLength(31);
    expect(PRODUCTION_SCHEMAS.PMS.PEARL_BASE.row).toBe(32);
    expect(WASTE_SCHEMAS.PMS.PEARL_BASE.row).toBe(65);
    expect(PRODUCTION_SCHEMAS.PMS.PEARL_BASE.expectedProductCode).toBe("TW.TO.000004");
    expect(PRODUCTION_SCHEMAS.PMS.PEARL_BASE.expectedLabel).not.toBe("");
  });

  it("resolves exact Production and Waste cells with D-only writes", () => {
    const production = resolveProductionTarget({ store: "PMS", sku: "PEARL_BASE", sheetName: "1 - 2026" });
    const waste = resolveWasteTarget({ store: "PMS", sku: "PEARL_BASE", sheetName: "1 - 2026" });
    expect(production).toMatchObject({
      domain: "PRODUCTION",
      spreadsheetId: WORKBOOKS.PMS.productionWaste,
      row: 32,
      column: "D"
    });
    expect(waste).toMatchObject({
      domain: "WASTE",
      spreadsheetId: WORKBOOKS.PMS.productionWaste,
      row: 65,
      column: "D"
    });
    expect(production.row).not.toBe(waste.row);
  });

  it("rejects unknown SKU and cross-store workbook observation", () => {
    expect(() => resolveProductionTarget({
      store: "PMS",
      sku: "NOT_A_SKU" as never,
      sheetName: "1 - 2026"
    })).toThrowError(/Unknown Production/);
    const target = resolveProductionTarget({ store: "PMS", sku: "PEARL_BASE", sheetName: "1 - 2026" });
    expectSchemaMismatch(() => validateProductionWasteObservation(target, {
      ...productionObservation(target),
      spreadsheetId: WORKBOOKS.TP6.productionWaste
    }));
  });

  it("rejects wrong section, moved row, label, code, and arbitrary column", () => {
    const target = resolveWasteTarget({ store: "TP6", sku: "GREEN_TEA_BASE", sheetName: "11 -2026" });
    const observed = productionObservation(target);
    expectSchemaMismatch(() => validateProductionWasteObservation(target, { ...observed, markerValue: "PRODUCTION" }));
    expectSchemaMismatch(() => validateProductionWasteObservation(target, { ...observed, labelValue: "PEARL BASE" }));
    expectSchemaMismatch(() => validateProductionWasteObservation(target, { ...observed, codeValue: "WRONG" }));
    expectSchemaMismatch(() => validateProductionWasteObservation(target, { ...observed, targetCell: "D44" }));
    expectSchemaMismatch(() => validateProductionWasteObservation(target, { ...observed, targetColumn: "E" }));
    expectSchemaMismatch(() => validateProductionWasteObservation({ ...target, row: 999 }, observed));
    validateProductionWasteObservation(target, observed);
  });

  it("does not permit separator rows through schema maps", () => {
    expect(Object.values(PRODUCTION_SCHEMAS.PMS).some(entry => entry.row === 28)).toBe(false);
    expect(Object.values(WASTE_SCHEMAS.PMS).some(entry => entry.row === 61)).toBe(false);
  });
});

describe("fixed Daily SO schema", () => {
  it("contains exactly ten targets including Harry Potter Cup", () => {
    expect(DAILY_SO_SKU_COUNT).toBe(10);
    expect(DAILY_SO_SCHEMAS.PMS.HARRY_POTTER_CUP).toMatchObject({
      row: 17,
      expectedLabel: "HARRY POTTER CUP",
      expectedUom: "PCS"
    });
    expect(DAILY_SO_SCHEMAS.TP6.HARRY_POTTER_CUP.row).toBe(17);
  });

  it("maps only verified days to C through AF", () => {
    expect(dayToColumn(1)).toBe("C");
    expect(dayToColumn(30)).toBe("AF");
    expect(() => dayToColumn(0)).toThrow();
    expect(() => dayToColumn(31)).toThrow();
  });

  it("resolves Harry Potter row 17 and validates complete observed schema", () => {
    const target = resolveDailySoTarget({ store: "TP6", sku: "HARRY_POTTER_CUP", day: 30 });
    expect(target).toMatchObject({
      domain: "DAILY_SO",
      spreadsheetId: WORKBOOKS.TP6.dailySo,
      sheetName: "Sheet1",
      row: 17,
      column: "AF"
    });
    validateDailySoObservation(target, dailyObservation(target));
  });

  it("rejects wrong marker, label, UOM, header, day, row, and column", () => {
    const target = resolveDailySoTarget({ store: "PMS", sku: "Y16_LOCAL_MEDIUM_CUP", day: 1 });
    const observed = dailyObservation(target);
    expectSchemaMismatch(() => validateDailySoObservation(target, { ...observed, storeMarkerValue: "GC-TP6" }));
    expectSchemaMismatch(() => validateDailySoObservation(target, { ...observed, labelValue: "HARRY POTTER CUP" }));
    expectSchemaMismatch(() => validateDailySoObservation(target, { ...observed, uomValue: "BOX" }));
    expectSchemaMismatch(() => validateDailySoObservation(target, { ...observed, quantityHeaderValue: "INPUT" }));
    expectSchemaMismatch(() => validateDailySoObservation(target, { ...observed, dayHeaderValue: 2 }));
    expectSchemaMismatch(() => validateDailySoObservation(target, { ...observed, targetCell: "B16" }));
    expectSchemaMismatch(() => validateDailySoObservation(target, { ...observed, targetColumn: "B" }));
    expectSchemaMismatch(() => validateDailySoObservation({ ...target, row: 999 }, observed));
    validateDailySoObservation(target, observed);
  });

  it("keeps schema maps immutable", () => {
    expect(() => {
      (DAILY_SO_SCHEMAS.PMS.HARRY_POTTER_CUP as { row: number }).row = 999;
    }).toThrow();
    expect(DAILY_SO_SCHEMAS.PMS.HARRY_POTTER_CUP.row).toBe(17);
  });
});
