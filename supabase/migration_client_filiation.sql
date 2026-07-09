-- Campo de filiação (nome da mãe / nome do pai) no cadastro de clientes,
-- usado sobretudo em qualificação de processos criminais (SEEU).
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS mother_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS father_name text;
