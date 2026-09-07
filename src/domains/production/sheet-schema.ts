import type { ProductionWasteSkuId, StoreId } from "../../core/identifiers.js";
import type { ProductionWasteTargetDescriptor } from "../../sheets/contract-types.js";

const productionEntries: readonly ProductionWasteTargetDescriptor[] = ([
  ["GREEN_TEA_BASE", 10, "GREEN TEA BASE", "WB.TE.000001"],
  ["BLACK_TEA_BASE", 11, "BLACK TEA BASE", "WB.TE.000002"],
  ["OOLONG_TEA_BASE", 12, "OOLONG TEA BASE", "WB.TE.000003"],
  ["OOLONG_TEA_LOCAL_BASE", 13, "OOLONG TEA LOKAL BASE", "WB.TE.000003"],
  ["ALISAN_TEA_BASE", 14, "ALISAN TEA BASE", "WB.TE.000004"],
  ["MILK_TEA_BASE", 15, "MILK TEA BASE", "WB.TE.000005"],
  ["MILK_TEA_LOCAL_BASE", 16, "MILK TEA BASE LOKAL", "WB.TE.000005"],
  ["EARL_GREY_MILK_TEA_BASE", 17, "EARL GREY MILK TEA BASE", "WB.TE.000006"],
  ["EARL_GREY_TEA_BASE", 18, "EARL GREY TEA BASE", "WB.TE.000007"],
  ["WINTER_MELON_BASE", 19, "WINTER MELON BASE", "WB.LI.000001"],
  ["HONEY_BASE", 20, "HONEY BASE", "WB.LI.000002"],
  ["MILK_COFFEE_BASE", 21, "MILK COFFEE BASE", "WB.LI.000003"],
  ["BLACK_COFFEE_BASE", 22, "BLACK COFFEE BASE", "WB.LI.000004"],
  ["GREEN_TEA_LOCAL_BASE", 23, "GREEN TEA LOKAL BASE", "WBS.TE.000001"],
  ["BLACK_TEA_LOCAL_BASE", 24, "BLACK TEA BASE LOKAL", "WBL.TE.000002"],
  ["EARL_GREY_MILK_TEA_LOCAL_BASE", 25, "EARL GREY MILK TEA LOKAL BASE", "WB.TE.000006"],
  ["EARL_GREY_TEA_LOCAL_BASE", 26, "EARL GREY TEA LOKAL BASE", "WB.TE.000007"],
  ["MILK_COFFEE_VARIETY_BASE", 27, "MILK COFFEE BERAGAM BASE", "WB.LI.000006"],
  ["HERBAL_JELLY_BASE", 29, "HERBAL JELLY BASE", "TW.TO.000001"],
  ["AI_YU_BASE", 30, "AI YU BASE", "TW.TO.000002"],
  ["PUDDING_BASE", 31, "PUDDING BASE", "TW.TO.000003"],
  ["PEARL_BASE", 32, "PEARL BASE", "TW.TO.000004"],
  ["MILK_FOAM_BASE", 33, "MILK FOAM BASE", "TW.TO.000005"],
  ["PISTACHIO_MILK_FOAM_BASE", 34, "PISTACHIO MILK FOAM BASE", "TW.TO.000008"],
  ["BANANA_FOAM_BASE", 35, "BANANA FOAM BASE", "TW.TO.000009"],
  ["CHEESE_FOAM_BASE", 36, "CHEESE FOAM BASE", "TW.TO.000011"],
  ["CHEESE_CAKE_PUDDING", 37, "CHEESE CAKE PUDDING", "RI.PW.000012"],
  ["COFFEE_MILK_FOAM_BASE", 38, "COFFEE MILK FOAM BASE", "TW.TO.000013"],
  ["MINI_PEARL_BASE", 39, "MINI PEARL BASE", "TW.TO.000014"],
  ["PEACH_YOGHURT_BASE", 40, "PEACH YOGHURT BASE", "WB.LI.000007"],
  ["LYCHYEE_BASE", 41, "LYCHYEE BASE", "TW.TO.000015"]
] as const).map(([canonicalSkuId, row, expectedLabel, expectedProductCode]) => Object.freeze({
  canonicalSkuId: canonicalSkuId as ProductionWasteSkuId,
  row,
  expectedLabel,
  expectedProductCode,
  labelColumn: "B" as const,
  productCodeColumn: "A" as const,
  writeColumn: "D" as const,
  section: Object.freeze({ markerCell: "B9" as const, expectedValue: "PRODUCTION" as const })
}));

function asMap(entries: readonly ProductionWasteTargetDescriptor[]) {
  return Object.freeze(Object.fromEntries(entries.map(entry => [entry.canonicalSkuId, entry]))) as Readonly<Record<ProductionWasteSkuId, ProductionWasteTargetDescriptor>>;
}

const productionMap = asMap(productionEntries);

export const PRODUCTION_SCHEMAS: Readonly<Record<StoreId, Readonly<Record<ProductionWasteSkuId, ProductionWasteTargetDescriptor>>>> = Object.freeze({
  PMS: productionMap,
  TP6: productionMap
});

export const PRODUCTION_SKU_COUNT = productionEntries.length;
