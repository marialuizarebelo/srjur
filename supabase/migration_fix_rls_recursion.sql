-- Corrige "infinite recursion detected in policy for relation profiles"
-- Causa: as policies admin_all_* checavam "role='admin'" fazendo um SELECT dentro da
-- própria tabela profiles, o que reavalia a RLS de profiles recursivamente.
-- Isso fazia com que, na prática, cada usuária só enxergasse a própria linha em
-- profiles (e qualquer policy de outra tabela que dependesse desse check também
-- podia falhar silenciosamente) — por isso Malu e Juliana não se viam em Usuários,
-- não conseguiam atribuir tarefas uma pra outra, e updates (marcar tarefa concluída)
-- podiam não persistir.

-- 1. Função helper SECURITY DEFINER: roda com privilégios elevados, então a consulta
-- dentro dela NÃO passa pela RLS de profiles de novo — quebra a recursão.
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

-- 2. Recria todas as policies admin_all_* usando is_admin() no lugar do subselect direto
drop policy if exists "admin_all_profiles" on public.profiles;
create policy "admin_all_profiles" on public.profiles for all using (public.is_admin());

drop policy if exists "admin_all_clients" on public.clients;
create policy "admin_all_clients" on public.clients for all using (public.is_admin());

drop policy if exists "admin_all_processes" on public.processes;
create policy "admin_all_processes" on public.processes for all using (public.is_admin());

drop policy if exists "admin_all_process_updates" on public.process_updates;
create policy "admin_all_process_updates" on public.process_updates for all using (public.is_admin());

drop policy if exists "admin_all_tasks" on public.tasks;
create policy "admin_all_tasks" on public.tasks for all using (public.is_admin());

drop policy if exists "admin_all_deadlines" on public.deadlines;
create policy "admin_all_deadlines" on public.deadlines for all using (public.is_admin());

drop policy if exists "admin_all_finance" on public.finance;
create policy "admin_all_finance" on public.finance for all using (public.is_admin());

drop policy if exists "admin_all_documents" on public.documents;
create policy "admin_all_documents" on public.documents for all using (public.is_admin());

drop policy if exists "admin_all_communications" on public.communications;
create policy "admin_all_communications" on public.communications for all using (public.is_admin());

drop policy if exists "admin_all_leads" on public.leads;
create policy "admin_all_leads" on public.leads for all using (public.is_admin());

drop policy if exists "admin_all_electronic_systems" on public.electronic_systems;
create policy "admin_all_electronic_systems" on public.electronic_systems for all using (public.is_admin());

drop policy if exists "admin_all_office_settings" on public.office_settings;
create policy "admin_all_office_settings" on public.office_settings for all using (public.is_admin());

drop policy if exists "admin_all_audit_log" on public.audit_log;
create policy "admin_all_audit_log" on public.audit_log for all using (public.is_admin());

drop policy if exists "admin_all_intimations" on public.intimations;
create policy "admin_all_intimations" on public.intimations for all using (public.is_admin());
