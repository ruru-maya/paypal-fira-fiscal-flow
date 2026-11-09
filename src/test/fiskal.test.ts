import { describe, expect, it } from "vitest";
import { routeEvent } from "@/lib/fiskal/routing";
import { deterministicMapper } from "@/lib/fiskal/mapper";
import { validateInvoice } from "@/lib/fiskal/validate";
import { invoiceTypeFor } from "@/lib/fiskal/fira";
import { decrypt, encrypt, mask } from "@/lib/fiskal/crypto";
import type { MerchantSettings } from "@/lib/fiskal/config";

const s: MerchantSettings = { business_name: "X", in_vat_system: false, default_vat_rate: 0, fira_payment_type: "KARTICA", demo_mode: true };

describe("routing", () => {
  it("capture completed -> invoice", () => expect(routeEvent({ event_type: "PAYMENT.CAPTURE.COMPLETED" })).toEqual({ route: "one_time_payment", action: "INVOICE" }));
  it("sale refunded -> storno", () => expect(routeEvent({ event_type: "PAYMENT.SALE.REFUNDED" }).action).toBe("STORNO"));
  it("reversed -> chargeback storno", () => expect(routeEvent({ event_type: "PAYMENT.CAPTURE.REVERSED" }).route).toBe("chargeback"));
  it("dispute created -> watch", () => expect(routeEvent({ event_type: "CUSTOMER.DISPUTE.CREATED" }).action).toBe("WATCH"));
  it("dispute resolved buyer favour -> storno", () =>
    expect(routeEvent({ event_type: "CUSTOMER.DISPUTE.RESOLVED", resource: { dispute_outcome: { outcome_code: "RESOLVED_BUYER_FAVOUR" } } }).action).toBe("STORNO"));
  it("dispute resolved seller favour -> none", () =>
    expect(routeEvent({ event_type: "CUSTOMER.DISPUTE.RESOLVED", resource: { dispute_outcome: { outcome_code: "RESOLVED_SELLER_FAVOUR" } } }).action).toBe("NONE"));
  it("unknown -> ignored", () => expect(routeEvent({ event_type: "FOO.BAR" }).route).toBe("ignored"));
});

describe("validation", () => {
  const m = deterministicMapper({ event_type: "PAYMENT.CAPTURE.COMPLETED" }, { amount: 10, currency: "EUR", resourceId: "C1" }, s) as ReturnType<typeof deterministicMapper> & { lineItems: never };
  it("passes when totals match", () => expect(validateInvoice((m as any).lineItems, { amount: 10, currency: "EUR" }, "EUR", s)).toEqual([]));
  it("fails on 1 cent mismatch", () => expect(validateInvoice((m as any).lineItems, { amount: 10.01, currency: "EUR" }, "EUR", s).length).toBe(1));
  it("non-VAT merchant cannot use 25%", () =>
    expect(validateInvoice([{ name: "a", description: "", lineItemId: "", price: 10, quantity: 1, unit: "kom", taxRate: 25 }], { amount: 10, currency: "EUR" }, "EUR", s).length).toBeGreaterThan(0));
  it("rejects 22% rate", () =>
    expect(validateInvoice([{ name: "a", description: "", lineItemId: "", price: 10, quantity: 1, unit: "kom", taxRate: 22 }], { amount: 10, currency: "EUR" }, "EUR", { ...s, in_vat_system: true }).length).toBe(1));
  it("rejects currency mismatch", () => expect(validateInvoice((m as any).lineItems, { amount: 10, currency: "USD" }, "EUR", s).length).toBe(1));
});

describe("FIRA invoice type", () => {
  it("demo always PONUDA", () => expect(invoiceTypeFor("storno", true)).toBe("PONUDA"));
  it("live invoice", () => expect(invoiceTypeFor("invoice", false)).toBe("FISKALNI_RAČUN"));
  it("live storno", () => expect(invoiceTypeFor("storno", false)).toBe("FISKALNI_STORNO_RAČUN"));
});

describe("crypto", () => {
  it("round-trips", async () => expect(await decrypt(await encrypt("secret-abc", "k"), "k")).toBe("secret-abc"));
  it("masks to last 4", () => expect(mask("abcdef1234")).toBe("••••1234"));
});

import { needsReview } from "@/lib/fiskal/mapper";
describe("review gate", () => {
  it("confidence below 0.7 needs review", () => expect(needsReview({ confidence: 0.69, warnings: [] }, [])).toBe(true));
  it("any warning needs review", () => expect(needsReview({ confidence: 0.95, warnings: ["x"] }, [])).toBe(true));
  it("validation error needs review", () => expect(needsReview({ confidence: 1, warnings: [] }, ["bad"])).toBe(true));
  it("clean + confident is sent", () => expect(needsReview({ confidence: 0.7, warnings: [] }, [])).toBe(false));
});

import { buildFiraPayload, toFiraRate, zagrebLocal } from "@/lib/fiskal/fira";
const vat: MerchantSettings = { ...s, in_vat_system: true, default_vat_rate: 25, demo_mode: false };
const L = (price: number, quantity: number, taxRate: number, extra: object = {}) => ({ name: "x", description: "", lineItemId: "1", price, quantity, unit: "kom", taxRate, ...extra });
const base = { webshopOrderId: 100001, orderNumber: "CAP-1", eventType: "PAYMENT.CAPTURE.COMPLETED", currency: "EUR" };

describe("FIRA payload (API v1.5.1)", () => {
  it("taxRate is a decimal fraction", () => {
    expect([25, 13, 5, 0].map(toFiraRate)).toEqual([0.25, 0.13, 0.05, 0]);
    const p: any = buildFiraPayload({ ...base, kind: "invoice", settings: vat, lineItems: [L(18, 2, 25), L(24, 1, 5)] });
    expect(p.lineItems.map((l: any) => l.taxRate)).toEqual([0.25, 0.05]);
  });
  it("non-VAT merchant: 0% lines carry OSLOBODENO + CLANAK_90 and taxValue 0", () => {
    const p: any = buildFiraPayload({ ...base, kind: "invoice", settings: s, lineItems: [L(10, 1, 0)] });
    expect(p.lineItems[0].productTaxCategory).toBe("OSLOBODENO");
    expect(p.lineItems[0].taxExemptionReason).toBe("CLANAK_90");
    expect(p.taxValue).toBe(0);
    expect(p.brutto).toBe(10);
  });
  it("brutto/netto/taxValue match per-line rounded sums", () => {
    const p: any = buildFiraPayload({ ...base, kind: "invoice", settings: vat, lineItems: [L(18, 2, 25), L(24, 1, 5)] });
    expect(p.brutto).toBe(60);
    expect(p.netto).toBe(28.8 + 22.86);
    expect(Math.round((p.brutto - p.netto) * 100) / 100).toBe(p.taxValue);
  });
  it("uses the stable webshopOrderId and puts the PayPal id in webshopOrderNumber", () => {
    const p: any = buildFiraPayload({ ...base, kind: "invoice", settings: vat, lineItems: [L(10, 1, 25)] });
    expect(p.webshopOrderId).toBe(100001);
    expect(p.webshopOrderNumber).toBe("CAP-1");
  });
  it("paymentType is always KARTICA with PayPal gateway, no prepaidAmount", () => {
    const p: any = buildFiraPayload({ ...base, kind: "invoice", settings: { ...vat, fira_payment_type: "GOTOVINA" }, lineItems: [L(10, 1, 25)] });
    expect(p.paymentType).toBe("KARTICA");
    expect(p.paymentGatewayCode).toBe("paypal");
    expect("prepaidAmount" in p).toBe(false);
  });
  it("b2bClient false for consumers, true with company/VAT id", () => {
    const c: any = buildFiraPayload({ ...base, kind: "invoice", settings: vat, lineItems: [L(10, 1, 25)], payer: { name: "Ana" } });
    const b: any = buildFiraPayload({ ...base, kind: "invoice", settings: vat, lineItems: [L(10, 1, 25)], payer: { company: "X d.o.o.", vatNumber: "HR123" } });
    expect(c.billingAddress.b2bClient).toBe(false);
    expect(b.billingAddress.b2bClient).toBe(true);
  });
  it("shipping → totalShipping, discount → discounts, sku → productCode", () => {
    const p: any = buildFiraPayload({ ...base, kind: "invoice", settings: vat, lineItems: [L(18, 1, 25, { productCode: "MUG-01" })], shipping: 5, discount: 2 });
    expect(p.totalShipping).toBe(5);
    expect(p.discounts[0].amount).toBe(2);
    expect(p.lineItems[0].productCode).toBe("MUG-01");
    expect(p.brutto).toBe(21);
  });
  it("validation counts shipping and discounts against the PayPal amount", () => {
    expect(validateInvoice([L(18, 1, 25)], { amount: 21, currency: "EUR" }, "EUR", vat, { shipping: 5, discount: 2 })).toEqual([]);
    expect(validateInvoice([L(18, 1, 25)], { amount: 18, currency: "EUR" }, "EUR", vat, { shipping: 5, discount: 2 }).length).toBe(1);
  });
  it("storno: negative amounts, original invoice number in termsHR; demo stays PONUDA", () => {
    const live: any = buildFiraPayload({ ...base, kind: "storno", settings: vat, lineItems: [L(-10, 1, 25)], originalInvoiceNumber: "12-1-1" });
    expect(live.invoiceType).toBe("FISKALNI_STORNO_RAČUN");
    expect(live.brutto).toBe(-10);
    expect(live.termsHR).toBe("Storno računa br. 12-1-1");
    const demo: any = buildFiraPayload({ ...base, kind: "storno", settings: { ...vat, demo_mode: true }, lineItems: [L(-10, 1, 25)] });
    expect(demo.invoiceType).toBe("PONUDA");
  });
  it("createdAt is Zagreb local time without zone, across DST", () => {
    expect(zagrebLocal("2026-07-01T10:00:00Z")).toBe("2026-07-01T12:00:00"); // CEST +2
    expect(zagrebLocal("2026-11-10T08:15:00Z")).toBe("2026-11-10T09:15:00"); // CET +1
    expect(zagrebLocal("2026-03-29T00:30:00Z")).toBe("2026-03-29T01:30:00"); // before switch
    expect(zagrebLocal("2026-03-29T01:30:00Z")).toBe("2026-03-29T03:30:00"); // after switch
    const p: any = buildFiraPayload({ ...base, kind: "invoice", settings: vat, lineItems: [L(10, 1, 25)], createdAt: "2026-11-10T08:15:00Z" });
    expect(p.createdAt).toBe("2026-11-10T09:15:00");
  });
});
