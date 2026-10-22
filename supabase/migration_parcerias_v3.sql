-- Parcerias v3: histórico retroativo.
--  * Comissões antigas (já pagas por fora / lançadas à mão no financeiro) podem ser registradas só como
--    histórico: não criam despesa no financeiro e não são recalculadas.
--  * Criar/editar um vínculo NÃO gera mais comissão sobre pagamentos antigos automaticamente
--    (isso duplicaria repasses já feitos). O passado entra pelo registro retroativo.

alter table public.partner_commissions add column if not exists historical boolean not null default false;
alter table public.partner_commissions add column if not exists paid_at date;
alter table public.partner_commissions add column if not exists notes text;

drop trigger if exists partner_link_apply on public.partner_clients;

create or replace function public.partner_apply_receita(f public.finance)
returns void language plpgsql security definer set search_path = public as $$
declare
  l record;
  recv date;
  cat text := lower(btrim(coalesce(f.category, '')));
  base_ok boolean;
  v_amount numeric(12,2);
  v_id uuid;
  v_hist boolean;
  v_desc text;
  v_client text;
  v_due date;
begin
  if f.type <> 'receita' then return; end if;

  -- Pagamento desfeito: remove comissões ainda não pagas; as já pagas ficam sinalizadas. Histórico não é tocado.
  if not coalesce(f.paid, false) or f.client_id is null or coalesce(f.impacts_cash, true) = false or coalesce(f.intragrupo, false) then
    for v_id in select c.id from partner_commissions c where c.source_finance_id = f.id and not c.historical loop
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
    select pc.*, p.name as partner_name, p.status as partner_status, p.payment_days
    from partner_clients pc join partners p on p.id = pc.partner_id
    where pc.client_id = f.client_id
  loop
    base_ok := exists (select 1 from unnest(l.categories) x where lower(btrim(x)) = cat);
    if l.active and l.partner_status = 'ativo' and base_ok
       and recv >= l.valid_from and (l.valid_until is null or recv <= l.valid_until)
       and (l.process_id is null or l.process_id = f.process_id) then
      v_amount := round(f.value * l.pct / 100, 2);
      v_due := public.add_business_days(recv, l.payment_days);
      select id, historical into v_id, v_hist from partner_commissions where source_finance_id = f.id and link_id = l.id;
      if v_id is null then
        insert into partner_commissions (partner_id, link_id, client_id, source_finance_id, base_amount, pct, amount, received_at)
        values (l.partner_id, l.id, f.client_id, f.id, f.value, l.pct, v_amount, recv)
        returning id into v_id;
        v_desc := 'Comissão de parceria ' || trim(to_char(l.pct, 'FM990.##')) || '% — ' || l.partner_name || ' — ' || coalesce(v_client, 'cliente') || ' (' || coalesce(f.description, '') || ')';
        insert into finance (type, category, description, value, date, due_date, paid, nature, impacts_cash, origin, business_unit, refletir_metricas, intragrupo, partner_commission_id)
        values ('despesa', 'Comissão de parceria', v_desc, v_amount, recv, v_due, false, 'real', true, 'operacional', f.business_unit, true, false, v_id);
      elsif not v_hist then
        -- pagamento editado: atualiza a comissão enquanto o repasse ainda não foi pago
        if not exists (select 1 from finance e where e.partner_commission_id = v_id and coalesce(e.paid, false)) then
          update partner_commissions set base_amount = f.value, pct = l.pct, amount = v_amount, received_at = recv where id = v_id;
          update finance set value = v_amount, date = recv, due_date = v_due, business_unit = f.business_unit where partner_commission_id = v_id;
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
        where source_finance_id = old.id and not historical
          and exists (select 1 from finance e where e.partner_commission_id = partner_commissions.id and coalesce(e.paid, false));
      delete from finance where partner_commission_id in (
        select c.id from partner_commissions c where c.source_finance_id = old.id and not c.historical
          and not exists (select 1 from finance e where e.partner_commission_id = c.id and coalesce(e.paid, false)));
      delete from partner_commissions c where c.source_finance_id = old.id and not c.historical and not exists (select 1 from finance e where e.partner_commission_id = c.id);
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

