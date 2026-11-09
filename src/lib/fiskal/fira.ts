// FIRA Webshop/ERP API v1.5.1 payload rules — see AGENTS.md "FIRA API rules".
import type { MerchantSettings } from "./config";
import type { LineItem } from "./mapper";
import { lineCents } from "./validate";

export type DocKind = "invoice" | "storno" | "test";

export function invoiceTypeFor(kind: DocKind, demo: boolean): string {
  if (demo || kind === "test") return "PONUDA";
  return kind === "storno" ? "FISKALNI_STORNO_RAČUN" : "FISKALNI_RAČUN";
}

/** Internal percentage → FIRA decimal fraction (25 → 0.25). */
export const toFiraRate = (pct: number) => Math.round(pct) / 100;

/** UTC ISO → Europe/Zagreb local time without zone, e.g. 2026-11-10T09:15:00. */
export function zagrebLocal(iso: string): string {
  const d = new Date(iso);
  const parts: Record<string, string> = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}T${parts["hour"]}:${parts["minute"]}:${parts["second"]}`;
}

export interface Payer {
  name?: string | undefined; email?: string | undefined; country?: string | undefined;
  company?: string | undefined; vatNumber?: string | undefined; oib?: string | undefined;
  address1?: string | undefined; address2?: string | undefined; city?: string | undefined; zipCode?: string | undefined; phone?: string | undefined;
}

export function buildFiraPayload(args: {
  kind: DocKind;
  settings: MerchantSettings;
  webshopOrderId: number;
  orderNumber: string;
  eventType: string;
  createdAt?: string | undefined;
  currency: string;
  lineItems: (LineItem & { productCode?: string | undefined })[];
  payer?: Payer | undefined;
  shipping?: number | undefined;
  discount?: number | undefined;
  originalInvoiceNumber?: string | undefined;
}) {
  const inVat = args.settings.in_vat_system;
  let grossC = 0, netC = 0;
  const lines = args.lineItems.map((l) => {
    const rate = inVat ? l.taxRate : 0;
    const g = lineCents(l);
    const n = Math.round(g / (1 + rate / 100));
    grossC += g; netC += n;
    const line: Record<string, unknown> = {
      name: l.name, description: l.description ?? "", lineItemId: l.lineItemId ?? "",
      price: l.price, quantity: l.quantity, unit: l.unit || "kom", taxRate: toFiraRate(rate),
    };
    if (l.productCode) line["productCode"] = l.productCode;
    if (rate === 0 && !inVat) { line["productTaxCategory"] = "OSLOBODENO"; line["taxExemptionReason"] = "CLANAK_90"; }
    return line;
  });
  // Shipping/discount share the first line's VAT rate.
  const r0 = inVat ? (args.lineItems[0]?.taxRate ?? 0) : 0;
  const shipC = Math.round((args.shipping ?? 0) * 100);
  const discC = Math.round((args.discount ?? 0) * 100);
  const extraGross = shipC - discC;
  grossC += extraGross;
  netC += Math.round(extraGross / (1 + r0 / 100));
  const brutto = grossC / 100;
  const netto = netC / 100;
  const taxValue = inVat ? (grossC - netC) / 100 : 0;

  const b2b = !!(args.payer?.company || args.payer?.vatNumber);
  const payload: Record<string, unknown> = {
    webshopOrderId: args.webshopOrderId,
    webshopType: "CUSTOM",
    webshopEvent: "order_created",
    webshopOrderNumber: args.orderNumber,
    invoiceType: invoiceTypeFor(args.kind, args.settings.demo_mode),
    paymentGatewayCode: "paypal",
    paymentGatewayName: "PayPal",
    currency: args.currency,
    taxesIncluded: true,
    billingAddress: {
      name: args.payer?.name ?? "", company: args.payer?.company ?? "",
      address1: args.payer?.address1 ?? "", address2: args.payer?.address2 ?? "",
      city: args.payer?.city ?? "", zipCode: args.payer?.zipCode ?? "", country: args.payer?.country ?? "HR",
      email: args.payer?.email ?? "", phone: args.payer?.phone ?? "",
      oib: args.payer?.oib ?? "", vatNumber: args.payer?.vatNumber ?? "", b2bClient: b2b,
    },
    taxValue,
    brutto,
    netto,
    customerLocale: "HR",
    lineItems: lines,
    paymentType: "KARTICA",
    internalNote: `PayPal ${args.eventType}: ${args.orderNumber}`,
  };
  if (args.createdAt) payload["createdAt"] = zagrebLocal(args.createdAt);
  if (shipC) payload["totalShipping"] = shipC / 100;
  if (discC) payload["discounts"] = [{ name: "PayPal discount", amount: discC / 100 }];
  if (args.kind === "storno" && args.originalInvoiceNumber) payload["termsHR"] = `Storno računa br. ${args.originalInvoiceNumber}`;
  return payload;
}

/** Pulls fiscal fields out of a FIRA response (field names vary by endpoint). */
export function extractFiscal(body: unknown) {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const src = b["invoice"] ?? b["data"] ?? b;
  const pick = (...keys: string[]) => { for (const k of keys) if (src?.[k] != null && src[k] !== "") return String(src[k]); return null; };
  return {
    jir: pick("jir", "JIR"),
    zki: pick("zki", "ZKI"),
    invoiceNumber: pick("invoiceNumber", "number", "brojRacuna", "invoiceNo"),
    fiscalStatus: pick("fiscalizationStatus", "fiscalStatus", "status"),
  };
}
