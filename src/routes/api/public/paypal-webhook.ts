import { createFileRoute } from "@tanstack/react-router";

// Public PayPal webhook receiver. In production src/server.ts answers first and processes via
// waitUntil; this handler is the fallback (e.g. dev). Every event is signature-verified with PayPal.
export const Route = createFileRoute("/api/public/paypal-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.text();
          const engine = await import("@/lib/fiskal/engine.server");
          await engine.handleWebhook(request.url, request.headers, body);
        } catch (e) {
          console.error("paypal-webhook error", e);
        }
        return new Response("ok");
      },
      GET: async () => new Response("FiskalBridge PayPal webhook is live."),
    },
  },
});
