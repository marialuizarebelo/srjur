-- ============================================================================
-- SRJUR BASIC -- trocar o subdominio (slug) de um escritorio
-- ============================================================================
-- Edite so as duas linhas v_atual / v_novo. Recusa (e nao muda nada) se o slug
-- atual nao existir, se o novo ja estiver em uso ou se o novo for invalido.
do $$
declare
  v_atual text := 'mestremarcio';   -- slug de hoje (o que vem antes de .srjur.com)
  v_novo  text := 'charyeot';       -- slug novo (sem www, sem ponto)
begin
  if v_novo !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or v_novo in ('www', 'app') then
    raise exception 'slug novo invalido: %', v_novo;
  end if;
  if (select count(*) from public.tenants where slug = v_atual) <> 1 then
    raise exception 'slug atual "%" nao encontrado (veja a lista de escritorios).', v_atual;
  end if;
  if exists (select 1 from public.tenants where slug = v_novo) then
    raise exception 'slug "%" ja esta em uso por outro escritorio.', v_novo;
  end if;
  update public.tenants set slug = v_novo where slug = v_atual;
end $$;

select id, name, slug from public.tenants order by name;
