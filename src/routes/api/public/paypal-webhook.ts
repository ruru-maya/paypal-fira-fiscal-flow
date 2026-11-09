import { createFileRoute } from "@tanstack/react-router";

// Public PayPal webhook receiver. Security: every event is verified with PayPal's
// verify-webhook-signature API before any document is created. Always answers 200.
export const Route = createFileRoute("/api/public/paypal-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const m = new URL(request.url).searchParams.get("m") ?? "";
          if (!/^[0-9a-f-]{36}$/i.test(m)) return new Response("ok");
          const event = await request.json().catch(() => null);
          if (!event || typeof event !== "object" || typeof event.event_type !== "string") return new Response("ok");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: merchant } = await supabaseAdmin.from("merchants").select("*").eq("id", m).maybeSingle();
          if (!merchant) return new Response("ok");
          const engine = await import("@/lib/fiskal/engine.server");
          const verified = await engine.verifySignature(merchant, request.headers, event);
          await engine.processEvent(merchant, event, verified);
        } catch (e) {
          console.error("paypal-webhook error", e);
        }
        return new Response("ok");
      },
      GET: async () => new Response("FiskalBridge PayPal webhook is live."),
    },
  },
});
