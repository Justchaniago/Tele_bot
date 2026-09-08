import type { Logger } from "../observability/logger.js";
import type { StoreId, DomainId, CanonicalSkuId } from "../core/identifiers.js";
import { parseCommandBlock } from "../parsing/parser.js";
import { resolveTarget } from "../sheets/target-resolver.js";
import { DAILY_SO_SCHEMAS } from "../domains/daily-so/sheet-schema.js";
import { PRODUCTION_SCHEMAS } from "../domains/production/sheet-schema.js";
import { WASTE_SCHEMAS } from "../domains/waste/sheet-schema.js";
import { planProduction } from "../domains/production/business.js";
import { planWaste } from "../domains/waste/business.js";
import { planDailySo } from "../domains/daily-so/business.js";
import { normalizeExistingValue } from "../domains/business-helpers.js";
import type { BusinessPlanResult, BusinessObservation, MutationEffect } from "../domains/business-types.js";
import type { DurableStateRepository } from "../persistence/repository.js";
import type { DurableRun, PrimaryStatusState } from "../persistence/durable-types.js";
import { residualEffects, effectIdentity } from "../persistence/recovery.js";
import type { SheetsReader } from "../sheets/sheets-reader.js";
import type { SheetWriteTarget } from "../sheets/contract-types.js";
import type { SheetsWriter } from "../sheets/sheets-writer.js";
import { TelegramDeliveryError, type TelegramNotifier } from "../telegram/notifier.js";
import type { AiSkuResolver } from "../parsing/ai-fallback.js";
import { aggregateStatus } from "./status-aggregate.js";
import { emitTelemetrySafely, stableTelemetryEventId, type OperationalTelemetry, type TeleAutoEventType } from "../observability/neo-avo-telemetry.js";
import { AppError } from "../core/errors.js";

export class WorkerService {
  constructor(private readonly repository: DurableStateRepository, private readonly reader: SheetsReader, private readonly writer: SheetsWriter, private readonly logger: Logger, private readonly notifier?: TelegramNotifier, private readonly now = () => new Date(), private readonly leaseMs = 60000, private readonly aiResolver?: AiSkuResolver, private readonly telemetry?: OperationalTelemetry) {}

  async drain(limit: number): Promise<number> {
    const now = this.now();
    const expired = await this.repository.listExpiredExecutingRuns(now, limit);
    for (const run of expired) await this.repository.recoverExpiredExecution(run.runId, now).then(() => this.emitRunEvent(run, "tele_auto.worker.recovery", "WARNING", "EFFECT_UNCERTAIN")).catch(error => this.logger.warn("Expired execution recovery skipped", { runId: run.runId, error: String(error) }));
    const runs = await this.repository.listRunnableRuns(limit);
    for (const run of runs) await this.process(run).catch(error => this.logger.error("Worker run failed", error, { runId: run.runId, store: run.store, domain: run.domain }));
    return runs.length;
  }

  private async process(initial: DurableRun): Promise<void> {
    let run = initial;
    if (run.status === "NEEDS_CLARIFICATION") { this.logger.info("Run requires clarification", { runId: run.runId, store: run.store, domain: run.domain }); this.emitRunEvent(run, "tele_auto.run.needs_clarification", "INFO", "PRE_WRITE"); await this.notifyClarification(run); return; }
    if (run.status === "RECEIVED") {
      this.emitRunEvent(run, "tele_auto.run.processing", "INFO", "PRE_WRITE");
      await this.publishStatus(run.updateKey, "RECEIVED", "Input diterima.");
      await this.publishStatus(run.updateKey, "PROCESSING", "Input sedang diproses...\nMohon tunggu hingga proses selesai sebelum mengirim input berikutnya.");
      try { run = await this.plan(run); }
      catch (error) { const failed = await this.repository.transitionRun(run.runId, "FAILED_RETRYABLE", run.version, error instanceof Error ? error.message : String(error)).catch(() => undefined); if (failed) { const schemaMismatch = error instanceof AppError && error.category === "SCHEMA_MISMATCH"; this.emitRunEvent(failed, schemaMismatch ? "tele_auto.sheets.schema_mismatch" : "tele_auto.run.failed", schemaMismatch ? "ERROR" : "WARNING", "PRE_WRITE", schemaMismatch ? "SHEET_SCHEMA_MISMATCH" : "PLANNING_FAILURE"); } return; }
      if (run.status === "NEEDS_CLARIFICATION") { this.emitRunEvent(run, "tele_auto.run.needs_clarification", "INFO", "PRE_WRITE"); await this.notifyClarification(run); return; }
      if (run.status === "AWAITING_CONFIRMATION") { this.emitRunEvent(run, "tele_auto.run.awaiting_confirmation", "INFO", "PRE_WRITE"); await this.publishConfirmation(run); return; }
      if (run.status === "COMPLETED") { await this.notify(run); return; }
      if (["FAILED_FINAL", "REJECTED"].includes(run.status)) { this.emitRunEvent(run, "tele_auto.run.failed", "ERROR", run.executionPhase, run.lastError); await this.publishStatus(run.updateKey, "FAILED", "Proses tidak dapat diselesaikan."); return; }
    }
    if (run.status === "READY" || run.status === "FAILED_RETRYABLE") await this.execute(run);
    else if (run.status === "EFFECT_UNCERTAIN") await this.reconcile(run);
  }

  private async plan(run: DurableRun): Promise<DurableRun> {
    if (!run.rawBlockBody) return this.repository.replanRun(run.runId, { status: "REQUIRES_CLARIFICATION", reasons: ["MISSING_INPUT"] }, run.version, this.now());
    const sheetNames = run.domain === "PRODUCTION" || run.domain === "WASTE" ? await this.reader.listSheetNames(run.store, run.domain) : undefined;
    const block = await parseCommandBlock({ domain: run.domain, body: run.rawBlockBody }, { now: this.now(), availableSheetNames: sheetNames, aiResolver: this.aiResolver });
    const targets: Record<string, SheetWriteTarget> = {};
    const day = block.normalizedDate?.day;
    for (const item of block.items) {
      if (item.status !== "RESOLVED" || !item.canonicalSkuId) continue;
      if ((run.domain === "DAILY_SO" && day === undefined) || ((run.domain !== "DAILY_SO") && !block.tabName)) continue;
      try { targets[item.canonicalSkuId] = resolveTarget({ store: run.store, domain: run.domain, sku: item.canonicalSkuId, sheetName: block.tabName, day }); } catch { /* planner emits safe clarification */ }
    }
    const observedValues: Record<string, unknown> = {};
    if (run.domain === "DAILY_SO" && day !== undefined) {
      for (const sku of Object.keys(DAILY_SO_SCHEMAS[run.store]) as CanonicalSkuId[]) { targets[sku] ??= resolveTarget({ store: run.store, domain: run.domain, sku, day }); observedValues[sku] = await this.reader.readTargetCurrent(targets[sku]); }
    } else for (const target of Object.values(targets)) observedValues[target.canonicalSkuId] = await this.reader.readTargetCurrent(target);
    const observed: BusinessObservation = { store: run.store, domain: run.domain, values: observedValues, ...(run.domain === "DAILY_SO" && block.normalizedDate ? { snapshotState: (await this.repository.getSnapshot(run.store, block.normalizedDate.iso)).state } : {}) };
    const decision: BusinessPlanResult = run.domain === "PRODUCTION" ? planProduction({ store: run.store, block, targets, observed }) : run.domain === "WASTE" ? planWaste({ store: run.store, block, targets, observed }) : planDailySo({ store: run.store, block, targets, observed });
    return this.repository.replanRun(run.runId, decision, run.version, this.now(), { date: block.normalizedDate?.iso });
  }

  private async execute(run: DurableRun): Promise<void> {
    const claim = await this.repository.claimExecution(run.runId, `worker-${process.pid}`, this.now(), this.leaseMs);
    if (claim.status !== "CLAIMED") return;
    const claimed = claim.run;
    if (!claimed.plan) return;
    const pending: MutationEffect[] = [];
    try {
      for (const effect of claimed.plan.effects) {
        const current = normalizeExistingValue(await this.reader.readEffectCurrent(effect));
        if (current === effect.desiredValue) continue;
        if (current !== effect.expectedOldValue) { const failed = await this.repository.failExecution(claimed.runId, claimed.lease!.owner, claimed.version, true, "Expected sheet value changed", this.now()); this.emitRunEvent(failed, "tele_auto.run.failed", "ERROR", "PRE_WRITE", "EXPECTED_OLD_MISMATCH"); return; }
        pending.push(effect);
      }
    } catch (error) {
      const final = error instanceof Error && error.name === "SheetsReadError" && (error as { classification?: string }).classification === "FINAL";
      const failed = await this.repository.failExecution(claimed.runId, claimed.lease!.owner, claimed.version, final, error instanceof Error ? error.message : "Pre-write observation failed", this.now());
      const schemaMismatch = error instanceof AppError && error.category === "SCHEMA_MISMATCH";
      this.emitRunEvent(failed, schemaMismatch ? "tele_auto.sheets.schema_mismatch" : "tele_auto.run.failed", schemaMismatch ? "ERROR" : final ? "ERROR" : "WARNING", "PRE_WRITE", schemaMismatch ? "SHEET_SCHEMA_MISMATCH" : error instanceof Error ? error.name : "PRE_WRITE_FAILURE");
      return;
    }
    if (!pending.length) { const completed = await this.repository.completeExecution(claimed.runId, claimed.lease!.owner, claimed.version, this.now()); return this.notify(completed); }
    let writing = await this.repository.markWriteStarted(claimed.runId, claimed.lease!.owner, claimed.version, this.now());
    try {
      await this.writer.writeEffects(pending);
      writing = await this.repository.markWriteConfirmed(writing.runId, writing.lease!.owner, writing.version, this.now());
      const completed = await this.repository.completeExecution(writing.runId, writing.lease!.owner, writing.version, this.now());
      await this.notify(completed);
    } catch (error) {
      const sheetsError = error instanceof Error && error.name === "SheetsWriteError" ? error as Error & { classification?: string; externalMutationOccurred?: boolean } : undefined;
      if (sheetsError && !sheetsError.externalMutationOccurred && sheetsError.classification !== "UNCERTAIN") {
        const classification = sheetsError.classification;
        const failed = await this.repository.failExecution(writing.runId, writing.lease!.owner, writing.version, classification === "FINAL", sheetsError.message, this.now());
        this.emitRunEvent(failed, "tele_auto.run.failed", classification === "FINAL" ? "ERROR" : "WARNING", "WRITE_STARTED", sheetsError.name);
        await this.publishStatus(writing.updateKey, "FAILED", "Proses tidak dapat diselesaikan.");
      } else {
        const uncertain = await this.repository.markEffectUncertain(writing.runId, writing.lease!.owner, writing.version, this.now()).catch(() => undefined);
        this.emitRunEvent(uncertain ?? writing, "tele_auto.run.effect_uncertain", "ERROR", "WRITE_STARTED", "EFFECT_UNCERTAIN");
      }
    }
  }

  private async reconcile(run: DurableRun): Promise<void> {
    if (!run.plan) return;
    let current = run;
    if (!current.effectRecovery) {
      const claim = await this.repository.claimReconciliation(run.runId, `worker-${process.pid}`, this.now(), this.leaseMs);
      if (claim.status !== "CLAIMED") return;
      current = claim.run;
      const plan = current.plan;
      if (!plan) return;
      const observations: Record<string, unknown> = {};
      for (const effect of plan.effects) observations[effect.canonicalSkuId] = await this.reader.readEffectCurrent(effect);
      const outcomes = plan.effects.map(effect => { const value = normalizeExistingValue(observations[effect.canonicalSkuId]); return { effectId: `${effect.domain}:${effect.store}:${effect.date}:${effect.canonicalSkuId}`, outcome: value === effect.desiredValue ? "ALREADY_APPLIED" as const : value === effect.expectedOldValue ? "RETRY_NEEDED" as const : "DO_NOT_OVERWRITE" as const, reconciledAt: this.now().toISOString() }; });
      current = await this.repository.persistReconciliation({ runId: current.runId, expectedVersion: current.version, outcomes, owner: current.lease!.owner, now: this.now() });
    }
    if (current.effectRecovery?.some(item => item.outcome === "DO_NOT_OVERWRITE")) return;
    if ((current.residualEffectIds ?? []).length === 0) { const completed = await this.repository.completeReconciledRun(current.runId, current.version); this.emitRunEvent(completed, "tele_auto.run.completed", "INFO", "WRITE_CONFIRMED"); return; }
    const claim = await this.repository.claimExecution(current.runId, `worker-${process.pid}`, this.now(), this.leaseMs);
    if (claim.status !== "CLAIMED" || !claim.run.plan || !claim.run.lease) return;
    const residual = residualEffects(claim.run);
    for (const effect of residual) {
      const value = normalizeExistingValue(await this.reader.readEffectCurrent(effect));
      if (value === effect.desiredValue) { await this.persistResidualOutcome(claim.run, effect, "ALREADY_APPLIED"); return this.reconcile(await this.repository.getRun(claim.run.runId) as DurableRun); }
      if (value !== effect.expectedOldValue) { await this.persistResidualOutcome(claim.run, effect, "DO_NOT_OVERWRITE"); return; }
    }
    try {
      await this.writer.writeEffects(residual);
      const executing = await this.repository.markEffectUncertain(claim.run.runId, claim.run.lease.owner, claim.run.version, this.now());
      const outcomes = (executing.plan?.effects ?? []).map(effect => ({ effectId: effectIdentity(effect), outcome: "ALREADY_APPLIED" as const, reconciledAt: this.now().toISOString() }));
      const reconciled = await this.repository.persistReconciliation({ runId: executing.runId, expectedVersion: executing.version, outcomes, owner: claim.run.lease.owner, now: this.now() });
      const completed = await this.repository.completeReconciledRun(reconciled.runId, reconciled.version);
      this.emitRunEvent(completed, "tele_auto.run.completed", "INFO", "WRITE_CONFIRMED");
    } catch { await this.repository.markEffectUncertain(claim.run.runId, claim.run.lease.owner, claim.run.version, this.now()).catch(() => undefined); }
  }

  private async persistResidualOutcome(run: DurableRun, effect: MutationEffect, outcome: "ALREADY_APPLIED" | "DO_NOT_OVERWRITE"): Promise<void> {
    if (!run.lease) return;
    const uncertain = await this.repository.markEffectUncertain(run.runId, run.lease.owner, run.version, this.now());
    const previous = uncertain.effectRecovery ?? [];
    const outcomes = [...previous.filter(item => item.effectId !== effectIdentity(effect)), { effectId: effectIdentity(effect), outcome, reconciledAt: this.now().toISOString() }];
    await this.repository.persistReconciliation({ runId: uncertain.runId, expectedVersion: uncertain.version, outcomes, owner: run.lease.owner, now: this.now() });
  }

  private async notify(run: DurableRun): Promise<void> {
    this.emitRunEvent(run, "tele_auto.run.completed", "INFO", run.executionPhase ?? "WRITE_CONFIRMED");
    await this.publishStatus(run.updateKey, "SUCCESS", "Berhasil diproses.\nAnda dapat mengirim input berikutnya.");
  }

  private async notifyClarification(run: DurableRun): Promise<void> {
    if (!this.notifier) { this.logger.warn("Clarification delivery skipped: notifier unavailable", { runId: run.runId, store: run.store, domain: run.domain }); return; }
    const claim = await this.repository.claimClarificationDelivery(run.runId, this.now());
    if (claim.status !== "CLAIMED") { if (claim.status === "ALREADY_DELIVERED") this.logger.debug("Clarification already delivered", { runId: run.runId }); return; }
    const date = run.date ?? "tanggal tersebut";
    this.logger.info("Clarification delivery attempted", { runId: run.runId, store: run.store, domain: run.domain, attempt: claim.run.clarificationDelivery?.attempt ?? 1 });
    try {
      const delivery = await this.publishStatus(run.updateKey, "NEEDS_INFORMATION", `Perlu informasi tambahan.\n\nData ${run.domain === "PRODUCTION" ? "produksi" : run.domain === "WASTE" ? "waste" : "Daily SO"} untuk ${date} belum diisi.\nKirim SKU dan quantity yang ingin dicatat.\n\nSelesaikan input ini terlebih dahulu sebelum mengirim data berikutnya.`);
      if (!delivery.ok) {
        this.emitTelemetry("tele_auto.telegram.delivery_failed", "WARNING", run, "TELEGRAM_DELIVERY_FAILED");
        await this.repository.recordClarificationDelivery(run.runId, claim.run.version, delivery.classification === "RETRYABLE" ? "FAILED_RETRYABLE" : "FAILED_FINAL", this.now(), "Telegram clarification delivery failed");
        return;
      }
      await this.repository.recordClarificationDelivery(run.runId, claim.run.version, "DELIVERED", this.now());
      this.logger.info("Clarification delivery succeeded", { runId: run.runId, store: run.store, domain: run.domain });
    } catch (error) {
      const classification = error instanceof TelegramDeliveryError && error.classification === "RETRYABLE" ? "RETRYABLE" : "FINAL";
      await this.repository.recordClarificationDelivery(run.runId, claim.run.version, classification === "FINAL" ? "FAILED_FINAL" : "FAILED_RETRYABLE", this.now(), "Telegram clarification delivery failed").catch(recordError => this.logger.warn("Clarification delivery result could not be persisted", { runId: run.runId, error: String(recordError) }));
      this.emitTelemetry("tele_auto.telegram.delivery_failed", "WARNING", run, "TELEGRAM_DELIVERY_FAILED");
      this.logger.warn("Clarification delivery failed", { runId: run.runId, store: run.store, domain: run.domain, classification });
    }
  }

  private async publishConfirmation(run: DurableRun): Promise<void> {
    const correction = run.plan?.corrections?.[0];
    const detail = correction ? `${correction.canonicalSkuId}: ${String(correction.oldValue)} → ${String(correction.proposedValue)}` : "Ada perubahan pada data yang sudah tercatat.";
    await this.publishStatus(run.updateKey, "NEEDS_CONFIRMATION", `Perlu konfirmasi perubahan.\n${detail}\n\nSelesaikan input ini terlebih dahulu sebelum mengirim data berikutnya.`);
  }

  private async publishStatus(updateKey: string, _state: PrimaryStatusState, _text: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly classification: "RETRYABLE" | "FINAL" }> {
    if (!this.notifier) return { ok: false, classification: "FINAL" };
    const update = await this.repository.getUpdate(updateKey);
    if (!update) return { ok: false, classification: "FINAL" };
    const runs = await Promise.all(update.blockRunIds.map(runId => this.repository.getRun(runId)));
    if (runs.some(run => !run)) return { ok: false, classification: "FINAL" };
    const aggregate = aggregateStatus(runs as DurableRun[], _state);
    const state = aggregate.state;
    const text = aggregate.text;
    const claim = await this.repository.claimPrimaryStatus(updateKey, state, aggregate.fingerprint, this.now());
    if (claim.status !== "CLAIMED") return claim.status === "ALREADY_DELIVERED" ? { ok: true } : { ok: false, classification: "RETRYABLE" };
    const claimed = claim.update;
    try {
      let messageId = claimed.primaryStatusMessage?.messageId;
      if (messageId && this.notifier.edit) await this.notifier.edit(claimed.chatId, messageId, text);
      else {
        const sent = await this.notifier.send(claimed.chatId, text);
        if (typeof sent === "string") messageId = sent;
      }
      await this.repository.recordPrimaryStatus(updateKey, claimed.version, state, aggregate.fingerprint, "DELIVERED", this.now(), messageId);
      this.logger.info("Primary status delivered", { updateKey, state });
      return { ok: true };
    } catch (error) {
      if (claimed.primaryStatusMessage?.messageId && (state === "SUCCESS" || state === "FAILED")) {
        try {
          const fallback = await this.notifier.send(claimed.chatId, text);
          await this.repository.recordPrimaryStatus(updateKey, claimed.version, state, aggregate.fingerprint, "DELIVERED", this.now(), typeof fallback === "string" ? fallback : undefined);
          this.logger.warn("Primary status edit failed; bounded fallback sent", { updateKey, state });
          return { ok: true };
        } catch (fallbackError) {
          this.logger.warn("Primary status fallback failed", { updateKey, state, error: String(fallbackError) });
        }
      }
      await this.repository.recordPrimaryStatus(updateKey, claimed.version, state, aggregate.fingerprint, "FAILED", this.now()).catch(recordError => this.logger.warn("Primary status result could not be persisted", { updateKey, error: String(recordError) }));
      this.logger.warn("Primary status delivery failed", { updateKey, state, error: String(error) });
      this.emitTelemetry("tele_auto.telegram.delivery_failed", "WARNING", undefined, "TELEGRAM_DELIVERY_FAILED", updateKey);
      return { ok: false, classification: error instanceof TelegramDeliveryError && error.classification === "RETRYABLE" ? "RETRYABLE" : "FINAL" };
    }
  }

  private emitRunEvent(run: DurableRun, type: TeleAutoEventType, severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL", phase?: string, errorCode?: string): void {
    this.emitTelemetry(type, severity, run, phase, undefined, errorCode);
  }

  private emitTelemetry(type: TeleAutoEventType, severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL", run?: DurableRun, phase?: string, subjectId?: string, errorCode?: string): void {
    const subject = run?.runId ?? subjectId ?? "runtime";
    emitTelemetrySafely(this.telemetry, {
      eventId: stableTelemetryEventId(subject, type, run?.version ?? 0),
      type,
      occurredAt: this.now(),
      ...(run ? { runId: run.runId, store: run.store, domain: run.domain, status: run.status } : {}),
      severity,
      ...(phase ? { executionPhase: phase } : {}),
      ...(errorCode ? { errorCode } : {})
    }, this.logger);
  }
}
