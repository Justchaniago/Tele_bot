import type { BusinessPlanResult, BusinessPlanningInput } from "../business-types.js";
import { planProductionWaste } from "../business-helpers.js";

export function planWaste(input: BusinessPlanningInput): BusinessPlanResult {
  return planProductionWaste(input, "WASTE");
}
