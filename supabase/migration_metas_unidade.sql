-- Metas financeiras por unidade: 'empresa' (Advocacia + SaaS juntos), 'advocacia' ou 'saas'.
-- Metas antigas ficam com NULL e continuam sendo calculadas como Advocacia (o comportamento que já existia).
alter table public.metas add column if not exists unidade text;
