-- Kanban de execução (estilo Scrum) para tarefas: fase de trabalho independente
-- do status pendente/concluída/cancelada já existente.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS workflow_stage text DEFAULT 'a_fazer'
  CHECK (workflow_stage IN ('backlog', 'a_fazer', 'fazendo', 'aguardando', 'concluido'));

-- Tarefas já concluídas (status = 'concluida') entram automaticamente como 'concluido'
UPDATE public.tasks SET workflow_stage = 'concluido' WHERE status = 'concluida' AND workflow_stage IS DISTINCT FROM 'concluido';
