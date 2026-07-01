-- Preferências de visualização fixadas por usuário (ex: lista/kanban/execução por página)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS view_prefs jsonb DEFAULT '{}'::jsonb;
