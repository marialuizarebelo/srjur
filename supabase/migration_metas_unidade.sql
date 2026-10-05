-- Cada meta financeira passa a declarar a que unidade se refere:
--   'empresa'   -> Advocacia + SaaS somados (como uma empresa só)
--   'advocacia' -> só o escritório
--   'saas'      -> só o sistema
-- As metas que já existiam eram calculadas só com a Advocacia, então ficam como 'advocacia'
-- (você pode editar qualquer uma para mudar a unidade).
alter table public.metas add column if not exists unidade text;
update public.metas set unidade = 'advocacia' where unidade is null and area = 'financeiro';
