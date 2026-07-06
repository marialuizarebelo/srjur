-- ============================================
-- SRJUR — Schema completo do banco de dados
-- Rodar no Supabase SQL Editor (todo de uma vez)
-- ============================================

-- 1. PROFILES (usuários do sistema)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  display_name text,
  role text not null default 'admin' check (role in ('admin', 'client')),
  role_title text,
  photo_url text,
  color text default '#8B5CF6',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. CLIENTS (clientes do escritório)
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  cpf_cnpj text,
  type text default 'pessoa_fisica' check (type in ('pessoa_fisica', 'pessoa_juridica')),
  area text,
  status text default 'ativo' check (status in ('ativo', 'inativo', 'prospecto')),
  responsible text,
  notes text,
  birth_date date,
  address text,
  portal_visible boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. PROCESSES (casos e processos)
create table if not exists public.processes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  number text,
  title text not null,
  type text default 'consultivo' check (type in ('consultivo', 'contencioso', 'extrajudicial')),
  area text,
  status text default 'em_andamento' check (status in ('em_andamento', 'concluido', 'arquivado', 'suspenso')),
  phase text default 'inicial',
  responsible text,
  court text,
  electronic_system text,
  notes text,
  portal_visible boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. PROCESS_UPDATES (andamentos — dentro do processo)
create table if not exists public.process_updates (
  id uuid primary key default gen_random_uuid(),
  process_id uuid references public.processes(id) on delete cascade not null,
  text text not null,
  author text,
  portal_visible boolean default false,
  created_at timestamptz default now()
);

-- 5. TASKS (compromissos e tarefas)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text default 'tarefa' check (type in ('tarefa', 'compromisso', 'reuniao', 'audiencia', 'diligencia', 'interno', 'cliente')),
  status text default 'pendente' check (status in ('pendente', 'concluida', 'cancelada')),
  priority text default 'media' check (priority in ('baixa', 'media', 'alta', 'urgente')),
  due_date date,
  due_time time,
  responsible text,
  client_id uuid references public.clients(id) on delete set null,
  process_id uuid references public.processes(id) on delete set null,
  recurrence text check (recurrence in ('diaria', 'semanal', 'mensal', 'personalizada', null)),
  portal_visible boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 6. DEADLINES (prazos processuais)
create table if not exists public.deadlines (
  id uuid primary key default gen_random_uuid(),
  process_id uuid references public.processes(id) on delete cascade,
  title text not null,
  due_date date not null,
  status text default 'pendente' check (status in ('pendente', 'cumprido', 'perdido')),
  responsible text,
  notes text,
  source text,
  portal_visible boolean default false,
  created_at timestamptz default now()
);

-- 7. FINANCE (lançamentos financeiros)
create table if not exists public.finance (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('receita', 'despesa')),
  category text,
  description text not null,
  value numeric(12,2) not null,
  date date not null default current_date,
  due_date date,
  paid boolean default false,
  payment_date date,
  client_id uuid references public.clients(id) on delete set null,
  process_id uuid references public.processes(id) on delete set null,
  origin text default 'operacional',
  nature text default 'real' check (nature in ('real', 'previsto')),
  impacts_cash boolean default true,
  responsible text,
  payment_link text,
  notes text,
  portal_visible boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 8. DOCUMENTS (links para Google Drive)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  drive_url text not null,
  type text,
  client_id uuid references public.clients(id) on delete set null,
  process_id uuid references public.processes(id) on delete set null,
  portal_visible boolean default false,
  created_at timestamptz default now()
);

-- 9. COMMUNICATIONS (templates de mensagem)
create table if not exists public.communications (
  id uuid primary key default gen_random_uuid(),
  title text,
  name text,
  category text,
  channel text default 'whatsapp',
  subject text,
  body text not null,
  variables text[] default '{}',
  tag_ids text[] default '{}',
  tag text,
  whatsapp_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 10. LEADS (CRM / pipeline)
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  cpf_cnpj text,
  source text,
  status text default 'novo' check (status in ('novo', 'contato', 'proposta', 'negociacao', 'convertido', 'perdido')),
  potential_value numeric(12,2),
  notes text,
  responsible text,
  next_followup date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 11. ELECTRONIC_SYSTEMS (sistemas eletrônicos)
create table if not exists public.electronic_systems (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  username text,
  notes text,
  created_at timestamptz default now()
);

-- 12. OFFICE_SETTINGS (configurações do escritório)
create table if not exists public.office_settings (
  id uuid primary key default gen_random_uuid(),
  name text default 'Scartezzini e Rebelo Advocacia',
  logo_url text,
  whatsapp_url text default 'https://web.whatsapp.com/',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 13. AUDIT_LOG (auditoria)
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  details jsonb,
  created_at timestamptz default now()
);

-- 14. INTIMATIONS (intimações)
create table if not exists public.intimations (
  id uuid primary key default gen_random_uuid(),
  process_id uuid references public.processes(id) on delete set null,
  source text,
  content text not null,
  received_at timestamptz default now(),
  read boolean default false,
  deadline_date date,
  created_at timestamptz default now()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.processes enable row level security;
alter table public.process_updates enable row level security;
alter table public.tasks enable row level security;
alter table public.deadlines enable row level security;
alter table public.finance enable row level security;
alter table public.documents enable row level security;
alter table public.communications enable row level security;
alter table public.leads enable row level security;
alter table public.electronic_systems enable row level security;
alter table public.office_settings enable row level security;
alter table public.audit_log enable row level security;
alter table public.intimations enable row level security;

-- Função helper SECURITY DEFINER: evita "infinite recursion detected in policy for
-- relation profiles" que ocorre quando a policy de profiles faz um SELECT na própria
-- tabela profiles. Rodando com privilégios elevados, essa consulta não reavalia a
-- RLS de profiles de novo.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Admin policies: acesso total para admins autenticados
create policy "admin_all_profiles" on public.profiles for all using (public.is_admin());
create policy "own_profile" on public.profiles for select using (user_id = auth.uid());

create policy "admin_all_clients" on public.clients for all using (public.is_admin());

create policy "admin_all_processes" on public.processes for all using (public.is_admin());

create policy "admin_all_process_updates" on public.process_updates for all using (public.is_admin());

create policy "admin_all_tasks" on public.tasks for all using (public.is_admin());

create policy "admin_all_deadlines" on public.deadlines for all using (public.is_admin());

create policy "admin_all_finance" on public.finance for all using (public.is_admin());

create policy "admin_all_documents" on public.documents for all using (public.is_admin());

create policy "admin_all_communications" on public.communications for all using (public.is_admin());

create policy "admin_all_leads" on public.leads for all using (public.is_admin());

create policy "admin_all_electronic_systems" on public.electronic_systems for all using (public.is_admin());

create policy "admin_all_office_settings" on public.office_settings for all using (public.is_admin());

create policy "admin_all_audit_log" on public.audit_log for all using (public.is_admin());

create policy "admin_all_intimations" on public.intimations for all using (public.is_admin());

-- Client policies: só vê seus próprios dados + portal_visible
create policy "client_own_processes" on public.processes for select using (
  portal_visible = true and client_id in (
    select c.id from public.clients c
    join public.profiles p on p.id::text = c.id::text
    where p.user_id = auth.uid() and p.role = 'client'
  )
);

create policy "client_visible_updates" on public.process_updates for select using (
  portal_visible = true and process_id in (
    select id from public.processes where portal_visible = true and client_id in (
      select c.id from public.clients c
      join public.profiles p on p.id::text = c.id::text
      where p.user_id = auth.uid() and p.role = 'client'
    )
  )
);

create policy "client_own_finance" on public.finance for select using (
  portal_visible = true and client_id in (
    select c.id from public.clients c
    join public.profiles p on p.id::text = c.id::text
    where p.user_id = auth.uid() and p.role = 'client'
  )
);

create policy "client_own_documents" on public.documents for select using (
  portal_visible = true and client_id in (
    select c.id from public.clients c
    join public.profiles p on p.id::text = c.id::text
    where p.user_id = auth.uid() and p.role = 'client'
  )
);

-- ============================================
-- TRIGGER: auto-create profile on signup
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email), 'admin');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- SEED: configurações iniciais
-- ============================================
insert into public.office_settings (name, whatsapp_url)
values ('Scartezzini e Rebelo Advocacia', 'https://web.whatsapp.com/')
on conflict do nothing;
