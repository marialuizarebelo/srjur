-- Pagamentos parciais vinculados a um lançamento do financeiro
CREATE TABLE IF NOT EXISTS public.finance_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  finance_id uuid NOT NULL REFERENCES public.finance(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_date date NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.finance_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated manage finance_payments"
  ON public.finance_payments
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_finance_payments_finance_id ON public.finance_payments(finance_id);
