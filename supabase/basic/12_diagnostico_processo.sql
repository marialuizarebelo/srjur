-- DIAGNOSTICO (so le e testa; NAO grava nada): por que o escritorio nao consegue salvar processo
create temp table if not exists _diag (ordem serial, item text, resultado text);
truncate _diag;

insert into _diag (item, resultado)
select 'regra ' || conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'public.processes'::regclass and contype = 'c';

insert into _diag (item, resultado)
select 'tipos ja gravados', coalesce(string_agg(t || ' (' || n || ')', ', '), '(nenhum processo)')
from (select coalesce(type, '(nulo)') t, count(*) n from public.processes group by 1) x;

insert into _diag (item, resultado)
select 'trigger em processes', tgname from pg_trigger
where tgrelid = 'public.processes'::regclass and not tgisinternal;

do $$
declare
  v_tenant uuid := (select id from public.tenants where slug = 'oliveiraecosta');
  t text; msg text;
begin
  insert into _diag (item, resultado)
  values ('escritorio oliveiraecosta', coalesce(v_tenant::text, 'NAO ENCONTRADO (slug diferente?)'));
  foreach t in array array['consultivo', 'contencioso', 'extrajudicial', 'judicial'] loop
    begin
      -- mesmo conjunto de colunas que a tela envia; o raise abaixo desfaz o teste
      insert into public.processes
        (title, type, status, phase, tenant_id, procedural_class, court, responsible_ids,
         portal_visible, opposing_parties, confidential, created_by)
      values ('TESTE DIAGNOSTICO', t, 'em_andamento', 'inicial', v_tenant, 'x', 'x', '{}',
              true, '[]'::jsonb, false, null);
      raise exception 'TESTE_OK';
    exception when others then
      msg := case when sqlerrm = 'TESTE_OK' then 'aceito' else 'RECUSADO: ' || sqlerrm end;
    end;
    insert into _diag (item, resultado) values ('teste gravar tipo ' || t, msg);
  end loop;
end $$;

select item, resultado from _diag order by ordem;
