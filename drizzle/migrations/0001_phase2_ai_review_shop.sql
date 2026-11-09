ALTER TABLE public.merchants ADD COLUMN paypal_product_id text, ADD COLUMN paypal_plan_id text;
ALTER TABLE public.paypal_events ADD COLUMN simulated boolean NOT NULL DEFAULT false;
ALTER TABLE public.fiscal_documents ADD COLUMN ai_mapped boolean NOT NULL DEFAULT false, ADD COLUMN skip_reason text, ADD COLUMN validation_errors jsonb NOT NULL DEFAULT '[]', ADD COLUMN source_context jsonb;
ALTER TABLE public.fiscal_documents DROP CONSTRAINT IF EXISTS fiscal_documents_status_check;
ALTER TABLE public.fiscal_documents ADD CONSTRAINT fiscal_documents_status_check CHECK (status IN ('sent','needs_review','failed','watching','ignored','rejected','skipped'));

CREATE TABLE public.ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  fiscal_document_id uuid REFERENCES public.fiscal_documents(id) ON DELETE CASCADE,
  model text NOT NULL,
  latency_ms int,
  confidence numeric,
  used_fallback boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_runs TO authenticated;
GRANT ALL ON public.ai_runs TO service_role;
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai runs" ON public.ai_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND m.user_id = auth.uid()));

CREATE TABLE public.simulation_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  paypal_event_id text,
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.simulation_nonces TO service_role;
ALTER TABLE public.simulation_nonces ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION supabase_realtime ADD TABLE public.paypal_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fiscal_documents;