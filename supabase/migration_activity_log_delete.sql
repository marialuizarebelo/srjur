-- Exclusão de comentário é "soft delete" — mantém a linha na timeline riscada
-- em vez de sumir, pra não quebrar o histórico.
ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
