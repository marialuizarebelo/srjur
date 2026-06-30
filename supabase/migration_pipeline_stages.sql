-- Migration: criar tabela de etapas do pipeline (editáveis)
-- Rodar no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  value text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#8B5CF6',
  position integer NOT NULL DEFAULT 0,
  show_in_kanban boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_pipeline_stages" ON public.pipeline_stages FOR ALL USING (public.is_admin());

-- Remove a constraint antiga de status dos leads
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Inserir etapas padrão
INSERT INTO public.pipeline_stages (label, value, color, position, show_in_kanban) VALUES
  ('Novo Lead',              'novo',               '#8B5CF6', 1,  true),
  ('Atendimento Agendado',   'atendimento_agendado','#6366F1', 2,  true),
  ('Atendimento Realizado',  'atendimento',         '#3B82F6', 3,  true),
  ('Proposta Enviada',       'proposta_enviada',     '#F59E0B', 4,  true),
  ('Follow-up',             'followup',             '#EC4899', 5,  true),
  ('Negociação',            'negociacao',            '#F97316', 6,  true),
  ('Contrato Enviado',      'contrato_enviado',      '#14B8A6', 7,  true),
  ('Contrato Assinado',     'contrato_assinado',     '#10B981', 8,  true),
  ('Convertido',            'convertido',            '#22C55E', 9,  false),
  ('Perdido',               'perdido',               '#6B7280', 10, false)
ON CONFLICT (value) DO NOTHING;
