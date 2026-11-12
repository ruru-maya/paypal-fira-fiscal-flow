import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { queryOptions } from "@tanstack/react-query";
import { getMerchant } from "@/lib/fiskal/merchant.functions";

export const merchantQuery = () =>
  queryOptions({ queryKey: ["merchant"], queryFn: () => getMerchant() });

const STYLES: Record<string, string> = {
  sent: "bg-success/15 text-success border-success/40",
  watching: "bg-warning/30 text-warning-foreground border-warning",
  needs_review: "bg-warning/30 text-warning-foreground border-warning",
  sending: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/10 text-destructive border-destructive/40",
  rejected: "bg-destructive/10 text-destructive border-destructive/40",
  ignored: "bg-muted text-muted-foreground border-border",
  skipped: "bg-muted text-muted-foreground border-border",
};
const LABELS: Record<string, string> = {
  sent: "Sent", watching: "Watching", needs_review: "Needs review", sending: "Sending…", failed: "Failed", rejected: "Rejected", ignored: "No action", skipped: "Skipped",
};
export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STYLES[status] ?? STYLES["ignored"]}`}>{LABELS[status] ?? status}</span>;
}

export function DemoBanner() {
  return (
    <div className="border-b border-warning bg-warning px-4 py-2 text-center text-sm font-semibold text-warning-foreground">
      Testing mode — FIRA creates offers, not official invoices
    </div>
  );
}

export function whatWeDid(doc?: { kind: string; status: string; invoice_type?: string | null }) {
  if (!doc) return "Nothing yet";
  if (doc.status === "rejected") return "Rejected (unverified)";
  if (doc.status === "watching") return "Watching dispute";
  if (doc.status === "skipped") return "Skipped by you";
  if (doc.status === "ignored") return "No document needed";
  if (doc.status === "needs_review") return "Waiting for your review";
  if (doc.status === "sending") return "Sending to FIRA…";
  if (doc.status === "failed") return "Sending to FIRA failed";
  const offer = doc.invoice_type === "PONUDA" ? " (as offer)" : "";
  return doc.kind === "storno" ? `Storno created in FIRA${offer}` : `Invoice created in FIRA${offer}`;
}


/* ---------- Plain-language helpers for the merchant's own screens ---------- */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const PLAIN_KIND: Record<string, string> = {
  one_time_payment: "Payment", subscription_payment: "Subscription renewal", paypal_invoice_paid: "Payment",
  refund: "Refund", chargeback: "Chargeback", dispute_open: "Dispute opened", dispute_resolved: "Dispute closed",
  info: "PayPal update", ignored: "PayPal update",
};

export function plainResult(doc: any): string {
  if (!doc) return "Nothing to do";
  const offer = doc.invoice_type === "PONUDA";
  const no = doc.fira_invoice_number ? ` no. ${doc.fira_invoice_number}` : "";
  switch (doc.status) {
    case "watching": return "Dispute opened — we're keeping an eye on it";
    case "needs_review": return "Needs your attention";
    case "sending": return "Sending to FIRA…";
    case "failed": return "Couldn't create the invoice";
    case "skipped": return "No invoice — you chose to skip it";
    case "rejected": return "Ignored — couldn't confirm it came from PayPal";
    case "ignored": return "Nothing to do";
  }
  if (doc.kind === "storno") return offer ? `Cancellation offer${no} created` : `Invoice cancelled (storno${no})`;
  return offer ? `Offer${no} created` : `Invoice${no} created`;
}

export function plainHeadline(doc: any): string {
  if (!doc) return "Nothing to do for this one";
  const r = plainResult(doc);
  return doc.status === "sent" ? `${r} in FIRA` : r;
}

const PILL: Record<string, [string, string]> = {
  sent: ["✓ Done", "bg-success/15 text-success border-success/40"],
  ignored: ["✓ Done", "bg-muted text-muted-foreground border-border"],
  skipped: ["✓ Done", "bg-muted text-muted-foreground border-border"],
  watching: ["⚠ Check", "bg-warning/30 text-warning-foreground border-warning"],
  needs_review: ["⚠ Check", "bg-warning/30 text-warning-foreground border-warning"],
  sending: ["… Sending", "bg-muted text-muted-foreground border-border"],
  failed: ["✕ Problem", "bg-destructive/10 text-destructive border-destructive/40"],
  rejected: ["✕ Problem", "bg-destructive/10 text-destructive border-destructive/40"],
};
export function PlainPill({ status }: { status: string }) {
  const [label, cls] = PILL[status] ?? PILL["ignored"]!;
  return <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export function friendlyTime(iso: string): string {
  const d = new Date(iso);
  const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86400000);
  if (diff === 0) return `Today, ${t}`;
  if (diff === 1) return `Yesterday, ${t}`;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${t}`;
}

/** Rewrites technical warnings in plain words (the original stays in Technical details). */
export function plainWarning(w: string): string {
  if (/outside the EU|export|OSS/i.test(w)) return "The customer is outside the EU. Different tax rules may apply — check with your accountant.";
  if (/reverse charge|VAT id|B2B|business/i.test(w)) return "The customer looks like a business from another EU country. Different tax rules may apply — check with your accountant.";
  if (/partial refund|proportional/i.test(w)) return "Only part of the payment was refunded. Please check which items are being cancelled.";
  if (/AI mapping unavailable|rule-based/i.test(w)) return "Our assistant was unavailable, so we prepared this one with simple rules.";
  if (/no item name|generic name/i.test(w)) return "PayPal didn't tell us what was sold, so we used a general name.";
  if (/did not add up|add up/i.test(w)) return "PayPal's item list didn't match the amount paid, so we used one line.";
  if (/original invoice.*not found/i.test(w)) return "We couldn't find the original invoice for this refund.";
  if (/could not fetch extra details/i.test(w)) return "We couldn't get all the details from PayPal.";
  if (/default when unsure|VAT rate|unsure/i.test(w)) return "We weren't sure about the VAT rate for an item — please check it.";
  return w;
}

/** Turns a stored FIRA error into one plain sentence. */
export function plainFiraError(e: string): string {
  if (/Unrecognized field/i.test(e)) return "FIRA didn't accept this invoice because of a problem on our side, not your data.";
  if (/key invalid/i.test(e)) return "FIRA didn't accept your FIRA key. Please reconnect FIRA in Settings.";
  if (/unpaid/i.test(e)) return "Your FIRA subscription seems to be unpaid, so FIRA didn't create the invoice.";
  if (/rejected the document/i.test(e)) return "FIRA didn't accept this invoice. Please check the items and try again.";
  return "We couldn't reach FIRA. Please try again in a moment.";
}

export function TechnicalDetails({ children, title = "Technical details" }: { children: ReactNode; title?: string }) {
  return (
    <details className="group rounded-lg border text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-muted-foreground">{title}<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
      <div className="space-y-3 border-t p-3">{children}</div>
    </details>
  );
}
