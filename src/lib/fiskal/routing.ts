export type Route =
  | "one_time_payment"
  | "subscription_payment"
  | "paypal_invoice_paid"
  | "refund"
  | "chargeback"
  | "dispute_open"
  | "dispute_resolved"
  | "info"
  | "ignored";

export type Action = "INVOICE" | "STORNO" | "WATCH" | "NONE";

export const SUBSCRIBED_EVENTS = [
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.SALE.COMPLETED",
  "INVOICING.INVOICE.PAID",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.SALE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
  "CUSTOMER.DISPUTE.CREATED",
  "CUSTOMER.DISPUTE.UPDATED",
  "CUSTOMER.DISPUTE.RESOLVED",
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.DENIED",
] as const;

export const EVENT_GROUPS_PLAIN = [
  "One-time payments",
  "Subscription renewals",
  "Paid PayPal invoices",
  "Refunds",
  "Chargebacks & disputes",
  "Subscription status changes",
];

const TABLE: Record<string, { route: Route; action: Action }> = {
  "PAYMENT.CAPTURE.COMPLETED": { route: "one_time_payment", action: "INVOICE" },
  "PAYMENT.SALE.COMPLETED": { route: "subscription_payment", action: "INVOICE" },
  "INVOICING.INVOICE.PAID": { route: "paypal_invoice_paid", action: "INVOICE" },
  "PAYMENT.CAPTURE.REFUNDED": { route: "refund", action: "STORNO" },
  "PAYMENT.SALE.REFUNDED": { route: "refund", action: "STORNO" },
  "PAYMENT.CAPTURE.REVERSED": { route: "chargeback", action: "STORNO" },
  "CUSTOMER.DISPUTE.CREATED": { route: "dispute_open", action: "WATCH" },
  "CUSTOMER.DISPUTE.UPDATED": { route: "dispute_open", action: "WATCH" },
  "BILLING.SUBSCRIPTION.ACTIVATED": { route: "info", action: "NONE" },
  "BILLING.SUBSCRIPTION.CANCELLED": { route: "info", action: "NONE" },
  "PAYMENT.CAPTURE.PENDING": { route: "info", action: "NONE" },
  "PAYMENT.CAPTURE.DENIED": { route: "info", action: "NONE" },
};

// deno-lint-ignore no-explicit-any
export function routeEvent(event: { event_type: string; resource?: any }): { route: Route; action: Action } {
  if (event.event_type === "CUSTOMER.DISPUTE.RESOLVED") {
    const outcome = String(event.resource?.dispute_outcome?.outcome_code ?? "");
    return outcome === "RESOLVED_BUYER_FAVOUR"
      ? { route: "dispute_resolved", action: "STORNO" }
      : { route: "dispute_resolved", action: "NONE" };
  }
  return TABLE[event.event_type] ?? { route: "ignored", action: "NONE" };
}

export const ROUTE_LABEL: Record<Route, string> = {
  one_time_payment: "One-time payment",
  subscription_payment: "Subscription renewal",
  paypal_invoice_paid: "PayPal invoice paid",
  refund: "Refund",
  chargeback: "Chargeback",
  dispute_open: "Dispute opened",
  dispute_resolved: "Dispute resolved",
  info: "Status update",
  ignored: "Other event",
};
