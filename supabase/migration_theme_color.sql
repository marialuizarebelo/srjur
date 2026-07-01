-- Cor de destaque (tema) escolhida pelo usuário, substitui o rosa padrão em botões/links/sidebar
ALTER TABLE public.office_settings ADD COLUMN IF NOT EXISTS primary_color text;
