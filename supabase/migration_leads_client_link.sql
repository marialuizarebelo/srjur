-- Vincula o lead ao cliente criado, sem precisar "esconder" o lead do
-- kanban mudando o status pra 'convertido'. Assim o card de venda fechada
-- continua visível na coluna "Contrato Assinado" pro histórico comercial.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
