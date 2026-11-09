import { ALLOWED_VAT_RATES, type MerchantSettings } from "./config";
import type { LineItem } from "./mapper";

const cents = (n: number) => Math.round(n * 100);

export function validateInvoice(
  lineItems: LineItem[],
  expected: { amount: number; currency: string },
  docCurrency: string,
  settings: MerchantSettings,
): string[] {
  const errors: string[] = [];
  if (!lineItems.length) errors.push("No line items.");
  const sum = lineItems.reduce((s, l) => s + cents(l.price) * l.quantity, 0);
  if (sum !== cents(expected.amount))
    errors.push(`Line items total ${(sum / 100).toFixed(2)} does not match PayPal amount ${expected.amount.toFixed(2)}.`);
  for (const l of lineItems) {
    if (!(ALLOWED_VAT_RATES as readonly number[]).includes(l.taxRate)) errors.push(`Invalid VAT rate ${l.taxRate}%.`);
    if (!settings.in_vat_system && l.taxRate !== 0) errors.push("Merchant is not in the VAT system; all rates must be 0%.");
  }
  if (docCurrency !== expected.currency) errors.push(`Currency ${docCurrency} does not match PayPal ${expected.currency}.`);
  return errors;
}
