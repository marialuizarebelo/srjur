-- Migration: suporte a parcelamento/mensalidade em finance_requests
-- Rodar no Supabase SQL Editor

ALTER TABLE public.finance_requests ADD COLUMN IF NOT EXISTS installments integer;
ALTER TABLE public.finance_requests ADD COLUMN IF NOT EXISTS recurrence text;
