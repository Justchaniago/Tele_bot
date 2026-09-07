import type { ProductionWasteSkuId, StoreId } from "../../core/identifiers.js";
import type { ProductionWasteTargetDescriptor } from "../../sheets/contract-types.js";

// Independent verified Waste inventory. No Production map, row offset, or index is used.
const wasteEntries: readonly ProductionWasteTargetDescriptor[] = ([
  ["GREEN_TEA_BASE", 43, "GREEN TEA BASE", "WB.TE.000001"],
  ["BLACK_TEA_BASE", 44, "BLACK TEA BASE", "WB.TE.000002"],
  ["OOLONG_TEA_BASE", 45, "OOLONG TEA BASE", "WB.TE.000003"],
  ["OOLONG_TEA_LOCAL_BASE", 46, "OOLONG TEA LOKAL BASE", "WB.TE.000003"],
  ["ALISAN_TEA_BASE", 47, "ALISAN TEA BASE", "WB.TE.000004"],
  ["MILK_TEA_BASE", 48, "MILK TEA BASE", "WB.TE.000005"],
  ["MILK_TEA_LOCAL_BASE", 49, "MILK TEA BASE LOKAL", "WB.TE.000005"],
  ["EARL_GREY_MILK_TEA_BASE", 50, "EARL GREY MILK TEA BASE", "WB.TE.000006"],
  ["EARL_GREY_TEA_BASE", 51, "EARL GREY TEA BASE", "WB.TE.000007"],
  ["WINTER_MELON_BASE", 52, "WINTER MELON BASE", "WB.LI.000001"],
  ["HONEY_BASE", 53, "HONEY BASE", "WB.LI.000002"],
  ["MILK_COFFEE_BASE", 54, "MILK COFFEE BASE", "WB.LI.000003"],
  ["BLACK_COFFEE_BASE", 55, "BLACK COFFEE BASE", "WB.LI.000004"],
  ["GREEN_TEA_LOCAL_BASE", 56, "GREEN TEA LOKAL BASE", "WBS.TE.000001"],
  ["BLACK_TEA_LOCAL_BASE", 57, "BLACK TEA BASE LOKAL", "WBL.TE.000002"],
  ["EARL_GREY_MILK_TEA_LOCAL_BASE", 58, "EARL GREY MILK TEA LOKAL BASE", "WB.TE.000006"],
  ["EARL_GREY_TEA_LOCAL_BASE", 59, "EARL GREY TEA LOKAL BASE", "WB.TE.000007"],
  ["MILK_COFFEE_VARIETY_BASE", 60, "MILK COFFEE BERAGAM BASE", "WB.LI.000006"],
  ["HERBAL_JELLY_BASE", 62, "HERBAL JELLY BASE", "TW.TO.000001"],
  ["AI_YU_BASE", 63, "AI YU BASE", "TW.TO.000002"],
  ["PUDDING_BASE", 64, "PUDDING BASE", "TW.TO.000003"],
  ["PEARL_BASE", 65, "PEARL BASE", "TW.TO.000004"],
  ["MILK_FOAM_BASE", 66, "MILK FOAM BASE", "TW.TO.000005"],
  ["PISTACHIO_MILK_FOAM_BASE", 67, "PISTACHIO MILK FOAM BASE", "TW.TO.000008"],
  ["BANANA_FOAM_BASE", 68, "BANANA FOAM BASE", "TW.TO.000009"],
  ["CHEESE_FOAM_BASE", 69, "CHEESE FOAM BASE", "TW.TO.000011"],
  ["CHEESE_CAKE_PUDDING", 70, "CHEESE CAKE PUDDING", "RI.PW.000012"],
  ["COFFEE_MILK_FOAM_BASE", 71, "COFFEE MILK FOAM BASE", "TW.TO.000013"],
  ["MINI_PEARL_BASE", 72, "MINI PEARL BASE", "TW.TO.000014"],
  ["PEACH_YOGHURT_BASE", 73, "PEACH YOGHURT BASE", "WB.LI.000007"],
  ["LYCHYEE_BASE", 74, "LYCHYEE BASE", "TW.TO.000015"]
] as const).map(([canonicalSkuId, row, expectedLabel, expectedProductCode]) => Object.freeze({
  canonicalSkuId: canonicalSkuId as ProductionWasteSkuId,
  row,
  expectedLabel,
  expectedProductCode,
  labelColumn: "B" as const,
  productCodeColumn: "A" as const,
  writeColumn: "D" as const,
  section: Object.freeze({ markerCell: "B42" as const, expectedValue: "WASTE" as const })
}));

function asMap(entries: readonly ProductionWasteTargetDescriptor[]) {
  return Object.freeze(Object.fromEntries(entries.map(entry => [entry.canonicalSkuId, entry]))) as Readonly<Record<ProductionWasteSkuId, ProductionWasteTargetDescriptor>>;
}

const wasteMap = asMap(wasteEntries);

export const WASTE_SCHEMAS: Readonly<Record<StoreId, Readonly<Record<ProductionWasteSkuId, ProductionWasteTargetDescriptor>>>> = Object.freeze({
  PMS: wasteMap,
  TP6: wasteMap
});

export const WASTE_SKU_COUNT = wasteEntries.length;
