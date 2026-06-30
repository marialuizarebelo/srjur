-- Migration: atualizar status possíveis de leads
-- Rodar no Supabase SQL Editor

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('novo', 'atendimento', 'proposta_enviada', 'followup', 'negociacao', 'contrato_enviado', 'contrato_assinado', 'convertido', 'perdido'));
