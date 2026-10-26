-- ============================================================================
-- SRJUR BASIC -- processo: tipo invalido vira "contencioso" automaticamente
-- ============================================================================
-- O atalho "Criar processo" da tela de Intimacoes (versao publicada ate agora)
-- envia type = 'judicial', que a regra processes_type_check recusa. Este trigger
-- troca qualquer tipo fora de consultivo/contencioso/extrajudicial por
-- contencioso ANTES da regra ser verificada. Idempotente.
begin;

create or replace function public.normalize_process_type()
returns trigger language plpgsql as $$
begin
  if new.type is not null and new.type not in ('consultivo', 'contencioso', 'extrajudicial') then
    new.type := 'contencioso';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_process_type on public.processes;
create trigger trg_normalize_process_type
  before insert or update of type on public.processes
  for each row execute function public.normalize_process_type();

commit;

-- Conferencia: deve listar o trigger novo.
select tgname from pg_trigger
where tgrelid = 'public.processes'::regclass and not tgisinternal order by 1;
