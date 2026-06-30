-- Vínculo do cliente com o cadastro de cliente no Asaas
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS asaas_customer_id text;

-- Vínculo do lançamento financeiro com a cobrança no Asaas
ALTER TABLE public.finance ADD COLUMN IF NOT EXISTS asaas_charge_id text;
ALTER TABLE public.finance ADD COLUMN IF NOT EXISTS asaas_status text;
ALTER TABLE public.finance ADD COLUMN IF NOT EXISTS asaas_invoice_url text;
ALTER TABLE public.finance ADD COLUMN IF NOT EXISTS asaas_subscription_id text;

CREATE INDEX IF NOT EXISTS idx_finance_asaas_charge ON public.finance(asaas_charge_id);

-- Transferências entre contas próprias (ex: Asaas → Nubank) ficam visíveis
-- no extrato mas não contam como receita/despesa real. Usamos o campo
-- "origin" que já existe na tabela finance com um novo valor:
--   origin = 'transferencia_interna'
-- (sem precisar de migration adicional, é só um valor de texto novo)
