/* Pure display helpers for document status. No I/O. */

/** How long a document may wait for FIRA's answer before the UI treats it as a problem. */
export const SENDING_WINDOW_MS = 2 * 60 * 1000;

interface StatusDoc {
  status: string;
  created_at?: string | null;
  fira_response?: unknown;
  fira_error?: string | null;
  line_items?: unknown;
  validation_errors?: unknown;
}

/**
 * A document that passed every check is stored as "failed" right before it is sent to FIRA,
 * and only becomes "sent" (or needs_review/failed) once FIRA answers (up to ~8 s).
 * Until FIRA has answered — and for at most SENDING_WINDOW_MS — it is shown as "sending".
 */
export function isAwaitingFira(doc: StatusDoc, now: number = Date.now()): boolean {
  if (doc.status !== "failed") return false;
  if (doc.fira_response != null || doc.fira_error) return false;
  if (!Array.isArray(doc.line_items) || doc.line_items.length === 0) return false;
  if (Array.isArray(doc.validation_errors) && doc.validation_errors.length > 0) return false;
  const created = doc.created_at ? Date.parse(doc.created_at) : NaN;
  if (Number.isNaN(created)) return false;
  return now - created < SENDING_WINDOW_MS;
}

/** Returns the document with status "sending" while it is waiting for FIRA; otherwise unchanged. */
export function withDisplayStatus<T extends StatusDoc>(doc: T, now: number = Date.now()): T {
  return isAwaitingFira(doc, now) ? { ...doc, status: "sending" } : doc;
}
