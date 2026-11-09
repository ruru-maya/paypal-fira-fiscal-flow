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
