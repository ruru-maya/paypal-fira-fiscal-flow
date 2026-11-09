import { createFileRoute } from "@tanstack/react-router";
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
      <ul className="mt-10 grid gap-3 sm:grid-cols-2">
        {EVENT_GROUPS_PLAIN.map((e) => (
          <li key={e} className="flex items-center gap-3 rounded-lg border bg-card p-4 text-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-success" /> {e}
          </li>
        ))}
      </ul>
    </main>
  );
}
