// Single switch point for PayPal environment. Change to "https://api-m.paypal.com" for live.
export const PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";
export const FIRA_API_URL = "https://app.fira.finance/api/v1/webshop/order/custom";

export const ALLOWED_VAT_RATES = [0, 5, 13, 25] as const;
export type VatRate = (typeof ALLOWED_VAT_RATES)[number];
export type FiraPaymentType = "KARTICA" | "TRANSAKCIJSKI" | "GOTOVINA";

export interface MerchantSettings {
  business_name: string;
  in_vat_system: boolean;
  default_vat_rate: VatRate;
  fira_payment_type: FiraPaymentType;
  demo_mode: boolean;
}
