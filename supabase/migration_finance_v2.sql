-- Migration: adicionar campos novos na tabela finance
-- Rodar no Supabase SQL Editor

ALTER TABLE public.finance ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.finance ADD COLUMN IF NOT EXISTS installments integer;
ALTER TABLE public.finance ADD COLUMN IF NOT EXISTS current_installment integer;
ALTER TABLE public.finance ADD COLUMN IF NOT EXISTS recurrence text;
