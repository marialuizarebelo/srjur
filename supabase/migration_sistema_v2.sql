-- Clientes do sistema v2: fases da implementação.
-- Cada fase com prazo vira uma tarefa no Calendário (saas_kind 'implementacao'); ao concluir a fase, a tarefa conclui;
-- ao apagar a fase (ou tirar o prazo), a tarefa pendente é cancelada.
alter table public.tasks drop constraint if exists tasks_saas_kind_check;
alter table public.tasks add constraint tasks_saas_kind_check check (saas_kind in ('bug', 'ajuste', 'duvida', 'verificacao', 'outro', 'implementacao'));

create table if not exists public.saas_impl_phases (
  id uuid primary key default gen_random_uuid(),
  saas_client_id uuid not null references public.saas_clients(id) on delete cascade,
  position integer not null default 0,
  name text not null,
  status text not null default 'pendente' check (status in ('pendente', 'andamento', 'concluida')),
  due_date date,
  done_at date,
  notes text,
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.saas_impl_phases enable row level security;
drop policy if exists admin_all_saas_phases on public.saas_impl_phases;
create policy admin_all_saas_phases on public.saas_impl_phases for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.trg_saas_phase_sync() returns trigger language plpgsql security definer set search_path = public as $$
declare v_client uuid; v_cname text; v_tid uuid; v_title text;
begin
  if tg_op = 'DELETE' then
    if old.task_id is not null then update tasks set status = 'cancelada' where id = old.task_id and status = 'pendente'; end if;
    return old;
  end if;
  select s.client_id, c.name into v_client, v_cname from saas_clients s join clients c on c.id = s.client_id where s.id = new.saas_client_id;
  v_title := 'Implementação: ' || new.name || ' — ' || coalesce(v_cname, '');
  if new.status = 'concluida' then
    new.done_at := coalesce(new.done_at, current_date);
    if new.task_id is not null then update tasks set status = 'concluida' where id = new.task_id and status = 'pendente'; end if;
  else
    new.done_at := null;
    if new.due_date is not null then
      if new.task_id is null then
        insert into tasks (title, type, status, priority, due_date, client_id, business_unit, saas_kind, workflow_stage)
        values (v_title, 'tarefa', 'pendente', 'media', new.due_date, v_client, 'saas', 'implementacao', 'a_fazer') returning id into v_tid;
        new.task_id := v_tid;
      else
        update tasks set title = v_title, due_date = new.due_date, status = 'pendente', workflow_stage = 'a_fazer' where id = new.task_id;
      end if;
    elsif new.task_id is not null then
      update tasks set status = 'cancelada' where id = new.task_id and status = 'pendente';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists saas_phase_sync on public.saas_impl_phases;
create trigger saas_phase_sync before insert or update or delete on public.saas_impl_phases for each row execute function public.trg_saas_phase_sync();
