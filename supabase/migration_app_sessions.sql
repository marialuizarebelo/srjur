-- Telemetria mínima de versão: cada pessoa registra qual versão do sistema (arquivo principal)
-- está rodando e em qual endereço. Serve pra diagnosticar "usuária com versão antiga".
create table if not exists public.app_sessions (
  user_id uuid not null,
  host text not null,
  display_name text,
  bundle text,
  sw_controlled boolean,
  user_agent text,
  seen_at timestamptz not null default now(),
  primary key (user_id, host)
);
alter table public.app_sessions enable row level security;
drop policy if exists app_sessions_own on public.app_sessions;
create policy app_sessions_own on public.app_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
