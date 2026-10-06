-- ============================================================================
-- SRJUR BASIC -- teste do login de suporte (um login, todos os escritorios)
-- ============================================================================
-- Rode DEPOIS do 04 e do 06, no SQL Editor, de uma vez so.
-- Cria 2 escritorios de teste, uma administradora e uma colega no primeiro, uma
-- administradora no segundo e um login de suporte, e confere:
--   - o suporte enxerga/grava SO o escritorio do link em que esta (e nada se o
--     link nao existe, e so a "casa" dele se nao ha link);
--   - administradora comum NAO consegue entrar em outro escritorio mandando o
--     cabecalho do link;
--   - o perfil do suporte nao e editado, rebaixado nem apagado por ninguem de
--     dentro do sistema;
--   - o que DEVE funcionar continua funcionando.
-- No fim apaga tudo que criou e mostra uma tabela: TODA linha deve ser OK = true.
-- Se qualquer linha vier false, NAO entregue o sistema.
-- ============================================================================

create temp table if not exists _sup_resultado (ordem serial, teste text, ok boolean);
truncate _sup_resultado;

do $$
declare
  demo uuid := (select id from public.tenants where slug = 'demo');
  t1 uuid; t2 uuid;
  ua uuid := gen_random_uuid();  -- administradora do escritorio 1
  uc uuid := gen_random_uuid();  -- colega comum do escritorio 1
  uo uuid := gen_random_uuid();  -- administradora do escritorio 2
  us uuid := gen_random_uuid();  -- login de suporte
  n int; v uuid;
  res jsonb := '[]'::jsonb;
begin
  if demo is null then raise exception 'Escritorio Demo (slug demo) nao encontrado.'; end if;

  -- ---------- preparacao (como dono do banco) ----------
  insert into public.tenants (name, slug) values ('TESTE SUPORTE 1', 'teste-sup-1') returning id into t1;
  insert into public.tenants (name, slug) values ('TESTE SUPORTE 2', 'teste-sup-2') returning id into t2;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
   (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@teste-sup.invalid', '', now(), '{}', '{}', now(), now()),
   (uc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@teste-sup.invalid', '', now(), '{}', '{}', now(), now()),
   (uo, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'o@teste-sup.invalid', '', now(), '{}', '{}', now(), now()),
   (us, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's@teste-sup.invalid', '', now(), '{}', '{}', now(), now());

  perform public.assign_user_to_tenant('a@teste-sup.invalid', t1, 'admin');
  perform public.assign_user_to_tenant('c@teste-sup.invalid', t1, 'admin');
  perform public.assign_user_to_tenant('o@teste-sup.invalid', t2, 'admin');

  insert into public.clients (name, tenant_id) values ('TESTE-SUP cliente T1', t1), ('TESTE-SUP cliente T2', t2);

  -- ---------- o login de suporte ----------
  perform public.make_support_login('s@teste-sup.invalid');
  select count(*) into n from public.profiles
   where user_id = us and is_support and role = 'admin' and tenant_id = demo and display_name = 'Suporte SRJUR';
  res := res || jsonb_build_object('t', 'suporte criado: marcado, admin e com a casa no Demo', 'ok', n = 1);

  begin
    perform public.make_support_login('a@teste-sup.invalid');
    res := res || jsonb_build_object('t', 'NAO promove a suporte um login de escritorio de cliente', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'NAO promove a suporte um login de escritorio de cliente', 'ok', sqlerrm ilike '%escritorio de cliente%');
  end;

  -- ---------- suporte no link do escritorio 1 ----------
  perform set_config('request.jwt.claims', json_build_object('sub', us, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', us::text, true);
  perform set_config('request.headers', '{"x-tenant-slug":"teste-sup-1"}', true);
  set local role authenticated;

  select count(*) into n from public.clients where name = 'TESTE-SUP cliente T1';
  res := res || jsonb_build_object('t', 'suporte no link do escritorio 1 ve o cliente do 1', 'ok', n = 1);
  select count(*) into n from public.clients where name = 'TESTE-SUP cliente T2';
  res := res || jsonb_build_object('t', 'suporte no link do escritorio 1 NAO ve o cliente do 2', 'ok', n = 0);
  select count(*) into n from public.tenants where slug in ('teste-sup-1', 'teste-sup-2');
  res := res || jsonb_build_object('t', 'suporte no link do 1 ve so o escritorio 1 (nome/logo)', 'ok', n = 1);

  insert into public.clients (name) values ('TESTE-SUP criado pelo suporte');
  update public.clients set name = 'INVADIDO' where name = 'TESTE-SUP cliente T2';
  get diagnostics n = row_count;
  res := res || jsonb_build_object('t', 'suporte NAO altera dado do escritorio 2 estando no link do 1', 'ok', n = 0);

  select count(*) into n from public.office_support_team() where display_name = 'Suporte SRJUR';
  res := res || jsonb_build_object('t', 'lista de suporte aparece para o suporte no escritorio', 'ok', n >= 1);

  -- ---------- suporte no link do escritorio 2 ----------
  perform set_config('request.headers', '{"x-tenant-slug":"teste-sup-2"}', true);
  select count(*) into n from public.clients where name = 'TESTE-SUP cliente T2';
  res := res || jsonb_build_object('t', 'suporte no link do escritorio 2 ve o cliente do 2', 'ok', n = 1);
  select count(*) into n from public.clients where name like 'TESTE-SUP%' and name <> 'TESTE-SUP cliente T2';
  res := res || jsonb_build_object('t', 'suporte no link do escritorio 2 NAO ve nada do escritorio 1', 'ok', n = 0);

  -- ---------- link que nao existe ----------
  perform set_config('request.headers', '{"x-tenant-slug":"nao-existe-xyz"}', true);
  select count(*) into n from public.clients;
  select public.my_tenant_id() into v;
  res := res || jsonb_build_object('t', 'link inexistente = suporte sem acesso a nada', 'ok', n = 0 and v is null);

  -- ---------- sem link (so a casa dele) ----------
  perform set_config('request.headers', '', true);
  select count(*) into n from public.clients where name like 'TESTE-SUP%';
  res := res || jsonb_build_object('t', 'sem link o suporte fica na casa (Demo) e nao ve os escritorios de teste', 'ok', n = 0);

  -- ---------- administradora comum tenta usar o cabecalho ----------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  perform set_config('request.headers', '{"x-tenant-slug":"teste-sup-2"}', true);
  set local role authenticated;

  select count(*) into n from public.clients where name = 'TESTE-SUP cliente T2';
  res := res || jsonb_build_object('t', 'admin comum NAO entra no escritorio 2 mandando o cabecalho', 'ok', n = 0);
  select count(*) into n from public.clients where name = 'TESTE-SUP cliente T1';
  res := res || jsonb_build_object('t', 'admin comum continua vendo o proprio escritorio', 'ok', n = 1);
  insert into public.clients (name) values ('TESTE-SUP forja pelo cabecalho');

  select count(*) into n from public.office_support_team() where display_name = 'Suporte SRJUR';
  res := res || jsonb_build_object('t', 'admin ve o suporte na lista de usuarios do escritorio', 'ok', n >= 1);

  -- ---------- admin tenta mexer no perfil do suporte ----------
  perform set_config('request.headers', '', true);
  update public.profiles set display_name = 'HACKEADO' where user_id = us;
  get diagnostics n = row_count;
  res := res || jsonb_build_object('t', 'admin NAO renomeia o suporte', 'ok', n = 0);
  delete from public.profiles where user_id = us;
  get diagnostics n = row_count;
  res := res || jsonb_build_object('t', 'admin NAO apaga o suporte', 'ok', n = 0);
  begin
    update public.profiles set is_support = true where user_id = uc;
    res := res || jsonb_build_object('t', 'admin NAO promove a colega a suporte', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'admin NAO promove a colega a suporte', 'ok', sqlerrm ilike '%suporte%');
  end;
  begin
    update public.profiles set display_name = 'Colega editada' where user_id = uc;
    get diagnostics n = row_count;
    res := res || jsonb_build_object('t', 'admin continua editando colega comum', 'ok', n = 1);
  exception when others then
    res := res || jsonb_build_object('t', 'admin continua editando colega comum', 'ok', false);
  end;

  -- ---------- administradora do escritorio 2 (anonimo e ela nao chamam o que nao devem) ----------
  reset role;
  set local role anon;
  begin
    perform * from public.office_support_team();
    res := res || jsonb_build_object('t', 'anonimo NAO chama a lista de suporte', 'ok', false);
  exception when insufficient_privilege then
    res := res || jsonb_build_object('t', 'anonimo NAO chama a lista de suporte', 'ok', true);
  end;
  reset role;

  -- ---------- o proprio suporte tenta se mudar ----------
  perform set_config('request.jwt.claims', json_build_object('sub', us, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', us::text, true);
  set local role authenticated;

  begin
    update public.profiles set role = 'client' where user_id = us;
    res := res || jsonb_build_object('t', 'suporte NAO vira cliente', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'suporte NAO vira cliente', 'ok', sqlerrm ilike '%suporte%');
  end;
  begin
    update public.profiles set is_support = false where user_id = us;
    res := res || jsonb_build_object('t', 'suporte NAO tira a propria protecao', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'suporte NAO tira a propria protecao', 'ok', sqlerrm ilike '%suporte%');
  end;
  begin
    delete from public.profiles where user_id = us;
    res := res || jsonb_build_object('t', 'suporte NAO apaga o proprio perfil', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'suporte NAO apaga o proprio perfil', 'ok', sqlerrm ilike '%suporte%');
  end;
  begin
    update public.profiles set nickname = 'Suporte Edit' where user_id = us;
    get diagnostics n = row_count;
    res := res || jsonb_build_object('t', 'o proprio suporte edita o proprio perfil (foto, apelido)', 'ok', n = 1);
  exception when others then
    res := res || jsonb_build_object('t', 'o proprio suporte edita o proprio perfil (foto, apelido)', 'ok', false);
  end;

  -- ---------- estado final + dono do banco ----------
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.headers', '', true);

  select count(*) into n from public.profiles
   where user_id = us and is_support and role = 'admin' and tenant_id = demo and display_name = 'Suporte SRJUR';
  res := res || jsonb_build_object('t', 'apos tudo isso o perfil do suporte continua intacto', 'ok', n = 1);

  select count(*) into n from public.clients where name = 'TESTE-SUP criado pelo suporte' and tenant_id = t1;
  res := res || jsonb_build_object('t', 'o que o suporte gravou no link do 1 ficou no escritorio 1', 'ok', n = 1);
  select count(*) into n from public.clients where name = 'TESTE-SUP forja pelo cabecalho' and tenant_id = t1;
  res := res || jsonb_build_object('t', 'a forja da admin comum caiu no escritorio DELA (1), nao no 2', 'ok', n = 1);
  select count(*) into n from public.clients where name = 'TESTE-SUP cliente T2' and tenant_id = t2;
  res := res || jsonb_build_object('t', 'cliente do escritorio 2 ficou intacto', 'ok', n = 1);

  begin
    update public.profiles set nickname = 'Ajuste do dono' where user_id = us;
    get diagnostics n = row_count;
    res := res || jsonb_build_object('t', 'dono do banco (SQL Editor) consegue ajustar o suporte', 'ok', n = 1);
  exception when others then
    res := res || jsonb_build_object('t', 'dono do banco (SQL Editor) consegue ajustar o suporte', 'ok', false);
  end;

  insert into _sup_resultado (teste, ok)
  select e->>'t', (e->>'ok')::boolean from jsonb_array_elements(res) e;

  -- ---------- limpeza (dono do banco: ignora a trava) ----------
  delete from auth.users where email like '%@teste-sup.invalid';
  delete from public.tenants where slug in ('teste-sup-1', 'teste-sup-2');
end $$;

select ordem, teste, ok from _sup_resultado order by ordem;
