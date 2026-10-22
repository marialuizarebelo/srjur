-- Módulo "Clientes do sistema" (SRJUR): operação dos clientes de SaaS — só no SRJUR principal.
--  * saas_clients: dados comerciais (plano, valor da implantação e da mensalidade, desde quando...).
--  * saas_credentials: acessos (links, contas, tokens). O SEGREDO nunca fica na tabela: vai para o Vault do
--    Supabase (criptografado) e só é lido por saas_reveal_secret, que exige admin e registra quem abriu.
--  * saas_history: linha do tempo.
--  * saas_recurring_checks: verificações recorrentes — viram tarefas no Calendário; ao concluir uma, a
--    próxima é criada (contando da data da conclusão).
--  * Chamados (bug/ajuste) e verificações são linhas da tabela tasks (business_unit 'saas'), então aparecem
--    no Calendário e em Tarefas como qualquer outra.

create table if not exists public.saas_clients (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  plan text,
  status text not null default 'ativo' check (status in ('implantacao', 'ativo', 'pausado', 'cancelado')),
  implementation_value numeric(12,2),
  monthly_value numeric(12,2),
  monthly_since date,
  billing_day integer check (billing_day between 1 and 31),
  started_at date,
  system_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saas_credentials (
  id uuid primary key default gen_random_uuid(),
  saas_client_id uuid not null references public.saas_clients(id) on delete cascade,
  label text not null,
  kind text not null default 'login' check (kind in ('login', 'token', 'api', 'link', 'conta', 'outro')),
  url text,
  username text,
  vault_secret_id uuid,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_revealed_at timestamptz,
  last_revealed_by uuid
);

create table if not exists public.saas_secret_access_log (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid,
  user_id uuid default auth.uid(),
  action text not null,
  at timestamptz not null default now()
);

create table if not exists public.saas_history (
  id uuid primary key default gen_random_uuid(),
  saas_client_id uuid not null references public.saas_clients(id) on delete cascade,
  kind text not null default 'nota' check (kind in ('nota', 'plano', 'reajuste', 'problema', 'ajuste', 'contato', 'outro')),
  body text not null,
  happened_at date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.saas_recurring_checks (
  id uuid primary key default gen_random_uuid(),
  saas_client_id uuid not null references public.saas_clients(id) on delete cascade,
  title text not null,
  description text,
  every_n integer not null check (every_n > 0),
  unit text not null default 'meses' check (unit in ('dias', 'semanas', 'meses')),
  next_due date not null,
  last_done date,
  active boolean not null default true,
  responsible_ids uuid[],
  created_at timestamptz not null default now()
);

alter table public.tasks add column if not exists saas_kind text check (saas_kind in ('bug', 'ajuste', 'duvida', 'verificacao', 'outro'));
alter table public.tasks add column if not exists recurring_check_id uuid references public.saas_recurring_checks(id) on delete set null;
create index if not exists tasks_recurring_check_idx on public.tasks (recurring_check_id) where recurring_check_id is not null;

-- RLS: só equipe (admin)
alter table public.saas_clients enable row level security;
alter table public.saas_credentials enable row level security;
alter table public.saas_secret_access_log enable row level security;
alter table public.saas_history enable row level security;
alter table public.saas_recurring_checks enable row level security;
drop policy if exists admin_all_saas_clients on public.saas_clients;
drop policy if exists admin_all_saas_credentials on public.saas_credentials;
drop policy if exists admin_read_saas_log on public.saas_secret_access_log;
drop policy if exists admin_all_saas_history on public.saas_history;
drop policy if exists admin_all_saas_checks on public.saas_recurring_checks;
create policy admin_all_saas_clients on public.saas_clients for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_saas_credentials on public.saas_credentials for all using (public.is_admin()) with check (public.is_admin());
create policy admin_read_saas_log on public.saas_secret_access_log for select using (public.is_admin());
create policy admin_all_saas_history on public.saas_history for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_saas_checks on public.saas_recurring_checks for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists saas_clients_touch on public.saas_clients;
create trigger saas_clients_touch before update on public.saas_clients for each row execute function public.partners_touch();
drop trigger if exists saas_credentials_touch on public.saas_credentials;
create trigger saas_credentials_touch before update on public.saas_credentials for each row execute function public.partners_touch();

-- ── Segredos (Vault) ──
create or replace function public.saas_set_secret(p_credential uuid, p_secret text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_sid uuid;
begin
  if not public.is_admin() then raise exception 'sem permissão'; end if;
  select vault_secret_id into v_sid from saas_credentials where id = p_credential;
  if not found then raise exception 'acesso não encontrado'; end if;
  if v_sid is null then
    v_sid := vault.create_secret(p_secret, 'saas-cred-' || p_credential::text, 'Acesso de cliente do sistema');
    update saas_credentials set vault_secret_id = v_sid where id = p_credential;
  else
    perform vault.update_secret(v_sid, p_secret);
  end if;
  insert into saas_secret_access_log (credential_id, action) values (p_credential, 'alterou');
end $$;

create or replace function public.saas_reveal_secret(p_credential uuid)
returns text language plpgsql security definer set search_path = public, vault as $$
declare v_sid uuid; v_secret text;
begin
  if not public.is_admin() then raise exception 'sem permissão'; end if;
  select vault_secret_id into v_sid from saas_credentials where id = p_credential;
  if v_sid is null then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_sid;
  update saas_credentials set last_revealed_at = now(), last_revealed_by = auth.uid() where id = p_credential;
  insert into saas_secret_access_log (credential_id, action) values (p_credential, 'revelou');
  return v_secret;
end $$;

create or replace function public.saas_credential_cleanup() returns trigger language plpgsql security definer set search_path = public, vault as $$
begin
  if old.vault_secret_id is not null then delete from vault.secrets where id = old.vault_secret_id; end if;
  return old;
end $$;
drop trigger if exists saas_credential_cleanup on public.saas_credentials;
create trigger saas_credential_cleanup after delete on public.saas_credentials for each row execute function public.saas_credential_cleanup();

revoke all on function public.saas_set_secret(uuid, text) from public;
revoke all on function public.saas_reveal_secret(uuid) from public;
grant execute on function public.saas_set_secret(uuid, text) to authenticated;
grant execute on function public.saas_reveal_secret(uuid) to authenticated;

-- ── Verificações recorrentes ──
create or replace function public.saas_next_date(d date, n integer, u text) returns date language sql immutable as $$
  select case u when 'dias' then d + n when 'semanas' then d + 7 * n else (d + (n || ' months')::interval)::date end
$$;

create or replace function public.saas_make_check_task(c public.saas_recurring_checks) returns void language plpgsql security definer set search_path = public as $$
declare v_client uuid;
begin
  select client_id into v_client from saas_clients where id = c.saas_client_id;
  insert into tasks (title, description, type, status, priority, due_date, client_id, business_unit, saas_kind, recurring_check_id, responsible_ids, workflow_stage)
  values ('Verificar: ' || c.title, c.description, 'tarefa', 'pendente', 'media', c.next_due, v_client, 'saas', 'verificacao', c.id, c.responsible_ids, 'a_fazer');
end $$;

create or replace function public.trg_saas_check_changed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.active then perform saas_make_check_task(new); end if;
  elsif tg_op = 'UPDATE' then
    if old.active and not new.active then
      update tasks set status = 'cancelada' where recurring_check_id = new.id and status = 'pendente';
    elsif not old.active and new.active and not exists (select 1 from tasks where recurring_check_id = new.id and status = 'pendente') then
      perform saas_make_check_task(new);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists saas_check_changed on public.saas_recurring_checks;
create trigger saas_check_changed after insert or update on public.saas_recurring_checks for each row execute function public.trg_saas_check_changed();

create or replace function public.trg_saas_task_done() returns trigger language plpgsql security definer set search_path = public as $$
declare c saas_recurring_checks%rowtype; v_next date;
begin
  if new.recurring_check_id is not null and new.status = 'concluida' and old.status is distinct from 'concluida' then
    select * into c from saas_recurring_checks where id = new.recurring_check_id;
    if c.id is not null and c.active and not exists (select 1 from tasks where recurring_check_id = c.id and status = 'pendente') then
      v_next := public.saas_next_date(current_date, c.every_n, c.unit);
      update saas_recurring_checks set last_done = current_date, next_due = v_next where id = c.id returning * into c;
      perform saas_make_check_task(c);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists saas_task_done on public.tasks;
create trigger saas_task_done after update of status on public.tasks for each row execute function public.trg_saas_task_done();
