import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Copy, FlaskConical, Sparkles, Store, Siren, Undo2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { friendlyTime, merchantQuery, PLAIN_KIND, PlainPill, plainFiraError, plainHeadline, plainResult, plainWarning, TechnicalDetails } from "@/components/fiskal/shared";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { downloadFiraPdfFn, listTimeline, refundPayment, resendDocument, setShareLiveView, simulateDisputeFn } from "@/lib/fiskal/merchant.functions";
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
  const [pickRefund, setPickRefund] = useState(false);
  const share = useServerFn(setShareLiveView);
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
  const payments = all.filter((e: any) => e.event_type === "PAYMENT.CAPTURE.COMPLETED");

  // Broken connection: the newest FIRA attempt failed because of the key or subscription.
  const lastFira = all.map((e: any) => e.fiscal_documents?.[0]).find((d: any) => d && (d.status === "sent" || d.fira_error));
  const broken = lastFira?.fira_error && /key invalid|unpaid/i.test(lastFira.fira_error) ? plainFiraError(lastFira.fira_error) : null;

  const now = new Date();
  const month = all.filter((e: any) => { const d = new Date(e.received_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const docsM = month.map((e: any) => e.fiscal_documents?.[0]).filter(Boolean);
  const summary = [
    ["Payments", month.filter((e: any) => ["one_time_payment", "subscription_payment", "paypal_invoice_paid"].includes(e.route)).length],
    ["Invoices created", docsM.filter((d: any) => d.status === "sent" && d.kind !== "storno").length],
    ["Cancellations", docsM.filter((d: any) => d.status === "sent" && d.kind === "storno").length],
    ["Needs attention", review.length],
  ] as const;
  const liveLink = typeof window !== "undefined" ? `${window.location.origin}/live/${m.id}` : `/live/${m.id}`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {broken ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive">
              <p className="font-medium">✕ {broken}</p>
              <Button asChild size="sm" variant="destructive"><Link to="/settings">Fix</Link></Button>
            </div>
          ) : m.demo_mode ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning bg-warning/15 p-4">
              <p className="font-medium">Testing mode — FIRA creates offers, not official invoices.</p>
              <Button asChild size="sm"><Link to="/settings">Go live</Link></Button>
            </div>
          ) : (
            <div className="rounded-xl border border-success bg-success/10 p-4 font-medium text-success">✓ Everything is connected — invoices are created automatically</div>
          )}
        </div>
        {IS_PAYPAL_SANDBOX && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline"><FlaskConical className="h-4 w-4" /> Testing tools <ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem asChild><Link to="/shop/$merchantId" params={{ merchantId: m.id }} target="_blank"><Store className="h-4 w-4" /> Open my test shop</Link></DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPickRefund(true)}><Undo2 className="h-4 w-4" /> Refund a test payment</DropdownMenuItem>
              <DropdownMenuItem onSelect={async () => {
                try { await simulate(); toast.success("Test dispute requested — it will appear in a few seconds"); } catch (e) { toast.error(errMsg(e)); }
              }}><Siren className="h-4 w-4" /> Simulate a dispute</DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="space-y-2 px-2 py-1.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><Share2 className="h-4 w-4" /> Share a live view link</span>
                  <Switch disabled={!m.demo_mode} checked={m.demo_mode && m.share_live_view} onCheckedChange={async (v) => {
                    try { await share({ data: { share: v } }); await qc.invalidateQueries({ queryKey: ["merchant"] }); } catch (e) { toast.error(errMsg(e)); }
                  }} />
                </div>
                {!m.demo_mode && <p className="text-xs text-muted-foreground">Only available in Testing mode.</p>}
                {m.demo_mode && m.share_live_view && (
                  <Button size="sm" variant="ghost" className="h-auto w-full justify-start px-1 py-1 text-xs" onClick={() => { navigator.clipboard.writeText(liveLink); toast.success("Link copied"); }}>
                    <Copy className="h-3 w-3" /> Copy link
                  </Button>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {summary.map(([k, v]) => (
          <div key={k} className="rounded-lg border bg-card px-3 py-2"><p className="text-xs text-muted-foreground">{k} · this month</p><p className="text-xl font-semibold tabular-nums">{v}</p></div>
        ))}
      </div>

      <div className="mb-4 mt-8 flex items-center justify-between">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">Activity</TabsTrigger>
            <TabsTrigger value="review">Needs your attention ({review.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-success" /> Updating live</span>
      </div>

      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          {tab === "review" ? "Nothing needs your attention. 🎉" : "No payments yet. When someone pays you with PayPal, it shows up here within seconds."}
        </div>
      )}
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {rows.map((ev: any) => {
          const doc = ev.fiscal_documents?.[0];
          const customer = doc?.source_context?.payer?.name;
          return (
            <li key={ev.id} className={fresh.has(ev.id) ? "row-fresh" : ""}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50">
                <button onClick={() => setOpen(ev)} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-left">
                  <span className="w-28 text-xs text-muted-foreground">{friendlyTime(ev.received_at)}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2 font-medium">
                      {PLAIN_KIND[ev.route] ?? "PayPal update"}
                      {ev.simulated && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">test</span>}
                      {doc?.ai_mapped && doc.confidence != null && (
                        <span title={`Prepared by AI, checked by our rules — ${Math.round(Number(doc.confidence) * 100)}% sure`} className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"><Sparkles className="h-3 w-3" /> AI</span>
                      )}
                    </span>
                    {customer && <span className="truncate text-xs text-muted-foreground">{customer}</span>}
                  </span>
                  <span className="w-24 text-right tabular-nums">{ev.amount != null ? `${Number(doc?.amount ?? ev.amount).toFixed(2)} ${ev.currency ?? ""}` : "—"}</span>
                  <span className="hidden w-56 text-sm text-muted-foreground sm:block">{plainResult(doc)}</span>
                  {doc && <PlainPill status={doc.status} />}
                </button>
                {doc?.status === "needs_review" && <Button size="sm" asChild><Link to="/review/$docId" params={{ docId: doc.id }}>Check</Link></Button>}
              </div>
            </li>
          );
        })}
      </ul>
      <Detail ev={open} inVat={!!m.in_vat_system} onClose={() => setOpen(null)} onRefund={(ev) => { setOpen(null); setRefundEv(ev); }} />
      <RefundDialog ev={refundEv} onClose={() => setRefundEv(null)} />
      <Dialog open={pickRefund} onOpenChange={setPickRefund}>
        <DialogContent>
          <DialogHeader><DialogTitle>Which test payment should be refunded?</DialogTitle></DialogHeader>
          {payments.length === 0 && <p className="text-sm text-muted-foreground">No test payments yet. Buy something in your test shop first.</p>}
          <ul className="max-h-80 divide-y overflow-auto rounded-lg border">
            {payments.map((ev: any) => (
              <li key={ev.id}><button className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setPickRefund(false); setRefundEv(ev); }}>
                <span>{friendlyTime(ev.received_at)} · {ev.fiscal_documents?.[0]?.source_context?.payer?.name ?? "Payment"}</span><span className="tabular-nums">{Number(ev.amount).toFixed(2)} {ev.currency}</span>
              </button></li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
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
        <DialogHeader><DialogTitle>Refund a test payment</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">A full refund cancels the whole invoice; a smaller amount cancels part of it. Paid: {ev && Number(ev.amount).toFixed(2)} EUR. No real money moves.</p>
        <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <DialogFooter>
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const a = Number(amount);
              const full = Math.round(a * 100) === Math.round(Number(ev.amount) * 100);
              await refund({ data: full ? { eventId: ev.id } : { eventId: ev.id, amount: a } });
              toast.success("Refund requested — the cancellation will appear shortly");
              onClose();
            } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
          }}>Refund {amount} EUR</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ ev, inVat, onClose, onRefund }: { ev: any; inVat: boolean; onClose: () => void; onRefund: (ev: any) => void }) {
  const qc = useQueryClient();
  const resend = useServerFn(resendDocument);
  const pdf = useServerFn(downloadFiraPdfFn);
  const [busy, setBusy] = useState(false);
  const doc = ev?.fiscal_documents?.[0];
  const failedFisc = /NEUSPJE/i.test(doc?.fiscal_status ?? "");
  const fiscalized = /FISKALIZIRANO/i.test(doc?.fiscal_status ?? "") && !failedFisc;
  const warnings = [...(doc?.validation_errors ?? []), ...(doc?.warnings ?? [])] as string[];
  return (
    <Sheet open={!!ev} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {ev && (
          <>
            <SheetHeader>
              <p className="text-xs text-muted-foreground">{PLAIN_KIND[ev.route] ?? "PayPal update"} · {friendlyTime(ev.received_at)}</p>
              <SheetTitle className="text-2xl">{plainHeadline(doc)}</SheetTitle>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-8 text-sm">
              {doc?.status === "sent" && doc.fira_response?.body?.id && (
                <Button size="lg" className="w-full" disabled={busy} onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await pdf({ data: { id: doc.id } });
                    const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
                    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
                    const a = document.createElement("a"); a.href = url; a.download = r.filename; a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 10000);
                  } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
                }}>{busy ? "Downloading…" : "Download invoice (PDF)"}</Button>
              )}
              {fiscalized && <p className="font-semibold text-success">✓ Officially registered with the Tax Administration</p>}
              {failedFisc && <p className="rounded-lg border border-warning bg-warning/15 p-3">The Tax Administration couldn't be reached. FIRA keeps trying for 48 hours — nothing for you to do.</p>}
              {doc?.fira_error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">{plainFiraError(doc.fira_error)}</p>}
              {doc?.skip_reason && <p className="rounded-lg bg-muted p-3">You chose not to create an invoice: {doc.skip_reason}</p>}
              {doc?.explanation_hr && (
                <div className="space-y-2 rounded-lg bg-muted p-4">
                  <p>{doc.explanation_hr}</p>
                  {doc.explanation_en && <p className="text-xs text-muted-foreground">{doc.explanation_en}</p>}
                </div>
              )}
              {doc?.line_items?.length > 0 && (
                <div>
                  <p className="mb-2 font-semibold">Items</p>
                  <div className={`grid gap-2 border-b pb-1 text-xs text-muted-foreground ${inVat ? "grid-cols-[1fr_3rem_5rem_3.5rem]" : "grid-cols-[1fr_3rem_5rem]"}`}>
                    <span>Name</span><span className="text-right">Qty</span><span className="text-right">Price</span>{inVat && <span className="text-right">VAT</span>}
                  </div>
                  {doc.line_items.map((l: any, i: number) => (
                    <div key={i} className={`grid gap-2 border-b py-1.5 ${inVat ? "grid-cols-[1fr_3rem_5rem_3.5rem]" : "grid-cols-[1fr_3rem_5rem]"}`}>
                      <span>{l.name}</span><span className="text-right tabular-nums">{l.quantity}</span><span className="text-right tabular-nums">{Number(l.price).toFixed(2)}</span>{inVat && <span className="text-right">{l.taxRate}%</span>}
                    </div>
                  ))}
                </div>
              )}
              {warnings.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-warning bg-warning/15 p-3">
                  {warnings.map((w, i) => <li key={i}>⚠ {plainWarning(w)}</li>)}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                {doc?.status === "needs_review" && <Button asChild><Link to="/review/$docId" params={{ docId: doc.id }}>Check & send</Link></Button>}
                {doc?.status === "failed" && doc.fira_request && (
                  <Button disabled={busy} onClick={async () => {
                    setBusy(true);
                    try {
                      const r = await resend({ data: { id: doc.id } });
                      if (r.errors.length) toast.error("Not sent — please check the items.");
                      else r.ok ? toast.success("Invoice created in FIRA") : toast.error(plainFiraError(r.firaError ?? ""));
                      await qc.invalidateQueries({ queryKey: ["timeline"] });
                      onClose();
                    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
                  }}>Try again</Button>
                )}
              </div>
              {IS_PAYPAL_SANDBOX && ev.event_type === "PAYMENT.CAPTURE.COMPLETED" && (
                <TechnicalDetails title="Testing tools">
                  <Button size="sm" variant="outline" onClick={() => onRefund(ev)}><Undo2 className="h-4 w-4" /> Refund this test payment</Button>
                </TechnicalDetails>
              )}
              <TechnicalDetails>
                <dl className="space-y-1 text-xs">
                  <div>PayPal event: <code>{ev.event_type}</code></div>
                  <div>PayPal id: <code className="break-all">{ev.resource_id}</code></div>
                  <div>Signature: {ev.simulated ? "Simulated test event" : ev.verified ? "Verified" : "Not verified"}</div>
                  {doc?.invoice_type && <div>FIRA document type: <code>{doc.invoice_type}</code></div>}
                  {doc?.fira_order_id && <div>FIRA order id: <code>{doc.fira_order_id}</code></div>}
                  {doc?.jir && <div className="break-all">JIR: <code>{doc.jir}</code></div>}
                  {doc?.zki && <div className="break-all">ZKI: <code>{doc.zki}</code></div>}
                  {doc?.fiscal_status && <div>Fiscal status: <code>{doc.fiscal_status}</code></div>}
                  {doc?.ai_mapped && doc.confidence != null && <div>AI confidence: {Math.round(Number(doc.confidence) * 100)}%</div>}
                </dl>
                {warnings.length > 0 && <ul className="space-y-1 text-xs">{warnings.map((w, i) => <li key={i}>• {w}</li>)}</ul>}
                {doc?.fira_error && <p className="break-words text-xs">FIRA said: {doc.fira_error}</p>}
                <Raw title="PayPal event" value={ev.raw} />
                {doc?.fira_request && <Raw title="Sent to FIRA" value={doc.fira_request} />}
                {doc?.fira_response && <Raw title="FIRA response" value={doc.fira_response} />}
              </TechnicalDetails>
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

