-- Tipo do prazo (Petição Inicial, Contestação, Apelação etc.) — texto livre,
-- validado só na UI (lista fechada em src/lib/deadlineTypes.ts), sem CHECK
-- constraint no banco pra não travar em cima de dados antigos/futuros.
ALTER TABLE public.deadlines ADD COLUMN IF NOT EXISTS tipo text;
