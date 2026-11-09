import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { merchantQuery, StatusBadge, whatWeDid } from "@/components/fiskal/shared";
import { listTimeline, resendDocument } from "@/lib/fiskal/merchant.functions";
import { ROUTE_LABEL, type Route as EvRoute } from "@/lib/fiskal/routing";
import { maskEmails } from "@/lib/fiskal/crypto";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — FiskalBridge" }, { name: "description", content: "Your PayPal events and FIRA documents." }] }),
  component: Dashboard,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function Dashboard() {
  const { data: md, isLoading } = useQuery(merchantQuery());
  const fetchTimeline = useServerFn(listTimeline);
  const tl = useQuery({ queryKey: ["timeline"], queryFn: () => fetchTimeline(), refetchInterval: 10000, enabled: !!md?.merchant });
  const [open, setOpen] = useState<any>(null);
  if (isLoading) return null;
  const m = md?.merchant;

  if (!m || !m.paypal_connected_at || !m.fira_connected_at) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-3xl font-bold">Let's get you connected</h1>
        <p className="mt-3 text-muted-foreground">Three short steps: your business, PayPal, and FIRA.</p>
        <Button asChild size="lg" className="mt-8"><Link to="/onboarding">Start setup</Link></Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatusCard ok label="PayPal" value="Connected" />
        <StatusCard ok label="FIRA" value="Connected" sub={m.fira_domain} />
        <StatusCard ok={!m.demo_mode} warn={m.demo_mode} label="Mode" value={m.demo_mode ? "Demo" : "Live"} sub={m.demo_mode ? "Offers only" : "Fiscalizing"} />
      </div>

      <h2 className="mb-4 mt-10 text-xl font-semibold">Activity</h2>
      {tl.data?.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          No PayPal events yet. Make a sandbox payment and it will appear here within seconds.
        </div>
      )}
      <ul className="divide-y rounded-xl border bg-card">
        {tl.data?.map((ev: any) => {
          const doc = ev.fiscal_documents?.[0];
          return (
            <li key={ev.id}>
              <button onClick={() => setOpen(ev)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-muted/50">
                <span className="w-32 text-xs text-muted-foreground">{new Date(ev.received_at).toLocaleString()}</span>
                <span className="flex-1 font-medium">{ROUTE_LABEL[ev.route as EvRoute] ?? ev.event_type}</span>
                <span className="w-28 text-right tabular-nums">{ev.amount != null ? `${Number(doc?.amount ?? ev.amount).toFixed(2)} ${ev.currency ?? ""}` : "—"}</span>
                <span className="hidden w-52 text-sm text-muted-foreground sm:block">{whatWeDid(doc)}</span>
                {doc && <StatusBadge status={doc.status} />}
              </button>
            </li>
          );
        })}
      </ul>
      <Detail ev={open} onClose={() => setOpen(null)} />
    </main>
  );
}

function StatusCard({ ok, warn, label, value, sub }: { ok?: boolean; warn?: boolean; label: string; value: string; sub?: string }) {
  return (
    <div className={`rounded-xl border p-5 ${warn ? "border-warning bg-warning/15" : "bg-card"}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
        {ok ? <CheckCircle2 className="h-5 w-5 text-success" /> : <CircleAlert className="h-5 w-5 text-warning-foreground" />} {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Detail({ ev, onClose }: { ev: any; onClose: () => void }) {
  const qc = useQueryClient();
  const resend = useServerFn(resendDocument);
  const [busy, setBusy] = useState(false);
  const doc = ev?.fiscal_documents?.[0];
  return (
    <Sheet open={!!ev} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {ev && (
          <>
            <SheetHeader><SheetTitle>{ROUTE_LABEL[ev.route as EvRoute] ?? ev.event_type}</SheetTitle></SheetHeader>
            <div className="space-y-6 px-4 pb-8 text-sm">
              <div className="flex items-center gap-3">{doc && <StatusBadge status={doc.status} />}<span>{whatWeDid(doc)}</span></div>
              <p className="text-xs text-muted-foreground">{ev.event_type} · {ev.resource_id} · {ev.verified ? "Signature verified" : "Not verified"}</p>
              {doc?.explanation_en && (
                <div className="space-y-2 rounded-lg bg-muted p-4">
                  <p><span className="mr-2 text-xs font-semibold text-muted-foreground">EN</span>{doc.explanation_en}</p>
                  <p><span className="mr-2 text-xs font-semibold text-muted-foreground">HR</span>{doc.explanation_hr}</p>
                </div>
              )}
              {doc?.line_items?.length > 0 && (
                <div>
                  <p className="mb-2 font-semibold">Line items {doc.invoice_type && <span className="font-normal text-muted-foreground">· {doc.invoice_type}</span>}</p>
                  {doc.line_items.map((l: any, i: number) => (
                    <div key={i} className="flex justify-between border-b py-1.5"><span>{l.quantity} × {l.name} <span className="text-muted-foreground">({l.taxRate}% VAT)</span></span><span className="tabular-nums">{Number(l.price).toFixed(2)}</span></div>
                  ))}
                </div>
              )}
              {doc?.warnings?.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-warning bg-warning/15 p-3">
                  {doc.warnings.map((w: string, i: number) => <li key={i}>⚠ {w}</li>)}
                </ul>
              )}
              {doc && ["failed", "needs_review"].includes(doc.status) && doc.fira_request && (
                <Button disabled={busy} onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await resend({ data: { id: doc.id } });
                    r.ok ? toast.success("Sent to FIRA") : toast.error("FIRA did not accept it — see response below");
                    await qc.invalidateQueries({ queryKey: ["timeline"] });
                    onClose();
                  } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
                }}>{doc.status === "failed" ? "Retry" : "Approve & send"}</Button>
              )}
              <Raw title="PayPal event" value={ev.raw} />
              {doc?.fira_request && <Raw title="Sent to FIRA" value={doc.fira_request} />}
              {doc?.fira_response && <Raw title="FIRA response" value={doc.fira_response} />}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Raw({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="group rounded-lg border">
      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 font-medium">{title}<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
      <pre className="max-h-80 overflow-auto bg-muted p-3 text-xs">{maskEmails(JSON.stringify(value, null, 2))}</pre>
    </details>
  );
}
