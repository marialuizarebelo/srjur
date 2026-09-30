-- ============================================================================
-- SRJUR BASIC -- multi-escritorio (multi-tenant) num unico projeto Supabase
-- ============================================================================
-- Rode UMA VEZ, no SQL Editor do projeto do Basic (o da demo), de uma vez so.
-- Tudo roda numa transacao: se algo falhar, nada e aplicado.
--
-- O que faz:
--   1. Cria a tabela `tenants` (um escritorio = um tenant) e o tenant "Demo".
--   2. Coloca `tenant_id` em TODAS as tabelas de dados; o que ja existe vira
--      do tenant Demo.
--   3. Um trigger preenche `tenant_id` sozinho a cada insert, a partir de quem
--      esta logado -- o front nao precisa mandar nem consegue forjar.
--   4. Troca as policies "qualquer admin ve tudo" por "admin do MEU escritorio".
--   5. Corrige unicos que colidiriam entre escritorios (etapas, DJEN).
--   6. Cadastro novo nunca vira admin sozinho (vem como 'client', sem
--      escritorio, sem acesso a nada, ate alguem atribuir).
--   7. Funcoes para criar escritorio novo e atribuir usuario a ele.
--
-- DEPOIS DE RODAR (ordem importa):
--   a) Desligar cadastro publico: Authentication > Sign In / Providers >
--      "Allow new users to sign up" = OFF.
--   b) Redeployar as Edge Functions (create-team-user, create-client-user,
--      daily-tasks, send-push, send-reminders, google-*, asaas) -- elas
--      precisam saber de escritorio. Ate la, criar usuario pela tela falha.
--   c) Rodar 02_teste_isolamento.sql e conferir que passou.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Escritorios
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique,
  status     text not null default 'ativo' check (status in ('ativo', 'suspenso', 'cancelado')),
  plan       text not null default 'basic',
  created_at timestamptz not null default now()
);
alter table public.tenants enable row level security;

insert into public.tenants (name, slug) values ('Demo', 'demo')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. profiles.tenant_id (antes das funcoes, que dependem dela)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists tenant_id uuid references public.tenants(id) on delete restrict;
update public.profiles set tenant_id = (select id from public.tenants where slug = 'demo') where tenant_id is null;
create index if not exists idx_profiles_tenant on public.profiles(tenant_id);

-- ---------------------------------------------------------------------------
-- 3. Funcoes de apoio
-- ---------------------------------------------------------------------------
create or replace function public.my_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where user_id = auth.uid() limit 1;
$$;

create or replace function public.my_profile_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where user_id = auth.uid() limit 1;
$$;

-- Continua igual: admin = profile com role 'admin'. O escopo por escritorio
-- e aplicado nas policies (is_admin() AND tenant_id = my_tenant_id()).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;

-- Cliente do portal: o cliente cujo e-mail e o do usuario logado, DENTRO do
-- escritorio dele (antes procurava no banco inteiro).
create or replace function public.my_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select c.id
  from public.clients c
  where lower(c.email) = lower((select email from auth.users where id = auth.uid()))
    and c.tenant_id = public.my_tenant_id()
  limit 1;
$$;

-- Preenche tenant_id no insert. Usuario logado: SEMPRE o escritorio dele
-- (ignora o que vier do front). Edge Function / cron (sem usuario logado):
-- precisa mandar tenant_id explicito -- nunca cria linha orfa.
create or replace function public.set_tenant_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.tenant_id := public.my_tenant_id();
    if new.tenant_id is null then
      raise exception 'Usuario sem escritorio associado';
    end if;
  elsif new.tenant_id is null then
    raise exception 'tenant_id obrigatorio para operacoes sem usuario logado';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. tenant_id + trigger + policy em todas as tabelas de dados
-- ---------------------------------------------------------------------------
do $$
declare
  demo uuid := (select id from public.tenants where slug = 'demo');
  t text;
  pol record;
  tabelas text[] := array[
    'activity_log','asaas_subscriptions','audit_log','client_field_history','clients',
    'communications','deadline_stages','deadlines','documents','electronic_systems',
    'finance','finance_payments','google_calendar_connections','google_event_links',
    'intimacoes','intimations','leads','marketing_content','oab_config','office_settings',
    'pipeline_stages','portal_messages','process_stages','process_updates','processes',
    'push_subscriptions','tasks','terms_acceptances'
  ];
begin
  foreach t in array tabelas loop
    execute format('alter table public.%I add column if not exists tenant_id uuid references public.tenants(id) on delete cascade', t);
    execute format('update public.%I set tenant_id = %L where tenant_id is null', t, demo);
    execute format('alter table public.%I alter column tenant_id set not null', t);
    execute format('create index if not exists idx_%s_tenant on public.%I(tenant_id)', t, t);
    execute format('drop trigger if exists trg_set_tenant on public.%I', t);
    execute format('create trigger trg_set_tenant before insert on public.%I for each row execute function public.set_tenant_id()', t);
    execute format('alter table public.%I enable row level security', t);

    -- Remove as policies antigas de admin ("ve tudo"). Ficam so as que tratam
    -- do proprio cliente do portal / do proprio usuario.
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
        and policyname !~ '^(client_|insert_own|Users manage)'
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    if t <> 'push_subscriptions' then
      execute format($f$
        create policy admin_tenant_all on public.%I for all
        using (public.is_admin() and tenant_id = public.my_tenant_id())
        with check (public.is_admin() and tenant_id = public.my_tenant_id())
      $f$, t);
    end if;
  end loop;
end $$;

-- push_subscriptions: cada usuario cuida das suas (ja existia); tenant_id serve
-- para o envio de notificacao nao vazar entre escritorios.
drop policy if exists "Users manage own subscriptions" on public.push_subscriptions;
create policy "Users manage own subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- terms_acceptances: cada um le o seu; admin le os do escritorio (via admin_tenant_all).
drop policy if exists own_terms on public.terms_acceptances;
create policy own_terms on public.terms_acceptances for select using (user_id = auth.uid());

-- portal_messages: a policy do cliente consultava auth.users direto (sem
-- permissao); usa my_client_id(), que ja e por escritorio.
drop policy if exists client_read_own on public.portal_messages;
create policy client_read_own on public.portal_messages for select using (client_id = public.my_client_id());

-- Portal do cliente le nome/logo/cor do escritorio dele.
drop policy if exists client_read_own_office on public.office_settings;
create policy client_read_own_office on public.office_settings for select using (tenant_id = public.my_tenant_id());

-- profiles: admin ve/edita so a equipe do proprio escritorio; cada um le o seu.
drop policy if exists admin_all_profiles on public.profiles;
create policy admin_tenant_all_profiles on public.profiles for all
  using (public.is_admin() and tenant_id = public.my_tenant_id())
  with check (public.is_admin() and tenant_id = public.my_tenant_id());

-- tenants: cada usuario le so o proprio escritorio. Escrita: so service_role / SQL.
drop policy if exists tenants_read_own on public.tenants;
create policy tenants_read_own on public.tenants for select using (id = public.my_tenant_id());

-- ---------------------------------------------------------------------------
-- 5. Unicos que colidiriam entre escritorios
-- ---------------------------------------------------------------------------
-- DJEN: o mesmo comunicado pode chegar para dois escritorios (mesma parte
-- atendida por advogados diferentes). Unico passa a ser POR escritorio.
alter table public.intimacoes drop constraint if exists intimacoes_djen_id_key;
create unique index if not exists intimacoes_tenant_djen_uidx on public.intimacoes(tenant_id, djen_id);

-- Etapas de kanban: cada escritorio tem as suas.
alter table public.pipeline_stages drop constraint if exists pipeline_stages_value_key;
create unique index if not exists pipeline_stages_tenant_value_uidx on public.pipeline_stages(tenant_id, value);
alter table public.process_stages drop constraint if exists process_stages_type_value_key;
create unique index if not exists process_stages_tenant_type_value_uidx on public.process_stages(tenant_id, type, value);

-- ---------------------------------------------------------------------------
-- 6. Cadastro novo nunca vira admin sozinho
-- ---------------------------------------------------------------------------
-- Papel e escritorio so vem de app_metadata (que so o servidor consegue
-- gravar; o usuario nao mexe). Sem isso: 'client' sem escritorio = sem acesso.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role   text := coalesce(new.raw_app_meta_data->>'role', 'client');
  v_tenant uuid := nullif(new.raw_app_meta_data->>'tenant_id', '')::uuid;
begin
  if v_role not in ('admin', 'client') then v_role := 'client'; end if;
  insert into public.profiles (user_id, display_name, role, tenant_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email), v_role, v_tenant);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Push de pagamento so para o escritorio de quem recebeu
-- ---------------------------------------------------------------------------
-- (a Edge Function send-push precisa filtrar por body.tenant_id -- passo b)
create or replace function public.notify_payment_received()
returns trigger language plpgsql as $$
begin
  if NEW.paid = true and (OLD.paid = false or OLD.paid is null) and NEW.type = 'receita' then
    begin
      perform net.http_post(
        url := current_setting('app.supabase_url') || '/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key')
        ),
        body := jsonb_build_object(
          'event', 'payment_received',
          'tenant_id', NEW.tenant_id,
          'title', 'Pagamento recebido',
          'body', coalesce(NEW.description, 'Um pagamento foi marcado como recebido'),
          'url', '/financeiro'
        )
      );
    exception when others then
      raise warning 'notify_payment_received: %', sqlerrm;
    end;
  end if;
  return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Criar escritorio novo e atribuir usuario (so service_role / SQL Editor)
-- ---------------------------------------------------------------------------
-- Cria o escritorio, copia as etapas padrao do tenant Demo (modelo) e cria o
-- registro de configuracoes do escritorio. Devolve o id do novo tenant.
create or replace function public.provision_tenant(p_name text, p_slug text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_demo   uuid := (select id from public.tenants where slug = 'demo');
  t text;
  cols text;
begin
  insert into public.tenants (name, slug)
  values (p_name, coalesce(p_slug, regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')))
  returning id into v_tenant;

  -- Etapas padrao: copia do tenant Demo
  foreach t in array array['pipeline_stages', 'process_stages', 'deadline_stages'] loop
    select string_agg(quote_ident(column_name), ', ') into cols
    from information_schema.columns
    where table_schema = 'public' and table_name = t and column_name not in ('id', 'tenant_id');
    execute format('insert into public.%I (tenant_id, %s) select %L, %s from public.%I where tenant_id = %L',
                   t, cols, v_tenant, cols, t, v_demo);
  end loop;

  insert into public.office_settings (tenant_id, name) values (v_tenant, p_name);
  return v_tenant;
end;
$$;

-- Atribui um usuario JA CRIADO (Authentication > Users > Add user) a um escritorio.
create or replace function public.assign_user_to_tenant(p_email text, p_tenant uuid, p_role text default 'admin')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_role not in ('admin', 'client') then raise exception 'role invalido: %', p_role; end if;
  update public.profiles
     set tenant_id = p_tenant, role = p_role
   where user_id = (select id from auth.users where lower(email) = lower(p_email));
  if not found then raise exception 'usuario % nao encontrado', p_email; end if;
end;
$$;

revoke all on function public.provision_tenant(text, text) from public, anon, authenticated;
revoke all on function public.assign_user_to_tenant(text, uuid, text) from public, anon, authenticated;

commit;
