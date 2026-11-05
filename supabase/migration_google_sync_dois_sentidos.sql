-- Google Agenda: a funcao google-calendar grava em google_event_links a coluna "origin" ('push' ou 'pull'),
-- mas o banco do Basic nao tinha essa coluna. Sem ela, o vinculo do evento nunca era salvo (erro silencioso)
-- e cada sincronizacao criava os mesmos eventos de novo na agenda do Google (duplicados).
alter table public.google_event_links add column if not exists origin text;
-- Google Agenda: sincronizacao de verdade, nos dois sentidos, com todas as agendas editaveis do Google.
-- calendar_id: de qual agenda do Google veio cada evento (as audiencias, por exemplo, ficam em uma agenda propria).
alter table public.google_event_links add column if not exists calendar_id text;

-- Datas de alteracao confiaveis: a sincronizacao compara com a ultima sincronizacao para saber qual lado mudou.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();

alter table public.deadlines add column if not exists updated_at timestamptz not null default now();
drop trigger if exists trg_deadlines_updated_at on public.deadlines;
create trigger trg_deadlines_updated_at before update on public.deadlines for each row execute function public.set_updated_at();
