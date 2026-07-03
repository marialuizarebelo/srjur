-- Substitui o campo de responsável (texto livre "Maria Luiza"/"Juliana"/"Ambas")
-- por um vínculo real com usuários (profiles), permitindo selecionar uma
-- ou várias pessoas por tarefa/prazo.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS responsible_ids uuid[] DEFAULT '{}';
ALTER TABLE public.deadlines ADD COLUMN IF NOT EXISTS responsible_ids uuid[] DEFAULT '{}';
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS responsible_ids uuid[] DEFAULT '{}';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS responsible_ids uuid[] DEFAULT '{}';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS responsible_ids uuid[] DEFAULT '{}';

-- Backfill a partir do texto antigo (assume que profiles.display_name bate
-- exatamente com os valores usados até agora: "Maria Luiza", "Juliana")
UPDATE public.tasks t SET responsible_ids = COALESCE((
  SELECT array_agg(p.id) FROM public.profiles p
  WHERE p.role = 'admin' AND (
    t.responsible = 'Ambas' OR p.display_name = t.responsible
  )
), '{}') WHERE t.responsible IS NOT NULL AND (t.responsible_ids IS NULL OR t.responsible_ids = '{}');

UPDATE public.deadlines d SET responsible_ids = COALESCE((
  SELECT array_agg(p.id) FROM public.profiles p
  WHERE p.role = 'admin' AND (
    d.responsible = 'Ambas' OR p.display_name = d.responsible
  )
), '{}') WHERE d.responsible IS NOT NULL AND (d.responsible_ids IS NULL OR d.responsible_ids = '{}');

UPDATE public.processes pr SET responsible_ids = COALESCE((
  SELECT array_agg(p.id) FROM public.profiles p
  WHERE p.role = 'admin' AND (
    pr.responsible = 'Ambas' OR p.display_name = pr.responsible
  )
), '{}') WHERE pr.responsible IS NOT NULL AND (pr.responsible_ids IS NULL OR pr.responsible_ids = '{}');

UPDATE public.clients cl SET responsible_ids = COALESCE((
  SELECT array_agg(p.id) FROM public.profiles p
  WHERE p.role = 'admin' AND (
    cl.responsible = 'Ambas' OR p.display_name = cl.responsible
  )
), '{}') WHERE cl.responsible IS NOT NULL AND (cl.responsible_ids IS NULL OR cl.responsible_ids = '{}');

UPDATE public.leads le SET responsible_ids = COALESCE((
  SELECT array_agg(p.id) FROM public.profiles p
  WHERE p.role = 'admin' AND (
    le.responsible = 'Ambas' OR p.display_name = le.responsible
  )
), '{}') WHERE le.responsible IS NOT NULL AND (le.responsible_ids IS NULL OR le.responsible_ids = '{}');
