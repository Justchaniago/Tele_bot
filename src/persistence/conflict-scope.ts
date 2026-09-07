import type { MutationPlan } from "../domains/business-types.js";
import type { ConflictScope } from "./durable-types.js";

export function conflictScopes(plan: MutationPlan): readonly ConflictScope[] {
  const scopes: ConflictScope[] = plan.effects.map(effect => ({
    key: `target:${effect.store}:${effect.domain}:${effect.target.spreadsheetId}:${effect.target.sheetName}:${effect.target.column}${effect.target.row}`,
    kind: "TARGET",
    store: effect.store,
    domain: effect.domain,
    date: effect.date
  }));
  if (plan.domain === "DAILY_SO" && plan.effects.some(effect => effect.provenance === "AUTO_FILL_MISSING")) {
    scopes.push({
      key: `daily-so-snapshot:${plan.store}:${plan.date}`,
      kind: "DAILY_SO_SNAPSHOT",
      store: plan.store,
      domain: plan.domain,
      date: plan.date
    });
  }
  return Object.freeze([...new Map(scopes.map(scope => [scope.key, scope])).values()]);
}

