-- Parceria: cada uma passa a ter a SUA linha no próprio financeiro (valor da sua parte,
-- pago/pendente independentes). Antes só existia uma linha, na aprovadora, que a outra
-- enxergava por uma regra de leitura (então "marcar pago" de uma mexia na da outra).
--
-- A segunda linha é criada pelo BANCO quando a solicitação vira "aprovado" (trigger), então
-- funciona com qualquer versão do app aberta no navegador.

drop function if exists public.create_partner_finance_rows(uuid, jsonb);

-- Cria (se ainda não existir) a linha de quem PEDIU para cada linha lançada pela aprovadora.
-- p_copy_paid = true só no preenchimento do histórico (copia pago/data de pagamento).
create or replace function public.mirror_partnership_rows(p_request_id uuid, p_copy_paid boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.finance_requests;
  base public.finance;
  n integer := 0;
  total_occ numeric;
  pct numeric;
  parts int;
  approver_name text;
  mirror_series uuid;
  f public.finance;
  req_tenant uuid;
  partes uuid[] := array['f2523561-ba07-4ed3-b1aa-5a48765037fa'::uuid, '35d0ffbd-5ce6-48fb-bfdc-26d92160e5b4'::uuid];
begin
  select * into r from public.finance_requests where id = p_request_id;
  if not found or r.finance_id is null then return 0; end if;
  select * into base from public.finance where id = r.finance_id;
  if not found then return 0; end if;

  -- Solicitações antigas têm tenant_id padrão (da Luiza) mesmo quando pedidas pela Giovanna:
  -- quem pediu é identificado por created_by (profile do dono do escritório) quando possível.
  req_tenant := case when r.created_by = any(partes) then r.created_by else r.tenant_id end;
  if req_tenant = base.tenant_id then return 0; end if;
  pct := coalesce(r.giovanna_pct, 50);
  parts := coalesce(r.installments, 1);
  total_occ := case
    when r.payment_method = 'Cartão de Crédito' and parts > 1 and r.recurrence is null then r.value * (1 - coalesce(r.card_fee_percent, 0) / 100)
    when r.recurrence is not null and parts > 1 then r.value
    else r.value / parts end;
  select display_name into approver_name from public.profiles where id = base.tenant_id;
  mirror_series := case when base.series_id is not null then md5(r.id::text || 'espelho')::uuid else null end;

  for f in
    select * from public.finance x
    where x.tenant_id = base.tenant_id and x.category = 'Parceria'
      and (x.id = base.id or (base.series_id is not null and x.series_id = base.series_id))
    order by x.current_installment nulls first, x.due_date
  loop
    if exists (select 1 from public.finance m where m.tenant_id = req_tenant and m.notes like '%[espelho:' || f.id || ']%') then
      continue;
    end if;
    insert into public.finance (type, category, description, value, date, due_date, client_id, payment_method, notes,
                                responsible, recurrence, installments, current_installment, series_id, card_fee_percent,
                                nature, tenant_id, portal_visible, paid, payment_date)
    values (f.type, 'Parceria', f.description, round(total_occ * pct / 100, 2), f.date, f.due_date, f.client_id, f.payment_method,
            '[espelho:' || f.id || '] Parceria com ' || coalesce(approver_name, 'a outra parte') ||
              ' — valor total ' || to_char(r.value, 'FM999G999G990D00') || ', esta é a sua parte (' || pct || '%).',
            'Parceria com ' || coalesce(approver_name, 'a outra parte'), f.recurrence, f.installments, f.current_installment,
            mirror_series, f.card_fee_percent, f.nature, req_tenant, false,
            case when p_copy_paid then f.paid else false end, case when p_copy_paid then f.payment_date else null end);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.mirror_partnership_rows(uuid, boolean) from public;

create or replace function public.trg_mirror_partnership_on_approve()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.mirror_partnership_rows(new.id, false);
  return new;
end;
$$;
drop trigger if exists mirror_partnership_on_approve on public.finance_requests;
create trigger mirror_partnership_on_approve
  after update of status, finance_id on public.finance_requests
  for each row
  when (new.status = 'aprovado' and new.finance_id is not null)
  execute function public.trg_mirror_partnership_on_approve();

-- Histórico: cria a linha de quem pediu para as solicitações JÁ aprovadas (copia pago/data).
select public.mirror_partnership_rows(r.id, true)
from public.finance_requests r
where r.status = 'aprovado' and r.finance_id is not null;

-- Cada uma passa a enxergar/gerir só as SUAS linhas (a regra de leitura cruzada duplicaria os valores).
drop policy if exists partnership_finance_shared on public.finance;

-- A linha antiga "Entrada - Marcio" era visível pra Giovanna por responsible_ids (compartilhamento
-- da época em que ela era colaboradora). Agora ela tem a metade dela como linha própria.
update public.finance
set responsible_ids = array['f2523561-ba07-4ed3-b1aa-5a48765037fa'::uuid]
where id = 'd775ce5d-8089-4aeb-b7a0-95875a8ab52f'
  and tenant_id = 'f2523561-ba07-4ed3-b1aa-5a48765037fa';
