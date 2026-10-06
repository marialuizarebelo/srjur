-- ============================================================================
-- SRJUR BASIC -- login de suporte protegido (por escritorio)
-- ============================================================================
-- Rode UMA VEZ no SQL Editor (pode repetir sem risco).
--
-- O que garante (no BANCO, nao so na tela):
--   - o perfil de suporte NAO pode ser editado, rebaixado, movido de
--     escritorio nem apagado por nenhum usuario de escritorio de cliente
--     (nem pelas administradoras, nem pela cliente);
--   - so o proprio suporte edita o proprio perfil (foto, apelido...), e mesmo
--     assim nunca muda papel, escritorio nem a marca de "suporte";
--   - ninguem, de dentro do sistema, consegue criar ou promover um suporte:
--     isso so se faz por aqui (SQL Editor / painel do Supabase);
--   - o dono do projeto (SQL Editor, painel, Edge Functions com service_role)
--     continua podendo mexer em tudo, porque la nao existe usuario logado.
--
-- O login de suporte (app@srjur.com) e UM so e vale em todos os escritorios:
-- veja o 06_suporte_em_todos_os_escritorios.sql, que deve ser rodado depois
-- deste. Aqui fica so a protecao do perfil dele.
--
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

commit;
