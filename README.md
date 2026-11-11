# FiskalBridge — PayPal → FIRA fiscalization connector

Every PayPal payment becomes an invoice in [FIRA](https://app.fira.finance); every refund, chargeback or lost dispute becomes a storno. Set-and-forget for Croatian online merchants. Built for the PayPal AI Hackathon.

- Live app: https://paypal-fira-fiscal-flow.lovable.app
- Live demo view: https://paypal-fira-fiscal-flow.lovable.app/live/b196fa6b-532d-4566-b738-58657364eddb
- Test shop: https://paypal-fira-fiscal-flow.lovable.app/shop/b196fa6b-532d-4566-b738-58657364eddb

## Try it in 2 minutes (for judges)

1. Open the [live demo view](https://paypal-fira-fiscal-flow.lovable.app/live/b196fa6b-532d-4566-b738-58657364eddb) (read-only dashboard).
2. Open the [test shop](https://paypal-fira-fiscal-flow.lovable.app/shop/b196fa6b-532d-4566-b738-58657364eddb) in another tab, add a product and pay with the PayPal **sandbox** buyer account from the Devpost testing instructions — or choose "Debit or Credit Card" and use a PayPal sandbox test card.
3. Within a few seconds the payment appears in the live view with the AI-prepared document, its explanation and the FIRA document number.

No sign-up needed. Everything runs in the PayPal sandbox and in Testing mode: no real money moves, and FIRA creates offers (PONUDA), not fiscal invoices. Signing up as a merchant yourself needs your own FIRA account (a paid Croatian invoicing service), which is why the live view exists.

## Why

Croatian law requires every sale paid by card-type methods (PayPal included) to be **fiscalized** — reported to the Tax Administration (Porezna uprava) with a JIR/ZKI code. Small webshops that sell via PayPal buttons, PayPal invoices or subscriptions usually do this by hand, copying each payment into their invoicing app, and forget refunds. FIRA fiscalizes invoices; FiskalBridge connects PayPal to it automatically. The connector **never touches the money** — it only listens to PayPal webhooks and creates documents in FIRA.

## Architecture

```text
 PayPal (sandbox)                         FiskalBridge (TanStack Start on Cloudflare Workers)
 ───────────────                         ──────────────────────────────────────────────────
  payment / refund /    webhook    ┌─────────────────────────────────────────────┐
  dispute event  ───────────────▶  │ /api/public/paypal-webhook                  │
                                   │  1. verify PayPal signature                 │
                                   │  2. de-duplicate on PayPal event id         │──▶ 200 immediately
                                   │     (rest runs in background, waitUntil)    │
                                   │  3. deterministic routing table             │
                                   │  4. enrich: order items / plan / original   │◀── PayPal REST API
                                   │  5. AI mapper (Gemini, structured output)   │◀── Lovable AI gateway
                                   │     └─ fallback: deterministic mapper       │
                                   │  6. code validation (cents, VAT rates)      │
                                   │  7. confidence ≥ 0.7 & no warnings?         │
                                   └──────────┬──────────────────────┬───────────┘
                                         yes  │                  no  │
                                              ▼                      ▼
                                   FIRA /webshop/order/custom   Review queue (merchant
                                   (PONUDA in Testing mode,        edits, re-validated,
                                    fiscal invoice when live)   approve or skip)
                                              │
                                              ▼
                              Postgres (RLS) ── realtime ──▶ Dashboard / live view
```

## Event table

| PayPal event | What we do |
| --- | --- |
| `PAYMENT.CAPTURE.COMPLETED` | Invoice (one-time payment) |
| `PAYMENT.SALE.COMPLETED` | Invoice (subscription renewal) |
| `INVOICING.INVOICE.PAID` | Invoice |
| `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.SALE.REFUNDED` | Storno (full or partial) |
| `PAYMENT.CAPTURE.REVERSED` | Storno (chargeback) |
| `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED` | Watch, no document |
| `CUSTOMER.DISPUTE.RESOLVED` | Storno if resolved in buyer's favour, otherwise no action |
| `BILLING.SUBSCRIPTION.ACTIVATED/CANCELLED`, `PAYMENT.CAPTURE.PENDING/DENIED` | Logged, no document |
| anything else | Logged and ignored |

## Where the AI is — and where it isn't

- **Rules route.** Which document (invoice / storno / none) is decided by a fixed table in `src/lib/fiskal/routing.ts`. No AI.
- **AI maps.** Gemini turns messy PayPal item data into clean invoice lines, picks VAT rates (25 / 13 / 5, or 0 for non-VAT merchants), matches partial refunds to original lines, flags cross-border/B2B cases, and writes EN + HR explanations. Structured tool output only — free text is never parsed.
- **Code validates.** Totals must match PayPal to the cent (incl. shipping and discounts), VAT rates must be in {0, 5, 13, 25}, non-VAT merchants must be 0%. Invalid documents are never sent — there is no bypass.
- **Humans review.** Low confidence (< 0.7) or any warning puts the document in the review queue. The merchant edits, the code re-validates, then they approve or skip with a reason.

## Testing mode and Live mode

- **Testing mode (default):** every document is sent to FIRA as an offer (**PONUDA**), which is not fiscalized; stornos are sent as offers with negative amounts.
- **Live mode:** documents are sent as `FISKALNI_RAČUN` / `FISKALNI_STORNO_RAČUN`, which FIRA fiscalizes with the Tax Administration (JIR + QR code).
- The public live view exists only in Testing mode.
- The sandbox tools (test shop, sandbox refunds, dispute simulator) follow the PayPal sandbox environment. In Live mode the test shop works only for the signed-in merchant.

## Run it yourself

1. Fork this repository and import it into [Lovable](https://lovable.dev) (or run it locally with `bun install && bun run dev` against your own Supabase project).
2. Enable Lovable Cloud (or connect Supabase) and apply the SQL migrations in `drizzle/migrations/`.
3. Add secrets:
   - `CREDENTIALS_ENCRYPTION_KEY` — 32 random bytes, base64 (e.g. `openssl rand -base64 32`). Encrypts stored PayPal secrets and FIRA keys.
   - `APP_PUBLIC_URL` — your published origin, e.g. `https://your-app.lovable.app`. Webhook URLs are built from it so PayPal can reach them without login.
   - AI: uses the Lovable AI gateway (`LOVABLE_API_KEY`, provided by Lovable Cloud).
4. Create a **PayPal sandbox REST app** at developer.paypal.com and copy its Client ID and Secret. The app creates the webhook for you.
5. In **FIRA** (Basic or Pro plan): Postavke → Webshop / ERP → add a **Custom** integration, copy the API key, enable "Dozvoli dohvat podataka".
6. Sign up in the app, complete the three onboarding steps, then open your test shop from the dashboard.

## Environment variables

- Public values in `.env` (see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (and their server twins). Publishable by design, protected by row-level security; replace with your own project's values.
- Server secrets, never committed: `CREDENTIALS_ENCRYPTION_KEY`, `APP_PUBLIC_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`.

Run the tests: `bun run test`

## Tech stack

TanStack Start (React 19, Vite 7) on Cloudflare Workers · Tailwind CSS v4 + shadcn/ui · Postgres with row-level security and realtime (Lovable Cloud / Supabase) · PayPal REST APIs (Orders, Subscriptions, Webhooks, Refunds) and JS SDK · FIRA Webshop/ERP API v1.5.1 · Gemini via the Lovable AI gateway · Vitest.

## Security notes

- PayPal secret and FIRA key are AES-GCM encrypted in a table with no browser access; the UI only shows the last 4 characters.
- Every table has row-level security; merchants only read their own rows. Browser users can update only their business settings columns.
- Webhooks are accepted only with a valid PayPal signature. Simulator events (which can't be signed) are accepted only in the PayPal sandbox, for a merchant holding a one-time nonce valid for 5 minutes.
- Public pages: the live view is Testing-mode only and opt-in, has no raw payloads, and masks names and e-mails. The test shop exposes only the public PayPal client id and is owner-only in Live mode.
- PayPal sandbox only; the base URL lives in one constant (`src/lib/fiskal/config.ts`).

## AI tools used

- **In the product:** Google Gemini (`google/gemini-3.8-flash`) via the Lovable AI gateway, for invoice line mapping and explanations.
- **For building:** the Lovable agent and Anthropic Claude.

## License

Copyright (C) 2026 Rusalka Majer, 3LB savjetovanje i usluge

Licensed under the GNU Affero General Public License v3.0 — see [LICENSE](./LICENSE).

## Trademarks

PayPal is a trademark of PayPal, Inc. FIRA is a trademark of its respective owner. This project is not affiliated with, endorsed by, or sponsored by PayPal or FIRA.
