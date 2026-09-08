import type { DurableRun, PrimaryStatusState } from "../persistence/durable-types.js";

export type AggregateStatus = {
  readonly state: PrimaryStatusState;
  readonly fingerprint: string;
  readonly text: string;
};

const label = (domain: DurableRun["domain"]): string => domain === "PRODUCTION" ? "Produksi" : domain === "WASTE" ? "Waste" : "Daily SO";
const active = new Set(["PARSED", "PLANNED", "READY", "EXECUTING", "EFFECT_UNCERTAIN", "FAILED_RETRYABLE"]);
const terminal = new Set(["COMPLETED", "FAILED_FINAL", "REJECTED"]);

function childState(run: DurableRun): string {
  if (run.status === "NEEDS_CLARIFICATION") return "Perlu informasi";
  if (run.status === "AWAITING_CONFIRMATION") return "Perlu konfirmasi";
  if (active.has(run.status)) return "Sedang diproses";
  if (run.status === "COMPLETED") return "Berhasil";
  if (terminal.has(run.status)) return "Gagal";
  return "Sedang diproses";
}

function fingerprintData(run: DurableRun): unknown {
  return {
    id: run.runId, version: run.version, status: run.status,
    decision: run.decisionStatus, date: run.date,
    pending: run.pendingInteraction ? { kind: run.pendingInteraction.kind, expiresAt: run.pendingInteraction.expiresAt } : undefined,
    clarification: run.clarificationDelivery ? { state: run.clarificationDelivery.state, attempt: run.clarificationDelivery.attempt } : undefined,
    corrections: run.plan?.corrections?.map(correction => ({ sku: correction.canonicalSkuId, old: correction.oldValue, proposed: correction.proposedValue, operation: correction.operation }))
  };
}

function detail(run: DurableRun): string {
  if (run.status === "NEEDS_CLARIFICATION") {
    const date = run.date ?? "tanggal tersebut";
    const subject = run.domain === "PRODUCTION" ? "produksi" : run.domain === "WASTE" ? "waste" : "Daily SO";
    return `${label(run.domain)}:\nData ${subject} untuk ${date} belum diisi.\nKirim SKU dan quantity yang ingin dicatat.`;
  }
  if (run.status === "AWAITING_CONFIRMATION") {
    const correction = run.plan?.corrections?.[0];
    return `${label(run.domain)}:\n${correction ? `${correction.canonicalSkuId}: ${String(correction.oldValue)} → ${String(correction.proposedValue)}` : "Ada perubahan pada data yang sudah tercatat."}`;
  }
  return "";
}

function skippedDetail(runs: readonly DurableRun[]): string {
  const terms = runs.flatMap(run => run.plan?.skippedItems?.map(item => item.rawTerm.trim()).filter(Boolean) ?? []);
  return terms.length ? `\nSKU yang dilewati karena tidak dikenali: ${terms.join(", ")}` : "";
}

export function aggregateStatus(runs: readonly DurableRun[], displayHint?: PrimaryStatusState): AggregateStatus {
  const ordered = [...runs].sort((a, b) => a.blockIndex - b.blockIndex);
  if (!ordered.length) return { state: "FAILED", fingerprint: "empty", text: "Proses tidak dapat diselesaikan." };
  // The fingerprint describes durable child content only. Presentation hints
  // (RECEIVED/PROCESSING during the planning window) must not manufacture
  // aggregate revisions or let a stale worker win an edit race.
  const fingerprint = JSON.stringify(ordered.map(fingerprintData));
  const hasClarification = ordered.some(run => run.status === "NEEDS_CLARIFICATION");
  const hasConfirmation = ordered.some(run => run.status === "AWAITING_CONFIRMATION");
  const hasActive = ordered.some(run => active.has(run.status));
  const allTerminal = ordered.every(run => terminal.has(run.status));
  const derived: PrimaryStatusState = hasClarification ? "NEEDS_INFORMATION" : hasConfirmation ? "NEEDS_CONFIRMATION" : hasActive || ordered.some(run => run.status === "RECEIVED") && !ordered.every(run => run.status === "RECEIVED") ? "PROCESSING" : allTerminal && ordered.every(run => run.status === "COMPLETED") ? "SUCCESS" : allTerminal && ordered.length === 1 ? "FAILED" : allTerminal ? "SUCCESS" : ordered.every(run => run.status === "RECEIVED") ? "RECEIVED" : "PROCESSING";
  // RECEIVED/PROCESSING are presentation hints during the short planning window.
  // They may never downgrade an actionable or terminal sibling state.
  const state: PrimaryStatusState = displayHint === "PROCESSING" && derived === "RECEIVED" ? "PROCESSING" : derived;
  if (ordered.length === 1) {
    const run = ordered[0];
    if (state === "NEEDS_INFORMATION") return { state, fingerprint, text: `Perlu informasi tambahan.\n\n${detail(run)}\n\nSelesaikan input ini terlebih dahulu sebelum mengirim data berikutnya.` };
    if (state === "NEEDS_CONFIRMATION") return { state, fingerprint, text: `Perlu konfirmasi perubahan.\n${detail(run)}\n\nSelesaikan input ini terlebih dahulu sebelum mengirim data berikutnya.` };
    if (state === "PROCESSING") return { state, fingerprint, text: "Input sedang diproses...\nMohon tunggu hingga proses selesai sebelum mengirim input berikutnya." };
    if (state === "SUCCESS") return { state, fingerprint, text: `Berhasil diproses.${skippedDetail(ordered)}\nAnda dapat mengirim input berikutnya.` };
    return { state: "FAILED", fingerprint, text: "Proses tidak dapat diselesaikan.\nAnda dapat mengirim input berikutnya." };
  }
  const summary = ordered.map(run => `${label(run.domain)}: ${childState(run)}`).join("\n");
  const actionable = ordered.filter(run => run.status === "NEEDS_CLARIFICATION" || run.status === "AWAITING_CONFIRMATION").map(detail).filter(Boolean).join("\n\n");
  const intro = state === "NEEDS_INFORMATION" ? "Perlu informasi tambahan." : state === "NEEDS_CONFIRMATION" ? "Perlu konfirmasi perubahan." : state === "PROCESSING" ? "Input sedang diproses..." : state === "SUCCESS" ? "Proses selesai." : "Proses tidak dapat diselesaikan.";
  const footer = state === "PROCESSING" ? "Mohon tunggu hingga proses selesai sebelum mengirim input berikutnya." : state === "NEEDS_INFORMATION" || state === "NEEDS_CONFIRMATION" ? "Selesaikan input ini terlebih dahulu sebelum mengirim data berikutnya." : "Anda dapat mengirim input berikutnya.";
  return { state, fingerprint, text: `${intro}\n\n${summary}${actionable ? `\n\n${actionable}` : ""}${state === "SUCCESS" ? skippedDetail(ordered) : ""}\n\n${footer}` };
}
