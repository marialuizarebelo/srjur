-- ============================================================================
-- SRJUR BASIC -- entrega de um escritorio novo (cliente)
-- ============================================================================
-- Reutilizavel: a cada cliente novo, siga os 3 passos abaixo.
-- Pre-requisito: 01_multitenant.sql ja rodado (e 02_teste_isolamento.sql, ok).
--
-- PASSO 1 -- criar o login (painel do Supabase, nao e SQL):
--   Authentication > Users > Add user > Create new user
--   Preencha o e-mail e uma senha provisoria SIMPLES, e marque
--   "Auto Confirm User". (Nao precisa mandar e-mail de convite.)
--
-- PASSO 2 -- preencher o bloco "DADOS" aqui embaixo e rodar o script inteiro,
--   de uma vez so, no SQL Editor. Roda numa transacao: se algo falhar, nada
--   e aplicado. Pode rodar de novo com seguranca (reaproveita o escritorio
--   se o slug ja existir).
--
-- PASSO 3 -- conferir a tabela que aparece no fim e entrar com o login no
--   sistema para testar. Depois, orientar o cliente a trocar a senha no
--   primeiro acesso: Configuracoes > Seguranca > Alterar senha.
--
-- PASSO 4 -- dominio do cliente (<slug>.srjur.com). O codigo nao muda: ele usa
--   o endereco em que esta aberto. Sao so 3 configuracoes externas:
--   a) Vercel > projeto do Basic > Settings > Domains > Add: <slug>.srjur.com
--      (se o Basic nao for o ambiente "Production" do projeto, escolha
--      "Git Branch: basic" ao adicionar). A Vercel mostra o valor do CNAME.
--   b) Hostinger > DNS do srjur.com > novo registro CNAME: nome = <slug>,
--      destino = o valor que a Vercel mostrou. Aguardar propagar.
--   c) Supabase > Authentication > URL Configuration > Redirect URLs: incluir
--      https://<slug>.srjur.com/**   (ou uma vez so: https://*.srjur.com/**).
--      Sem isso o link do e-mail "Esqueceu a senha?" cai no endereco errado.
--
-- O que o script faz:
--   - cria o escritorio (tenant) com as etapas padrao copiadas do Demo;
--   - liga o login ao escritorio como administrador (acesso total);
--   - preenche o nome da pessoa no perfil;
--   - recusa se o login ja pertencer a OUTRO escritorio (nunca "rouba").
-- ============================================================================

create temp table if not exists _entrega (ordem serial, item text, valor text);
truncate _entrega;

do $$
declare
  -- ======================= DADOS (preencha) ================================
  v_escritorio text := 'NOME DO ESCRITORIO';      -- aparece no sistema, no login e nos PDFs
  v_slug       text := 'slug-do-escritorio';      -- so minusculas, numeros e hifen; nao repete
  v_email      text := 'email@do-cliente.com';    -- o MESMO e-mail criado no passo 1
  v_nome       text := 'Nome Completo da Pessoa'; -- nome completo (perfil)
  v_apelido    text := 'Apelido';                 -- como o sistema a chama no dia a dia
  -- =========================================================================
  v_tenant uuid;
  v_user   uuid;
  v_atual  uuid;
  v_role   text;
  n_pipe int; n_proc int; n_prazo int; n_office int;
begin
  -- Pre-requisitos: o 01_multitenant.sql precisa ter sido rodado.
  if to_regclass('public.tenants') is null
     or to_regprocedure('public.provision_tenant(text,text)') is null
     or to_regprocedure('public.assign_user_to_tenant(text,uuid,text)') is null then
    raise exception 'Rode primeiro o 01_multitenant.sql neste projeto (tenants/provision_tenant nao encontrados).';
  end if;

  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'slug invalido (%): use so minusculas, numeros e hifen', v_slug;
  end if;

  -- O login precisa existir (passo 1).
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'Login % nao encontrado. Faca o PASSO 1 (Authentication > Users > Add user) e rode de novo.', v_email;
  end if;

  select tenant_id into v_atual from public.profiles where user_id = v_user;

  -- Escritorio: reaproveita se o slug ja existe, senao cria.
  select id into v_tenant from public.tenants where slug = v_slug;
  if v_tenant is null then
    v_tenant := public.provision_tenant(v_escritorio, v_slug);
  end if;

  if v_atual is not null and v_atual <> v_tenant then
    raise exception 'O login % ja pertence a outro escritorio. Nada foi alterado.', v_email;
  end if;

  perform public.assign_user_to_tenant(v_email, v_tenant, 'admin');

  update public.profiles
     set display_name = v_apelido,
         full_name    = v_nome,
         nickname     = v_apelido
   where user_id = v_user;

  -- Conferencia: falha (e desfaz tudo) se algo nao ficou como esperado.
  select role into v_role from public.profiles where user_id = v_user and tenant_id = v_tenant;
  if v_role is distinct from 'admin' then
    raise exception 'Conferencia falhou: perfil nao ficou admin neste escritorio.';
  end if;
  select count(*) into n_pipe  from public.pipeline_stages where tenant_id = v_tenant;
  select count(*) into n_proc  from public.process_stages  where tenant_id = v_tenant;
  select count(*) into n_prazo from public.deadline_stages where tenant_id = v_tenant;
  select count(*) into n_office from public.office_settings where tenant_id = v_tenant;
  if n_office <> 1 then
    raise exception 'Conferencia falhou: esperava 1 linha de configuracoes do escritorio, achei %.', n_office;
  end if;

  insert into _entrega (item, valor) values
    ('escritorio',              v_escritorio),
    ('slug',                    v_slug),
    ('tenant_id',               v_tenant::text),
    ('login (e-mail)',          v_email),
    ('papel',                   v_role),
    ('etapas de leads/funil',   n_pipe::text),
    ('etapas de processos',     n_proc::text),
    ('etapas de prazos',        n_prazo::text),
    ('linhas de configuracao',  n_office::text);
end $$;

select item, valor from _entrega order by ordem;
