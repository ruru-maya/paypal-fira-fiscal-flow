import type { MerchantSettings } from "./config";

export interface LineItem {
  name: string;
  description: string;
  lineItemId: string;
  price: number; // gross, EUR
  quantity: number;
  unit: string;
  taxRate: number;
}

export interface MappedInvoice {
  lineItems: LineItem[];
  explanation_en: string;
  explanation_hr: string;
  confidence: number;
  warnings: string[];
}

export interface PaymentDetails {
  amount: number; // signed: negative for storno
  currency: string;
  resourceId: string;
  itemName?: string | undefined;
  planName?: string | undefined;
}

// Swappable mapper interface — Phase 2 replaces this with an AI-backed implementation.
export type InvoiceMapper = (
  event: { event_type: string },
  details: PaymentDetails,
  settings: MerchantSettings,
) => Promise<MappedInvoice> | MappedInvoice;

export const deterministicMapper: InvoiceMapper = (event, details, settings) => {
  const warnings: string[] = [];
  const rate = settings.in_vat_system ? settings.default_vat_rate : 0;
  const name = details.itemName || details.planName || "PayPal payment";
  if (!details.itemName && !details.planName) warnings.push("No item name from PayPal; used a generic name.");
  const isStorno = details.amount < 0;
  return {
    lineItems: [
      {
        name,
        description: `PayPal ${details.resourceId}`,
        lineItemId: details.resourceId,
        price: Math.round(details.amount * 100) / 100,
        quantity: 1,
        unit: "kom",
        taxRate: rate,
      },
    ],
    explanation_en: isStorno
      ? `Reversal of ${Math.abs(details.amount).toFixed(2)} ${details.currency} for "${name}" (${event.event_type}), VAT ${rate}%.`
      : `One line for "${name}", ${details.amount.toFixed(2)} ${details.currency} incl. VAT ${rate}% (${event.event_type}).`,
    explanation_hr: isStorno
      ? `Storno iznosa ${Math.abs(details.amount).toFixed(2)} ${details.currency} za "${name}", PDV ${rate}%.`
      : `Jedna stavka "${name}", ${details.amount.toFixed(2)} ${details.currency} s uključenim PDV-om ${rate}%.`,
    confidence: warnings.length ? 0.8 : 1,
    warnings,
  };
};
