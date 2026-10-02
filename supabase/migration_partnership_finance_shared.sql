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
