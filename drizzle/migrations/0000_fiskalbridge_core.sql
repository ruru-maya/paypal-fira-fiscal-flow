CREATE TABLE public.merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  business_name text NOT NULL DEFAULT '',
  oib text,
  in_vat_system boolean NOT NULL DEFAULT false,
  default_vat_rate int NOT NULL DEFAULT 0 CHECK (default_vat_rate IN (0,5,13,25)),
  fira_payment_type text NOT NULL DEFAULT 'KARTICA' CHECK (fira_payment_type IN ('KARTICA','TRANSAKCIJSKI','GOTOVINA')),
  demo_mode boolean NOT NULL DEFAULT true,
  paypal_connected_at timestamptz,
  fira_connected_at timestamptz,
  paypal_webhook_id text,
  paypal_webhook_url text,
  paypal_client_id_last4 text,
  fira_domain text,
  fira_key_last4 text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.merchants TO authenticated;
GRANT ALL ON public.merchants TO service_role;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own merchant select" ON public.merchants FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own merchant insert" ON public.merchants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own merchant update" ON public.merchants FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.merchant_credentials (
  merchant_id uuid PRIMARY KEY REFERENCES public.merchants(id) ON DELETE CASCADE,
  paypal_client_id text,
  paypal_secret text,
  fira_domain text,
  fira_api_key text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.merchant_credentials TO service_role;
ALTER TABLE public.merchant_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.paypal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  paypal_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  route text,
  resource_id text,
  amount numeric(12,2),
  currency text,
  raw jsonb,
  verified boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.paypal_events (merchant_id, received_at DESC);
GRANT SELECT ON public.paypal_events TO authenticated;
GRANT ALL ON public.paypal_events TO service_role;
ALTER TABLE public.paypal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events" ON public.paypal_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND m.user_id = auth.uid()));

CREATE TABLE public.fiscal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  paypal_event_id uuid REFERENCES public.paypal_events(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('invoice','storno','none','test')),
  invoice_type text,
  resource_id text,
  amount numeric(12,2),
  currency text,
  line_items jsonb NOT NULL DEFAULT '[]',
  explanation_en text,
  explanation_hr text,
  confidence numeric,
  warnings jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL CHECK (status IN ('sent','needs_review','failed','watching','ignored','rejected')),
  fira_request jsonb,
  fira_response jsonb,
  original_document_id uuid REFERENCES public.fiscal_documents(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.fiscal_documents (merchant_id, created_at DESC);
CREATE INDEX ON public.fiscal_documents (merchant_id, resource_id);
GRANT SELECT ON public.fiscal_documents TO authenticated;
GRANT ALL ON public.fiscal_documents TO service_role;
ALTER TABLE public.fiscal_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own docs" ON public.fiscal_documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND m.user_id = auth.uid()));