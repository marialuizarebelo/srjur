-- Metas do módulo de Métricas (financeiras e comerciais), com período
-- mensal/semestral/anual escolhido por meta. Só existe no projeto principal
-- (main) — não faz parte do esquema multi-tenant compartilhado.

create table if not exists public.metas (
  id uuid primary key default gen_random_uuid(),
  area text not null,       -- 'financeiro' | 'comercial'
  tipo text not null,       -- 'receita_minima' | 'despesa_maxima' | 'saldo_minimo' | 'novos_leads' | 'novos_clientes' | 'taxa_conversao'
  label text not null,
  valor_alvo numeric not null,
  periodo text not null,    -- 'mensal' | 'semestral' | 'anual'
  ano integer not null,
  mes integer,               -- 1-12, só quando periodo = 'mensal'
  semestre integer,          -- 1 ou 2, só quando periodo = 'semestral'
  categoria text,            -- filtro opcional (categoria financeira), só em receita_minima/despesa_maxima
  origem text,                -- filtro opcional (origem do lead), só em novos_leads
  prioridade text default 'media', -- 'baixa' | 'media' | 'alta'
  observacoes text,
  responsavel_id uuid,        -- profiles.id (opcional)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.metas enable row level security;

create policy "admin_all_metas" on public.metas for all using (is_admin());
