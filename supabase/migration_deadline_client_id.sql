-- Permite vincular um prazo direto a um cliente (além do vínculo via
-- processo), útil quando ainda não existe processo formal cadastrado.
ALTER TABLE public.deadlines ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
