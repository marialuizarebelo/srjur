-- Parcerias v2:
--  * A comissão passa a incidir sobre CATEGORIAS do financeiro (as mesmas do lançamento de receita),
--    escolhidas por parceiro e por vínculo — em vez de "inicial/mensalidade/tudo".
--  * Prazo para repassar o parceiro: N dias úteis (padrão 5) depois do recebimento; vira o vencimento
--    da despesa "Comissão de parceria".

alter table public.partners add column if not exists default_categories text[] not null default array['Honorários iniciais', 'Implementação'];
alter table public.partners add column if not exists payment_days integer not null default 5 check (payment_days >= 0 and payment_days <= 60);
alter table public.partner_clients add column if not exists categories text[] not null default array['Honorários iniciais', 'Implementação'];

-- migra o que já existia (a base antiga) para categorias
update public.partners set default_categories = case default_base
  when 'mensalidade' then array['Mensalidade']
  when 'tudo' then array['Honorários iniciais', 'Implementação', 'Mensalidade', 'Acordo', 'Consultoria', 'Êxito', 'Outros']
  else array['Honorários iniciais', 'Implementação'] end
  where exists (select 1 from information_schema.columns where table_name = 'partners' and column_name = 'default_base');
update public.partner_clients set categories = case base
  when 'mensalidade' then array['Mensalidade']
  when 'tudo' then array['Honorários iniciais', 'Implementação', 'Mensalidade', 'Acordo', 'Consultoria', 'Êxito', 'Outros']
  else array['Honorários iniciais', 'Implementação'] end
  where exists (select 1 from information_schema.columns where table_name = 'partner_clients' and column_name = 'base');

-- Domingo de Páscoa (algoritmo de Gauss/Meeus) — usado p/ Sexta-feira Santa
create or replace function public.easter_sunday(y int) returns date language plpgsql immutable as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mo int; da int;
begin
  a := y % 19; b := y / 100; c := y % 100; d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451; mo := (h + l - 7 * m + 114) / 31; da := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(y, mo, da);
end $$;

-- Dia útil = não é sábado/domingo nem feriado nacional (fixos + Sexta-feira Santa).
create or replace function public.is_business_day(d date) returns boolean language plpgsql immutable as $$
declare md text := to_char(d, 'MM-DD');
begin
  if extract(isodow from d) in (6, 7) then return false; end if;
  if md in ('01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25') then return false; end if;
  if md = '11-20' and extract(year from d) >= 2024 then return false; end if; -- Consciência Negra (nacional desde 2024)
  if d = public.easter_sunday(extract(year from d)::int) - 2 then return false; end if; -- Sexta-feira Santa
  return true;
end $$;

create or replace function public.add_business_days(d date, n int) returns date language plpgsql immutable as $$
declare r date := d; left_ int := n;
begin
  while left_ > 0 loop
    r := r + 1;
    if public.is_business_day(r) then left_ := left_ - 1; end if;
  end loop;
  return r;
end $$;

create or replace function public.partner_apply_receita(f public.finance)
returns void language plpgsql security definer set search_path = public as $$
declare
  l record;
  recv date;
  cat text := lower(btrim(coalesce(f.category, '')));
  base_ok boolean;
  v_amount numeric(12,2);
  v_id uuid;
  v_desc text;
  v_client text;
  v_due date;
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
      select id into v_id from partner_commissions where source_finance_id = f.id and link_id = l.id;
      if v_id is null then
        insert into partner_commissions (partner_id, link_id, client_id, source_finance_id, base_amount, pct, amount, received_at)
        values (l.partner_id, l.id, f.client_id, f.id, f.value, l.pct, v_amount, recv)
        returning id into v_id;
        v_desc := 'Comissão de parceria ' || trim(to_char(l.pct, 'FM990.##')) || '% — ' || l.partner_name || ' — ' || coalesce(v_client, 'cliente') || ' (' || coalesce(f.description, '') || ')';
        insert into finance (type, category, description, value, date, due_date, paid, nature, impacts_cash, origin, business_unit, refletir_metricas, intragrupo, partner_commission_id)
        values ('despesa', 'Comissão de parceria', v_desc, v_amount, recv, v_due, false, 'real', true, 'operacional', f.business_unit, true, false, v_id);
      else
        -- pagamento editado: atualiza a comissão enquanto o repasse ainda não foi pago
        if not exists (select 1 from finance e where e.partner_commission_id = v_id and coalesce(e.paid, false)) then
          update partner_commissions set base_amount = f.value, pct = l.pct, amount = v_amount, received_at = recv where id = v_id;
          update finance set value = v_amount, date = recv, due_date = v_due, business_unit = f.business_unit where partner_commission_id = v_id;
        end if;
      end if;
    end if;
  end loop;
end $$;

alter table public.partners drop column if exists default_base;
alter table public.partner_clients drop column if exists base;
