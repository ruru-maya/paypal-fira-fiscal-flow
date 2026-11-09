import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleX, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getDocument, resendDocument, skipDocument } from "@/lib/fiskal/merchant.functions";
import { StatusBadge } from "@/components/fiskal/shared";
import type { LineItem } from "@/lib/fiskal/mapper";
import { maskEmails } from "@/lib/fiskal/crypto";

export const Route = createFileRoute("/_authenticated/review/$docId")({
  head: () => ({ meta: [{ title: "Review document — FiskalBridge" }, { name: "description", content: "Check and approve a document before it is sent to FIRA." }] }),
  component: Review,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function Review() {
  const { docId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchDoc = useServerFn(getDocument);
  const send = useServerFn(resendDocument);
  const skip = useServerFn(skipDocument);
  const { data, isLoading } = useQuery({ queryKey: ["doc", docId], queryFn: () => fetchDoc({ data: { id: docId } }) });
  const [lines, setLines] = useState<LineItem[]>([]);
  const [lang, setLang] = useState<"en" | "hr">("en");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (data?.doc) { setLines((data.doc.line_items as any) ?? []); setErrors((data.doc.validation_errors as any) ?? []); } }, [data?.doc]);
  const target = Number(data?.doc?.amount ?? 0);
  const extras = Math.round((Number(data?.doc?.shipping ?? 0) - Number(data?.doc?.discount ?? 0)) * 100);
  const total = useMemo(() => (lines.reduce((s, l) => s + Math.round(Number(l.price) * Number(l.quantity) * 100), 0) + extras) / 100, [lines, extras]);
  const matches = Math.round(total * 100) === Math.round(target * 100);

  if (isLoading || !data) return null;
  const doc: any = data.doc;
  const ev: any = doc.paypal_events;
  const src: any = doc.source_context ?? {};
  const run: any = data.runs[0];
  const editable = ["needs_review", "failed"].includes(doc.status);
  const upd = (i: number, patch: Partial<LineItem>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link to="/dashboard" className="text-sm text-primary">← Back to dashboard</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Review {doc.kind === "storno" ? "storno" : "invoice"}</h1>
        <StatusBadge status={doc.status} />
        {doc.ai_mapped && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"><Sparkles className="h-3 w-3" /> AI-mapped · {Math.round(Number(doc.confidence) * 100)}%</span>}
        {run && <span className="text-xs text-muted-foreground">{run.model} · {run.latency_ms} ms{run.used_fallback ? " · fallback used" : ""}</span>}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 font-semibold">What PayPal says</h2>
          <dl className="space-y-2 text-sm">
            <Row k="Event" v={ev?.event_type} />
            <Row k="Amount" v={`${Number(ev?.amount ?? 0).toFixed(2)} ${ev?.currency ?? ""}`} />
            <Row k="Reference" v={ev?.resource_id} />
            <Row k="Payer" v={maskEmails([src.payer?.name, src.payer?.email, src.payer?.country].filter(Boolean).join(" · ") || "—")} />
            {src.company && <Row k="Company" v={src.company} />}
            {src.vatId && <Row k="VAT id" v={src.vatId} />}
          </dl>
          {(src.items?.length > 0 || src.planName || src.itemName) && (
            <div className="mt-4">
              <p className="mb-1 text-sm font-medium">Items</p>
              {src.items?.map((i: any, k: number) => <p key={k} className="border-b py-1 text-sm">{i.quantity} × {i.name} — {Number(i.unitPrice).toFixed(2)}</p>)}
              {src.planName && <p className="text-sm">Plan: {src.planName}</p>}
              {!src.items?.length && src.itemName && <p className="text-sm">{src.itemName}</p>}
            </div>
          )}
          {src.originalLines?.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-sm font-medium">Original invoice</p>
              {src.originalLines.map((l: any, k: number) => <p key={k} className="border-b py-1 text-sm">{l.quantity} × {l.name} — {Number(l.price).toFixed(2)} ({l.taxRate}%)</p>)}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 font-semibold">What we'll send to FIRA</h2>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_4rem_5.5rem_5rem_2rem] gap-2 text-xs font-medium text-muted-foreground"><span>Name</span><span>Qty</span><span>Unit price</span><span>VAT</span><span /></div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_4rem_5.5rem_5rem_2rem] gap-2">
                <Input disabled={!editable} value={l.name} onChange={(e) => upd(i, { name: e.target.value })} />
                <Input disabled={!editable} type="number" min="0.01" step="1" value={l.quantity} onChange={(e) => upd(i, { quantity: Number(e.target.value) })} />
                <Input disabled={!editable} type="number" step="0.01" value={l.price} onChange={(e) => upd(i, { price: Number(e.target.value) })} />
                <Select disabled={!editable} value={String(l.taxRate)} onValueChange={(v) => upd(i, { taxRate: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[25, 13, 5, 0].map((r) => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                </Select>
                <Button disabled={!editable || lines.length === 1} variant="ghost" size="icon" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {editable && <Button variant="ghost" size="sm" onClick={() => setLines([...lines, { name: "", description: "", lineItemId: String(lines.length + 1), price: 0, quantity: 1, unit: "kom", taxRate: lines[0]?.taxRate ?? 0 }])}><Plus className="h-4 w-4" /> Add line</Button>}
          </div>
          <div className={`mt-4 flex items-center justify-between rounded-lg p-3 font-semibold ${matches ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
            <span className="flex items-center gap-2">{matches ? <CheckCircle2 className="h-5 w-5" /> : <CircleX className="h-5 w-5" />} Total {total.toFixed(2)} EUR</span>
            <span className="text-sm font-normal">PayPal: {target.toFixed(2)}{extras !== 0 && ` (incl. shipping/discount ${(extras / 100).toFixed(2)})`}</span>
          </div>
        </section>
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">AI explanation</h2>
            <div className="flex rounded-md border text-xs">
              {(["en", "hr"] as const).map((l) => <button key={l} onClick={() => setLang(l)} className={`px-2.5 py-1 uppercase ${lang === l ? "bg-muted font-semibold" : ""}`}>{l}</button>)}
            </div>
          </div>
          <p className="text-sm">{lang === "en" ? doc.explanation_en : doc.explanation_hr}</p>
        </div>
        <div className="rounded-xl border border-warning bg-warning/15 p-5 text-sm">
          <h2 className="mb-2 font-semibold">Why this needs review</h2>
          <ul className="space-y-1">
            {errors.map((w, i) => <li key={`e${i}`} className="text-destructive">✕ {w}</li>)}
            {doc.fira_error && <li className="text-destructive">✕ {doc.fira_error}</li>}
            {(doc.warnings ?? []).map((w: string, i: number) => <li key={i}>⚠ {w}</li>)}
            {Number(doc.confidence) < 0.7 && <li>⚠ AI confidence is below 70%.</li>}
          </ul>
        </div>
      </section>

      {editable && (
        <section className="mt-6 flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-end">
          <Button size="lg" disabled={busy || !matches} onClick={async () => {
            setBusy(true);
            try {
              const r = await send({ data: { id: doc.id, lineItems: lines } });
              if (r.errors.length) { setErrors(r.errors); toast.error("Not sent — fix the errors shown."); }
              else if (r.ok) { toast.success("Sent to FIRA"); await qc.invalidateQueries({ queryKey: ["timeline"] }); navigate({ to: "/dashboard" }); }
              else { toast.error(r.firaError ?? "FIRA did not accept the document."); await qc.invalidateQueries({ queryKey: ["doc", docId] }); }
            } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }}>Approve & send to FIRA</Button>
          <div className="flex-1 space-y-2">
            <Textarea placeholder="Reason for not invoicing (required)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
          <Button variant="outline" disabled={busy || reason.trim().length < 3} onClick={async () => {
            setBusy(true);
            try { await skip({ data: { id: doc.id, reason } }); toast.success("Skipped"); await qc.invalidateQueries({ queryKey: ["timeline"] }); navigate({ to: "/dashboard" }); }
            catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }}>Skip — don't invoice</Button>
        </section>
      )}
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></div>;
}
