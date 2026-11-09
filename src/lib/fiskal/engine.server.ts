// Server-only engine: PayPal + FIRA I/O and event processing. Import dynamically from handlers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FIRA_API_URL, PAYPAL_API_BASE, type MerchantSettings, type VatRate, type FiraPaymentType } from "./config";
import { decrypt, encrypt } from "./crypto";
import { routeEvent, SUBSCRIBED_EVENTS } from "./routing";
import { deterministicMapper, type InvoiceMapper, type PaymentDetails } from "./mapper";
import { validateInvoice } from "./validate";
import { buildFiraPayload, type Payer } from "./fira";

// Swap point for Phase 2 (AI mapper).
const mapToInvoice: InvoiceMapper = deterministicMapper;

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
      method: "POST",
      headers: { "Content-Type": "application/json", "FIRA-Api-Key": apiKey, "X-Webshop-Domain": domain },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let body: Json = text;
    try { body = JSON.parse(text); } catch { /* keep text */ }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { error: String(e) } };
  }
}

function settingsOf(m: Json): MerchantSettings {
  return {
    business_name: m.business_name,
    in_vat_system: m.in_vat_system,
    default_vat_rate: m.default_vat_rate as VatRate,
    fira_payment_type: m.fira_payment_type as FiraPaymentType,
    demo_mode: m.demo_mode,
  };
}

export async function sendDocument(docId: string) {
  const { data: doc } = await supabaseAdmin.from("fiscal_documents").select("*").eq("id", docId).single();
  if (!doc?.fira_request) throw new Error("Document has nothing to send");
  const creds = await loadCredentials(doc.merchant_id);
  if (!creds.firaApiKey) throw new Error("FIRA is not connected");
  const payload = { ...(doc.fira_request as Json), webshopOrderId: Date.now() };
  const r = await postToFira(creds.firaDomain, creds.firaApiKey, payload);
  await supabaseAdmin
    .from("fiscal_documents")
    .update({ status: r.ok ? "sent" : "failed", fira_request: payload, fira_response: { status: r.status, body: r.body } })
    .eq("id", docId);
  return r.ok;
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

/** Processes a verified event. Never throws. */
export async function processEvent(merchant: Json, event: Json, verified: boolean) {
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
    resource_id: resourceId, amount, currency, raw: event, verified: true,
  }).select("id").single();
  if (error) return; // duplicate (unique violation) or failure → idempotent no-op

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
    let payer: Payer | undefined;
    let originalDocId: string | null = null;
    let orderNumber = resourceId;
    const creds = await loadCredentials(merchant.id);

    // Enrichment
    try {
      const token = await paypalToken(creds.paypalClientId, creds.paypalSecret);
      const orderId = r.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        const o = await pp(token, `/v2/checkout/orders/${orderId}`);
        const pu = o.body.purchase_units?.[0];
        itemName = pu?.items?.map((i: Json) => i.name).join(", ") || pu?.description;
        payer = {
          name: [o.body.payer?.name?.given_name, o.body.payer?.name?.surname].filter(Boolean).join(" "),
          email: o.body.payer?.email_address, country: o.body.payer?.address?.country_code,
        };
      }
      const subId = r.billing_agreement_id;
      if (subId) {
        const s = await pp(token, `/v1/billing/subscriptions/${subId}`);
        if (s.body.plan_id) {
          const p = await pp(token, `/v1/billing/plans/${s.body.plan_id}`);
          planName = p.body.name;
        }
        const sub = s.body.subscriber;
        if (sub) payer = { name: [sub.name?.given_name, sub.name?.surname].filter(Boolean).join(" "), email: sub.email_address, country: sub.shipping_address?.address?.country_code };
      }
      if (event.event_type === "INVOICING.INVOICE.PAID") {
        const inv = r.invoice ?? r;
        itemName = inv.items?.map((i: Json) => i.name).join(", ") || itemName;
        orderNumber = inv.detail?.invoice_number ?? inv.id ?? orderNumber;
        const b = inv.primary_recipients?.[0]?.billing_info;
        if (b) payer = { name: b.name?.full_name, email: b.email_address, country: b.address?.country_code };
      }
    } catch (e) {
      warnings.push(`Could not fetch extra details from PayPal: ${String(e)}`);
    }

    if (kind === "storno") {
      const origId = originalIdOf(event);
      if (origId) {
        const { data: orig } = await supabaseAdmin.from("fiscal_documents").select("id, line_items, fira_request")
          .eq("merchant_id", merchant.id).eq("resource_id", origId).eq("kind", "invoice")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (orig) {
          originalDocId = orig.id;
          itemName = itemName ?? (orig.line_items as Json)?.[0]?.name;
          payer = payer ?? ((orig.fira_request as Json)?.billingAddress as Payer);
        } else warnings.push(`Original invoice for ${origId} not found in FiskalBridge.`);
        orderNumber = `${origId}-STORNO-${resourceId}`;
      }
    }

    const signed = amount == null ? 0 : kind === "storno" ? -Math.abs(amount) : amount;
    const details: PaymentDetails = { amount: signed, currency: currency ?? "EUR", resourceId: orderNumber, itemName, planName };
    const mapped = await mapToInvoice(event, details, settings);
    const docCurrency = currency ?? "EUR";
    const errors = amount == null ? ["PayPal event has no amount."] : validateInvoice(mapped.lineItems, { amount: signed, currency: docCurrency }, "EUR", settings);
    const payload = buildFiraPayload({
      kind, settings, orderNumber, eventType: event.event_type, createdAt: event.create_time ?? new Date().toISOString(),
      currency: docCurrency, lineItems: mapped.lineItems, payer,
    });

    const { data: doc } = await supabaseAdmin.from("fiscal_documents").insert({
      ...base, amount: signed, kind, invoice_type: payload.invoiceType, line_items: mapped.lineItems as Json,
      explanation_en: mapped.explanation_en, explanation_hr: mapped.explanation_hr, confidence: mapped.confidence,
      warnings: [...warnings, ...mapped.warnings, ...errors], status: errors.length ? "needs_review" : "failed",
      fira_request: payload as Json, original_document_id: originalDocId,
    }).select("id").single();
    if (doc && !errors.length) await sendDocument(doc.id);
  } catch (e) {
    console.error("processEvent failed", e);
    await supabaseAdmin.from("fiscal_documents").insert({
      ...base, kind: action === "STORNO" ? "storno" : "invoice", status: "failed", warnings: [String(e)],
      explanation_en: "Something went wrong while processing this event.", explanation_hr: "Došlo je do greške pri obradi događaja.",
    });
  }
}
