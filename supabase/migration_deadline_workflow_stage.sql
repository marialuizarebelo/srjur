-- Mesmo kanban de execução (Backlog/A Fazer/Fazendo/Aguardando/Concluído) para prazos,
-- usado na visualização combinada de etapas dentro do Calendário.
ALTER TABLE public.deadlines ADD COLUMN IF NOT EXISTS workflow_stage text DEFAULT 'a_fazer'
  CHECK (workflow_stage IN ('backlog', 'a_fazer', 'fazendo', 'aguardando', 'concluido'));

UPDATE public.deadlines SET workflow_stage = 'concluido' WHERE status = 'cumprido' AND workflow_stage IS DISTINCT FROM 'concluido';
