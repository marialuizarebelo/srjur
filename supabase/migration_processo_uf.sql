-- ============================================================================
-- SRJUR -- estado (UF) no processo, identificado sozinho pelo numero (CNJ)
-- ============================================================================
-- Rode UMA VEZ no SQL Editor do projeto (pode repetir). Transacao unica.
--   - processes.state: UF do processo (a pessoa pode trocar na mao).
--   - public.uf_from_cnj(numero): descobre a UF pelo tribunal do numero CNJ; so quando e seguro
--     (Justica Estadual, Eleitoral, Militar estadual, Trabalho, TRF4 por secao e TRF6). Nos demais, vazio.
--   - gatilho: ao cadastrar/alterar o numero, se o estado estiver vazio, preenche sozinho
--     (vale tambem para importacoes e para processos criados a partir de intimacoes).
--   - preenche os processos que ja existem.
-- ============================================================================
begin;

alter table public.processes add column if not exists state text;

create or replace function public.uf_from_cnj(p_numero text)
returns text language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  j int; tr int; origem text;
  ufs text[] := array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SE','SP','TO'];
  trt text[] := array['RJ','SP','MG','RS','BA','PE','CE','PA','PR','DF','AM','SC','PB','RO','SP','MA','ES','GO','AL','SE','RN','PI','MT','MS'];
begin
  if length(d) <> 20 then return null; end if;
  j := substr(d, 14, 1)::int; tr := substr(d, 15, 2)::int; origem := substr(d, 17, 4);
  if j in (8, 6, 7) then
    if tr between 1 and 27 then return ufs[tr]; end if;
    return null;
  elsif j = 5 then
    if tr between 1 and 24 then return trt[tr]; end if;
    return null;
  elsif j = 4 then
    if tr = 6 then return 'MG'; end if;
    if tr = 4 then
      if origem like '70%' then return 'PR'; elsif origem like '71%' then return 'RS'; elsif origem like '72%' then return 'SC'; end if;
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.processes_set_uf()
returns trigger language plpgsql as $$
begin
  if (new.state is null or new.state = '') and new.number is not null then
    new.state := public.uf_from_cnj(new.number);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_processes_uf on public.processes;
create trigger trg_processes_uf before insert or update of number on public.processes
  for each row execute function public.processes_set_uf();

update public.processes set state = public.uf_from_cnj(number) where (state is null or state = '') and number is not null;

commit;
