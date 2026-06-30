-- Substitui o controle de sincronização por uma tabela de vínculos,
-- permitindo que o mesmo item (tarefa ou prazo) sincronize com VÁRIAS
-- agendas Google ao mesmo tempo (ex: escritório + pessoal).
CREATE TABLE IF NOT EXISTS public.google_event_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL CHECK (source_table IN ('tasks', 'deadlines')),
  source_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.google_calendar_connections(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  synced_at timestamptz DEFAULT now(),
  UNIQUE (source_table, source_id, connection_id)
);

ALTER TABLE public.google_event_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_google_links" ON public.google_event_links FOR ALL USING (public.is_admin());
