import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { connectFira, connectPaypal, saveBusiness, sendFiraTest, testFira } from "@/lib/fiskal/merchant.functions";
import { EVENT_GROUPS_PLAIN } from "@/lib/fiskal/routing";

/* eslint-disable @typescript-eslint/no-explicit-any */
const err = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));

export function BusinessForm({ merchant, onDone, submitLabel = "Continue" }: { merchant: any; onDone?: () => void; submitLabel?: string }) {
  const qc = useQueryClient();
  const save = useServerFn(saveBusiness);
  const [f, setF] = useState({
    business_name: merchant?.business_name ?? "",
    oib: merchant?.oib ?? "",
    in_vat_system: merchant?.in_vat_system ?? false,
    default_vat_rate: (merchant?.default_vat_rate ?? 0) as 0 | 5 | 13 | 25,
    demo_mode: merchant?.demo_mode ?? true,
  });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await save({ data: f });
          await qc.invalidateQueries({ queryKey: ["merchant"] });
          toast.success("Saved");
          onDone?.();
        } catch (e) { err(e); } finally { setBusy(false); }
      }}
    >
      <Field label="Business name">
        <Input required value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} placeholder="Moj Obrt d.o.o." />
      </Field>
      <Field label="OIB (optional)" hint="11 digits">
        <Input value={f.oib} inputMode="numeric" maxLength={11} onChange={(e) => setF({ ...f, oib: e.target.value.replace(/\D/g, "") })} />
      </Field>
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="font-medium">Are you in the VAT system?</p>
          <p className="text-sm text-muted-foreground">U sustavu PDV-a</p>
        </div>
        <Switch checked={f.in_vat_system} onCheckedChange={(v) => setF({ ...f, in_vat_system: v, default_vat_rate: v ? 25 : 0 })} />
      </div>
      <div className="grid gap-6">
        <Field label="Default VAT rate">
          <Select disabled={!f.in_vat_system} value={String(f.default_vat_rate)} onValueChange={(v) => setF({ ...f, default_vat_rate: Number(v) as 0 })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{[25, 13, 5, 0].map((r) => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-warning bg-warning/20 p-4">
        <div>
          <p className="font-medium">Demo mode</p>
          <p className="text-sm text-muted-foreground">Documents are sent to FIRA as offers (PONUDA), never fiscalized. Keep this on while testing.</p>
        </div>
        <Switch checked={f.demo_mode} onCheckedChange={(v) => setF({ ...f, demo_mode: v })} />
      </div>
      <Button type="submit" size="lg" disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
    </form>
  );
}

export function WebhookUrl({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <div className="rounded-lg bg-muted p-3 text-sm">
      <p className="mb-1 font-medium">Webhook URL PayPal will call</p>
      <div className="flex items-center gap-2">
        <code className="break-all text-xs">{url}</code>
        <Button type="button" size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export function PaypalForm({ merchant, webhookUrl, onDone }: { merchant: any; webhookUrl: string | null; onDone?: () => void }) {
  const qc = useQueryClient();
  const connect = useServerFn(connectPaypal);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const connected = !!merchant?.paypal_connected_at;
  return (
    <div className="space-y-6">
      {connected && (
        <div className="rounded-lg border border-success bg-success/10 p-4">
          <p className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 className="h-5 w-5" /> Connected</p>
          <p className="mt-1 text-sm text-muted-foreground">Client ID ••••{merchant.paypal_client_id_last4} · Webhook {merchant.paypal_webhook_id}</p>
          <p className="mt-3 text-sm font-medium">We listen for:</p>
          <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
            {EVENT_GROUPS_PLAIN.map((e) => <li key={e} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" />{e}</li>)}
          </ul>
        </div>
      )}
      <WebhookUrl url={merchant?.paypal_webhook_url ?? webhookUrl} />
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await connect({ data: { clientId, secret } });
            await qc.invalidateQueries({ queryKey: ["merchant"] });
            setSecret("");
            toast.success("PayPal connected and webhook registered");
            onDone?.();
          } catch (e) { err(e); } finally { setBusy(false); }
        }}
      >
        <p className="text-sm text-muted-foreground">
          In the PayPal Developer Dashboard open <b>Apps & Credentials → Sandbox</b>, pick your app and copy its Client ID and Secret.
        </p>
        <Field label="Client ID"><Input required value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" /></Field>
        <Field label="Secret"><Input required type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" /></Field>
        <Button type="submit" size="lg" disabled={busy}>{busy ? "Connecting…" : connected ? "Reconnect PayPal" : "Connect PayPal"}</Button>
      </form>
    </div>
  );
}

export function FiraForm({ merchant, onDone }: { merchant: any; onDone?: () => void }) {
  const qc = useQueryClient();
  const connect = useServerFn(connectFira);
  const test = useServerFn(sendFiraTest);
  const check = useServerFn(testFira);
  const [domain, setDomain] = useState(merchant?.fira_domain ?? "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<{ ok: boolean; message: string } | null>(null);
  const connected = !!merchant?.fira_connected_at;
  return (
    <div className="space-y-6">
      {connected && (
        <div className="rounded-lg border border-success bg-success/10 p-4">
          <p className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 className="h-5 w-5" /> Connected</p>
          <p className="mt-1 text-sm text-muted-foreground">API key ••••{merchant.fira_key_last4}{merchant.fira_domain ? ` · ${merchant.fira_domain}` : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={async () => {
              setBusy(true);
              try { const r = await check(); setHint(r); r.status === 200 ? toast.success(r.message) : toast.warning(r.message); }
              catch (e) { err(e); } finally { setBusy(false); }
            }}>Test connection</Button>
            <Button variant="outline" disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                const r = await test();
                r.ok ? toast.success("Test offer (PONUDA) created in FIRA") : toast.error(`FIRA answered ${r.status}: ${r.body}`);
              } catch (e) { err(e); } finally { setBusy(false); }
            }}>Send test offer (PONUDA)</Button>
          </div>
          {hint && <p className={`mt-3 text-sm ${hint.ok ? "" : "text-destructive"}`}>{hint.message}</p>}
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        <ol className="list-decimal space-y-2 rounded-lg bg-muted p-4 pl-8 text-sm">
          <li>In FIRA open <b>Postavke → Webshop / ERP</b> and add a <b>Custom</b> integration.</li>
          <li>Copy the API key.</li>
          <li>Switch on <b>"Dozvoli dohvat podataka"</b> (lets us check invoice status), and the e-mail switches if you want FIRA to e-mail invoices to your buyers. FIRA sends those e-mails itself — we never e-mail anyone.</li>
          <li>Paste the key here.</li>
          <li className="list-none pt-1 text-xs text-muted-foreground">Requires FIRA Basic or Pro (Light plans have no API).</li>
        </ol>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await connect({ data: { domain, apiKey } });
            await qc.invalidateQueries({ queryKey: ["merchant"] });
            setApiKey("");
            setHint(r.test);
            r.test.status === 200 ? toast.success("FIRA connected") : toast.warning(`FIRA connected. ${r.test.message}`);
            onDone?.();
          } catch (e) { err(e); } finally { setBusy(false); }
        }}>
          <Field label="FIRA API key"><Input required type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" /></Field>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Advanced</summary>
            <div className="mt-3"><Field label="Webshop domain (optional)"><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="mojshop.hr" /></Field></div>
          </details>
          <Button type="submit" size="lg" disabled={busy}>{connected ? "Update FIRA key" : "Connect FIRA"}</Button>
        </form>
      </div>
    </div>
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
