import type { BusinessPlanResult, BusinessPlanningInput } from "../business-types.js";
import { planProductionWaste } from "../business-helpers.js";

export function planProduction(input: BusinessPlanningInput): BusinessPlanResult {
  return planProductionWaste(input, "PRODUCTION");
}
