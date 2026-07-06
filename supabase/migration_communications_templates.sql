-- A tela de Comunicações (templates) foi construída assumindo colunas que nunca
-- existiram na tabela public.communications de produção — por isso "Salvar"
-- não salvava nada (o insert/update falhava silenciosamente por coluna inexistente).
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS channel text DEFAULT 'whatsapp';
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS variables text[] DEFAULT '{}';
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS tag_ids text[] DEFAULT '{}';

-- "title" era NOT NULL no schema antigo mas não é mais usado pelo código atual
-- (virou "name") — relaxa a constraint pra não bloquear os inserts novos.
ALTER TABLE public.communications ALTER COLUMN title DROP NOT NULL;
