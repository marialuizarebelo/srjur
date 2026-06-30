-- Guarda o ID da pasta (além do link) para chamadas de API confiáveis
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS drive_folder_id text;
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS drive_folder_id text;

-- Pasta raiz do escritório no Drive, onde as pastas de clientes/processos são criadas
ALTER TABLE public.office_settings ADD COLUMN IF NOT EXISTS drive_root_folder_id text;
ALTER TABLE public.office_settings ADD COLUMN IF NOT EXISTS drive_root_folder_name text;
