-- Histórico de movimentações + comentários, reutilizável em qualquer tela
-- (prazos, tarefas, clientes, processos, marketing). "entity_type" identifica
-- a tabela de origem, "entity_id" o registro. "kind" separa o que o sistema
-- registrou automaticamente (mudança de status/etapa) do que a usuária
-- escreveu manualmente.
CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  kind text not null default 'comment' check (kind in ('comment', 'activity')),
  text text not null,
  user_id uuid references auth.users(id) on delete set null,
  author text,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS activity_log_entity_idx ON public.activity_log (entity_type, entity_id, created_at desc);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_activity_log" ON public.activity_log;
CREATE POLICY "admin_all_activity_log" ON public.activity_log FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
