import type { MerchantSettings } from "./config";
import type { LineItem } from "./mapper";

export type DocKind = "invoice" | "storno" | "test";

export function invoiceTypeFor(kind: DocKind, demo: boolean): string {
  if (demo || kind === "test") return "PONUDA";
  return kind === "storno" ? "FISKALNI_STORNO_RAČUN" : "FISKALNI_RAČUN";
}

export interface Payer { name?: string; email?: string; country?: string }

export function buildFiraPayload(args: {
  kind: DocKind;
  settings: MerchantSettings;
  orderNumber: string;
  eventType: string;
  createdAt: string;
  currency: string;
  lineItems: LineItem[];
  payer?: Payer | undefined;
}) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const brutto = r2(args.lineItems.reduce((s, l) => s + l.price * l.quantity, 0));
  const netto = r2(args.lineItems.reduce((s, l) => s + (l.price * l.quantity) / (1 + l.taxRate / 100), 0));
  const due = new Date(new Date(args.createdAt).getTime() + 14 * 86400000).toISOString().slice(0, 10);
  return {
    webshopOrderId: Date.now(),
    webshopType: "CUSTOM",
    webshopEvent: "order_created",
    webshopOrderNumber: args.orderNumber,
    invoiceType: invoiceTypeFor(args.kind, args.settings.demo_mode),
    paymentGatewayCode: "paypal",
    paymentGatewayName: "PayPal",
    createdAt: args.createdAt,
    dueDate: due,
    validTo: "",
    currency: args.currency,
    taxesIncluded: true,
    billingAddress: {
      name: args.payer?.name ?? "", address1: "", address2: "", city: "",
      country: args.payer?.country ?? "HR", phone: "", zipCode: "",
      email: args.payer?.email ?? "", vatNumber: "", oib: "", company: "",
    },
    taxValue: r2(brutto - netto),
    brutto,
    netto,
    customerLocale: "HR",
    lineItems: args.lineItems,
    paymentType: args.settings.fira_payment_type,
    internalNote: `PayPal ${args.eventType}: ${args.orderNumber}`,
  };
}
