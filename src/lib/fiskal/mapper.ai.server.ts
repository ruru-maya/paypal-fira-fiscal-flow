// AI invoice mapper (Lovable AI, structured tool output). Code validation always runs afterwards.
import { generateChatCompletion } from "@lovable.dev/ai-gateway";
import type { MerchantSettings } from "./config";
import { deterministicMapper, type LineItem, type MappedInvoice, type PaymentDetails } from "./mapper";

export const AI_MODEL = "google/gemini-3.8-flash" as const;
const AI_TIMEOUT_MS = 12000;

const TOOL = {
  type: "function" as const,
  function: {
    name: "emit_invoice",
    description: "Return the invoice content for FIRA.",
    parameters: {
      type: "object",
      properties: {
        lineItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Clean, human-readable product name" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string", description: "Usually 'kom'" },
              price: { type: "number", description: "Gross unit price in EUR incl. VAT. Negative for storno." },
              taxRate: { type: "number", enum: [0, 5, 13, 25] },
            },
            required: ["name", "description", "quantity", "unit", "price", "taxRate"],
          },
        },
        explanation_en: { type: "string" },
        explanation_hr: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        warnings: { type: "array", items: { type: "string" } },
      },
      required: ["lineItems", "explanation_en", "explanation_hr", "confidence", "warnings"],
    },
  },
};

const SYSTEM = `You map PayPal payment data into Croatian invoice line items for the FIRA invoicing app.
Rules:
- Sum of (price × quantity) MUST equal the given paypal_amount (already excludes shipping and discounts) exactly to the cent (gross, EUR). For refunds/storno all prices are NEGATIVE and sum to the negative refunded amount.
- Clean messy names (e.g. "SKU-221 HANDMADE MUG BLU x2" → name "Handmade mug, blue", quantity 2).
- VAT: if merchant is NOT in the VAT system every taxRate is 0. Otherwise choose per line from Croatian rates: 25 standard; 13 (e.g. accommodation, some food services); 5 (e.g. books, some foods, medicines). Use the merchant default when unsure and add a warning.
- Partial refunds: work out which original lines/quantities the refunded amount corresponds to. If no combination matches exactly, emit ONE proportional storno line and add a warning.
- Cross-border/B2B (ONLY for merchants in the VAT system; skip for non-VAT merchants): if payer is an EU business with a VAT id, or the payer is outside the EU, add a warning that reverse charge / OSS may apply and the merchant or accountant should confirm. NEVER apply special regimes yourself.
- explanation_en and explanation_hr: 1–3 plain sentences for a non-technical merchant: what happened and what document will be created.
- confidence: 0–1, lower when you guessed.`;

export async function aiMapToInvoice(
  event: { event_type: string },
  details: PaymentDetails,
  settings: MerchantSettings,
): Promise<{ mapped: MappedInvoice; usedFallback: boolean; latencyMs: number; error?: string }> {
  const t0 = Date.now();
  const input = {
    route: details.route, event_type: event.event_type,
    paypal_amount: details.amount, currency: details.currency,
    items: details.items ?? null, item_name: details.itemName ?? null, subscription_plan: details.planName ?? null,
    payer: { country: details.payerCountry ?? null, looks_like_business: !!details.payerIsBusiness, company: details.payerCompany ?? null, vat_id: details.payerVatId ?? null },
    merchant: { in_vat_system: settings.in_vat_system, default_vat_rate: settings.default_vat_rate },
    original_invoice_lines: details.originalLines ?? null, original_invoice_total: details.originalTotal ?? null,
  };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    const res = await generateChatCompletion(
      {
        model: AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify(input) },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "emit_invoice" } },
      },
      { signal: ctrl.signal },
    ).finally(() => clearTimeout(timer));
    const call = res.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = call && "function" in call ? call.function.arguments : undefined;
    if (!argsRaw) throw new Error("AI returned no structured output");
    const out = JSON.parse(argsRaw) as {
      lineItems: Omit<LineItem, "lineItemId">[]; explanation_en: string; explanation_hr: string; confidence: number; warnings: string[];
    };
    if (!Array.isArray(out.lineItems)) throw new Error("AI output missing lineItems");
    const mapped: MappedInvoice = {
      lineItems: out.lineItems.map((l, i) => ({
        name: String(l.name ?? "").slice(0, 200), description: String(l.description ?? "").slice(0, 500),
        lineItemId: String(i + 1), price: Math.round(Number(l.price) * 100) / 100,
        quantity: Number(l.quantity) || 1, unit: String(l.unit || "kom"), taxRate: Number(l.taxRate),
      })),
      explanation_en: String(out.explanation_en ?? ""), explanation_hr: String(out.explanation_hr ?? ""),
      confidence: Math.max(0, Math.min(1, Number(out.confidence) || 0)),
      warnings: Array.isArray(out.warnings) ? out.warnings.map(String) : [],
    };
    return { mapped, usedFallback: false, latencyMs: Date.now() - t0 };
  } catch (e) {
    const mapped = await deterministicMapper(event, details, settings);
    mapped.warnings.push("AI mapping unavailable — used the simple rule-based mapping.");
    return { mapped, usedFallback: true, latencyMs: Date.now() - t0, error: String(e).slice(0, 500) };
  }
}
