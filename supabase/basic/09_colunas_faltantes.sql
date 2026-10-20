-- ============================================================================
-- SRJUR BASIC -- colunas que o codigo grava e o banco do Basic ainda nao tinha
-- ============================================================================
-- Sintoma que isto corrige: "Could not find the 'procedural_class' column of
-- 'processes' in the schema cache" ao salvar um processo (e erros parecidos ao
-- salvar cliente, lead, tarefa ou prazo).
--
-- Rode UMA VEZ no SQL Editor (pode repetir, nao apaga nada, nao altera o que ja
-- existe: so ACRESCENTA colunas com IF NOT EXISTS). Roda numa transacao.
-- Serve para TODOS os escritorios (as colunas sao da tabela, nao de um escritorio).
--
-- Colunas acrescentadas (so entram se ainda nao existirem):
--   processes : procedural_class (Classe processual), created_by
--   clients   : rep_name, rep_cpf, rep_role, rep_document_type, rep_address
--               (representante legal), created_by
--   leads     : dados cadastrais completos (tipo, genero, RG, endereco, tags,
--               nascimento, assinatura, representante legal)
--   tasks     : created_by
--   deadlines : start_date (data de inicio), created_by
-- ============================================================================

begin;

-- ---- processes --------------------------------------------------------------
alter table public.processes add column if not exists procedural_class text;
alter table public.processes add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- ---- clients ----------------------------------------------------------------
alter table public.clients add column if not exists rep_name          text;
alter table public.clients add column if not exists rep_cpf           text;
alter table public.clients add column if not exists rep_role          text;
alter table public.clients add column if not exists rep_document_type text;
alter table public.clients add column if not exists rep_address       text;
alter table public.clients add column if not exists created_by        uuid references public.profiles(id) on delete set null;

-- ---- leads (mesmos dados cadastrais do cliente, para converter sem perder nada)
alter table public.leads add column if not exists type              text;
alter table public.leads add column if not exists gender            text;
alter table public.leads add column if not exists nationality       text;
alter table public.leads add column if not exists marital_status    text;
alter table public.leads add column if not exists profession        text;
alter table public.leads add column if not exists rg_number         text;
alter table public.leads add column if not exists rg_issuer         text;
alter table public.leads add column if not exists cep               text;
alter table public.leads add column if not exists street            text;
alter table public.leads add column if not exists address_number    text;
alter table public.leads add column if not exists complement        text;
alter table public.leads add column if not exists neighborhood      text;
alter table public.leads add column if not exists city              text;
alter table public.leads add column if not exists state             text;
alter table public.leads add column if not exists birth_date        date;
alter table public.leads add column if not exists signed_at         date;
alter table public.leads add column if not exists tags              text;
alter table public.leads add column if not exists rep_name          text;
alter table public.leads add column if not exists rep_cpf           text;
alter table public.leads add column if not exists rep_role          text;
alter table public.leads add column if not exists rep_document_type text;
alter table public.leads add column if not exists rep_address       text;
alter table public.leads add column if not exists drive_folder_id   text;
alter table public.leads add column if not exists drive_url         text;
alter table public.leads add column if not exists created_by        uuid references public.profiles(id) on delete set null;

-- ---- tasks / deadlines ------------------------------------------------------
alter table public.tasks     add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.deadlines add column if not exists start_date date;
alter table public.deadlines add column if not exists created_by uuid references public.profiles(id) on delete set null;

commit;

-- Faz o Supabase reconhecer as colunas novas agora (sem esperar o cache expirar).
notify pgrst, 'reload schema';

-- Conferencia: deve listar 8 linhas, todas com existe = true.
select c.tabela, c.coluna,
       exists (select 1 from information_schema.columns i
               where i.table_schema = 'public' and i.table_name = c.tabela and i.column_name = c.coluna) as existe
from (values
  ('processes','procedural_class'), ('processes','created_by'),
  ('clients','rep_name'), ('leads','rep_name'), ('leads','cep'),
  ('tasks','created_by'), ('deadlines','created_by'), ('deadlines','start_date')
) as c(tabela, coluna)
order by 1, 2;
