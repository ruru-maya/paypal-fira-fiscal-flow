<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Pure fiscalization logic (routing, mapper, validation, FIRA payload, crypto) lives in `src/lib/fiskal/` with no I/O, so it is testable and the mapper can be swapped for AI.
- PayPal base URL is defined only in `src/lib/fiskal/config.ts` so sandbox/live switching is one change.
- PayPal/FIRA I/O and event processing live in `src/lib/fiskal/engine.server.ts`, imported dynamically from server handlers only; the webhook is `src/routes/api/public/paypal-webhook.ts` and authenticates callers via PayPal signature verification.
- Webhook URLs are built from env `APP_PUBLIC_URL` (fallback: request origin) so PayPal always calls a public, login-free origin.
- Credentials table has no client grants; browser sees only last-4 hints stored on `merchants`.
- Invoice mapping: AI mapper in `src/lib/fiskal/mapper.ai.server.ts` (structured tool output) with the deterministic mapper as fallback; code validation + `needsReview` gate always decide whether anything is sent.
- `sendDocument` re-validates line items and refuses to send invalid documents; there is no bypass path.
- In production `src/server.ts` short-circuits the PayPal webhook with `ctx.waitUntil` so PayPal gets 200 immediately; the route handler is the inline fallback. FIRA calls have an 8s timeout.
- Simulated PayPal events are accepted only for demo-mode merchants holding an unexpired one-time nonce in `simulation_nonces`.
- Public test-shop server functions work only for demo-mode merchants and expose only the public PayPal client id.

## FIRA API rules (Webshop/ERP API v1.5.1)
- Internal VAT is a percentage (25); the FIRA payload sends a decimal fraction (0.25). Convert only in `buildFiraPayload`.
- Non-VAT merchants: every 0% line carries `productTaxCategory: "OSLOBODENO"` + `taxExemptionReason: "CLANAK_90"`, and `taxValue` is 0.
- `brutto`/`netto`/`taxValue` are computed from per-line amounts rounded to cents, then summed; `taxesIncluded: true` (prices are gross).
- `webshopOrderId` is FIRA's int64 idempotency key: always the document's `fira_order_id` identity, identical on every retry, never `Date.now()` for real documents. A 400 "already created" means success. `webshopOrderNumber` holds the PayPal id.
- `createdAt` is Europe/Zagreb local time without zone or offset (`zagrebLocal`).
- `paymentType` is always `KARTICA` with `paymentGatewayCode: "paypal"` / `paymentGatewayName: "PayPal"`; never send `prepaidAmount`. Merchants get no payment-type choice.
- `billingAddress.b2bClient` is sent explicitly: true only with a company or VAT id.
- PayPal shipping → `totalShipping`, discounts → `discounts[]`, sku → line `productCode`; `lineItemId` is display only. Validation includes shipping and discounts.
- Storno: stand-alone document with negative amounts, own `webshopOrderId`, original invoice number in `termsHR`; demo mode still sends PONUDA. FIRA never e-mails stornos.
- Only `FIRA-Api-Key` is required; send `X-Webshop-Domain` only when the merchant set one.
- Connection test uses `GET /api/v1/webshop/erp/invoices` (200 ok, 403 data access off, 401 bad key, 402 unpaid) and never creates documents.
- POST errors: 400 → needs_review with FIRA's message; 401/402 → failed with a plain message; 409 → resend same request once; 500/timeout → look up by webshopOrderId before resending; 429 → honour Retry-After (≤5s) once.
- Store `jir`, `zki`, invoice number and fiscalization status from FIRA's response; NEUSPJEŠNO_FISKALIZIRANO still counts as sent (FIRA retries for 48 h).
- The connector never sends e-mail; FIRA e-mails buyers when the merchant enables it.
