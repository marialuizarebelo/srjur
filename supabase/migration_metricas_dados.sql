-- Dados que faltavam para as métricas ficarem corretas.
-- Rode uma vez no SQL Editor do Supabase da MAIN. É seguro rodar de novo (usa "if not exists").
--
-- O que muda:
--  * LEADS ........ motivo da perda, data da perda e data da conversão (preenchidas sozinhas pelo sistema)
--  * CLIENTES ..... data e motivo do encerramento (a data é preenchida sozinha quando o status vira "inativo")
--  * TAREFAS ...... unidade (Advocacia/SaaS) e data de conclusão (sozinha)
--  * PRAZOS ....... data de conclusão (sozinha)
--  * PROCESSOS .... data de encerramento preenchida sozinha quando o status vira concluído/arquivado
--  * FINANCEIRO ... "entre as empresas" (movimento Advocacia ⇄ SaaS que não conta em dobro no consolidado)
--                   e tipo de custo (fixo/variável) para o ponto de equilíbrio
--
-- Os dados que já existiam são preenchidos de forma aproximada (data da última edição);
-- você pode corrigir a data de qualquer cliente/lead editando o cadastro.

-- ───────────── Colunas ─────────────
alter table public.leads      add column if not exists lost_reason   text;
alter table public.leads      add column if not exists lost_at       timestamptz;
alter table public.leads      add column if not exists converted_at  timestamptz;
alter table public.leads      add column if not exists business_unit text;

alter table public.clients    add column if not exists inactivated_at date;
alter table public.clients    add column if not exists inactive_reason text;

alter table public.tasks      add column if not exists business_unit text;
alter table public.tasks      add column if not exists completed_at  timestamptz;

alter table public.deadlines  add column if not exists completed_at  timestamptz;

alter table public.finance    add column if not exists intragrupo    boolean not null default false;
alter table public.finance    add column if not exists cost_type     text;  -- 'fixo' | 'variavel' (só despesas)

-- ───────────── Preenchimento automático (gatilhos) ─────────────
-- Assim funciona em qualquer tela (kanban, formulário, sincronização do Google...) sem depender de cada uma lembrar.

create or replace function public.trg_leads_datas() returns trigger language plpgsql as $$
begin
  if new.status = 'convertido' and (tg_op = 'INSERT' or old.status is distinct from 'convertido') and new.converted_at is null then
    new.converted_at := now();
  end if;
  if new.status = 'perdido' and (tg_op = 'INSERT' or old.status is distinct from 'perdido') then
    new.lost_at := now();
  end if;
  if new.status is distinct from 'perdido' then
    new.lost_at := null;
  end if;
  return new;
end $$;
drop trigger if exists leads_datas on public.leads;
create trigger leads_datas before insert or update on public.leads for each row execute function public.trg_leads_datas();

create or replace function public.trg_clients_encerramento() returns trigger language plpgsql as $$
begin
  if new.status = 'inativo' and (tg_op = 'INSERT' or old.status is distinct from 'inativo') and new.inactivated_at is null then
    new.inactivated_at := current_date;
  end if;
  if new.status is distinct from 'inativo' then
    new.inactivated_at := null;
  end if;
  return new;
end $$;
drop trigger if exists clients_encerramento on public.clients;
create trigger clients_encerramento before insert or update on public.clients for each row execute function public.trg_clients_encerramento();

create or replace function public.trg_tasks_conclusao() returns trigger language plpgsql as $$
begin
  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status is distinct from 'concluida') then
    new.completed_at := now();
  end if;
  if new.status is distinct from 'concluida' then
    new.completed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists tasks_conclusao on public.tasks;
create trigger tasks_conclusao before insert or update on public.tasks for each row execute function public.trg_tasks_conclusao();

create or replace function public.trg_deadlines_conclusao() returns trigger language plpgsql as $$
begin
  if new.status in ('cumprido', 'perdido') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.completed_at := now();
  end if;
  if new.status = 'pendente' then
    new.completed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists deadlines_conclusao on public.deadlines;
create trigger deadlines_conclusao before insert or update on public.deadlines for each row execute function public.trg_deadlines_conclusao();

create or replace function public.trg_processes_encerramento() returns trigger language plpgsql as $$
begin
  if new.status in ('concluido', 'arquivado') and new.closed_date is null then
    new.closed_date := current_date;
  end if;
  return new;
end $$;
drop trigger if exists processes_encerramento on public.processes;
create trigger processes_encerramento before insert or update on public.processes for each row execute function public.trg_processes_encerramento();

-- ───────────── Dados que já existiam (aproximação) ─────────────
update public.leads set converted_at = coalesce(signed_at::timestamptz, updated_at, created_at)
  where status = 'convertido' and converted_at is null;
update public.leads set lost_at = coalesce(updated_at, created_at)
  where status = 'perdido' and lost_at is null;
update public.clients set inactivated_at = coalesce(updated_at, created_at)::date
  where status = 'inativo' and inactivated_at is null;
update public.tasks set completed_at = coalesce(updated_at, created_at)
  where status = 'concluida' and completed_at is null;
update public.deadlines set completed_at = due_date::timestamptz
  where status in ('cumprido', 'perdido') and completed_at is null;
update public.processes set closed_date = coalesce(updated_at, created_at)::date
  where status in ('concluido', 'arquivado') and closed_date is null;
