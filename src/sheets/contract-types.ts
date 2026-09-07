import type { CanonicalSkuId, DomainId, StoreId } from "../core/identifiers.js";

export type SheetColumn = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J"
  | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W"
  | "X" | "Y" | "Z" | "AA" | "AB" | "AC" | "AD" | "AE" | "AF";
export type ProductionWasteColumn = "D";
export type DailySoColumn = Exclude<SheetColumn, "A" | "B">;

export type SectionAssertion = {
  readonly markerCell: "B9" | "B42";
  readonly expectedValue: "PRODUCTION" | "WASTE";
};

export type ProductionWasteTargetDescriptor = {
  readonly canonicalSkuId: CanonicalSkuId;
  readonly row: number;
  readonly expectedLabel: string;
  readonly expectedProductCode: string;
  readonly labelColumn: "B";
  readonly productCodeColumn: "A";
  readonly writeColumn: ProductionWasteColumn;
  readonly section: SectionAssertion;
};

export type DailySoTargetDescriptor = {
  readonly canonicalSkuId: CanonicalSkuId;
  readonly row: number;
  readonly expectedLabel: string;
  readonly expectedUom: "PCS";
  readonly labelColumn: "A";
  readonly uomColumn: "B";
  readonly writeColumns: readonly DailySoColumn[];
};

export type SheetWriteTarget = {
  readonly store: StoreId;
  readonly domain: DomainId;
  readonly spreadsheetId: string;
  readonly sheetName: string;
  readonly row: number;
  readonly column: SheetColumn;
  readonly canonicalSkuId: CanonicalSkuId;
  readonly assertions: Readonly<Record<string, unknown>>;
};

export type ProductionWasteObservation = {
  readonly spreadsheetId: string;
  readonly sheetName: string;
  readonly markerCell: string;
  readonly markerValue: string;
  readonly codeCell: string;
  readonly codeValue: string;
  readonly labelCell: string;
  readonly labelValue: string;
  readonly targetCell: string;
  readonly targetColumn: string;
};

export type DailySoObservation = {
  readonly spreadsheetId: string;
  readonly sheetName: string;
  readonly storeMarkerValue: string;
  readonly productHeaderValue: string;
  readonly quantityHeaderValue: string;
  readonly labelCell: string;
  readonly labelValue: string;
  readonly uomCell: string;
  readonly uomValue: string;
  readonly dayHeaderCell: string;
  readonly dayHeaderValue: number;
  readonly targetCell: string;
  readonly targetColumn: string;
};
