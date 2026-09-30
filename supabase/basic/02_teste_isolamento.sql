-- ============================================================================
-- SRJUR BASIC -- teste de isolamento entre escritorios
-- ============================================================================
-- Rode DEPOIS do 01_multitenant.sql, no SQL Editor, de uma vez so.
-- Cria 2 escritorios de teste (A e B), um admin em cada, e tenta:
--   - B ler / alterar / apagar dados de A
--   - B forjar tenant_id de A num insert
--   - usuario sem escritorio ler qualquer coisa
--   - anonimo ler qualquer coisa
--   - o mesmo DJEN id existir nos dois escritorios
-- No fim apaga tudo que criou e mostra uma tabela: TODA linha deve ser OK = true.
-- Se qualquer linha vier false, NAO entregue o sistema: me mande o resultado.
-- ============================================================================

create temp table if not exists _iso_resultado (ordem serial, teste text, ok boolean, detalhe text);
truncate _iso_resultado;

do $$
declare
  ta uuid; tb uuid;
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); un uuid := gen_random_uuid();
  ca uuid;
  n int;
  res jsonb := '[]'::jsonb;

begin
  -- ---------- preparacao (como dono do banco) ----------
  ta := public.provision_tenant('TESTE ISO A', 'teste-iso-a');
  tb := public.provision_tenant('TESTE ISO B', 'teste-iso-b');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
   (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@teste-iso.invalid', '', now(), '{}', '{}', now(), now()),
   (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@teste-iso.invalid', '', now(), '{}', '{}', now(), now()),
   (un, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'n@teste-iso.invalid', '', now(), '{}', '{}', now(), now());

  -- cadastro novo sem atribuicao NAO pode virar admin
  select count(*) into n from public.profiles where user_id = ua and role = 'admin';
  res := res || jsonb_build_object('t', 'cadastro novo NAO vira admin sozinho', 'ok', n = 0);

  perform public.assign_user_to_tenant('a@teste-iso.invalid', ta, 'admin');
  perform public.assign_user_to_tenant('b@teste-iso.invalid', tb, 'admin');
  -- un (sem escritorio) fica como veio: client, sem tenant

  -- ---------- A cria dados ----------
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;

  insert into public.clients (name) values ('Cliente do A') returning id into ca;
  insert into public.tasks (title) values ('Tarefa do A');
  insert into public.intimacoes (djen_id, numero_processo) values (999000111, '0000000-00.0000.0.00.0000');

  select count(*) into n from public.clients;
  res := res || jsonb_build_object('t', 'A enxerga o proprio cliente', 'ok', n = 1);

  -- ---------- B tenta invadir ----------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ub::text, true);
  set local role authenticated;

  select count(*) into n from public.clients;
  res := res || jsonb_build_object('t', 'B NAO le clientes do A', 'ok', n = 0);
  select count(*) into n from public.tasks;
  res := res || jsonb_build_object('t', 'B NAO le tarefas do A', 'ok', n = 0);
  select count(*) into n from public.intimacoes;
  res := res || jsonb_build_object('t', 'B NAO le intimacoes do A', 'ok', n = 0);
  select count(*) into n from public.profiles where tenant_id = ta;
  res := res || jsonb_build_object('t', 'B NAO le equipe do A (profiles)', 'ok', n = 0);
  select count(*) into n from public.office_settings where tenant_id = ta;
  res := res || jsonb_build_object('t', 'B NAO le configuracoes do A', 'ok', n = 0);

  update public.clients set name = 'INVADIDO' where id = ca;
  get diagnostics n = row_count;
  res := res || jsonb_build_object('t', 'B NAO altera cliente do A', 'ok', n = 0);

  delete from public.clients where id = ca;
  get diagnostics n = row_count;
  res := res || jsonb_build_object('t', 'B NAO apaga cliente do A', 'ok', n = 0);

  -- B tenta forjar tenant_id = A num insert: o trigger tem que forcar para B
  insert into public.clients (name, tenant_id) values ('Forjado por B', ta);
  reset role;
  select count(*) into n from public.clients where name = 'Forjado por B' and tenant_id = tb;
  res := res || jsonb_build_object('t', 'B NAO consegue forjar tenant_id do A (vira B)', 'ok', n = 1);
  select count(*) into n from public.clients where name = 'Forjado por B' and tenant_id = ta;
  res := res || jsonb_build_object('t', 'nada foi parar no A por forja', 'ok', n = 0);

  -- mesmo id do DJEN nos dois escritorios (antes colidia)
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ub::text, true);
  set local role authenticated;
  begin
    insert into public.intimacoes (djen_id, numero_processo) values (999000111, '0000000-00.0000.0.00.0000');
    res := res || jsonb_build_object('t', 'mesmo djen_id pode existir nos 2 escritorios', 'ok', true);
  exception when others then
    res := res || jsonb_build_object('t', 'mesmo djen_id pode existir nos 2 escritorios', 'ok', false);
  end;
  reset role;

  -- ---------- usuario sem escritorio ----------
  perform set_config('request.jwt.claims', json_build_object('sub', un, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', un::text, true);
  set local role authenticated;
  select count(*) into n from public.clients;
  res := res || jsonb_build_object('t', 'usuario sem escritorio NAO le clientes', 'ok', n = 0);
  select count(*) into n from public.finance;
  res := res || jsonb_build_object('t', 'usuario sem escritorio NAO le financeiro', 'ok', n = 0);
  select count(*) into n from public.profiles where tenant_id is not null;
  res := res || jsonb_build_object('t', 'usuario sem escritorio NAO le equipes', 'ok', n = 0);
  reset role;

  -- ---------- anonimo ----------
  set local role anon;
  begin
    select count(*) into n from public.clients;
    res := res || jsonb_build_object('t', 'anonimo NAO le clientes', 'ok', n = 0);
  exception when insufficient_privilege then
    res := res || jsonb_build_object('t', 'anonimo NAO le clientes', 'ok', true);
  end;
  reset role;

  -- ---------- guarda resultado (fora do role restrito) ----------
  insert into _iso_resultado (teste, ok)
  select e->>'t', (e->>'ok')::boolean from jsonb_array_elements(res) e;

  -- ---------- limpeza ----------
  delete from auth.users where email like '%@teste-iso.invalid';
  delete from public.tenants where slug in ('teste-iso-a', 'teste-iso-b');
end $$;

select ordem, teste, ok from _iso_resultado order by ordem;
