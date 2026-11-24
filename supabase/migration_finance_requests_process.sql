-- Solicitações financeiras podem ser vinculadas a um processo.
-- process_title guarda o nome do processo para a outra parte (que pode não enxergar o processo) saber de qual se trata.
alter table public.finance_requests add column if not exists process_id uuid references public.processes(id) on delete set null;
alter table public.finance_requests add column if not exists process_title text;

-- A parcela-espelho (de quem pediu) passa a levar o processo escolhido na solicitação.
CREATE OR REPLACE FUNCTION public.mirror_partnership_rows(p_request_id uuid, p_copy_paid boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                                nature, tenant_id, portal_visible, paid, payment_date, portal_value, process_id)
    values (f.type, 'Parceria', f.description, round(total_occ * pct / 100, 2), f.date, f.due_date, f.client_id, f.payment_method,
            '[espelho:' || f.id || '] Parceria com ' || coalesce(approver_name, 'a outra parte') ||
              ' — valor total ' || to_char(r.value, 'FM999G999G990D00') || ', esta é a sua parte (' || pct || '%).',
            'Parceria com ' || coalesce(approver_name, 'a outra parte'), f.recurrence, f.installments, f.current_installment,
            mirror_series, f.card_fee_percent, f.nature, req_tenant, false,
            case when p_copy_paid then f.paid else false end, case when p_copy_paid then f.payment_date else null end,
            total_occ, r.process_id);
    n := n + 1;
  end loop;
  return n;
end;
$function$;
