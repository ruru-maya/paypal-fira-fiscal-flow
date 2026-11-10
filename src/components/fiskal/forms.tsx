import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectFira, connectPaypal, saveBusiness, sendFiraTest, testFira } from "@/lib/fiskal/merchant.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */
const err = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));

/** Plain result of a FIRA connection check. */
export function plainFiraTest(r: { status: number; message: string }) {
  if (r.status === 200) return { ok: true, text: "✓ FIRA is connected and working." };
  if (r.status === 403) return { ok: true, text: "✓ FIRA is connected. Tip: in FIRA turn on \"Dozvoli dohvat podataka\" so we can check invoice status." };
  if (r.status === 401) return { ok: false, text: "FIRA didn't accept this key. Please copy it again from FIRA." };
  if (r.status === 402) return { ok: false, text: "Your FIRA subscription seems to be unpaid." };
  return { ok: false, text: "We couldn't reach FIRA right now. Please try again in a moment." };
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex-1 rounded-xl border-2 px-4 py-4 text-lg font-semibold transition ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>
      {children}
    </button>
  );
}

export function BusinessForm({ merchant, onDone, submitLabel = "Continue" }: { merchant: any; onDone?: () => void; submitLabel?: string }) {
  const qc = useQueryClient();
  const save = useServerFn(saveBusiness);
  const [f, setF] = useState({
    business_name: merchant?.business_name ?? "",
    oib: merchant?.oib ?? "",
    in_vat_system: (merchant?.in_vat_system ?? null) as boolean | null,
    default_vat_rate: (merchant?.in_vat_system ? (merchant?.default_vat_rate || 25) : 25) as 0 | 5 | 13 | 25,
  });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (f.in_vat_system === null) { toast.error("Please tell us whether you're registered for VAT."); return; }
        setBusy(true);
        try {
          await save({ data: {
            business_name: f.business_name, oib: f.oib, in_vat_system: f.in_vat_system,
            default_vat_rate: f.in_vat_system ? f.default_vat_rate : 0,
            demo_mode: merchant?.demo_mode ?? true, // new merchants always start in Testing mode
          } });
          await qc.invalidateQueries({ queryKey: ["merchant"] });
          toast.success("Saved");
          onDone?.();
        } catch (e) { err(e); } finally { setBusy(false); }
      }}
    >
      <Field label="Business name">
        <Input required value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} placeholder="Moj Obrt d.o.o." />
      </Field>
      <div className="space-y-3">
        <p className="font-medium">Are you registered for VAT <span className="font-normal text-muted-foreground">(u sustavu PDV-a)</span>?</p>
        <div className="flex gap-3">
          <Choice active={f.in_vat_system === true} onClick={() => setF({ ...f, in_vat_system: true })}>Yes</Choice>
          <Choice active={f.in_vat_system === false} onClick={() => setF({ ...f, in_vat_system: false })}>No</Choice>
        </div>
      </div>
      {f.in_vat_system && (
        <div className="space-y-3">
          <p className="font-medium">Most of your products are taxed at:</p>
          <div className="flex gap-3">
            {([25, 13, 5] as const).map((r) => <Choice key={r} active={f.default_vat_rate === r} onClick={() => setF({ ...f, default_vat_rate: r })}>{r}%</Choice>)}
          </div>
          <p className="text-sm text-muted-foreground">We still pick the right rate for each product.</p>
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">More details (optional)</summary>
        <div className="mt-3">
          <Field label="OIB" hint="11 digits">
            <Input value={f.oib} inputMode="numeric" maxLength={11} onChange={(e) => setF({ ...f, oib: e.target.value.replace(/\D/g, "") })} />
          </Field>
        </div>
      </details>
      <Button type="submit" size="lg" disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
    </form>
  );
}

export function WebhookUrl({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <div className="rounded-lg bg-muted p-3 text-sm">
      <p className="mb-1 font-medium">Webhook URL PayPal calls</p>
      <div className="flex items-center gap-2">
        <code className="break-all text-xs">{url}</code>
        <Button type="button" size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export function PaypalConnected() {
  return (
    <div className="rounded-lg border border-success bg-success/10 p-4">
      <p className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 className="h-5 w-5" /> PayPal is connected.</p>
      <p className="mt-1 text-sm">We'll be told about payments, subscription renewals, refunds and chargebacks.</p>
    </div>
  );
}

export function PaypalForm({ merchant, onDone }: { merchant: any; onDone?: () => void }) {
  const qc = useQueryClient();
  const connect = useServerFn(connectPaypal);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const connected = !!merchant?.paypal_connected_at;
  return (
    <div className="space-y-6">
      {connected && <PaypalConnected />}
      <ol className="list-decimal space-y-1 rounded-lg bg-muted p-4 pl-8 text-sm">
        <li>Log in at <b>developer.paypal.com</b></li>
        <li>Open <b>Apps & Credentials</b></li>
        <li>Open your app</li>
        <li>Copy the two codes PayPal calls <b>"Client ID"</b> and <b>"Secret"</b></li>
      </ol>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await connect({ data: { clientId, secret } });
            await qc.invalidateQueries({ queryKey: ["merchant"] });
            setSecret("");
            toast.success("PayPal is connected");
            onDone?.();
          } catch (e) { err(e); } finally { setBusy(false); }
        }}
      >
        <Field label="Client ID"><Input required value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" /></Field>
        <Field label="Secret"><Input required type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" /></Field>
        <Button type="submit" size="lg" disabled={busy}>{busy ? "Connecting…" : connected ? "Reconnect PayPal" : "Connect PayPal"}</Button>
      </form>
    </div>
  );
}

export function FiraForm({ merchant, onDone, advanced = false }: { merchant: any; onDone?: () => void; advanced?: boolean }) {
  const qc = useQueryClient();
  const connect = useServerFn(connectFira);
  const [domain, setDomain] = useState(merchant?.fira_domain ?? "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const connected = !!merchant?.fira_connected_at;
  return (
    <div className="space-y-6">
      <ol className="list-decimal space-y-1 rounded-lg bg-muted p-4 pl-8 text-sm">
        <li>In FIRA open <b>Postavke → Webshop / ERP</b> and add a <b>Custom</b> shop.</li>
        <li>Copy the key FIRA shows you.</li>
        <li>Turn on <b>"Dozvoli dohvat podataka"</b>. If you want FIRA to e-mail invoices to your buyers, turn that on too.</li>
        <li>Paste the key below.</li>
        <li className="list-none pt-1 text-xs text-muted-foreground">Needs FIRA Basic or Pro.</li>
      </ol>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setResult(null);
        try {
          const r = await connect({ data: { domain, apiKey } });
          await qc.invalidateQueries({ queryKey: ["merchant"] });
          setApiKey("");
          setResult(plainFiraTest(r.test));
          onDone?.();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setResult({ ok: false, text: /unpaid|402/i.test(msg) ? "Your FIRA subscription seems to be unpaid." : "FIRA didn't accept this key. Please copy it again from FIRA." });
        } finally { setBusy(false); }
      }}>
        <Field label="FIRA key"><Input required type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" /></Field>
        {advanced && <Field label="Webshop domain (optional, advanced)"><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="mojshop.hr" /></Field>}
        <Button type="submit" size="lg" disabled={busy}>{busy ? "Checking…" : connected ? "Save new FIRA key" : "Connect FIRA"}</Button>
      </form>
      {result && <p className={`rounded-lg border p-3 text-sm ${result.ok ? "border-success bg-success/10" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>{result.text}</p>}
    </div>
  );
}

export function FiraTestButton() {
  const check = useServerFn(testFira);
  const [busy, setBusy] = useState(false);
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
      setBusy(true);
      try { const r = plainFiraTest(await check()); r.ok ? toast.success(r.text) : toast.error(r.text); }
      catch (e) { err(e); } finally { setBusy(false); }
    }}>{busy ? "Testing…" : "Test connection"}</Button>
  );
}

export function FiraTestOfferButton() {
  const test = useServerFn(sendFiraTest);
  const [busy, setBusy] = useState(false);
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const r = await test();
        r.ok ? toast.success("Test offer (PONUDA) created in FIRA") : toast.error(`FIRA answered ${r.status}: ${r.body}`);
      } catch (e) { err(e); } finally { setBusy(false); }
    }}>Send test offer to FIRA</Button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label} {hint && <span className="font-normal text-muted-foreground">· {hint}</span>}</Label>
      {children}
    </div>
  );
}
