import { isUnknownFieldError } from "@/lib/fiskal/fira";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, ChevronDown, Sparkles, Store, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { merchantQuery, StatusBadge, whatWeDid } from "@/components/fiskal/shared";
import { downloadFiraPdfFn, listTimeline, refundPayment, resendDocument, simulateDisputeFn } from "@/lib/fiskal/merchant.functions";
import { ROUTE_LABEL, type Route as EvRoute } from "@/lib/fiskal/routing";
import { maskEmails } from "@/lib/fiskal/crypto";
import { IS_PAYPAL_SANDBOX } from "@/lib/fiskal/config";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — FiskalBridge" }, { name: "description", content: "Your PayPal events and FIRA documents." }] }),
  component: Dashboard,
});

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* eslint-disable @typescript-eslint/no-explicit-any */
function Dashboard() {
  const qc = useQueryClient();
  const { data: md, isLoading } = useQuery(merchantQuery());
  const fetchTimeline = useServerFn(listTimeline);
  const simulate = useServerFn(simulateDisputeFn);
  const m = md?.merchant;
  const tl = useQuery({ queryKey: ["timeline"], queryFn: () => fetchTimeline(), refetchInterval: 30000, enabled: !!m });
  const [open, setOpen] = useState<any>(null);
  const [refundEv, setRefundEv] = useState<any>(null);
  const [tab, setTab] = useState("all");
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  // Realtime: refetch on any change; RLS limits rows to this merchant.
  useEffect(() => {
    if (!m) return;
    const ch = supabase
      .channel(`timeline-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "paypal_events", filter: `merchant_id=eq.${m.id}` }, () => qc.invalidateQueries({ queryKey: ["timeline"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "fiscal_documents", filter: `merchant_id=eq.${m.id}` }, () => qc.invalidateQueries({ queryKey: ["timeline"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [m?.id, qc]);

  // Highlight rows that appeared after first load.
  useEffect(() => {
    if (!tl.data) return;
    const ids = tl.data.map((e: any) => e.id as string);
    if (seen.current) {
      const added = ids.filter((id) => !seen.current!.has(id));
      if (added.length) {
        setFresh((s) => new Set([...s, ...added]));
        setTimeout(() => setFresh((s) => { const n = new Set(s); added.forEach((a) => n.delete(a)); return n; }), 4000);
      }
    }
    seen.current = new Set(ids);
  }, [tl.data]);

  if (isLoading) return null;
  if (!m || !m.paypal_connected_at || !m.fira_connected_at) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-3xl font-bold">Let's get you connected</h1>
        <p className="mt-3 text-muted-foreground">Three short steps: your business, PayPal, and FIRA.</p>
        <Button asChild size="lg" className="mt-8"><Link to="/onboarding">Start setup</Link></Button>
      </main>
    );
  }

  const all = tl.data ?? [];
  const review = all.filter((e: any) => e.fiscal_documents?.[0]?.status === "needs_review");
  const rows = tab === "review" ? review : all;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatusCard ok label="PayPal" value="Connected" />
        <StatusCard ok label="FIRA" value="Connected" sub={m.fira_domain} />
        <StatusCard ok={!m.demo_mode} warn={m.demo_mode} label="Mode" value={m.demo_mode ? "Demo" : "Live"} sub={m.demo_mode ? "Offers only" : "Fiscalizing"} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {IS_PAYPAL_SANDBOX && (
          <Button asChild variant="outline"><Link to="/shop/$merchantId" params={{ merchantId: m.id }} target="_blank"><Store className="h-4 w-4" /> Open my test shop</Link></Button>
        )}
        {IS_PAYPAL_SANDBOX && (
          <Button variant="outline" onClick={async () => {
            try { await simulate(); toast.success("Dispute simulation requested — it will appear in a few seconds"); } catch (e) { toast.error(errMsg(e)); }
          }}><Siren className="h-4 w-4" /> Simulate dispute</Button>
        )}
      </div>

      <div className="mb-4 mt-8 flex items-center justify-between">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">Activity</TabsTrigger>
            <TabsTrigger value="review">
              Needs review {review.length > 0 && <span className="ml-1.5 rounded-full bg-warning px-1.5 text-xs text-warning-foreground">{review.length}</span>}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-success" /> Live</span>
      </div>

      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          {tab === "review" ? "Nothing to review. 🎉" : "No PayPal events yet. Make a sandbox payment and it will appear here within seconds."}
        </div>
      )}
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {rows.map((ev: any) => {
          const doc = ev.fiscal_documents?.[0];
          return (
            <li key={ev.id} className={fresh.has(ev.id) ? "row-fresh" : ""}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50">
                <button onClick={() => setOpen(ev)} className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-left">
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
                {doc?.status === "needs_review" && <Button size="sm" asChild><Link to="/review/$docId" params={{ docId: doc.id }}>Review</Link></Button>}
                {IS_PAYPAL_SANDBOX && ev.event_type === "PAYMENT.CAPTURE.COMPLETED" && (
                  <Button size="sm" variant="ghost" onClick={() => setRefundEv(ev)}>Refund (sandbox)</Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Detail ev={open} onClose={() => setOpen(null)} />
      <RefundDialog ev={refundEv} onClose={() => setRefundEv(null)} />
    </main>
  );
}

function RefundDialog({ ev, onClose }: { ev: any; onClose: () => void }) {
  const refund = useServerFn(refundPayment);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ev) setAmount(Number(ev.amount).toFixed(2)); }, [ev]);
  return (
    <Dialog open={!!ev} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Refund in PayPal sandbox</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Full refund creates a full storno; a smaller amount creates a partial storno. Paid: {ev && Number(ev.amount).toFixed(2)} EUR.</p>
        <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <DialogFooter>
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const a = Number(amount);
              const full = Math.round(a * 100) === Math.round(Number(ev.amount) * 100);
              await refund({ data: full ? { eventId: ev.id } : { eventId: ev.id, amount: a } });
              toast.success("Refund sent to PayPal — the storno will appear shortly");
              onClose();
            } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
          }}>Refund {amount} EUR</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
              <p className="text-xs text-muted-foreground">{ev.event_type} · {ev.resource_id} · {ev.simulated ? "Simulated (demo)" : ev.verified ? "Signature verified" : "Not verified"}</p>
              <FiscalResult doc={doc} />
              {doc?.fira_error && (isUnknownFieldError(doc.fira_error) ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                  <p>FIRA didn't accept a field we sent — this is a connector bug, not your data.</p>
                  <details className="mt-1 text-xs"><summary className="cursor-pointer">Raw reason</summary><p className="mt-1 break-words">{doc.fira_error}</p></details>
                </div>
              ) : <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">{doc.fira_error}</p>)}
              {doc?.skip_reason && <p className="rounded-lg bg-muted p-3">Skipped: {doc.skip_reason}</p>}
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
                    <div key={i} className="flex justify-between border-b py-1.5"><span>{l.quantity} × {l.name} <span className="text-muted-foreground">({l.taxRate}% VAT)</span></span><span className="tabular-nums">{(Number(l.price) * l.quantity).toFixed(2)}</span></div>
                  ))}
                </div>
              )}
              {[...(doc?.validation_errors ?? []), ...(doc?.warnings ?? [])].length > 0 && (
                <ul className="space-y-1 rounded-lg border border-warning bg-warning/15 p-3">
                  {(doc.validation_errors ?? []).map((w: string, i: number) => <li key={`e${i}`} className="text-destructive">✕ {w}</li>)}
                  {(doc.warnings ?? []).map((w: string, i: number) => <li key={i}>⚠ {w}</li>)}
                </ul>
              )}
              {doc?.status === "needs_review" && <Button asChild><Link to="/review/$docId" params={{ docId: doc.id }}>Open review</Link></Button>}
              {doc?.status === "failed" && doc.fira_request && (
                <Button disabled={busy} onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await resend({ data: { id: doc.id } });
                    if (r.errors.length) toast.error(`Not sent — ${r.errors.join(" ")}`);
                    else r.ok ? toast.success("Sent to FIRA") : toast.error(r.firaError ?? "FIRA did not accept it");
                    await qc.invalidateQueries({ queryKey: ["timeline"] });
                    onClose();
                  } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
                }}>Retry</Button>
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

function FiscalResult({ doc }: { doc: any }) {
  if (!doc || doc.status !== "sent") return null;
  const failedFisc = /NEUSPJE/i.test(doc.fiscal_status ?? "");
  const fiscalized = /FISKALIZIRANO/i.test(doc.fiscal_status ?? "") && !failedFisc;
  const pdf = useServerFn(downloadFiraPdfFn);
  const [busy, setBusy] = useState(false);
  return (
    <div className={`space-y-1 rounded-lg border p-3 ${failedFisc ? "border-warning bg-warning/15" : "bg-card"}`}>
      {fiscalized && <p className="font-semibold text-success">Fiscalized by the Tax Administration ✓</p>}
      {failedFisc && <p className="font-semibold text-warning-foreground">Tax office unreachable — FIRA will retry fiscalization for 48 h</p>}
      {doc.fira_invoice_number && <p>Invoice no. <b>{doc.fira_invoice_number}</b></p>}
      {doc.jir && <p className="break-all text-xs">JIR {doc.jir}</p>}
      {doc.zki && <p className="break-all text-xs">ZKI {doc.zki}</p>}
      {doc.fiscal_status && <p className="text-xs text-muted-foreground">Status: {doc.fiscal_status}</p>}
      <p className="text-xs text-muted-foreground">FIRA order id {doc.fira_order_id}</p>
      {doc.fira_response?.body?.id && (
        <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const r = await pdf({ data: { id: doc.id } });
            const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
            const a = document.createElement("a"); a.href = url; a.download = r.filename; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
        }}>{busy ? "Downloading…" : "Download PDF from FIRA"}</Button>
      )}
    </div>
  );
}
