/** V2 collections are isolated from retired pre-V2 state. */
export const V2_COLLECTIONS = Object.freeze({
  updates: "tele_auto_v2_updates",
  runs: "tele_auto_v2_runs",
  conflictScopes: "tele_auto_v2_conflict_scopes",
  snapshots: "tele_auto_v2_daily_snapshots"
});

export const V2_RETENTION = Object.freeze({
  interactionMinutes: 15,
  // Production adapter may configure Firestore TTL cleanup; application checks expiry first.
  interactionField: "expiresAt"
});
