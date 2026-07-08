-- Permite que a admin principal cadastre outras usuárias direto pelo sistema
-- (sem precisar mexer no Supabase), limite quais módulos cada uma acessa, e
-- registre o aceite dos Termos de Uso no primeiro login de cada usuária.

-- null = acesso total (conta principal/dona); array = só os módulos listados
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_modules text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  terms_version text not null,
  accepted_at timestamptz default now(),
  user_agent text
);

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_or_admin_terms" ON public.terms_acceptances;
CREATE POLICY "own_or_admin_terms" ON public.terms_acceptances FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin()
);

DROP POLICY IF EXISTS "insert_own_terms" ON public.terms_acceptances;
CREATE POLICY "insert_own_terms" ON public.terms_acceptances FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
