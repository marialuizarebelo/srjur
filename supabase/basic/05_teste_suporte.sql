-- ============================================================================
-- SRJUR BASIC -- teste do login de suporte protegido
-- ============================================================================
-- Rode DEPOIS do 04_suporte_protegido.sql, no SQL Editor, de uma vez so.
-- Cria um escritorio de teste com uma administradora, uma colega e um login de
-- suporte, e tenta (como a administradora e como o proprio suporte):
--   editar / rebaixar / mover / apagar o suporte, promover alguem a suporte,
--   criar um suporte de dentro do sistema, e reaproveitar um login de outro
--   escritorio. Tambem confere que o que DEVE funcionar continua funcionando.
-- No fim apaga tudo que criou e mostra uma tabela: TODA linha deve ser OK = true.
-- Se qualquer linha vier false, NAO entregue o sistema.
-- ============================================================================

create temp table if not exists _sup_resultado (ordem serial, teste text, ok boolean);
truncate _sup_resultado;

do $$
declare
  t1 uuid; t2 uuid;
  ua uuid := gen_random_uuid();  -- administradora do escritorio de teste
  uc uuid := gen_random_uuid();  -- colega (admin comum) do mesmo escritorio
  us uuid := gen_random_uuid();  -- login de suporte
  uo uuid := gen_random_uuid();  -- admin de OUTRO escritorio
  n int;
  res jsonb := '[]'::jsonb;
  msg text;
begin
  -- ---------- preparacao (como dono do banco) ----------
  insert into public.tenants (name, slug) values ('TESTE SUPORTE 1', 'teste-sup-1') returning id into t1;
  insert into public.tenants (name, slug) values ('TESTE SUPORTE 2', 'teste-sup-2') returning id into t2;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
   (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@teste-sup.invalid', '', now(), '{}', '{}', now(), now()),
   (uc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@teste-sup.invalid', '', now(), '{}', '{}', now(), now()),
   (us, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's@teste-sup.invalid', '', now(), '{}', '{}', now(), now()),
   (uo, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'o@teste-sup.invalid', '', now(), '{}', '{}', now(), now());

  perform public.assign_user_to_tenant('a@teste-sup.invalid', t1, 'admin');
  perform public.assign_user_to_tenant('c@teste-sup.invalid', t1, 'admin');
  perform public.assign_user_to_tenant('o@teste-sup.invalid', t2, 'admin');
  perform public.add_support_to_tenant('s@teste-sup.invalid', t1);

  select count(*) into n from public.profiles
   where user_id = us and is_support and role = 'admin' and tenant_id = t1 and display_name = 'Suporte SRJUR';
  res := res || jsonb_build_object('t', 'suporte criado: marcado, admin e no escritorio certo', 'ok', n = 1);

  -- recusa login que ja e de outro escritorio
  begin
    perform public.add_support_to_tenant('o@teste-sup.invalid', t1);
    res := res || jsonb_build_object('t', 'NAO reaproveita login de outro escritorio como suporte', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'NAO reaproveita login de outro escritorio como suporte', 'ok', sqlerrm ilike '%outro escritorio%');
  end;

  -- ---------- a administradora tenta mexer no suporte ----------
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;

  begin
    update public.profiles set display_name = 'HACKEADO' where user_id = us;
    res := res || jsonb_build_object('t', 'admin NAO renomeia o suporte', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'admin NAO renomeia o suporte', 'ok', sqlerrm ilike '%suporte%');
  end;

  begin
    update public.profiles set role = 'client' where user_id = us;
    res := res || jsonb_build_object('t', 'admin NAO rebaixa o suporte para cliente', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'admin NAO rebaixa o suporte para cliente', 'ok', sqlerrm ilike '%suporte%');
  end;

  begin
    update public.profiles set allowed_modules = array['tarefas'] where user_id = us;
    res := res || jsonb_build_object('t', 'admin NAO limita os modulos do suporte', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'admin NAO limita os modulos do suporte', 'ok', sqlerrm ilike '%suporte%');
  end;

  begin
    update public.profiles set is_support = false where user_id = us;
    res := res || jsonb_build_object('t', 'admin NAO tira a protecao do suporte', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'admin NAO tira a protecao do suporte', 'ok', sqlerrm ilike '%suporte%');
  end;

  begin
    delete from public.profiles where user_id = us;
    res := res || jsonb_build_object('t', 'admin NAO apaga o suporte', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'admin NAO apaga o suporte', 'ok', sqlerrm ilike '%suporte%');
  end;

  begin
    update public.profiles set is_support = true where user_id = ua;
    res := res || jsonb_build_object('t', 'admin NAO se promove a suporte', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'admin NAO se promove a suporte', 'ok', sqlerrm ilike '%suporte%');
  end;

  begin
    update public.profiles set is_support = true where user_id = uc;
    res := res || jsonb_build_object('t', 'admin NAO promove a colega a suporte', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'admin NAO promove a colega a suporte', 'ok', sqlerrm ilike '%suporte%');
  end;

  -- o que DEVE continuar funcionando: editar uma colega comum
  begin
    update public.profiles set display_name = 'Colega editada' where user_id = uc;
    get diagnostics n = row_count;
    res := res || jsonb_build_object('t', 'admin continua editando colega comum', 'ok', n = 1);
  exception when others then
    res := res || jsonb_build_object('t', 'admin continua editando colega comum', 'ok', false);
  end;

  -- ---------- o proprio suporte ----------
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', us, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', us::text, true);
  set local role authenticated;

  begin
    update public.profiles set nickname = 'Suporte Edit' where user_id = us;
    get diagnostics n = row_count;
    res := res || jsonb_build_object('t', 'o proprio suporte edita o proprio perfil', 'ok', n = 1);
  exception when others then
    res := res || jsonb_build_object('t', 'o proprio suporte edita o proprio perfil', 'ok', false);
  end;

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
    update public.profiles set tenant_id = t2 where user_id = us;
    res := res || jsonb_build_object('t', 'suporte NAO muda de escritorio sozinho', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'suporte NAO muda de escritorio sozinho', 'ok', sqlerrm ilike '%suporte%');
  end;

  begin
    delete from public.profiles where user_id = us;
    res := res || jsonb_build_object('t', 'suporte NAO apaga o proprio perfil', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'suporte NAO apaga o proprio perfil', 'ok', sqlerrm ilike '%suporte%');
  end;

  -- ---------- criar suporte de dentro do sistema ----------
  reset role;
  delete from public.profiles where user_id = uc;   -- (dono do banco: libera o user_id para o teste)
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;

  begin
    insert into public.profiles (user_id, role, tenant_id, is_support) values (uc, 'admin', t1, true);
    res := res || jsonb_build_object('t', 'admin NAO cria perfil de suporte de dentro do sistema', 'ok', false);
  exception when others then
    res := res || jsonb_build_object('t', 'admin NAO cria perfil de suporte de dentro do sistema', 'ok', sqlerrm ilike '%suporte%');
  end;

  -- ---------- estado final do suporte + dono do banco ----------
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  select count(*) into n from public.profiles
   where user_id = us and is_support and role = 'admin' and tenant_id = t1 and display_name = 'Suporte SRJUR';
  res := res || jsonb_build_object('t', 'apos tudo isso o suporte continua intacto', 'ok', n = 1);

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
