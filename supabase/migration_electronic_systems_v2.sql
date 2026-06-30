ALTER TABLE public.electronic_systems ADD COLUMN IF NOT EXISTS password text;
ALTER TABLE public.electronic_systems ADD COLUMN IF NOT EXISTS totp_secret text;
ALTER TABLE public.electronic_systems ADD COLUMN IF NOT EXISTS color text DEFAULT '#8B5CF6';
