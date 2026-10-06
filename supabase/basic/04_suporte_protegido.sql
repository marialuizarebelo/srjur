-- ============================================================================
-- SRJUR BASIC -- login de suporte protegido (por escritorio)
-- ============================================================================
-- Rode UMA VEZ no SQL Editor (pode repetir sem risco). Depois, para colocar o
-- suporte em um escritorio, use a funcao do fim deste arquivo (veja "COMO USAR").
--
-- O que garante (no BANCO, nao so na tela):
--   - o perfil de suporte de um escritorio NAO pode ser editado, rebaixado,
--     movido de escritorio nem apagado por nenhum usuario do escritorio
--     (nem pelas administradoras, nem pela cliente);
--   - so o proprio suporte edita o proprio perfil (foto, apelido...), e mesmo
--     assim nunca muda papel, escritorio nem a marca de "suporte";
--   - ninguem, de dentro do sistema, consegue criar ou promover um suporte:
--     isso so se faz por aqui (SQL Editor / painel do Supabase);
--   - o dono do projeto (SQL Editor, painel, Edge Functions com service_role)
--     continua podendo mexer em tudo, porque la nao existe usuario logado.
--
-- Importante: um login (e-mail) pertence a UM escritorio so. Cada escritorio
-- tem o seu login de suporte, com e-mail proprio.
--
-- COMO USAR (um escritorio por vez), depois de criar o login em
-- Authentication > Users > Add user (Auto Confirm User) e de o escritorio
-- existir (03_novo_escritorio.sql):
--
--   select public.add_support_to_tenant(
--     'app@srjur.com',
--     (select id from public.tenants where slug = 'slug-do-escritorio')
--   );
--
-- Depois rode o 05_teste_suporte.sql: toda linha deve vir ok = true.
-- ============================================================================

begin;

alter table public.profiles add column if not exists is_support boolean not null default false;

-- ---------------------------------------------------------------------------
-- Trava: quem esta logado no sistema nunca mexe num perfil de suporte.
-- Fora do sistema (SQL Editor, painel, service_role) auth.uid() e nulo e passa.
-- ---------------------------------------------------------------------------
create or replace function public.protect_support_profile()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.is_support then
      raise exception 'Perfil de suporte so e criado pelo SRJUR, nao de dentro do sistema.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.is_support then
      raise exception 'O perfil de suporte SRJUR e protegido e nao pode ser removido.';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.is_support then
    if auth.uid() <> old.user_id then
      raise exception 'O perfil de suporte SRJUR e protegido: so o proprio suporte pode edita-lo.';
    end if;
    if new.is_support is distinct from old.is_support
       or new.tenant_id is distinct from old.tenant_id
       or new.role      is distinct from old.role
       or new.user_id   is distinct from old.user_id then
      raise exception 'O perfil de suporte SRJUR nao pode ter papel, escritorio ou protecao alterados.';
    end if;
  elsif new.is_support then
    raise exception 'Perfil de suporte so e definido pelo SRJUR, nao de dentro do sistema.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_support on public.profiles;
create trigger trg_protect_support
  before insert or update or delete on public.profiles
  for each row execute function public.protect_support_profile();

-- ---------------------------------------------------------------------------
-- Coloca um login existente como suporte protegido de um escritorio.
-- Recusa se o login ja pertence a OUTRO escritorio (nunca "rouba").
-- ---------------------------------------------------------------------------
create or replace function public.add_support_to_tenant(p_email text, p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid;
  v_atual uuid;
begin
  if not exists (select 1 from public.tenants where id = p_tenant) then
    raise exception 'Escritorio nao encontrado. Confira o slug.';
  end if;

  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'Login % nao encontrado. Crie em Authentication > Users > Add user (Auto Confirm User) e rode de novo.', p_email;
  end if;

  select tenant_id into v_atual from public.profiles where user_id = v_user;
  if v_atual is not null and v_atual <> p_tenant then
    raise exception 'O login % ja pertence a outro escritorio. Cada escritorio precisa do seu proprio login de suporte (e-mail diferente). Nada foi alterado.', p_email;
  end if;

  perform public.assign_user_to_tenant(p_email, p_tenant, 'admin');

  update public.profiles
     set is_support   = true,
         display_name = 'Suporte SRJUR',
         full_name    = 'Suporte SRJUR',
         nickname     = 'Suporte',
         role_title   = 'Suporte SRJUR'
   where user_id = v_user;
end;
$$;

revoke all on function public.add_support_to_tenant(text, uuid) from public, anon, authenticated;

commit;
