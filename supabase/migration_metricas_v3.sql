-- Fase 3 do módulo Métricas e Metas: dimensão "unidade de negócio"
-- (preparada no banco, ainda sem seletor nos formulários — Advocacia é o
-- valor implícito enquanto o campo estiver vazio), diário + checklist de
-- ações por meta, e anotações em gráfico. Só existe no projeto principal
-- (main).

alter table public.clients add column if not exists business_unit text;
alter table public.leads add column if not exists business_unit text;
alter table public.finance add column if not exists business_unit text;
alter table public.processes add column if not exists business_unit text;

alter table public.metas add column if not exists meta_pai_id uuid references public.metas(id) on delete set null;

create table if not exists public.meta_notas (
  id uuid primary key default gen_random_uuid(),
  meta_id uuid not null references public.metas(id) on delete cascade,
  texto text not null,
  created_at timestamptz default now()
);
alter table public.meta_notas enable row level security;
create policy "admin_all_meta_notas" on public.meta_notas for all using (is_admin());

create table if not exists public.meta_acoes (
  id uuid primary key default gen_random_uuid(),
  meta_id uuid not null references public.metas(id) on delete cascade,
  texto text not null,
  concluida boolean default false,
  created_at timestamptz default now()
);
alter table public.meta_acoes enable row level security;
create policy "admin_all_meta_acoes" on public.meta_acoes for all using (is_admin());

-- Anotações livres presas a um mês específico de um gráfico (ex: "campanha
-- de anúncios iniciada" em Comercial, ou "entrada de honorários de êxito
-- pontual" em Financeiro) -- pra explicar picos sem confundir com tendência.
create table if not exists public.metricas_notas (
  id uuid primary key default gen_random_uuid(),
  area text not null,   -- 'financeiro' | 'comercial'
  mes text not null,    -- 'YYYY-MM'
  texto text not null,
  created_at timestamptz default now()
);
alter table public.metricas_notas enable row level security;
create policy "admin_all_metricas_notas" on public.metricas_notas for all using (is_admin());
