-- Etapas do kanban de Processos, agora editáveis (renomear/recolorir/criar/excluir),
-- em vez de fixas no código. Uma linha por etapa, separadas por tipo de processo
-- (judicial cobre consultivo/contencioso; extrajudicial tem seu próprio fluxo).
CREATE TABLE IF NOT EXISTS public.process_stages (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('judicial', 'extrajudicial')),
  value text not null,
  name text not null,
  color text not null default '#8B5CF6',
  position int not null default 0,
  created_at timestamptz default now(),
  unique (type, value)
);

ALTER TABLE public.process_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_all_process_stages" ON public.process_stages;
CREATE POLICY "admin_all_process_stages" ON public.process_stages FOR ALL USING (public.is_admin());

-- Semente com as etapas que já existiam fixas no código, pra não perder nada
-- do que já estava cadastrado nos processos existentes.
INSERT INTO public.process_stages (type, value, name, color, position) VALUES
  ('judicial', 'inicial', 'Inicial', '#8B5CF6', 0),
  ('judicial', 'citacao', 'Citação', '#3B82F6', 1),
  ('judicial', 'instrucao', 'Instrução', '#F59E0B', 2),
  ('judicial', 'audiencia', 'Audiência', '#EC4899', 3),
  ('judicial', 'recurso', 'Recurso', '#F97316', 4),
  ('judicial', 'execucao', 'Execução', '#14B8A6', 5),
  ('judicial', 'encerrado', 'Encerrado', '#6B7280', 6),
  ('extrajudicial', 'notificacao', 'Notificação enviada', '#8B5CF6', 0),
  ('extrajudicial', 'aguardando_resposta', 'Aguardando resposta', '#3B82F6', 1),
  ('extrajudicial', 'negociacao', 'Negociação', '#F59E0B', 2),
  ('extrajudicial', 'acordo', 'Acordo fechado', '#14B8A6', 3),
  ('extrajudicial', 'sem_acordo', 'Sem acordo / vai a juízo', '#F97316', 4),
  ('extrajudicial', 'encerrado', 'Encerrado', '#6B7280', 5)
ON CONFLICT (type, value) DO NOTHING;
