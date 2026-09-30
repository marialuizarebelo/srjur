-- Fecha a policy de finance_payments, que estava liberada pra qualquer usuário
-- autenticado (inclusive cliente do portal) ler e alterar pagamentos de todo mundo.
--
-- Agora: só admin, e só nos pagamentos de lançamentos que ELE já enxerga em
-- `finance`. O subselect em finance passa pela RLS de finance, então qualquer
-- regra de escritório/parceria que já valha lá vale aqui automaticamente
-- (não precisa mexer em tenant_id nem em policy de parceria).
--
-- Só a tela admin de Financeiro usa essa tabela; o portal do cliente não lê.

DROP POLICY IF EXISTS "Authenticated manage finance_payments" ON public.finance_payments;

CREATE POLICY "admin_manage_finance_payments"
  ON public.finance_payments
  FOR ALL
  USING (
    public.is_admin()
    AND EXISTS (SELECT 1 FROM public.finance f WHERE f.id = finance_payments.finance_id)
  )
  WITH CHECK (
    public.is_admin()
    AND EXISTS (SELECT 1 FROM public.finance f WHERE f.id = finance_payments.finance_id)
  );
