-- Tipos de prazo personalizados: cada escritório cria os seus, além da lista padrão do sistema.
create table if not exists public.deadline_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.my_tenant_id(),
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index if not exists deadline_types_tenant_name_key on public.deadline_types (tenant_id, lower(btrim(name)));
alter table public.deadline_types enable row level security;
drop policy if exists deadline_types_admin_tenant on public.deadline_types;
create policy deadline_types_admin_tenant on public.deadline_types for all
  using (public.is_admin() and tenant_id = public.my_tenant_id())
  with check (public.is_admin() and tenant_id = public.my_tenant_id());
grant select, insert, update, delete on public.deadline_types to authenticated;
