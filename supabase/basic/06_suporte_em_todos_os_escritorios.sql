-- ============================================================================
-- SRJUR BASIC -- UM login de suporte (app@srjur.com) que vale em TODOS os escritorios
-- ============================================================================
-- Rode UMA VEZ no SQL Editor, depois do 04_suporte_protegido.sql (pode repetir).
-- Roda numa transacao: se algo falhar, nada e aplicado.
--
-- Como funciona:
--   - O login de suporte e UM so (profiles.is_support = true), com a "casa" no
--     escritorio Demo. Ele NAO precisa de um usuario em cada escritorio.
--   - Quando o sistema e aberto no link de um escritorio
--     (<slug>.srjur.com), o front manda o cabecalho x-tenant-slug SO se quem
--     esta logado e suporte. O banco usa esse cabecalho para colocar o suporte
--     naquele escritorio: tudo que ele ve e grava e daquele escritorio.
--   - Para QUALQUER outra pessoa o cabecalho e ignorado (a administradora de um
--     escritorio nunca consegue "entrar" em outro mandando o cabecalho).
--   - Escritorio que nao existe no link = suporte sem acesso a nada.
--   - Nenhuma politica de seguranca das tabelas muda: so a funcao
--     my_tenant_id(), que todas ja usam, passa a conhecer o suporte.
--   - O perfil do suporte fica fora dos escritorios de clientes, entao nenhuma
--     administradora consegue editar ou remover ele (alem da trava do 04).
--
-- DEPOIS DE RODAR:
--   1) Marque o login como suporte (ele ja precisa existir em Authentication):
--        select public.make_support_login('app@srjur.com');
--   2) Rode o 05_teste_suporte.sql: toda linha deve vir ok = true.
--   3) Redeploy das Edge Functions create-team-user, create-client-user,
--      google-calendar e google-drive (elas tambem precisam saber do suporte).
-- ============================================================================

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_support') then
    raise exception 'Rode primeiro o 04_suporte_protegido.sql neste projeto (coluna profiles.is_support nao existe).';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. my_tenant_id(): o escritorio de quem esta logado. Para o suporte, o
--    escritorio do link (cabecalho x-tenant-slug); para os demais, o proprio.
-- ---------------------------------------------------------------------------
create or replace function public.my_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select case
           when p.is_support and h.slug is not null
             then (select t.id from public.tenants t where t.slug = h.slug)  -- slug inexistente = null = sem acesso
           else p.tenant_id
         end
  from public.profiles p
  cross join lateral (
    select nullif(lower(nullif(current_setting('request.headers', true), '')::json ->> 'x-tenant-slug'), '') as slug
  ) h
  where p.user_id = auth.uid()
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 2. Marca um login existente como O suporte (so do SRJUR, nunca de cliente).
-- ---------------------------------------------------------------------------
drop function if exists public.add_support_to_tenant(text, uuid);

create or replace function public.make_support_login(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid;
  v_demo  uuid := (select id from public.tenants where slug = 'demo');
  v_atual uuid;
begin
  if v_demo is null then
    raise exception 'Escritorio Demo nao encontrado (slug demo).';
  end if;

  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'Login % nao encontrado. Crie em Authentication > Users > Add user (Auto Confirm User) e rode de novo.', p_email;
  end if;

  select tenant_id into v_atual from public.profiles where user_id = v_user;
  if not found then
    raise exception 'Perfil do login % nao encontrado.', p_email;
  end if;
  -- Nunca promove a suporte (acesso a TODOS os escritorios) um login que ja
  -- pertence a um escritorio de cliente.
  if v_atual is not null and v_atual <> v_demo then
    raise exception 'O login % pertence a um escritorio de cliente e nao pode virar suporte. Nada foi alterado.', p_email;
  end if;

  perform public.assign_user_to_tenant(p_email, v_demo, 'admin');

  update public.profiles
     set is_support   = true,
         display_name = 'Suporte SRJUR',
         full_name    = 'Suporte SRJUR',
         nickname     = 'Suporte',
         role_title   = 'Suporte SRJUR'
   where user_id = v_user;
end;
$$;

revoke all on function public.make_support_login(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lista do suporte para a tela Configuracoes > Usuarios de cada escritorio
--    (so nome/cargo/foto; so para administradoras de um escritorio).
-- ---------------------------------------------------------------------------
create or replace function public.office_support_team()
returns table (display_name text, role_title text, photo_url text, color text)
language sql stable security definer set search_path = public as $$
  -- Uma linha por nome: se houver mais de um login de suporte (ex.: o da Malu e o
  -- app@srjur.com), a lista do escritorio mostra "Suporte SRJUR" uma vez so.
  select distinct on (p.display_name)
         p.display_name, p.role_title, p.photo_url, p.color
  from public.profiles p
  where p.is_support
    and public.is_admin()
    and public.my_tenant_id() is not null
  order by p.display_name, (p.photo_url is null), p.created_at;
$$;

revoke all on function public.office_support_team() from public, anon;
grant execute on function public.office_support_team() to authenticated;

commit;
