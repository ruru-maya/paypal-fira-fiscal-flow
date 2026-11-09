import { queryOptions } from "@tanstack/react-query";
import { getMerchant } from "@/lib/fiskal/merchant.functions";

export const merchantQuery = () =>
  queryOptions({ queryKey: ["merchant"], queryFn: () => getMerchant() });

const STYLES: Record<string, string> = {
  sent: "bg-success/15 text-success border-success/40",
  watching: "bg-warning/30 text-warning-foreground border-warning",
  needs_review: "bg-warning/30 text-warning-foreground border-warning",
  failed: "bg-destructive/10 text-destructive border-destructive/40",
  rejected: "bg-destructive/10 text-destructive border-destructive/40",
  ignored: "bg-muted text-muted-foreground border-border",
};
const LABELS: Record<string, string> = {
  sent: "Sent", watching: "Watching", needs_review: "Needs review", failed: "Failed", rejected: "Rejected", ignored: "No action",
};
export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STYLES[status] ?? STYLES["ignored"]}`}>{LABELS[status] ?? status}</span>;
}

export function DemoBanner() {
  return (
    <div className="border-b border-warning bg-warning/40 px-4 py-2 text-center text-sm font-medium text-warning-foreground">
      Demo mode – documents are sent as offers, not fiscalized
    </div>
  );
}

export function whatWeDid(doc?: { kind: string; status: string; invoice_type?: string | null }) {
  if (!doc) return "Nothing yet";
  if (doc.status === "rejected") return "Rejected (unverified)";
  if (doc.status === "watching") return "Watching dispute";
  if (doc.status === "ignored") return "No document needed";
  if (doc.status === "needs_review") return "Waiting for your review";
  if (doc.status === "failed") return "Sending to FIRA failed";
  const offer = doc.invoice_type === "PONUDA" ? " (as offer)" : "";
  return doc.kind === "storno" ? `Storno created in FIRA${offer}` : `Invoice created in FIRA${offer}`;
}
