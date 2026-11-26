-- ============================================================================
-- SRJUR -- as limitacoes de modulo (Configuracoes > Usuarios) passam a valer NO BANCO
-- ============================================================================
-- Rode UMA VEZ no SQL Editor do projeto (pode repetir). Transacao unica; se algo falhar, nada muda.
--
-- Antes: a limitacao so escondia o menu e bloqueava a pagina; quem era administradora lia qualquer
--        tabela direto pela API e podia ate mudar a propria permissao.
-- Agora: cada tabela so responde a quem tem pelo menos um dos modulos que usam aquele dado.
--   - Acesso total = allowed_modules vazio ou nulo (e o perfil de suporte, quando existe). NADA muda para essas pessoas.
--   - Perfis: so quem tem acesso total cria/remove usuarios e altera permissoes. Acesso limitado edita so as
--     preferencias do proprio perfil (nunca modulos, papel ou escritorio).
-- Funciona com ou sem escritorios (tenant) e com ou sem perfil de suporte.
-- ============================================================================

begin;

create or replace function public.is_unrestricted()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce((to_jsonb(p)->>'is_support')::boolean, false) or p.allowed_modules is null or cardinality(p.allowed_modules) = 0
                   from public.profiles p where p.user_id = auth.uid() limit 1), false);
$$;

create or replace function public.module_allowed_any(p_keys text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce((to_jsonb(p)->>'is_support')::boolean, false) or p.allowed_modules is null or cardinality(p.allowed_modules) = 0 or p.allowed_modules && p_keys
                   from public.profiles p where p.user_id = auth.uid() limit 1), false);
$$;

create or replace function public.module_allowed(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.module_allowed_any(array[p_key]);
$$;

-- ---------------------------------------------------------------------------
-- Tabela -> modulos que podem enxerga-la. Reescreve cada politica de administradora (is_admin()) acrescentando o modulo.
-- ---------------------------------------------------------------------------
do $$
declare
  r record; pol record; novo_using text; novo_check text; cmd_sql text;
  cadastros text[] := array['clientes','processos','tarefas','prazos','calendario','financeiro','portal-admin','comunicacoes','sistemas','parcerias','clientes-sistema'];
  processos text[] := array['processos','clientes','tarefas','prazos','calendario','financeiro','portal-admin','comunicacoes','sistemas'];
  financeiro text[] := array['financeiro','parcerias','clientes-sistema'];
begin
  for r in select * from (values
    ('finance',               financeiro),
    ('finance_payments',      financeiro),
    ('asaas_subscriptions',   array['financeiro']),
    ('electronic_systems',    array['autenticador']),
    ('marketing_content',     array['marketing']),
    ('communications',        array['comunicacoes']),
    ('portal_messages',       array['portal-admin']),
    ('leads',                 array['clientes','metricas']),
    ('client_field_history',  array['clientes']),
    ('oab_config',            array['sistemas']),
    ('intimacoes',            array['sistemas','processos']),
    ('intimations',           array['sistemas','processos']),
    ('clients',               cadastros),
    ('processes',             processos),
    ('process_updates',       processos),
    ('process_clients',       processos),
    ('tasks',                 array['tarefas','calendario','clientes','processos']),
    ('deadlines',             array['prazos','calendario','processos','clientes']),
    ('deadline_stages',       array['prazos','calendario','processos','clientes']),
    ('documents',             array['clientes','processos','portal-admin']),
    ('partners',              array['parcerias']),
    ('partner_clients',       array['parcerias']),
    ('partner_commissions',   array['parcerias']),
    ('partner_receipts',      array['parcerias']),
    ('partner_receivables',   array['parcerias']),
    ('metas',                 array['metricas']),
    ('meta_acoes',            array['metricas']),
    ('meta_notas',            array['metricas']),
    ('metricas_notas',        array['metricas']),
    ('saas_clients',          array['clientes-sistema']),
    ('saas_credentials',      array['clientes-sistema']),
    ('saas_history',          array['clientes-sistema']),
    ('saas_impl_phases',      array['clientes-sistema']),
    ('saas_recurring_checks', array['clientes-sistema']),
    ('saas_secret_access_log',array['clientes-sistema'])
  ) as t(tabela, modulos)
  loop
    if to_regclass('public.' || r.tabela) is null then continue; end if;

    -- finance_payments aberta a qualquer usuario logado (inclusive cliente do portal): vira politica de administradora
    if r.tabela = 'finance_payments' then
      for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'finance_payments'
                   and coalesce(qual, '') not ilike '%is_admin()%' and coalesce(with_check, '') not ilike '%is_admin()%'
                   and policyname ilike '%manage%' loop
        execute format('drop policy %I on public.finance_payments', pol.policyname);
        execute format($f$create policy admin_manage_finance_payments on public.finance_payments for all
          using (public.is_admin() and public.module_allowed_any(%L::text[])) with check (public.is_admin() and public.module_allowed_any(%L::text[]))$f$, r.modulos, r.modulos);
      end loop;
    end if;

    for pol in select policyname, cmd, qual, with_check from pg_policies
               where schemaname = 'public' and tablename = r.tabela
                 and (coalesce(qual, '') ilike '%is_admin()%' or coalesce(with_check, '') ilike '%is_admin()%')
                 and coalesce(qual, '') || coalesce(with_check, '') not like '%module_allowed_any%'
    loop
      novo_using := case when pol.qual is not null then format('(%s) and public.module_allowed_any(%L::text[])', pol.qual, r.modulos) end;
      novo_check := case when pol.with_check is not null then format('(%s) and public.module_allowed_any(%L::text[])', pol.with_check, r.modulos) end;
      cmd_sql := format('alter policy %I on public.%I', pol.policyname, r.tabela);
      if novo_using is not null then cmd_sql := cmd_sql || ' using (' || novo_using || ')'; end if;
      if novo_check is not null then cmd_sql := cmd_sql || ' with check (' || novo_check || ')'; end if;
      execute cmd_sql;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Perfis: so acesso total gerencia usuarios e permissoes
-- ---------------------------------------------------------------------------
do $$
declare adm_using text; adm_check text; pol record;
begin
  -- condicao atual das administradoras sobre perfis (inclui o escritorio, quando ha)
  select qual, coalesce(with_check, qual) into adm_using, adm_check
  from pg_policies where schemaname = 'public' and tablename = 'profiles'
    and (coalesce(qual, '') ilike '%is_admin()%') and cmd = 'ALL' order by policyname limit 1;
  if adm_using is null then
    select qual, coalesce(with_check, qual) into adm_using, adm_check
    from pg_policies where schemaname = 'public' and tablename = 'profiles' and coalesce(qual, '') ilike '%is_admin()%' limit 1;
  end if;
  if adm_using is null then raise exception 'politica de administradora em profiles nao encontrada: nada foi alterado'; end if;

  -- sai a politica "tudo" das administradoras e a "tudo" do proprio perfil (que deixava mudar a propria permissao)
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles'
             and policyname in ('admin_all_profiles', 'admin_tenant_all_profiles', 'profiles_own') loop
    execute format('drop policy %I on public.profiles', pol.policyname);
  end loop;
  drop policy if exists perm_admin_select on public.profiles;
  drop policy if exists perm_admin_insert on public.profiles;
  drop policy if exists perm_admin_update on public.profiles;
  drop policy if exists perm_admin_delete on public.profiles;
  drop policy if exists perm_own_select on public.profiles;
  drop policy if exists perm_own_update on public.profiles;

  execute format('create policy perm_admin_select on public.profiles for select using (%s)', adm_using);
  execute format('create policy perm_admin_insert on public.profiles for insert with check ((%s) and public.is_unrestricted())', adm_check);
  execute format('create policy perm_admin_update on public.profiles for update using ((%s) and public.is_unrestricted()) with check ((%s) and public.is_unrestricted())', adm_using, adm_check);
  execute format('create policy perm_admin_delete on public.profiles for delete using ((%s) and public.is_unrestricted())', adm_using);
  -- o proprio perfil: ler sempre; editar (a trava abaixo impede mexer em permissao/papel/escritorio)
  create policy perm_own_select on public.profiles for select using (user_id = auth.uid());
  create policy perm_own_update on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
end $$;

create or replace function public.guard_profile_privileges()
returns trigger language plpgsql set search_path = public as $$
declare k text;
begin
  if auth.uid() is null or public.is_unrestricted() then return new; end if;
  foreach k in array array['allowed_modules', 'role', 'tenant_id', 'user_id', 'is_support', 'restricted_to_responsible'] loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      raise exception 'Seu acesso e limitado: so quem tem acesso total altera permissoes, papel ou escritorio.';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_guard_privileges on public.profiles;
create trigger trg_guard_privileges before update on public.profiles
  for each row execute function public.guard_profile_privileges();

commit;
