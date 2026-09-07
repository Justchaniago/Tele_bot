import type { MutationEffect, MutationPlan } from "../domains/business-types.js";
import type { DurableRun, EffectRecovery, RecoveryDecision, RecoveryObservation } from "./durable-types.js";

export function effectIdentity(effect: MutationEffect): string {
  return `${effect.store}:${effect.domain}:${effect.date}:${effect.canonicalSkuId}:${effect.target.spreadsheetId}:${effect.target.sheetName}:${effect.target.column}${effect.target.row}`;
}

export function recoveryDecision(observation: RecoveryObservation): RecoveryDecision {
  if (observation === "DESIRED") return "ALREADY_APPLIED";
  if (observation === "EXPECTED_OLD") return "RETRY_NEEDED";
  return "DO_NOT_OVERWRITE";
}

export type MultiEffectRecovery = {
  readonly retry: readonly MutationEffect[];
  readonly alreadyApplied: readonly MutationEffect[];
  readonly conflicts: readonly MutationEffect[];
};

export function recoverPlan(
  plan: MutationPlan,
  observations: Readonly<Record<string, RecoveryObservation>>
): MultiEffectRecovery {
  const retry: MutationEffect[] = [];
  const alreadyApplied: MutationEffect[] = [];
  const conflicts: MutationEffect[] = [];
  for (const effect of plan.effects) {
    const observation = observations[effectIdentity(effect)] ?? observations[effect.canonicalSkuId];
    if (observation === "EXPECTED_OLD") retry.push(effect);
    else if (observation === "DESIRED") alreadyApplied.push(effect);
    else conflicts.push(effect);
  }
  return Object.freeze({ retry: Object.freeze(retry), alreadyApplied: Object.freeze(alreadyApplied), conflicts: Object.freeze(conflicts) });
}

export function recoveryEntries(
  plan: MutationPlan,
  observations: Readonly<Record<string, RecoveryObservation>>,
  reconciledAt: Date
): readonly EffectRecovery[] {
  return Object.freeze(plan.effects.map(effect => ({
    effectId: effectIdentity(effect),
    outcome: recoveryDecision(observations[effectIdentity(effect)] ?? observations[effect.canonicalSkuId] ?? "CONFLICT"),
    reconciledAt: reconciledAt.toISOString()
  })));
}

export function residualEffects(run: DurableRun): readonly MutationEffect[] {
  if (!run.plan || !run.effectRecovery) return [];
  const retryIds = new Set(run.effectRecovery.filter(entry => entry.outcome === "RETRY_NEEDED").map(entry => entry.effectId));
  return Object.freeze(run.plan.effects.filter(effect => retryIds.has(effectIdentity(effect))));
}
