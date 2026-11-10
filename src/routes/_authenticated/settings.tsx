import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BusinessForm, FiraForm, PaypalForm, WebhookUrl } from "@/components/fiskal/forms";
import { merchantQuery } from "@/components/fiskal/shared";
import { reregisterWebhook, setDemoMode, setShareLiveView } from "@/lib/fiskal/merchant.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — FiskalBridge" }, { name: "description", content: "Business, PayPal and FIRA settings." }] }),
  component: Settings,
});

function Settings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(merchantQuery());
  const rereg = useServerFn(reregisterWebhook);
  const demo = useServerFn(setDemoMode);
  const share = useServerFn(setShareLiveView);
  const [busy, setBusy] = useState(false);
  if (isLoading) return null;
  const m = data?.merchant;
  return (
    <main className="mx-auto max-w-2xl space-y-12 px-4 py-10">
      <h1 className="text-3xl font-bold">Settings</h1>
      {m && (
        <section className="flex items-center justify-between rounded-xl border p-5">
          <div>
            <p className="font-semibold">FIRA test mode — send offers (PONUDA) instead of fiscal invoices</p>
            <p className="text-sm text-muted-foreground">{m.demo_mode ? "On — FIRA creates offers only; nothing is fiscalized." : "Off — real fiscal invoices and storno invoices are issued and reported to the Tax Administration."}</p>
          </div>
          <Switch checked={m.demo_mode} onCheckedChange={async (v) => {
            if (!v && !confirm("Turn off FIRA test mode? Real fiscal invoices will be issued and reported to the Tax Administration.")) return;
            await demo({ data: { demo_mode: v } });
            qc.invalidateQueries({ queryKey: ["merchant"] });
          }} />
        </section>
      )}
      {m && (
        <section className="flex items-center justify-between gap-4 rounded-xl border p-5">
          <div>
            <p className="font-semibold">Share a read-only live view of my dashboard (FIRA test mode only)</p>
            <p className="text-sm text-muted-foreground">
              {!m.demo_mode ? "Unavailable while FIRA test mode is off." : m.share_live_view ? <>Anyone with the link can watch: <a className="text-primary underline" href={`/live/${m.id}`} target="_blank" rel="noreferrer">/live/{m.id}</a></> : "Off — nobody else can see your activity."}
            </p>
          </div>
          <Switch disabled={!m.demo_mode} checked={m.demo_mode && m.share_live_view} onCheckedChange={async (v) => {
            await share({ data: { share: v } });
            qc.invalidateQueries({ queryKey: ["merchant"] });
          }} />
        </section>
      )}
      <Section title="Your business"><BusinessForm merchant={m} submitLabel="Save" /></Section>
      {m && (
        <>
          <Section title="PayPal">
            <PaypalForm merchant={m} webhookUrl={data?.webhookUrl ?? null} />
            {m.paypal_connected_at && (
              <div className="mt-6 space-y-3 rounded-xl border p-4">
                <p className="text-sm">If the app address changed (e.g. after publishing), re-register so PayPal calls the new URL:</p>
                <WebhookUrl url={data?.webhookUrl ?? null} />
                {!data?.usingPublicUrl && <p className="text-xs text-muted-foreground">Using the current page address because no public app address is configured.</p>}
                <Button variant="outline" disabled={busy} onClick={async () => {
                  setBusy(true);
                  try { const r = await rereg(); toast.success(`Webhook registered: ${r.url}`); qc.invalidateQueries({ queryKey: ["merchant"] }); }
                  catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
                }}>Re-register webhook</Button>
              </div>
            )}
          </Section>
          <Section title="FIRA"><FiraForm merchant={m} /></Section>
        </>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-5 text-xl font-semibold">{title}</h2>{children}</section>;
}
