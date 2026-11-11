import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scrubText } from "./crypto";
import { IS_PAYPAL_SANDBOX } from "./config";
import { canUseTestShop, SHOP_PAUSED_MESSAGE } from "./shop-access";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function myMerchant(supabase: any) {
  const { data } = await supabase.from("merchants").select("*").maybeSingle();
  return data;
}
async function requireMerchant(supabase: any) {
  const m = await myMerchant(supabase);
  if (!m) throw new Error("Please complete step 1 (your business) first.");
  return m;
}
function webhookUrl(merchantId: string, base: string) {
  return `${base}/api/public/paypal-webhook?m=${merchantId}`;
}
function baseUrl() {
  const env = process.env["APP_PUBLIC_URL"];
  if (env) return env.replace(/\/+$/, "");
  const req = getRequest();
  return req ? new URL(req.url).origin : "";
}

export const getMerchant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await myMerchant(context.supabase);
    return { merchant: m, webhookUrl: m ? webhookUrl(m.id, baseUrl()) : null, usingPublicUrl: !!process.env["APP_PUBLIC_URL"] };
  });

const businessSchema = z.object({
  business_name: z.string().trim().min(1).max(200),
  oib: z.string().trim().regex(/^\d{11}$/).or(z.literal("")).optional(),
  in_vat_system: z.boolean(),
  default_vat_rate: z.union([z.literal(0), z.literal(5), z.literal(13), z.literal(25)]),
  demo_mode: z.boolean(),
});

export const saveBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => businessSchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = { ...data, fira_payment_type: "KARTICA", oib: data.oib || null, default_vat_rate: data.in_vat_system ? data.default_vat_rate : 0 };
    const existing = await myMerchant(context.supabase);
    const q = existing
      ? context.supabase.from("merchants").update(row).eq("id", existing.id)
      : context.supabase.from("merchants").insert({ ...row, user_id: context.userId });
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDemoMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ demo_mode: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const m = await requireMerchant(context.supabase);
    const { error } = await context.supabase.from("merchants").update(data.demo_mode ? { demo_mode: true } : { demo_mode: false, share_live_view: false }).eq("id", m.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const connectPaypal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().trim().min(10).max(200), secret: z.string().trim().min(10).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const m = await requireMerchant(context.supabase);
    const engine = await import("./engine.server");
    const token = await engine.paypalToken(data.clientId, data.secret);
    const url = webhookUrl(m.id, baseUrl());
    const webhookId = await engine.ensureWebhook(token, url);
    await engine.saveCredentials(m.id, { paypal_client_id: data.clientId, paypal_secret: data.secret });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("merchants").update({
      paypal_webhook_id: webhookId, paypal_webhook_url: url, paypal_connected_at: new Date().toISOString(),
      paypal_client_id_last4: data.clientId.slice(-4),
    }).eq("id", m.id);
    return { webhookId, url };
  });

export const reregisterWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await requireMerchant(context.supabase);
    const engine = await import("./engine.server");
    const c = await engine.loadCredentials(m.id);
    if (!c.paypalClientId) throw new Error("Connect PayPal first.");
    const token = await engine.paypalToken(c.paypalClientId, c.paypalSecret);
    const url = webhookUrl(m.id, baseUrl());
    const webhookId = await engine.ensureWebhook(token, url);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("merchants").update({ paypal_webhook_id: webhookId, paypal_webhook_url: url }).eq("id", m.id);
    return { webhookId, url };
  });

export const connectFira = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    domain: z.string().trim().max(200).transform((s) => s.replace(/^https?:\/\//, "").replace(/\/.*$/, "")).optional().default(""),
    apiKey: z.string().trim().min(8).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const m = await requireMerchant(context.supabase);
    const engine = await import("./engine.server");
    const test = await engine.testFiraConnection(data.domain, data.apiKey);
    if (test.status === 401 || test.status === 402) throw new Error(test.message);
    await engine.saveCredentials(m.id, { fira_domain: data.domain, fira_api_key: data.apiKey });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("merchants").update({
      fira_domain: data.domain || null, fira_key_last4: data.apiKey.slice(-4), fira_connected_at: new Date().toISOString(),
    }).eq("id", m.id);
    return { ok: true, test };
  });

export const testFira = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await requireMerchant(context.supabase);
    const engine = await import("./engine.server");
    const c = await engine.loadCredentials(m.id);
    if (!c.firaApiKey) throw new Error("Connect FIRA first.");
    return engine.testFiraConnection(c.firaDomain, c.firaApiKey);
  });

export const sendFiraTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await requireMerchant(context.supabase);
    const engine = await import("./engine.server");
    const { buildFiraPayload } = await import("./fira");
    const c = await engine.loadCredentials(m.id);
    if (!c.firaApiKey) throw new Error("Connect FIRA first.");
    const rate = m.in_vat_system ? m.default_vat_rate : 0;
    const payload = buildFiraPayload({
      kind: "test", settings: { ...m, demo_mode: true }, webshopOrderId: Date.now() /* test offer only, never fiscal */, orderNumber: `FB-TEST-${Date.now()}`,
      eventType: "FISKALBRIDGE.TEST", createdAt: new Date().toISOString(), currency: "EUR",
      lineItems: [{ name: "FiskalBridge connection test", description: "Test offer – not fiscalized", lineItemId: "test", price: 1, quantity: 1, unit: "kom", taxRate: rate }],
    });
    const r = await engine.postToFira(c.firaDomain, c.firaApiKey, payload);
    return { ok: r.ok, status: r.status, body: JSON.stringify(r.body).slice(0, 500) };
  });

export const listTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("paypal_events")
      .select("*, fiscal_documents!fiscal_documents_paypal_event_id_fkey(*)")
      .order("received_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const lineSchema = z.object({
  name: z.string().trim().min(1).max(200), description: z.string().max(500).default(""), lineItemId: z.string().max(50).default(""),
  price: z.number().finite(), quantity: z.number().positive().max(100000), unit: z.string().max(10).default("kom"), taxRate: z.number(),
});

/** Retry (failed) or approve (needs_review). Code validation always runs again; invalid documents are never sent. */
export const resendDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), lineItems: z.array(lineSchema).min(1).max(100).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS read proves ownership before the privileged send.
    const { data: doc } = await context.supabase.from("fiscal_documents").select("id, status").eq("id", data.id).maybeSingle();
    if (!doc) throw new Error("Not found");
    if (!["failed", "needs_review"].includes(doc.status)) throw new Error("This document cannot be sent.");
    const engine = await import("./engine.server");
    return engine.sendDocument(doc.id, data.lineItems);
  });

export const skipDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doc } = await context.supabase.from("fiscal_documents").select("id, status").eq("id", data.id).maybeSingle();
    if (!doc || !["failed", "needs_review"].includes(doc.status)) throw new Error("This document cannot be skipped.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("fiscal_documents").update({ status: "skipped", skip_reason: data.reason }).eq("id", doc.id);
    return { ok: true };
  });

export const getDocument = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doc } = await context.supabase.from("fiscal_documents").select("*, paypal_events!fiscal_documents_paypal_event_id_fkey(*)").eq("id", data.id).maybeSingle();
    if (!doc) throw new Error("Not found");
    const { data: runs } = await context.supabase.from("ai_runs").select("*").eq("fiscal_document_id", data.id).order("created_at", { ascending: false });
    return { doc, runs: runs ?? [] };
  });

export const refundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ eventId: z.string().uuid(), amount: z.number().positive().max(100000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const m = await requireMerchant(context.supabase);
    const { data: ev } = await context.supabase.from("paypal_events").select("event_type, resource_id, amount").eq("id", data.eventId).maybeSingle();
    if (!ev || ev.event_type !== "PAYMENT.CAPTURE.COMPLETED" || !ev.resource_id) throw new Error("Only one-time payments can be refunded here.");
    if (data.amount && data.amount > Number(ev.amount)) throw new Error("Refund is larger than the payment.");
    const engine = await import("./engine.server");
    return { status: await engine.refundCapture(m.id, ev.resource_id, data.amount) };
  });

export const simulateDisputeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const m = await requireMerchant(context.supabase);
    const engine = await import("./engine.server");
    return { id: await engine.simulateDispute(m) };
  });

export const downloadFiraPdfFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const m = await requireMerchant(context.supabase);
    const { data: doc } = await context.supabase.from("fiscal_documents").select("fira_response, fira_invoice_number").eq("id", data.id).eq("merchant_id", m.id).maybeSingle();
    const firaId = (doc?.fira_response as any)?.body?.id;
    if (!firaId) throw new Error("FIRA did not return a document id for this document.");
    const engine = await import("./engine.server");
    return { base64: await engine.downloadFiraPdf(m.id, String(firaId)), filename: `FIRA-${doc?.fira_invoice_number ?? firaId}.pdf`.replace(/[^\w.-]/g, "_") };
  });

/* ---------- Public test-shop functions (PayPal sandbox only; never expose secrets) ---------- */
async function shopMerchant(merchantId: string, accessToken?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: m } = await supabaseAdmin.from("merchants").select("*").eq("id", merchantId).maybeSingle();
  if (!m || !m.paypal_connected_at) throw new Error("This test shop is not available.");
  if (!IS_PAYPAL_SANDBOX) throw new Error("The test shop only works with PayPal sandbox.");
  let callerId: string | null = null;
  if (!m.demo_mode && accessToken) {
    const { data: u } = await supabaseAdmin.auth.getUser(accessToken);
    callerId = u.user?.id ?? null;
  }
  if (!canUseTestShop(m, callerId)) throw new Error(SHOP_PAUSED_MESSAGE);
  return m;
}
const idSchema = z.object({ merchantId: z.string().uuid(), accessToken: z.string().max(4096).optional() });

export const getShopConfig = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      const m = await shopMerchant(data.merchantId, data.accessToken);
      const engine = await import("./engine.server");
      const c = await engine.loadCredentials(m.id);
      return { ok: true as const, liveMode: !m.demo_mode, clientId: c.paypalClientId, businessName: m.business_name, products: engine.SHOP_PRODUCTS.map((p) => ({ ...p })) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

export const shopCreateOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idSchema.extend({ cart: z.array(z.object({ sku: z.string().max(20), qty: z.number().int().min(1).max(20) })).min(1).max(10) }).parse(d))
  .handler(async ({ data }) => {
    const m = await shopMerchant(data.merchantId, data.accessToken);
    const engine = await import("./engine.server");
    return { id: await engine.createShopOrder(m.id, data.cart) };
  });

export const shopCaptureOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idSchema.extend({ orderId: z.string().regex(/^[A-Z0-9]{5,40}$/) }).parse(d))
  .handler(async ({ data }) => {
    const m = await shopMerchant(data.merchantId, data.accessToken);
    const engine = await import("./engine.server");
    return engine.captureShopOrder(m.id, data.orderId);
  });

export const shopSubscriptionPlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    const m = await shopMerchant(data.merchantId, data.accessToken);
    const engine = await import("./engine.server");
    return { planId: await engine.ensureSubscriptionPlan(m) };
  });

export const setShareLiveView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ share: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const m = await requireMerchant(context.supabase);
    const { error } = await context.supabase.from("merchants").update({ share_live_view: data.share }).eq("id", m.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Public read-only live view (demo-mode merchants who opted in). Exposes no raw payloads, no PII. ---------- */
function payerNames(raw: any): string[] {
  const r = raw?.resource ?? {};
  const p = r.payer ?? r.payer_info ?? {};
  const n = [p.name?.given_name, p.name?.surname, p.first_name, p.last_name, r.shipping?.name?.full_name, p.name?.full_name];
  return n.filter((x): x is string => typeof x === "string" && x.trim().length > 1).flatMap((x) => x.split(/\s+/)).filter((x) => x.length > 1);
}
export const getLiveView = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await supabaseAdmin.from("merchants").select("id, business_name, demo_mode, share_live_view").eq("id", data.merchantId).maybeSingle();
    if (!m || !m.demo_mode || !m.share_live_view) return { ok: false as const };
    const { data: evs } = await supabaseAdmin
      .from("paypal_events")
      .select("id, event_type, route, amount, currency, received_at, simulated, verified, raw, fiscal_documents!fiscal_documents_paypal_event_id_fkey(id, kind, status, invoice_type, amount, currency, line_items, explanation_en, explanation_hr, confidence, warnings, ai_mapped, fira_invoice_number, fiscal_status, jir)")
      .eq("merchant_id", m.id)
      .order("received_at", { ascending: false })
      .limit(50);
    const events = (evs ?? []).map((e: any) => {
      const names = payerNames(e.raw);
      const docs = (e.fiscal_documents ?? []).map((d: any) => ({
        ...d,
        jir: d.jir ? "present" : null,
        explanation_en: scrubText(d.explanation_en, names),
        explanation_hr: scrubText(d.explanation_hr, names),
        warnings: (d.warnings ?? []).map((w: string) => scrubText(w, names)),
        line_items: (d.line_items ?? []).map((l: any) => ({ name: scrubText(l.name, names), quantity: l.quantity, price: l.price, taxRate: l.taxRate })),
      }));
      const { raw: _raw, ...rest } = e;
      return { ...rest, fiscal_documents: docs };
    });
    return { ok: true as const, businessName: m.business_name, events };
  });
