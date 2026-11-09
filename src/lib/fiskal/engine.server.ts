// Server-only engine: PayPal + FIRA I/O and event processing. Import dynamically from handlers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FIRA_API_URL, PAYPAL_API_BASE, type MerchantSettings, type VatRate, type FiraPaymentType } from "./config";
import { decrypt, encrypt } from "./crypto";
import { routeEvent, SUBSCRIBED_EVENTS } from "./routing";
import { needsReview, type LineItem, type PaymentDetails, type SourceItem } from "./mapper";
import { aiMapToInvoice, AI_MODEL } from "./mapper.ai.server";
import { validateInvoice } from "./validate";
import { buildFiraPayload, type Payer } from "./fira";

// Swap point for Phase 2 (AI mapper).
const FIRA_TIMEOUT_MS = 8000;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

function encKey() {
  const k = process.env["CREDENTIALS_ENCRYPTION_KEY"];
  if (!k) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not configured");
  return k;
}

export function publicBaseUrl(requestUrl?: string) {
  const env = process.env["APP_PUBLIC_URL"];
  if (env) return env.replace(/\/+$/, "");
  return requestUrl ? new URL(requestUrl).origin : "";
}
export const webhookUrlFor = (base: string, merchantId: string) => `${base}/api/public/paypal-webhook?m=${merchantId}`;

export async function paypalToken(clientId: string, secret: string): Promise<string> {
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`PayPal rejected these credentials (${j.error_description ?? res.status})`);
  return j.access_token;
}

async function pp(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${PAYPAL_API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export async function ensureWebhook(token: string, url: string): Promise<string> {
  const list = await pp(token, "/v1/notifications/webhooks");
  const existing = (list.body.webhooks ?? []).find((w: Json) => w.url === url);
  const event_types = SUBSCRIBED_EVENTS.map((name) => ({ name }));
  if (existing) {
    await pp(token, `/v1/notifications/webhooks/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify([{ op: "replace", path: "/event_types", value: event_types }]),
    });
    return existing.id;
  }
  const created = await pp(token, "/v1/notifications/webhooks", { method: "POST", body: JSON.stringify({ url, event_types }) });
  if (!created.ok) throw new Error(`Could not create PayPal webhook: ${created.body.message ?? created.status} ${JSON.stringify(created.body.details ?? "")}`);
  return created.body.id;
}

export async function saveCredentials(merchantId: string, fields: Record<string, string>) {
  const k = encKey();
  const row: Record<string, string> = { merchant_id: merchantId, updated_at: new Date().toISOString() };
  for (const [f, v] of Object.entries(fields)) row[f] = await encrypt(v, k);
  const { error } = await supabaseAdmin.from("merchant_credentials").upsert(row as never, { onConflict: "merchant_id" });
  if (error) throw new Error(error.message);
}

export async function loadCredentials(merchantId: string) {
  const { data } = await supabaseAdmin.from("merchant_credentials").select("*").eq("merchant_id", merchantId).maybeSingle();
  const k = encKey();
  const d = async (v: string | null | undefined) => (v ? await decrypt(v, k) : "");
  return {
    paypalClientId: await d(data?.paypal_client_id),
    paypalSecret: await d(data?.paypal_secret),
    firaDomain: await d(data?.fira_domain),
    firaApiKey: await d(data?.fira_api_key),
  };
}

export async function postToFira(domain: string, apiKey: string, payload: Json) {
  try {
    const res = await fetch(FIRA_API_URL, {
      signal: AbortSignal.timeout(FIRA_TIMEOUT_MS),
      method: "POST",
      headers: { "Content-Type": "application/json", "FIRA-Api-Key": apiKey, "X-Webshop-Domain": domain },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let body: Json = text;
    try { body = JSON.parse(text); } catch { /* keep text */ }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, status: 0, body: { error: timedOut ? `FIRA did not answer within ${FIRA_TIMEOUT_MS / 1000}s (retryable)` : String(e) } };
  }
}

export function settingsOf(m: Json): MerchantSettings {
  return {
    business_name: m.business_name,
    in_vat_system: m.in_vat_system,
    default_vat_rate: m.default_vat_rate as VatRate,
    fira_payment_type: m.fira_payment_type as FiraPaymentType,
    demo_mode: m.demo_mode,
  };
}

/** Validates the document's current line items with code; returns errors (empty = valid). */
export function validateDoc(doc: Json, merchant: Json, lineItems: LineItem[]): string[] {
  const settings = settingsOf(merchant);
  return validateInvoice(lineItems, { amount: Number(doc.amount), currency: doc.currency ?? "EUR" }, "EUR", settings);
}

/** Sends a document to FIRA. Never sends invalid documents. */
export async function sendDocument(docId: string, editedLines?: LineItem[]) {
  const { data: doc } = await supabaseAdmin.from("fiscal_documents").select("*").eq("id", docId).single();
  if (!doc?.fira_request) throw new Error("Document has nothing to send");
  const { data: merchant } = await supabaseAdmin.from("merchants").select("*").eq("id", doc.merchant_id).single();
  const lines = (editedLines ?? (doc.line_items as Json)) as LineItem[];
  const errors = validateDoc(doc, merchant, lines);
  if (errors.length) {
    await supabaseAdmin.from("fiscal_documents").update({ validation_errors: errors, line_items: lines as Json }).eq("id", docId);
    return { ok: false, errors };
  }
  const creds = await loadCredentials(doc.merchant_id);
  if (!creds.firaApiKey) throw new Error("FIRA is not connected");
  const req = doc.fira_request as Json;
  const settings = settingsOf(merchant);
  const payload = buildFiraPayload({
    kind: doc.kind === "storno" ? "storno" : "invoice", settings, orderNumber: req.webshopOrderNumber,
    eventType: String(req.internalNote ?? "").replace(/^PayPal (\S+):.*/, "$1"), createdAt: req.createdAt,
    currency: req.currency, lineItems: lines, payer: req.billingAddress,
  });
  const r = await postToFira(creds.firaDomain, creds.firaApiKey, payload);
  await supabaseAdmin.from("fiscal_documents").update({
    status: r.ok ? "sent" : "failed", invoice_type: payload.invoiceType, line_items: lines as Json, validation_errors: [],
    fira_request: payload as Json, fira_response: { status: r.status, body: r.body },
  }).eq("id", docId);
  return { ok: r.ok, errors: [] as string[] };
}

export async function verifySignature(merchant: Json, headers: Headers, event: Json): Promise<boolean> {
  try {
    if (!merchant.paypal_webhook_id) return false;
    const c = await loadCredentials(merchant.id);
    const token = await paypalToken(c.paypalClientId, c.paypalSecret);
    const r = await pp(token, "/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: JSON.stringify({
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: merchant.paypal_webhook_id,
        webhook_event: event,
      }),
    });
    return r.ok && r.body.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}

const EU = new Set(["AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI","FR","GR","HR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK"]);
export const isEu = (c?: string) => !!c && EU.has(c.toUpperCase());

function amountOf(event: Json): { amount: number | null; currency: string | null } {
  const r = event.resource ?? {};
  const a =
    r.amount?.value ?? r.amount?.total ?? r.total_refunded_amount?.value ?? r.dispute_amount?.value ??
    r.invoice?.amount?.value ?? r.amount_with_breakdown?.gross_amount?.value ?? null;
  const c =
    r.amount?.currency_code ?? r.amount?.currency ?? r.total_refunded_amount?.currency_code ??
    r.dispute_amount?.currency_code ?? r.invoice?.amount?.currency_code ?? null;
  return { amount: a != null ? Number(a) : null, currency: c };
}

function originalIdOf(event: Json): string | null {
  const r = event.resource ?? {};
  if (event.event_type === "PAYMENT.SALE.REFUNDED") return r.sale_id ?? null;
  if (event.event_type === "PAYMENT.CAPTURE.REVERSED") return r.id ?? null;
  if (event.event_type === "CUSTOMER.DISPUTE.RESOLVED") return r.disputed_transactions?.[0]?.seller_transaction_id ?? null;
  const up = (r.links ?? []).find((l: Json) => l.rel === "up")?.href as string | undefined;
  return up ? up.split("/").pop() ?? null : null;
}

/** Simulator events can't pass signature checks; accept only demo-mode merchants with a fresh nonce we created. */
async function consumeSimulationNonce(merchant: Json, event: Json): Promise<boolean> {
  if (!merchant.demo_mode) return false;
  const { data } = await supabaseAdmin.from("simulation_nonces").select("id, paypal_event_id")
    .eq("merchant_id", merchant.id).eq("event_type", event.event_type).is("used_at", null)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
  const match = (data ?? []).find((n) => !n.paypal_event_id || n.paypal_event_id === event.id);
  if (!match) return false;
  const { data: upd } = await supabaseAdmin.from("simulation_nonces").update({ used_at: new Date().toISOString() })
    .eq("id", match.id).is("used_at", null).select("id");
  return !!upd?.length;
}

/** Full webhook pipeline. Never throws. */
export async function handleWebhook(url: string, headers: Headers, bodyText: string) {
  try {
    const m = new URL(url).searchParams.get("m") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(m)) return;
    let event: Json = null;
    try { event = JSON.parse(bodyText); } catch { return; }
    if (!event || typeof event.event_type !== "string") return;
    const { data: merchant } = await supabaseAdmin.from("merchants").select("*").eq("id", m).maybeSingle();
    if (!merchant) return;
    let verified = await verifySignature(merchant, headers, event);
    let simulated = false;
    if (!verified && (await consumeSimulationNonce(merchant, event))) { verified = true; simulated = true; }
    await processEvent(merchant, event, verified, simulated);
  } catch (e) {
    console.error("handleWebhook failed", e);
  }
}

/** Processes an event. Never throws. */
export async function processEvent(merchant: Json, event: Json, verified: boolean, simulated = false) {
  const { route, action } = routeEvent(event);
  const r = event.resource ?? {};
  const { amount, currency } = amountOf(event);
  const resourceId: string = r.id ?? "";

  if (!verified) {
    const { data: ev } = await supabaseAdmin.from("paypal_events").insert({
      merchant_id: merchant.id, paypal_event_id: `rejected:${event.id ?? "?"}:${crypto.randomUUID()}`,
      event_type: event.event_type ?? "UNKNOWN", route, resource_id: resourceId, amount, currency, raw: event, verified: false,
    }).select("id").single();
    if (ev) await supabaseAdmin.from("fiscal_documents").insert({
      merchant_id: merchant.id, paypal_event_id: ev.id, kind: "none", status: "rejected",
      explanation_en: "Signature could not be verified with PayPal — event rejected.",
      explanation_hr: "Potpis nije potvrđen kod PayPala — događaj odbijen.",
    });
    return;
  }

  const { data: ev, error } = await supabaseAdmin.from("paypal_events").insert({
    merchant_id: merchant.id, paypal_event_id: event.id, event_type: event.event_type, route,
    resource_id: resourceId, amount, currency, raw: event, verified: true, simulated,
  }).select("id").single();
  if (error) return; // duplicate → idempotent no-op

  const base = { merchant_id: merchant.id, paypal_event_id: ev.id, resource_id: resourceId, amount, currency };

  if (action === "NONE" || action === "WATCH") {
    const watching = action === "WATCH";
    await supabaseAdmin.from("fiscal_documents").insert({
      ...base, kind: "none", status: watching ? "watching" : "ignored",
      explanation_en: watching ? "Dispute opened — we are watching it. No document yet." : route === "dispute_resolved" ? "Dispute closed – no action needed." : "Logged for information only. No document needed.",
      explanation_hr: watching ? "Otvoren spor — pratimo ga. Dokument još nije izdan." : route === "dispute_resolved" ? "Spor zatvoren – nije potrebna radnja." : "Zabilježeno samo informativno. Dokument nije potreban.",
    });
    return;
  }

  try {
    const settings = settingsOf(merchant);
    const kind = action === "STORNO" ? "storno" : "invoice";
    const warnings: string[] = [];
    let itemName: string | undefined;
    let planName: string | undefined;
    let items: SourceItem[] | undefined;
    let payer: Payer | undefined;
    let company: string | undefined;
    let vatId: string | undefined;
    let originalDocId: string | null = null;
    let originalLines: LineItem[] | undefined;
    let originalTotal: number | undefined;
    let orderNumber = resourceId;
    const creds = await loadCredentials(merchant.id);

    try {
      const token = await paypalToken(creds.paypalClientId, creds.paypalSecret);
      const orderId = r.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        const o = await pp(token, `/v2/checkout/orders/${orderId}`);
        const pu = o.body.purchase_units?.[0];
        items = pu?.items?.map((i: Json) => ({ name: i.name, description: i.description, quantity: Number(i.quantity) || 1, unitPrice: Number(i.unit_amount?.value ?? 0), sku: i.sku }));
        itemName = pu?.description;
        const p = o.body.payer ?? o.body.payment_source?.paypal;
        payer = { name: [p?.name?.given_name, p?.name?.surname].filter(Boolean).join(" "), email: p?.email_address, country: p?.address?.country_code };
        company = p?.business_name ?? pu?.shipping?.name?.full_name?.match?.(/d\.o\.o\.|GmbH|Ltd|S\.r\.l|SAS|B\.V\./i) ? pu.shipping.name.full_name : undefined;
        vatId = p?.tax_info?.tax_id;
      }
      const subId = r.billing_agreement_id;
      if (subId) {
        const s = await pp(token, `/v1/billing/subscriptions/${subId}`);
        if (s.body.plan_id) {
          const pl = await pp(token, `/v1/billing/plans/${s.body.plan_id}`);
          planName = pl.body.name;
        }
        const sub = s.body.subscriber;
        if (sub) payer = { name: [sub.name?.given_name, sub.name?.surname].filter(Boolean).join(" "), email: sub.email_address, country: sub.shipping_address?.address?.country_code };
      }
      if (event.event_type === "INVOICING.INVOICE.PAID") {
        const inv = r.invoice ?? r;
        items = inv.items?.map((i: Json) => ({ name: i.name, description: i.description, quantity: Number(i.quantity) || 1, unitPrice: Number(i.unit_amount?.value ?? 0) }));
        orderNumber = inv.detail?.invoice_number ?? inv.id ?? orderNumber;
        const b = inv.primary_recipients?.[0]?.billing_info;
        if (b) { payer = { name: b.name?.full_name, email: b.email_address, country: b.address?.country_code }; company = b.business_name; }
      }
    } catch (e) {
      warnings.push(`Could not fetch extra details from PayPal: ${String(e)}`);
    }

    if (kind === "storno") {
      const origId = originalIdOf(event);
      if (origId) {
        const { data: orig } = await supabaseAdmin.from("fiscal_documents").select("id, line_items, fira_request, amount")
          .eq("merchant_id", merchant.id).eq("resource_id", origId).eq("kind", "invoice")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (orig) {
          originalDocId = orig.id;
          originalLines = orig.line_items as unknown as LineItem[];
          originalTotal = Number(orig.amount);
          payer = payer ?? ((orig.fira_request as Json)?.billingAddress as Payer);
        } else warnings.push(`Original invoice for ${origId} not found in FiskalBridge.`);
        orderNumber = `${origId}-STORNO-${resourceId}`;
      }
    }

    const signed = amount == null ? 0 : kind === "storno" ? -Math.abs(amount) : amount;
    const docCurrency = currency ?? "EUR";
    const details: PaymentDetails = {
      amount: signed, currency: docCurrency, resourceId: orderNumber, route, itemName, planName, items,
      payerCountry: payer?.country, payerIsBusiness: !!(company || vatId), payerCompany: company, payerVatId: vatId,
      originalLines, originalTotal,
    };
    const ai = await aiMapToInvoice(event, details, settings);
    const mapped = ai.mapped;
    // Code-side cross-border safety net (never applies a regime, only warns).
    if (payer?.country && !isEu(payer.country) && !mapped.warnings.some((w) => /OSS|reverse|outside/i.test(w)))
      mapped.warnings.push(`Customer is outside the EU (${payer.country}) — export/OSS rules may apply; confirm with your accountant.`);
    const errors = amount == null ? ["PayPal event has no amount."] : validateInvoice(mapped.lineItems, { amount: signed, currency: docCurrency }, "EUR", settings);
    const allWarnings = [...warnings, ...mapped.warnings];
    const review = needsReview({ confidence: mapped.confidence, warnings: allWarnings }, errors);
    const payload = buildFiraPayload({
      kind, settings, orderNumber, eventType: event.event_type, createdAt: event.create_time ?? new Date().toISOString(),
      currency: docCurrency, lineItems: mapped.lineItems, payer,
    });

    const { data: doc } = await supabaseAdmin.from("fiscal_documents").insert({
      ...base, amount: signed, currency: docCurrency, kind, invoice_type: payload.invoiceType, line_items: mapped.lineItems as Json,
      explanation_en: mapped.explanation_en, explanation_hr: mapped.explanation_hr, confidence: mapped.confidence,
      warnings: allWarnings, validation_errors: errors, status: review ? "needs_review" : "failed",
      ai_mapped: !ai.usedFallback, fira_request: payload as Json, original_document_id: originalDocId,
      source_context: { items: items ?? null, itemName: itemName ?? null, planName: planName ?? null, payer: payer ?? null, company: company ?? null, vatId: vatId ?? null, originalLines: originalLines ?? null } as Json,
    }).select("id").single();
    if (doc) {
      await supabaseAdmin.from("ai_runs").insert({
        merchant_id: merchant.id, fiscal_document_id: doc.id, model: AI_MODEL, latency_ms: ai.latencyMs,
        confidence: mapped.confidence, used_fallback: ai.usedFallback, error: ai.error ?? null,
      });
      if (!review) await sendDocument(doc.id);
    }
  } catch (e) {
    console.error("processEvent failed", e);
    await supabaseAdmin.from("fiscal_documents").insert({
      ...base, kind: action === "STORNO" ? "storno" : "invoice", status: "failed", warnings: [String(e)],
      explanation_en: "Something went wrong while processing this event.", explanation_hr: "Došlo je do greške pri obradi događaja.",
    });
  }
}

/* ---------- Sandbox demo helpers (test shop, refunds, simulator) ---------- */

export async function merchantToken(merchantId: string) {
  const c = await loadCredentials(merchantId);
  if (!c.paypalClientId) throw new Error("PayPal is not connected for this shop.");
  return { token: await paypalToken(c.paypalClientId, c.paypalSecret), clientId: c.paypalClientId };
}

export const SHOP_PRODUCTS = [
  { sku: "MUG-01", name: "Handmade ceramic mug", price: 18.0 },
  { sku: "LIC-02", name: "Licitar heart magnet", price: 6.5 },
  { sku: "BOOK-03", name: "Croatian cookbook", price: 24.0 },
] as const;

export async function createShopOrder(merchantId: string, cart: { sku: string; qty: number }[]) {
  const { token } = await merchantToken(merchantId);
  const items = cart.map((c) => {
    const p = SHOP_PRODUCTS.find((x) => x.sku === c.sku);
    if (!p) throw new Error("Unknown product");
    return { name: p.name, sku: p.sku, quantity: String(c.qty), unit_amount: { currency_code: "EUR", value: p.price.toFixed(2) }, category: "PHYSICAL_GOODS" };
  });
  const total = cart.reduce((s, c) => s + Math.round(SHOP_PRODUCTS.find((x) => x.sku === c.sku)!.price * 100) * c.qty, 0) / 100;
  const r = await pp(token, "/v2/checkout/orders", {
    method: "POST", headers: { "PayPal-Request-Id": crypto.randomUUID() },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ description: "Varaždin Souvenirs (demo)", amount: { currency_code: "EUR", value: total.toFixed(2), breakdown: { item_total: { currency_code: "EUR", value: total.toFixed(2) } } }, items }],
    }),
  });
  if (!r.ok) throw new Error(`PayPal: ${r.body.message ?? r.status}`);
  return r.body.id as string;
}

export async function captureShopOrder(merchantId: string, orderId: string) {
  const { token } = await merchantToken(merchantId);
  const r = await pp(token, `/v2/checkout/orders/${orderId}/capture`, { method: "POST", headers: { "PayPal-Request-Id": `cap-${orderId}` } });
  if (!r.ok) throw new Error(`PayPal: ${r.body.message ?? r.status}`);
  return { status: r.body.status as string };
}

export async function ensureSubscriptionPlan(merchant: Json) {
  if (merchant.paypal_plan_id) return merchant.paypal_plan_id as string;
  const { token } = await merchantToken(merchant.id);
  let productId = merchant.paypal_product_id as string | null;
  if (!productId) {
    const p = await pp(token, "/v1/catalogs/products", { method: "POST", body: JSON.stringify({ name: "Souvenir of the Month club", type: "PHYSICAL", category: "GIFTS_AND_FLOWERS" }) });
    if (!p.ok) throw new Error(`PayPal product: ${p.body.message ?? p.status}`);
    productId = p.body.id;
  }
  const plan = await pp(token, "/v1/billing/plans", {
    method: "POST",
    body: JSON.stringify({
      product_id: productId, name: "Souvenir of the Month club", status: "ACTIVE",
      billing_cycles: [{ frequency: { interval_unit: "MONTH", interval_count: 1 }, tenure_type: "REGULAR", sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: "9.99", currency_code: "EUR" } } }],
      payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
    }),
  });
  if (!plan.ok) throw new Error(`PayPal plan: ${plan.body.message ?? plan.status}`);
  await supabaseAdmin.from("merchants").update({ paypal_product_id: productId, paypal_plan_id: plan.body.id }).eq("id", merchant.id);
  return plan.body.id as string;
}

export async function refundCapture(merchantId: string, captureId: string, amount?: number) {
  const { token } = await merchantToken(merchantId);
  const body = amount ? { amount: { value: amount.toFixed(2), currency_code: "EUR" } } : {};
  const r = await pp(token, `/v2/payments/captures/${captureId}/refund`, { method: "POST", headers: { "PayPal-Request-Id": crypto.randomUUID() }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PayPal refund: ${r.body.message ?? r.body.details?.[0]?.description ?? r.status}`);
  return r.body.status as string;
}

export async function simulateDispute(merchant: Json) {
  if (!merchant.demo_mode) throw new Error("Simulation is only available in demo mode.");
  const { token } = await merchantToken(merchant.id);
  const { data: nonce } = await supabaseAdmin.from("simulation_nonces").insert({ merchant_id: merchant.id, event_type: "CUSTOMER.DISPUTE.CREATED" }).select("id").single();
  const r = await pp(token, "/v1/notifications/simulate-event", {
    method: "POST", body: JSON.stringify({ webhook_id: merchant.paypal_webhook_id, event_type: "CUSTOMER.DISPUTE.CREATED", resource_version: "1.0" }),
  });
  if (!r.ok) throw new Error(`PayPal simulator: ${r.body.message ?? r.status}`);
  if (nonce && r.body.id) await supabaseAdmin.from("simulation_nonces").update({ paypal_event_id: r.body.id }).eq("id", nonce.id).is("used_at", null);
  return r.body.id as string;
}
