/* Pure helpers for PayPal payer data. No I/O. */

const LEGAL_SUFFIX = /d\.o\.o\.|GmbH|Ltd|S\.r\.l|SAS|B\.V\./i;

/**
 * Business name of the buyer: PayPal's business_name when present, otherwise the shipping
 * name when it carries a legal-entity suffix (e.g. "Foo d.o.o."). Never throws on missing data.
 */
export function detectCompany(
  payer: { business_name?: string | null } | null | undefined,
  purchaseUnit:
    { shipping?: { name?: { full_name?: string | null } | null } | null } | null | undefined,
): string | undefined {
  if (payer?.business_name) return payer.business_name;
  const shippingName = purchaseUnit?.shipping?.name?.full_name;
  return typeof shippingName === "string" && LEGAL_SUFFIX.test(shippingName)
    ? shippingName
    : undefined;
}
