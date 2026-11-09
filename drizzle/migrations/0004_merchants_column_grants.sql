REVOKE INSERT, UPDATE ON public.merchants FROM authenticated;
GRANT INSERT (user_id, business_name, oib, in_vat_system, default_vat_rate, fira_payment_type, demo_mode) ON public.merchants TO authenticated;
GRANT UPDATE (business_name, oib, in_vat_system, default_vat_rate, fira_payment_type, demo_mode, share_live_view) ON public.merchants TO authenticated;
REVOKE ALL ON public.merchants FROM anon;
REVOKE ALL ON public.paypal_events, public.fiscal_documents, public.ai_runs, public.merchant_credentials, public.simulation_nonces FROM anon;