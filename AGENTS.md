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
