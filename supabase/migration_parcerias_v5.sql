-- Parcerias v5: o vínculo cliente <-> parceiro pode valer só para uma empresa (advocacia | saas).
-- Serve para clientes das duas empresas (ex.: 10% sobre a advocacia e 20% sobre o sistema).
-- business_unit nulo = vale para qualquer empresa.
alter table public.partner_clients add column if not exists business_unit text check (business_unit in ('advocacia', 'saas'));
drop index if exists public.partner_clients_unique;
create unique index if not exists partner_clients_unique
  on public.partner_clients (partner_id, client_id, coalesce(process_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(business_unit, ''));

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
       and (l.process_id is null or l.process_id = f.process_id)
       and (l.business_unit is null or l.business_unit = case when f.business_unit = 'saas' then 'saas' else 'advocacia' end) then
      v_amount := round(f.value * l.pct / 100, 2);
      v_due := public.add_business_days(recv, l.payment_days);
      select id, historical into v_id, v_hist from partner_commissions where source_finance_id = f.id and link_id = l.id;
      if v_id is null then
        insert into partner_commissions (partner_id, link_id, client_id, source_finance_id, base_amount, pct, amount, received_at, business_unit)
        values (l.partner_id, l.id, f.client_id, f.id, f.value, l.pct, v_amount, recv, case when f.business_unit = 'saas' then 'saas' else 'advocacia' end)
        returning id into v_id;
        v_desc := 'Comissão de parceria ' || trim(to_char(l.pct, 'FM990.##')) || '% — ' || l.partner_name || ' — ' || coalesce(v_client, 'cliente') || ' (' || coalesce(f.description, '') || ')';
        insert into finance (type, category, description, value, date, due_date, paid, nature, impacts_cash, origin, business_unit, refletir_metricas, intragrupo, partner_commission_id)
        values ('despesa', 'Comissão de parceria', v_desc, v_amount, recv, v_due, false, 'real', true, 'operacional', f.business_unit, true, false, v_id);
      elsif not v_hist then
        -- pagamento editado: atualiza a comissão enquanto o repasse ainda não foi pago
        if not exists (select 1 from finance e where e.partner_commission_id = v_id and coalesce(e.paid, false)) then
          update partner_commissions set base_amount = f.value, pct = l.pct, amount = v_amount, received_at = recv, business_unit = case when f.business_unit = 'saas' then 'saas' else 'advocacia' end where id = v_id;
          update finance set value = v_amount, date = recv, due_date = v_due, business_unit = f.business_unit where partner_commission_id = v_id;
        end if;
      end if;
    end if;
  end loop;
end $$;

