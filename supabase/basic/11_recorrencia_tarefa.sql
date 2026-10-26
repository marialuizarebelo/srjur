-- ============================================================================
-- SRJUR BASIC -- tarefa recorrente: remove a regra antiga de "recurrence"
-- ============================================================================
-- A tela grava Diaria/Semanal/Quinzenal/Mensal/Trimestral (com inicial maiuscula
-- e acento), mas o schema original so aceitava diaria/semanal/mensal/personalizada
-- em minusculas. Resultado: tarefa recorrente nao salvava. Idempotente.
begin;

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.tasks'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%recurrence%'
  loop
    execute format('alter table public.tasks drop constraint %I', r.conname);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';

-- Conferencia: nao deve listar nenhuma regra com "recurrence".
select conname, pg_get_constraintdef(oid) as regra
from pg_constraint
where conrelid = 'public.tasks'::regclass and contype = 'c';
