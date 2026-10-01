-- Migration: suporte a parcelamento/mensalidade/cartão em finance_requests
-- Rodar no Supabase SQL Editor

ALTER TABLE public.finance_requests ADD COLUMN IF NOT EXISTS installments integer;
ALTER TABLE public.finance_requests ADD COLUMN IF NOT EXISTS recurrence text;
ALTER TABLE public.finance_requests ADD COLUMN IF NOT EXISTS card_fee_percent numeric;
