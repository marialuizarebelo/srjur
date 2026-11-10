-- Separa por escritório as tabelas que mostravam tudo para as duas.
-- Regra: só aparece para as duas o que pertence a um cliente/processo das duas (a visibilidade do registro "pai" já faz essa regra).

drop policy if exists "admin_all_process_updates" on public.process_updates;
create policy "admin_all_process_updates" on public.process_updates for all
  using (is_admin() and exists (select 1 from public.processes p where p.id = process_updates.process_id))
  with check (is_admin() and exists (select 1 from public.processes p where p.id = process_updates.process_id));

drop policy if exists "admin_all_activity_log" on public.activity_log;
create policy "admin_all_activity_log" on public.activity_log for all
  using (is_admin() and (
    case activity_log.entity_type
      when 'task'     then exists (select 1 from public.tasks x     where x.id = activity_log.entity_id)
      when 'process'  then exists (select 1 from public.processes x where x.id = activity_log.entity_id)
      when 'client'   then exists (select 1 from public.clients x   where x.id = activity_log.entity_id)
      when 'deadline' then exists (select 1 from public.deadlines x where x.id = activity_log.entity_id)
      else (activity_log.user_id = auth.uid() or activity_log.user_id = my_profile_id())
    end))
  with check (is_admin() and (
    case activity_log.entity_type
      when 'task'     then exists (select 1 from public.tasks x     where x.id = activity_log.entity_id)
      when 'process'  then exists (select 1 from public.processes x where x.id = activity_log.entity_id)
      when 'client'   then exists (select 1 from public.clients x   where x.id = activity_log.entity_id)
      when 'deadline' then exists (select 1 from public.deadlines x where x.id = activity_log.entity_id)
      else (activity_log.user_id = auth.uid() or activity_log.user_id = my_profile_id())
    end));

drop policy if exists "admin_all" on public.portal_messages;
create policy "admin_all" on public.portal_messages for all
  using (is_admin() and exists (select 1 from public.clients c where c.id = portal_messages.client_id))
  with check (is_admin() and exists (select 1 from public.clients c where c.id = portal_messages.client_id));

drop policy if exists "admin_all_google_links" on public.google_event_links;
create policy "admin_all_google_links" on public.google_event_links for all
  using (is_admin() and connection_id in (select id from public.google_calendar_connections))
  with check (is_admin() and connection_id in (select id from public.google_calendar_connections));
