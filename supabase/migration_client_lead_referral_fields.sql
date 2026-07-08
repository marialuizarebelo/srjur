-- O formulário de Cliente/Lead usa esses campos há tempo, mas nunca tinham
-- sido migrados pro banco de fato (bug de schema drift) — por isso salvar
-- um cliente/lead falhava silenciosamente (coluna inexistente).
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS referral_fee_pct numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS referral_fee_pct numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS referred_by text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_contact_at date;
