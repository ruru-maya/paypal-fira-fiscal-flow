import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge, whatWeDid } from "@/components/fiskal/shared";
import { getLiveView } from "@/lib/fiskal/merchant.functions";
import { ROUTE_LABEL, type Route as EvRoute } from "@/lib/fiskal/routing";

export const Route = createFileRoute("/live/$merchantId")({
  head: () => ({
    meta: [
      { title: "Live demo dashboard — FiskalBridge" },
      { name: "description", content: "Read-only live view: PayPal sandbox payments turning into FIRA documents in real time." },
      { property: "og:title", content: "FiskalBridge live demo" },
      { property: "og:description", content: "Watch PayPal sandbox payments become FIRA documents live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Live,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function Live() {
  const { merchantId } = Route.useParams();
  const fn = useServerFn(getLiveView);
  // Polling (anonymous visitors cannot use row-level realtime on private tables).
  const q = useQuery({ queryKey: ["live", merchantId], queryFn: () => fn({ data: { merchantId } }), refetchInterval: 3000 });
  const [open, setOpen] = useState<any>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);
  const events = q.data?.ok ? q.data.events : [];

  useEffect(() => {
    if (!q.data?.ok) return;
    const ids = events.map((e: any) => e.id as string);
    if (seen.current) {
      const added = ids.filter((id) => !seen.current!.has(id));
      if (added.length) {
        setFresh((s) => new Set([...s, ...added]));
        setTimeout(() => setFresh((s) => { const n = new Set(s); added.forEach((a) => n.delete(a)); return n; }), 4000);
      }
    }
    seen.current = new Set(ids);
  }, [q.data]);

  if (q.data && !q.data.ok) return <main className="mx-auto max-w-md px-4 py-20 text-center text-muted-foreground">This live view is not shared right now.</main>;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">Read-only live view · demo mode</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{q.data?.ok ? q.data.businessName : "…"}</h1>
        <Button asChild variant="outline"><Link to="/shop/$merchantId" params={{ merchantId }} target="_blank"><Store className="h-4 w-4" /> Open the test shop</Link></Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Pay in the test shop and the FIRA document appears here within seconds. Names and e-mails are masked.</p>
      <div className="mb-3 mt-6 flex justify-end"><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-success" /> Live</span></div>
      {events.length === 0 && <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">No events yet.</div>}
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {events.map((ev: any) => {
          const doc = ev.fiscal_documents?.[0];
          return (
            <li key={ev.id} className={fresh.has(ev.id) ? "row-fresh" : ""}>
              <button onClick={() => setOpen(ev)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-muted/50">
                <span className="w-32 text-xs text-muted-foreground">{new Date(ev.received_at).toLocaleString()}</span>
                <span className="flex flex-1 items-center gap-2 font-medium">
                  {ROUTE_LABEL[ev.route as EvRoute] ?? ev.event_type}
                  {ev.simulated && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">simulated</span>}
                  {doc?.ai_mapped && doc.confidence != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"><Sparkles className="h-3 w-3" /> AI-mapped · {Math.round(Number(doc.confidence) * 100)}%</span>
                  )}
                </span>
                <span className="w-28 text-right tabular-nums">{ev.amount != null ? `${Number(doc?.amount ?? ev.amount).toFixed(2)} ${ev.currency ?? ""}` : "—"}</span>
                <span className="hidden w-52 text-sm text-muted-foreground sm:block">{whatWeDid(doc)}{doc?.fira_invoice_number && <span className="block text-xs">No. {doc.fira_invoice_number}</span>}</span>
                {doc && <StatusBadge status={doc.status} />}
              </button>
            </li>
          );
        })}
      </ul>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open && (() => {
            const doc = open.fiscal_documents?.[0];
            return (
              <>
                <SheetHeader><SheetTitle>{ROUTE_LABEL[open.route as EvRoute] ?? open.event_type}</SheetTitle></SheetHeader>
                <div className="space-y-5 px-4 pb-8 text-sm">
                  <div className="flex items-center gap-3">{doc && <StatusBadge status={doc.status} />}<span>{whatWeDid(doc)}</span></div>
                  <p className="text-xs text-muted-foreground">{open.event_type} · {open.simulated ? "Simulated (demo)" : open.verified ? "Signature verified" : "Not verified"}</p>
                  {doc?.status === "sent" && (
                    <div className="rounded-lg border p-3">
                      {doc.fira_invoice_number && <p>FIRA document no. <b>{doc.fira_invoice_number}</b> · {doc.invoice_type}</p>}
                      {doc.fiscal_status && <p className="text-xs text-muted-foreground">Fiscal status: {doc.fiscal_status}</p>}
                    </div>
                  )}
                  {doc?.explanation_en && (
                    <div className="space-y-2 rounded-lg bg-muted p-4">
                      <p><span className="mr-2 text-xs font-semibold text-muted-foreground">EN</span>{doc.explanation_en}</p>
                      <p><span className="mr-2 text-xs font-semibold text-muted-foreground">HR</span>{doc.explanation_hr}</p>
                    </div>
                  )}
                  {doc?.line_items?.length > 0 && (
                    <div>
                      <p className="mb-2 font-semibold">Line items</p>
                      {doc.line_items.map((l: any, i: number) => (
                        <div key={i} className="flex justify-between border-b py-1.5"><span>{l.quantity} × {l.name} <span className="text-muted-foreground">({l.taxRate}% VAT)</span></span><span className="tabular-nums">{(Number(l.price) * l.quantity).toFixed(2)}</span></div>
                      ))}
                    </div>
                  )}
                  {(doc?.warnings ?? []).length > 0 && (
                    <ul className="space-y-1 rounded-lg border border-warning bg-warning/15 p-3">{doc.warnings.map((w: string, i: number) => <li key={i}>⚠ {w}</li>)}</ul>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </main>
  );
}
