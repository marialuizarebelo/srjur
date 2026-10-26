-- ============================================================================
-- SRJUR BASIC -- tipo do processo: aceita exatamente o que a tela envia
-- ============================================================================
-- Corrige: new row for relation "processes" violates check constraint
-- "processes_type_check". A tela grava type = consultivo, contencioso ou
-- extrajudicial. Idempotente; roda numa transacao (se algo falhar, nada muda).
begin;

-- Se existir algum processo gravado como "judicial" (valor antigo do atalho de
-- intimacao), passa para "contencioso" (judicial = contencioso).
update public.processes set type = 'contencioso' where type = 'judicial';

alter table public.processes drop constraint if exists processes_type_check;
alter table public.processes add constraint processes_type_check
  check (type in ('consultivo', 'contencioso', 'extrajudicial'));

commit;

notify pgrst, 'reload schema';

-- Conferencia: deve mostrar a regra com os 3 tipos.
select conname, pg_get_constraintdef(oid) as regra
from pg_constraint
where conrelid = 'public.processes'::regclass and contype = 'c';
