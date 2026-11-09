import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EVENT_GROUPS_PLAIN } from "@/lib/fiskal/routing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FiskalBridge — PayPal to FIRA fiscalization" },
      { name: "description", content: "Every PayPal payment becomes a fiscalized FIRA invoice; every refund a storno. Set and forget." },
      { property: "og:title", content: "FiskalBridge — PayPal to FIRA fiscalization" },
      { property: "og:description", content: "Every PayPal payment becomes a fiscalized FIRA invoice; every refund a storno." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20 font-sans">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">FiskalBridge</p>
      <h1 className="mt-4 text-4xl font-bold leading-tight text-foreground sm:text-5xl">
        PayPal payments in, fiscalized FIRA invoices out.
      </h1>
      <p className="mt-6 text-lg text-muted-foreground">
        Connect PayPal and FIRA once. Every payment becomes an invoice, every refund or chargeback a storno —
        automatically. We never touch your money.
      </p>
      <div className="mt-8 flex gap-3">
        <Button asChild size="lg"><Link to="/auth">Get started</Link></Button>
        <Button asChild size="lg" variant="outline"><Link to="/dashboard">Dashboard</Link></Button>
      </div>
      <ul className="mt-10 grid gap-3 sm:grid-cols-2">
        {EVENT_GROUPS_PLAIN.map((e) => (
          <li key={e} className="flex items-center gap-3 rounded-lg border bg-card p-4 text-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-success" /> {e}
          </li>
        ))}
      </ul>

      <section className="mt-20">
        <h2 className="text-2xl font-bold text-foreground">How it works</h2>
        <ol className="mt-6 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.t} className="flex gap-4 rounded-lg border bg-card p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{i + 1}</span>
              <div><p className="font-semibold text-foreground">{s.t}</p><p className="text-sm text-muted-foreground">{s.d}</p></div>
            </li>
          ))}
        </ol>
        <h3 className="mt-12 text-lg font-semibold text-foreground">PayPal event → what we do</h3>
        <div className="mt-4 overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground"><tr><th className="px-4 py-2 font-medium">PayPal event</th><th className="px-4 py-2 font-medium">What we do</th></tr></thead>
            <tbody className="divide-y">
              {EVENT_TABLE.map(([e, a]) => <tr key={e}><td className="px-4 py-2 font-mono text-xs">{e}</td><td className="px-4 py-2">{a}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
      <footer className="mt-20 border-t pt-6 text-sm text-muted-foreground">Open source (AGPL-3.0) · Not affiliated with PayPal or FIRA</footer>
    </main>
  );
}

const STEPS = [
  { t: "PayPal webhook", d: "PayPal tells us a payment, refund or dispute happened." },
  { t: "Verify & de-duplicate", d: "We check PayPal's signature and ignore events we've already seen." },
  { t: "Rules route the event", d: "A fixed table decides: invoice, storno, watch, or nothing. No AI here." },
  { t: "AI maps invoice lines + VAT", d: "AI turns messy PayPal item data into clean invoice lines and VAT rates, and explains them." },
  { t: "Code validates → FIRA, or human review", d: "Totals must match to the cent and VAT rates must be allowed. If anything is unsure, you review it first." },
];

const EVENT_TABLE: [string, string][] = [
  ["PAYMENT.CAPTURE.COMPLETED", "Invoice"],
  ["PAYMENT.SALE.COMPLETED", "Invoice (subscription renewal)"],
  ["INVOICING.INVOICE.PAID", "Invoice"],
  ["PAYMENT.CAPTURE.REFUNDED / PAYMENT.SALE.REFUNDED", "Storno (full or partial)"],
  ["PAYMENT.CAPTURE.REVERSED", "Storno (chargeback)"],
  ["CUSTOMER.DISPUTE.CREATED / UPDATED", "Watch the dispute, no document"],
  ["CUSTOMER.DISPUTE.RESOLVED", "Storno if the buyer won, otherwise no action"],
  ["BILLING.SUBSCRIPTION.*, PAYMENT.CAPTURE.PENDING / DENIED", "Logged, no document"],
  ["Anything else", "Logged and ignored"],
];
