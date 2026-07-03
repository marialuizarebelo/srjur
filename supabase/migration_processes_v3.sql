-- Campos processuais essenciais que faltavam
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS opposing_party text;
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS opposing_cpf text;
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS opposing_parties jsonb;
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS filing_date date;
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS citation_date date;
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS instance text;
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS confidential boolean DEFAULT false;
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS closed_date date;
