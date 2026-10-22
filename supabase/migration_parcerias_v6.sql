-- Parcerias v6: recibo para comissão antiga (histórico). Ela não tem despesa no Financeiro, então o recibo
-- não nasce sozinho: a tela chama esta função, que emite o recibo com os dados congelados da comissão.
create or replace function public.partner_issue_receipt(p_commission uuid)
returns public.partner_receipts language plpgsql security definer set search_path = public as $$
declare
  v_c partner_commissions%rowtype;
  v_p partners%rowtype;
  v_cl clients%rowtype;
  v_src finance%rowtype;
  v_office record;
  v_existing partner_receipts%rowtype;
  v_row partner_receipts%rowtype;
  v_paid date;
begin
  if not public.is_admin() then raise exception 'sem permissão'; end if;
  select * into v_c from partner_commissions where id = p_commission;
  if v_c.id is null then raise exception 'comissão não encontrada'; end if;
  if not v_c.historical then raise exception 'o recibo das comissões do Financeiro é gerado ao marcar a despesa como paga'; end if;
  select * into v_existing from partner_receipts where commission_id = p_commission and voided_at is null;
  if v_existing.id is not null then return v_existing; end if;
  v_paid := coalesce(v_c.paid_at, current_date);
  select * into v_p from partners where id = v_c.partner_id;
  select * into v_cl from clients where id = v_c.client_id;
  if v_c.source_finance_id is not null then select * into v_src from finance where id = v_c.source_finance_id; end if;
  select name, logo_url, primary_color into v_office from office_settings limit 1;
  insert into partner_receipts (number, partner_id, commission_id, finance_id, amount, paid_at, snapshot)
  values (
    'REC-' || to_char(v_paid, 'YYYY') || '-' || lpad(nextval('partner_receipt_seq')::text, 4, '0'),
    v_c.partner_id, v_c.id, null, v_c.amount, v_paid,
    jsonb_build_object(
      'partner_name', v_p.name, 'partner_document', v_p.document, 'partner_oab', v_p.oab, 'partner_pix', v_p.pix_key,
      'client_name', v_cl.name, 'pct', v_c.pct, 'base_amount', v_c.base_amount, 'received_at', v_c.received_at,
      'source_description', coalesce(v_src.description, v_c.notes), 'business_unit', v_c.business_unit,
      'office_name', v_office.name, 'office_logo', v_office.logo_url, 'office_color', v_office.primary_color
    ))
  returning * into v_row;
  return v_row;
end $$;
grant execute on function public.partner_issue_receipt(uuid) to authenticated;
