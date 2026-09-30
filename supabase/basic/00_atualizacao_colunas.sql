-- ============================================================================
-- SRJUR BASIC -- atualiza o banco da demo para acompanhar o codigo atual
-- ============================================================================
-- Rode ANTES do 01_multitenant.sql. So ACRESCENTA colunas (IF NOT EXISTS):
-- nao apaga nem altera nada que ja existe, e pode rodar mais de uma vez.
--
-- Colunas que o codigo ja usa e o banco da demo ainda nao tinha:
--   leads.responsible_ids   -- varios responsaveis por lead
--   leads.first_contact_at  -- data do primeiro contato (CRM)
--   leads.referred_by       -- quem indicou
--   leads.referral_fee_pct  -- % de comissao de indicacao
--   leads.created_by        -- quem criou o lead (historico)
--   office_settings.default_lead_responsible_id -- responsavel padrao pelos
--                              follow-ups de lead (Configuracoes)
-- ============================================================================

begin;

alter table public.leads add column if not exists responsible_ids  uuid[] default '{}';
alter table public.leads add column if not exists first_contact_at date;
alter table public.leads add column if not exists referred_by      text;
alter table public.leads add column if not exists referral_fee_pct numeric;
alter table public.leads add column if not exists created_by       uuid references public.profiles(id) on delete set null;

alter table public.office_settings
  add column if not exists default_lead_responsible_id uuid references public.profiles(id) on delete set null;

commit;
