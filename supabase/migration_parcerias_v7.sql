-- Parcerias, v7: parceria em que NÓS indicamos clientes ao parceiro (nós recebemos a comissão), sozinha ou junto com a
-- de sempre (o parceiro nos indica clientes e nós pagamos comissão).
-- direction: 'paga' = pagamos comissão (como sempre foi); 'recebe' = recebemos comissão; 'ambos' = os dois sentidos.
-- As comissões que recebemos ficam numa tabela própria (partner_receivables), sem mexer nos gatilhos das que pagamos.

alter table public.partners add column if not exists direction text not null default 'paga';
alter table public.partners drop constraint if exists partners_direction_check;
alter table public.partners add constraint partners_direction_check check (direction in ('paga', 'recebe', 'ambos'));
-- % combinada sobre os honorários do parceiro, nas indicações que enviamos
alter table public.partners add column if not exists receive_pct numeric(5,2);

create table if not exists public.partner_receivables (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  client_name text,                       -- pessoa indicada que não é cliente cadastrado
  description text,                       -- serviço / processo indicado
  base_amount numeric(12,2),              -- honorários que o parceiro cobrou
  pct numeric(5,2),
  amount numeric(12,2) not null,          -- comissão combinada
  expected_at date,                       -- previsão de recebimento
  received_at date,                       -- data em que foi recebida (null = a receber)
  finance_id uuid references public.finance(id) on delete set null,  -- receita lançada no Financeiro ao receber
  business_unit text not null default 'advocacia' check (business_unit in ('advocacia', 'saas')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partner_receivables_partner_idx on public.partner_receivables (partner_id);

alter table public.partner_receivables enable row level security;
drop policy if exists admin_all_partner_receivables on public.partner_receivables;
create policy admin_all_partner_receivables on public.partner_receivables for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists partner_receivables_touch on public.partner_receivables;
create trigger partner_receivables_touch before update on public.partner_receivables for each row execute function public.partners_touch();
