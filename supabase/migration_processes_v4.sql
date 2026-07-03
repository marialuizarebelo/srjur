-- Permite o tipo "extrajudicial" (constraint antiga só aceitava consultivo/contencioso)
ALTER TABLE public.processes DROP CONSTRAINT IF EXISTS processes_type_check;
ALTER TABLE public.processes ADD CONSTRAINT processes_type_check
  CHECK (type IN ('consultivo', 'contencioso', 'extrajudicial'));
