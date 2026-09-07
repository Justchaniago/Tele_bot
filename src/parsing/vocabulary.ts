import type { CanonicalSkuId, DomainId, DailySoSkuId, ProductionWasteSkuId } from "../core/identifiers.js";

export type VocabularyEntry = {
  readonly canonicalSkuId: CanonicalSkuId;
  readonly canonicalName: string;
  readonly domains: readonly DomainId[];
  readonly aliases: readonly string[];
  readonly family: string;
  readonly qualifiers: readonly string[];
};

const productionWaste: readonly [ProductionWasteSkuId, string, readonly string[]][] = [
  ["GREEN_TEA_BASE", "GREEN TEA BASE", ["gt", "green tea"]],
  ["BLACK_TEA_BASE", "BLACK TEA BASE", ["bt", "black tea"]],
  ["OOLONG_TEA_BASE", "OOLONG TEA BASE", ["ot", "oolong tea"]],
  ["OOLONG_TEA_LOCAL_BASE", "OOLONG TEA LOKAL BASE", ["ot lokal", "ot local", "oolong tea"]],
  ["ALISAN_TEA_BASE", "ALISAN TEA BASE", []],
  ["MILK_TEA_BASE", "MILK TEA BASE", ["milk tea"]],
  ["MILK_TEA_LOCAL_BASE", "MILK TEA BASE LOKAL", ["milk tea", "milk tea lokal", "milk tea local"]],
  ["EARL_GREY_MILK_TEA_BASE", "EARL GREY MILK TEA BASE", ["egmt", "earl grey", "earl grey milk tea"]],
  ["EARL_GREY_TEA_BASE", "EARL GREY TEA BASE", ["egt", "earl grey", "earl grey tea"]],
  ["WINTER_MELON_BASE", "WINTER MELON BASE", []],
  ["HONEY_BASE", "HONEY BASE", []],
  ["MILK_COFFEE_BASE", "MILK COFFEE BASE", ["milk coffee", "coffee"]],
  ["BLACK_COFFEE_BASE", "BLACK COFFEE BASE", ["coffee"]],
  ["GREEN_TEA_LOCAL_BASE", "GREEN TEA LOKAL BASE", ["gt lokal", "gt local", "green tea local", "green tea lokal"]],
  ["BLACK_TEA_LOCAL_BASE", "BLACK TEA BASE LOKAL", ["bt lokal", "bt local", "black tea", "black tea local", "black tea lokal"]],
  ["EARL_GREY_MILK_TEA_LOCAL_BASE", "EARL GREY MILK TEA LOKAL BASE", ["egmt lokal", "egmt local", "earl grey", "earl grey local", "earl grey lokal", "earl grey milk tea", "earl grey milk tea local"]],
  ["EARL_GREY_TEA_LOCAL_BASE", "EARL GREY TEA LOKAL BASE", ["egt lokal", "egt local", "earl grey", "earl grey local", "earl grey lokal", "earl grey tea", "earl grey tea local"]],
  ["MILK_COFFEE_VARIETY_BASE", "MILK COFFEE BERAGAM BASE", ["coffee"]],
  ["HERBAL_JELLY_BASE", "HERBAL JELLY BASE", []],
  ["AI_YU_BASE", "AI YU BASE", []],
  ["PUDDING_BASE", "PUDDING BASE", ["pudding"]],
  ["PEARL_BASE", "PEARL BASE", ["pearl"]],
  ["MILK_FOAM_BASE", "MILK FOAM BASE", []],
  ["PISTACHIO_MILK_FOAM_BASE", "PISTACHIO MILK FOAM BASE", ["pistachio foam"]],
  ["BANANA_FOAM_BASE", "BANANA FOAM BASE", []],
  ["CHEESE_FOAM_BASE", "CHEESE FOAM BASE", []],
  ["CHEESE_CAKE_PUDDING", "CHEESE CAKE PUDDING", ["pudding"]],
  ["COFFEE_MILK_FOAM_BASE", "COFFEE MILK FOAM BASE", ["coffee"]],
  ["MINI_PEARL_BASE", "MINI PEARL BASE", []],
  ["PEACH_YOGHURT_BASE", "PEACH YOGHURT BASE", []],
  ["LYCHYEE_BASE", "LYCHYEE BASE", []]
];

const dailySo: readonly [DailySoSkuId, string, readonly string[]][] = [
  ["Y16_G1_MEDIUM_CUP", "GONG CHA Y16 CUPS-G1 (MEDIUM)", ["medium", "medium g1", "g1 medium"]],
  ["Y22_G1_LARGE_CUP", "GONG CHA Y22 CUPS-G1 (LARGE)", ["large g1", "g1 large", "large", "cupl"]],
  ["Y12_G1_SMALL_CUP", "GONG CHA Y12 CUPS-G1 (SMALL)", ["small g1", "g1 small", "small", "cups"]],
  ["PAPER_CUP_16OZ", "GONG CHA PAPER CUP - 16OZ", ["paper cup", "cuph"]],
  ["RAISED_COVER", "RAISED COVER", ["domlid"]],
  ["PAPER_CUP_LID", "GONG CHA PAPER CUP LID", ["paper cup lid", "hotlid"]],
  ["MILLAC_GOLD_1LT", "WHIP CREAM - MILLAC GOLD 1LT", ["millac"]],
  ["FRESH_MILK_DIAMOND_946ML", "FRESH MILK -  PLAIN DIAMOND 946ML", ["freshmilk", "fresh milk", "fm", "susu", "diamond", "plain diamond"]],
  ["Y16_LOCAL_MEDIUM_CUP", "GONG CHA Y16 CUPS LOCAL (MEDIUM)", ["medium", "medium local", "local medium", "medium lokal", "lokal medium"]],
  ["HARRY_POTTER_CUP", "HARRY POTTER CUP", ["harry potter"]]
];

const familyMetadata: Partial<Record<CanonicalSkuId, { readonly family: string; readonly qualifiers: readonly string[] }>> = {
  GREEN_TEA_BASE: { family: "GREEN_TEA", qualifiers: ["BASE"] },
  GREEN_TEA_LOCAL_BASE: { family: "GREEN_TEA", qualifiers: ["LOCAL"] },
  BLACK_TEA_BASE: { family: "BLACK_TEA", qualifiers: ["BASE"] },
  BLACK_TEA_LOCAL_BASE: { family: "BLACK_TEA", qualifiers: ["LOCAL"] },
  OOLONG_TEA_BASE: { family: "OOLONG_TEA", qualifiers: ["BASE"] },
  OOLONG_TEA_LOCAL_BASE: { family: "OOLONG_TEA", qualifiers: ["LOCAL"] },
  MILK_TEA_BASE: { family: "MILK_TEA", qualifiers: ["BASE"] },
  MILK_TEA_LOCAL_BASE: { family: "MILK_TEA", qualifiers: ["LOCAL"] },
  EARL_GREY_MILK_TEA_BASE: { family: "EARL_GREY", qualifiers: ["MILK", "TEA", "BASE"] },
  EARL_GREY_TEA_BASE: { family: "EARL_GREY", qualifiers: ["TEA", "BASE"] },
  EARL_GREY_MILK_TEA_LOCAL_BASE: { family: "EARL_GREY", qualifiers: ["MILK", "TEA", "LOCAL"] },
  EARL_GREY_TEA_LOCAL_BASE: { family: "EARL_GREY", qualifiers: ["TEA", "LOCAL"] },
  MILK_COFFEE_BASE: { family: "COFFEE", qualifiers: ["MILK", "BASE"] },
  BLACK_COFFEE_BASE: { family: "COFFEE", qualifiers: ["BLACK", "BASE"] },
  MILK_COFFEE_VARIETY_BASE: { family: "COFFEE", qualifiers: ["MILK", "VARIETY"] },
  COFFEE_MILK_FOAM_BASE: { family: "COFFEE", qualifiers: ["MILK", "FOAM"] },
  PUDDING_BASE: { family: "PUDDING", qualifiers: ["BASE"] },
  CHEESE_CAKE_PUDDING: { family: "PUDDING", qualifiers: ["CHEESE", "CAKE"] },
  Y16_G1_MEDIUM_CUP: { family: "DAILY_MEDIUM", qualifiers: ["G1"] },
  Y16_LOCAL_MEDIUM_CUP: { family: "DAILY_MEDIUM", qualifiers: ["LOCAL"] }
};

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[(){}_,=:\-]+/g, " ")
    .replace(/[\/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const VOCABULARY: readonly VocabularyEntry[] = Object.freeze([
  ...productionWaste.map(([canonicalSkuId, canonicalName, aliases]) => Object.freeze({
    canonicalSkuId,
    canonicalName,
    domains: Object.freeze(["PRODUCTION", "WASTE"] as const),
    aliases: Object.freeze(aliases),
    family: familyMetadata[canonicalSkuId]?.family ?? canonicalSkuId,
    qualifiers: Object.freeze(familyMetadata[canonicalSkuId]?.qualifiers ?? [])
  })),
  ...dailySo.map(([canonicalSkuId, canonicalName, aliases]) => Object.freeze({
    canonicalSkuId,
    canonicalName,
    domains: Object.freeze(["DAILY_SO"] as const),
    aliases: Object.freeze(aliases),
    family: familyMetadata[canonicalSkuId]?.family ?? canonicalSkuId,
    qualifiers: Object.freeze(familyMetadata[canonicalSkuId]?.qualifiers ?? [])
  }))
]);

export const PRODUCTION_WASTE_VOCABULARY_COUNT = productionWaste.length;
export const DAILY_SO_VOCABULARY_COUNT = dailySo.length;
