-- Módulo de Parcerias (só no SRJUR principal).
-- Parceiros que indicam clientes e têm direito a uma % do que o cliente paga.
--
-- Regras de negócio:
--  * A comissão só nasce quando o pagamento é RECEBIDO (finance.paid = true) e é calculada
--    sobre finance.value — que já é o valor líquido (o desconto da taxa de cartão já é aplicado
--    no lançamento).
--  * Base da comissão por vínculo: 'inicial' (honorários iniciais / implementação),
--    'mensalidade' ou 'tudo'. Padrão: inicial.
--  * Cada comissão vira um lançamento de DESPESA no financeiro ("Comissão de parceria"), que a
--    equipe marca como pago pelo próprio Financeiro. Ao marcar como pago, nasce o recibo.
--  * Só gera comissão de pagamentos recebidos a partir de partner_clients.valid_from
--    (padrão: a data em que o vínculo foi criado) — repasses antigos lançados à mão não duplicam.

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'pessoa' check (kind in ('pessoa', 'empresa', 'advogado')),
  document text,
  oab text,
  email text,
  phone text,
  pix_key text,
  bank_info text,
  notes text,
  status text not null default 'ativo' check (status in ('ativo', 'encerrado')),
  started_at date,
  drive_url text,
  client_id uuid references public.clients(id) on delete set null,
  -- regra padrão do parceiro (vem pré-selecionada no vínculo com cada cliente)
  default_pct numeric(5,2),
  default_base text not null default 'inicial' check (default_base in ('inicial', 'mensalidade', 'tudo')),
  valid_from date,
  valid_until date, -- null = vigência indeterminada
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_clients (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  process_id uuid references public.processes(id) on delete set null, -- opcional: vale só para este processo
  pct numeric(5,2) not null check (pct >= 0 and pct <= 100),
  base text not null default 'inicial' check (base in ('inicial', 'mensalidade', 'tudo')),
  valid_from date not null default current_date,
  valid_until date, -- null = indeterminado
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists partner_clients_unique
  on public.partner_clients (partner_id, client_id, coalesce(process_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists partner_clients_client_idx on public.partner_clients (client_id);

create table if not exists public.partner_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  link_id uuid references public.partner_clients(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  source_finance_id uuid references public.finance(id) on delete set null,
  base_amount numeric(12,2) not null,
  pct numeric(5,2) not null,
  amount numeric(12,2) not null,
  received_at date not null,
  needs_review boolean not null default false, -- o pagamento de origem foi estornado/apagado depois da comissão paga
  created_at timestamptz not null default now()
);
create unique index if not exists partner_commissions_source_link
  on public.partner_commissions (source_finance_id, link_id) where source_finance_id is not null and link_id is not null;
create index if not exists partner_commissions_partner_idx on public.partner_commissions (partner_id);

alter table public.finance add column if not exists partner_commission_id uuid references public.partner_commissions(id) on delete set null;
create unique index if not exists finance_partner_commission_uq on public.finance (partner_commission_id) where partner_commission_id is not null;

create sequence if not exists public.partner_receipt_seq;
create table if not exists public.partner_receipts (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  partner_id uuid not null references public.partners(id) on delete cascade,
  commission_id uuid references public.partner_commissions(id) on delete set null,
  finance_id uuid references public.finance(id) on delete set null,
  amount numeric(12,2) not null,
  paid_at date not null,
  snapshot jsonb not null default '{}'::jsonb,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists partner_receipts_commission_live
  on public.partner_receipts (commission_id) where voided_at is null;
create index if not exists partner_receipts_partner_idx on public.partner_receipts (partner_id);

-- RLS: só admin (equipe), como o resto do financeiro
alter table public.partners enable row level security;
alter table public.partner_clients enable row level security;
alter table public.partner_commissions enable row level security;
alter table public.partner_receipts enable row level security;
drop policy if exists admin_all_partners on public.partners;
drop policy if exists admin_all_partner_clients on public.partner_clients;
drop policy if exists admin_all_partner_commissions on public.partner_commissions;
drop policy if exists admin_all_partner_receipts on public.partner_receipts;
create policy admin_all_partners on public.partners for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_partner_clients on public.partner_clients for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_partner_commissions on public.partner_commissions for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_partner_receipts on public.partner_receipts for all using (public.is_admin()) with check (public.is_admin());

-- updated_at
create or replace function public.partners_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists partners_touch on public.partners;
create trigger partners_touch before update on public.partners for each row execute function public.partners_touch();
drop trigger if exists partner_clients_touch on public.partner_clients;
create trigger partner_clients_touch before update on public.partner_clients for each row execute function public.partners_touch();

-- ── Geração da comissão a partir de um pagamento recebido ──
create or replace function public.partner_apply_receita(f public.finance)
returns void language plpgsql security definer set search_path = public as $$
declare
  l record;
  recv date;
  cat text := lower(coalesce(f.category, ''));
  base_ok boolean;
  v_amount numeric(12,2);
  v_id uuid;
  v_desc text;
  v_partner text;
  v_client text;
begin
  if f.type <> 'receita' then return; end if;

  -- Pagamento desfeito: remove comissões ainda não pagas; as já pagas ficam sinalizadas
  if not coalesce(f.paid, false) or f.client_id is null or coalesce(f.impacts_cash, true) = false or coalesce(f.intragrupo, false) then
    for v_id in select c.id from partner_commissions c where c.source_finance_id = f.id loop
      if exists (select 1 from finance e where e.partner_commission_id = v_id and coalesce(e.paid, false)) then
        update partner_commissions set needs_review = true where id = v_id;
      else
        delete from finance where partner_commission_id = v_id;
        delete from partner_commissions where id = v_id;
      end if;
    end loop;
    return;
  end if;

  recv := coalesce(f.payment_date, f.date, current_date);
  select name into v_client from clients where id = f.client_id;

  for l in
    select pc.*, p.name as partner_name, p.status as partner_status
    from partner_clients pc join partners p on p.id = pc.partner_id
    where pc.client_id = f.client_id
  loop
    base_ok := case l.base
      when 'tudo' then true
      when 'mensalidade' then cat = 'mensalidade'
      else cat like 'honor%inic%'
    end;
    if l.active and l.partner_status = 'ativo' and base_ok
       and recv >= l.valid_from and (l.valid_until is null or recv <= l.valid_until)
       and (l.process_id is null or l.process_id = f.process_id) then
      v_amount := round(f.value * l.pct / 100, 2);
      select id into v_id from partner_commissions where source_finance_id = f.id and link_id = l.id;
      if v_id is null then
        insert into partner_commissions (partner_id, link_id, client_id, source_finance_id, base_amount, pct, amount, received_at)
        values (l.partner_id, l.id, f.client_id, f.id, f.value, l.pct, v_amount, recv)
        returning id into v_id;
        v_desc := 'Comissão de parceria ' || trim(to_char(l.pct, 'FM990.##')) || '% — ' || l.partner_name || ' — ' || coalesce(v_client, 'cliente') || ' (' || coalesce(f.description, '') || ')';
        insert into finance (type, category, description, value, date, paid, nature, impacts_cash, origin, business_unit, refletir_metricas, intragrupo, partner_commission_id)
        values ('despesa', 'Comissão de parceria', v_desc, v_amount, recv, false, 'real', true, 'operacional', f.business_unit, true, false, v_id);
      else
        -- pagamento editado: atualiza a comissão enquanto o repasse ainda não foi pago
        if not exists (select 1 from finance e where e.partner_commission_id = v_id and coalesce(e.paid, false)) then
          update partner_commissions set base_amount = f.value, pct = l.pct, amount = v_amount, received_at = recv where id = v_id;
          update finance set value = v_amount, date = recv, business_unit = f.business_unit where partner_commission_id = v_id;
        end if;
      end if;
    end if;
  end loop;
end $$;

create or replace function public.trg_finance_partner() returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_c partner_commissions%rowtype;
  v_p partners%rowtype;
  v_cl clients%rowtype;
  v_src finance%rowtype;
  v_office record;
begin
  if tg_op = 'DELETE' then
    if old.type = 'receita' then
      update partner_commissions set needs_review = true
        where source_finance_id = old.id
          and exists (select 1 from finance e where e.partner_commission_id = partner_commissions.id and coalesce(e.paid, false));
      delete from finance where partner_commission_id in (
        select c.id from partner_commissions c where c.source_finance_id = old.id
          and not exists (select 1 from finance e where e.partner_commission_id = c.id and coalesce(e.paid, false)));
      delete from partner_commissions c where c.source_finance_id = old.id and not exists (select 1 from finance e where e.partner_commission_id = c.id);
    end if;
    return old;
  end if;

  if new.type = 'receita' then
    perform partner_apply_receita(new);
  elsif new.type = 'despesa' and new.partner_commission_id is not null then
    -- repasse pago => recibo; repasse desfeito => anula o recibo
    if coalesce(new.paid, false) and not exists (select 1 from partner_receipts r where r.commission_id = new.partner_commission_id and r.voided_at is null) then
      select * into v_c from partner_commissions where id = new.partner_commission_id;
      if v_c.id is null then return new; end if;
      select * into v_p from partners where id = v_c.partner_id;
      select * into v_cl from clients where id = v_c.client_id;
      select * into v_src from finance where id = v_c.source_finance_id;
      select name, logo_url, primary_color into v_office from office_settings limit 1;
      insert into partner_receipts (number, partner_id, commission_id, finance_id, amount, paid_at, snapshot)
      values (
        'REC-' || to_char(coalesce(new.payment_date, current_date), 'YYYY') || '-' || lpad(nextval('partner_receipt_seq')::text, 4, '0'),
        v_c.partner_id, v_c.id, new.id, new.value, coalesce(new.payment_date, current_date),
        jsonb_build_object(
          'partner_name', v_p.name, 'partner_document', v_p.document, 'partner_oab', v_p.oab, 'partner_pix', v_p.pix_key,
          'client_name', v_cl.name, 'pct', v_c.pct, 'base_amount', v_c.base_amount, 'received_at', v_c.received_at,
          'source_description', v_src.description, 'business_unit', v_src.business_unit,
          'payment_method', new.payment_method,
          'office_name', v_office.name, 'office_logo', v_office.logo_url, 'office_color', v_office.primary_color
        ));
    elsif not coalesce(new.paid, false) then
      update partner_receipts set voided_at = now() where commission_id = new.partner_commission_id and voided_at is null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists finance_partner_ins on public.finance;
drop trigger if exists finance_partner_upd on public.finance;
drop trigger if exists finance_partner_del on public.finance;
create trigger finance_partner_ins after insert on public.finance for each row execute function public.trg_finance_partner();
create trigger finance_partner_upd after update on public.finance for each row execute function public.trg_finance_partner();
create trigger finance_partner_del before delete on public.finance for each row execute function public.trg_finance_partner();

-- Vínculo criado/alterado: reavalia os pagamentos já recebidos do cliente a partir de valid_from
create or replace function public.trg_partner_link() returns trigger language plpgsql security definer set search_path = public as $$
declare r finance%rowtype;
begin
  for r in select * from finance where client_id = new.client_id and type = 'receita' and paid = true loop
    perform partner_apply_receita(r);
  end loop;
  return new;
end $$;
drop trigger if exists partner_link_apply on public.partner_clients;
create trigger partner_link_apply after insert or update on public.partner_clients for each row execute function public.trg_partner_link();
