-- ============================================================================
-- SRJUR -- excluir usuario (Configuracoes > Usuarios)
-- ============================================================================
-- Rode UMA VEZ no SQL Editor do projeto (pode repetir). Cria a funcao que desvincula o que a pessoa
-- cadastrou ("criado por" vira vazio; clientes, processos, tarefas e prazos CONTINUAM) e apaga o perfil.
-- So a Edge Function delete-team-user chama (service role): as conferencias de quem pode excluir ficam la.
-- ============================================================================
begin;

create or replace function public.remove_team_user(p_profile_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid; r record;
begin
  select user_id into v_user from public.profiles where id = p_profile_id;
  if v_user is null then raise exception 'perfil nao encontrado'; end if;

  -- tudo que aponta para este perfil e bloquearia a exclusao ("criado por" etc.) vira vazio
  for r in
    select c.conrelid::regclass::text as tabela, a.attname as coluna, a.attnotnull as obrigatorio
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and c.confdeltype in ('a', 'r')
  loop
    if r.obrigatorio then raise exception 'nao e possivel excluir: % exige este usuario em %', r.tabela, r.coluna; end if;
    execute format('update %s set %I = null where %I = $1', r.tabela, r.coluna, r.coluna) using p_profile_id;
  end loop;

  delete from public.profiles where id = p_profile_id;
  return v_user;
end;
$$;

revoke all on function public.remove_team_user(uuid) from public, anon, authenticated;
grant execute on function public.remove_team_user(uuid) to service_role;

commit;
