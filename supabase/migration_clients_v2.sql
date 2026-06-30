-- Migration: campos completos para clientes
-- Rodar no Supabase SQL Editor

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS nationality text DEFAULT 'brasileira';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS marital_status text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS profession text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS rg_number text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS rg_issuer text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cep text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS address_number text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS complement text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS neighborhood text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS potential_value numeric(12,2);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS drive_url text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tags text;
