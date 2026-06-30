-- Rastreia toda assinatura criada no Asaas, independente de já ter
-- conseguido lançar a primeira cobrança no Financeiro ou não. Isso permite
-- que a sincronização sempre saiba quais assinaturas existem.
CREATE TABLE IF NOT EXISTS public.asaas_subscriptions (
  id text PRIMARY KEY, -- id da assinatura no Asaas
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  category text,
  process_id uuid REFERENCES public.processes(id) ON DELETE SET NULL,
  responsible text,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.asaas_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_asaas_subscriptions" ON public.asaas_subscriptions FOR ALL USING (public.is_admin());
