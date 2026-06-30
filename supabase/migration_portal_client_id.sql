-- Adiciona client_id em portal_messages e documents para filtrar por cliente
ALTER TABLE public.portal_messages ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_portal_messages_client ON public.portal_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_client ON public.documents(client_id);
