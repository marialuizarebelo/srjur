-- Parceria Luiza/Giovanna: os lançamentos da categoria "Parceria" passam a ser
-- editáveis e excluíveis pelas DUAS (marcar como pago, editar, excluir), em vez de
-- só leitura para quem não aprovou. A exclusão fica registrada no histórico do cliente
-- (activity_log), feita pelo app.
drop policy if exists select_partnership_finance on public.finance;
drop policy if exists partnership_finance_shared on public.finance;
create policy partnership_finance_shared on public.finance
  for all
  using (
    is_admin() and category = 'Parceria'
    and tenant_id = any (array['f2523561-ba07-4ed3-b1aa-5a48765037fa'::uuid, '35d0ffbd-5ce6-48fb-bfdc-26d92160e5b4'::uuid])
  )
  with check (
    is_admin() and category = 'Parceria'
    and tenant_id = any (array['f2523561-ba07-4ed3-b1aa-5a48765037fa'::uuid, '35d0ffbd-5ce6-48fb-bfdc-26d92160e5b4'::uuid])
  );

-- Excluir um lançamento aprovado falhava (e o app não mostrava o erro): a solicitação
-- aprovada apontava pro lançamento por chave estrangeira sem ON DELETE. Agora, ao
-- excluir o lançamento, a solicitação só perde o vínculo (finance_id = null).
alter table public.finance_requests drop constraint if exists finance_requests_finance_id_fkey;
alter table public.finance_requests
  add constraint finance_requests_finance_id_fkey
  foreign key (finance_id) references public.finance(id) on delete set null;

-- Portal do cliente: precisa mostrar o valor CHEIO que o cliente paga (ex.: 500), não só
-- a fatia de quem aprovou (250). O app passa a gravar portal_value ao aprovar; aqui
-- preenchemos as solicitações já aprovadas (sem mudar o que está visível ou não no portal).
alter table public.finance add column if not exists portal_value numeric;
with req as (
  select r.finance_id, r.value, coalesce(r.installments,1) n, r.recurrence, r.payment_method, coalesce(r.card_fee_percent,0) fee
  from public.finance_requests r
  where r.status = 'aprovado' and r.client_id is not null and r.finance_id is not null
), occ as (
  select finance_id,
    case when payment_method = 'Cartão de Crédito' and n > 1 and recurrence is null then value * (1 - fee/100)
         when recurrence is not null and n > 1 then value
         else value / n end as total
  from req
)
update public.finance f set portal_value = o.total
from occ o join public.finance f0 on f0.id = o.finance_id
where f.category = 'Parceria' and f.portal_value is null
  and (f.id = o.finance_id or (f0.series_id is not null and f.series_id = f0.series_id));
