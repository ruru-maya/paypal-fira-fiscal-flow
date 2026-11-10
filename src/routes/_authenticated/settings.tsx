import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BusinessForm, FiraForm, FiraTestButton, FiraTestOfferButton, PaypalForm, WebhookUrl } from "@/components/fiskal/forms";
import { merchantQuery, TechnicalDetails } from "@/components/fiskal/shared";
import { reregisterWebhook, setDemoMode } from "@/lib/fiskal/merchant.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — FiskalBridge" }, { name: "description", content: "Mode, business details and connections." }] }),
  component: Settings,
});

function Settings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(merchantQuery());
  const rereg = useServerFn(reregisterWebhook);
  const demo = useServerFn(setDemoMode);
  const [busy, setBusy] = useState(false);
  const [openPp, setOpenPp] = useState(false);
  const [openFira, setOpenFira] = useState(false);
  if (isLoading) return null;
  const m = data?.merchant;
  const setMode = async (testing: boolean) => {
    if (!testing && !confirm("From now on FIRA will issue official invoices that are reported to the Tax Administration. Continue?")) return;
    try { await demo({ data: { demo_mode: testing } }); await qc.invalidateQueries({ queryKey: ["merchant"] }); toast.success(testing ? "Back in Testing mode" : "You're live"); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <main className="mx-auto max-w-2xl space-y-12 px-4 py-10">
      <h1 className="text-3xl font-bold">Settings</h1>
      {m && (
        <section className={`rounded-xl border p-5 ${m.demo_mode ? "border-warning bg-warning/15" : "border-success bg-success/10"}`}>
          <p className="text-xl font-semibold">{m.demo_mode ? "Testing mode" : "Live mode"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {m.demo_mode ? "FIRA creates offers, not official invoices. Nothing is reported to the Tax Administration." : "FIRA issues official invoices that are reported to the Tax Administration."}
          </p>
          <div className="mt-4">
            {m.demo_mode ? <Button onClick={() => setMode(false)}>Go live</Button> : <Button variant="outline" onClick={() => setMode(true)}>Back to testing</Button>}
          </div>
        </section>
      )}
      <Section title="Your business"><BusinessForm merchant={m} submitLabel="Save" /></Section>
      {m && (
        <Section title="Connections">
          <div className="space-y-4">
            <div className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-medium">PayPal {m.paypal_connected_at ? <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" /> Connected</span> : <span className="text-muted-foreground">Not connected</span>}</p>
                <Button size="sm" variant="outline" onClick={() => setOpenPp(!openPp)}>{openPp ? "Close" : m.paypal_connected_at ? "Reconnect" : "Connect"}</Button>
              </div>
              {openPp && <div className="mt-4"><PaypalForm merchant={m} onDone={() => setOpenPp(false)} /></div>}
            </div>
            <div className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-medium">FIRA {m.fira_connected_at ? <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" /> Connected</span> : <span className="text-muted-foreground">Not connected</span>}</p>
                <div className="flex gap-2">
                  {m.fira_connected_at && <FiraTestButton />}
                  <Button size="sm" variant="outline" onClick={() => setOpenFira(!openFira)}>{openFira ? "Close" : m.fira_connected_at ? "Reconnect" : "Connect"}</Button>
                </div>
              </div>
              {openFira && <div className="mt-4"><FiraForm merchant={m} advanced /></div>}
            </div>
          </div>
        </Section>
      )}
      {m && (
        <TechnicalDetails>
          <WebhookUrl url={data?.webhookUrl ?? null} />
          {!data?.usingPublicUrl && <p className="text-xs text-muted-foreground">Using the current page address because no public app address is configured.</p>}
          {m.paypal_connected_at && (
            <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
              setBusy(true);
              try { const r = await rereg(); toast.success(`Webhook registered: ${r.url}`); qc.invalidateQueries({ queryKey: ["merchant"] }); }
              catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
            }}>Re-register webhook</Button>
          )}
          <dl className="space-y-1 text-xs">
            <div>Webhook id: <code>{m.paypal_webhook_id ?? "—"}</code></div>
            <div>PayPal Client ID: <code>••••{m.paypal_client_id_last4 ?? "—"}</code></div>
            <div>FIRA key: <code>••••{m.fira_key_last4 ?? "—"}</code></div>
            <div>FIRA webshop domain (advanced): <code>{m.fira_domain || "not set"}</code> <span className="text-muted-foreground">— change it via FIRA → Reconnect</span></div>
          </dl>
          {m.fira_connected_at && <FiraTestOfferButton />}
        </TechnicalDetails>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-5 text-xl font-semibold">{title}</h2>{children}</section>;
}
