ALTER TABLE public.fiscal_documents ADD COLUMN fira_order_id bigint GENERATED ALWAYS AS IDENTITY (START WITH 100000);
CREATE UNIQUE INDEX fiscal_documents_fira_order_id_key ON public.fiscal_documents (fira_order_id);
ALTER TABLE public.fiscal_documents
  ADD COLUMN jir text,
  ADD COLUMN zki text,
  ADD COLUMN fira_invoice_number text,
  ADD COLUMN fiscal_status text,
  ADD COLUMN fira_error text,
  ADD COLUMN shipping numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN discount numeric(12,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.merchants.fira_payment_type IS 'DEPRECATED: PayPal always uses KARTICA';