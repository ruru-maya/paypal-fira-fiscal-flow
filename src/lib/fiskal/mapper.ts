import type { MerchantSettings } from "./config";

export interface LineItem {
  name: string;
  description: string;
  lineItemId: string;
  price: number; // gross unit price, EUR (negative for storno)
  quantity: number;
  unit: string;
  taxRate: number; // percentage internally (25); converted to 0.25 only in the FIRA payload
  productCode?: string | undefined; // PayPal sku → FIRA product list
}

export interface MappedInvoice {
  lineItems: LineItem[];
  explanation_en: string;
  explanation_hr: string;
  confidence: number;
  warnings: string[];
}

export interface SourceItem {
  name: string;
  description?: string | undefined;
  quantity: number;
  unitPrice: number;
  sku?: string | undefined;
}

export interface PaymentDetails {
  amount: number; // signed: negative for storno
  currency: string;
  resourceId: string;
  route?: string | undefined;
  itemName?: string | undefined;
  planName?: string | undefined;
  items?: SourceItem[] | undefined;
  payerCountry?: string | undefined;
  payerIsBusiness?: boolean | undefined;
  payerCompany?: string | undefined;
  payerVatId?: string | undefined;
  originalLines?: LineItem[] | undefined;
  originalTotal?: number | undefined;
}

// Swappable mapper interface — AI implementation lives in mapper.ai.server.ts.
export type InvoiceMapper = (
  event: { event_type: string },
  details: PaymentDetails,
  settings: MerchantSettings,
) => Promise<MappedInvoice> | MappedInvoice;

const cents = (n: number) => Math.round(n * 100);

export const deterministicMapper: InvoiceMapper = (event, details, settings) => {
  const warnings: string[] = [];
  const rate = settings.in_vat_system ? settings.default_vat_rate : 0;
  const isStorno = details.amount < 0;
  const sign = isStorno ? -1 : 1;

  // Full storno that mirrors the original invoice exactly.
  if (isStorno && details.originalLines?.length && details.originalTotal != null && cents(details.originalTotal) === cents(Math.abs(details.amount))) {
    return {
      lineItems: details.originalLines.map((l) => ({ ...l, price: -Math.abs(l.price) })),
      explanation_en: `Full reversal of the original invoice (${Math.abs(details.amount).toFixed(2)} ${details.currency}).`,
      explanation_hr: `Potpuni storno izvornog računa (${Math.abs(details.amount).toFixed(2)} ${details.currency}).`,
      confidence: 0.9,
      warnings,
    };
  }

  // Use PayPal items when they add up exactly.
  if (!isStorno && details.items?.length) {
    const sum = details.items.reduce((s, i) => s + cents(i.unitPrice) * i.quantity, 0);
    if (sum === cents(details.amount)) {
      return {
        lineItems: details.items.map((i, idx) => ({
          name: i.name, description: i.description ?? "", lineItemId: i.sku ?? String(idx + 1),
          price: i.unitPrice, quantity: i.quantity, unit: "kom", taxRate: rate,
        })),
        explanation_en: `${details.items.length} item(s) from the PayPal order, VAT ${rate}%.`,
        explanation_hr: `${details.items.length} stavki iz PayPal narudžbe, PDV ${rate}%.`,
        confidence: 0.85,
        warnings,
      };
    }
    warnings.push("PayPal items did not add up to the paid amount; used a single line.");
  }

  const name = details.items?.[0]?.name || details.itemName || details.planName || details.originalLines?.[0]?.name || "PayPal payment";
  if (name === "PayPal payment") warnings.push("No item name from PayPal; used a generic name.");
  if (isStorno && details.originalLines?.length) warnings.push("Partial refund: one proportional storno line was used.");
  return {
    lineItems: [{
      name: isStorno ? `Storno: ${name}` : name, description: `PayPal ${details.resourceId}`, lineItemId: details.resourceId,
      price: Math.round(details.amount * 100) / 100, quantity: 1, unit: "kom", taxRate: rate,
    }],
    explanation_en: isStorno
      ? `Reversal of ${Math.abs(details.amount).toFixed(2)} ${details.currency} for "${name}" (${event.event_type}), VAT ${rate}%.`
      : `One line for "${name}", ${details.amount.toFixed(2)} ${details.currency} incl. VAT ${rate}% (${event.event_type}).`,
    explanation_hr: isStorno
      ? `Storno iznosa ${Math.abs(details.amount).toFixed(2)} ${details.currency} za "${name}", PDV ${rate}%.`
      : `Jedna stavka "${name}", ${details.amount.toFixed(2)} ${details.currency} s uključenim PDV-om ${rate}%.`,
    confidence: warnings.length ? 0.8 : 1 * sign * sign,
    warnings,
  };
};

/** Review gate: anything uncertain must be checked by a human before it reaches FIRA. */
const TAX_REGIME_WARNING = /cross[- ]?border|outside the EU|non[- ]?EU|\bB2B\b|reverse[- ]?charge|\bOSS\b|export/i;
/** Non-VAT merchants charge 0% anyway, so cross-border/B2B/OSS warnings are noise for them. */
export function filterTaxRegimeWarnings(warnings: string[], inVatSystem: boolean): string[] {
  return inVatSystem ? warnings : warnings.filter((w) => !TAX_REGIME_WARNING.test(w));
}

export function needsReview(m: Pick<MappedInvoice, "confidence" | "warnings">, validationErrors: string[]): boolean {
  return validationErrors.length > 0 || m.confidence < 0.7 || m.warnings.length > 0;
}
