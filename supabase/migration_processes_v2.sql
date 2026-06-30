-- Migration: campos completos para processos
-- Rodar no Supabase SQL Editor

ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS access_key text;
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS cause_value numeric(12,2);
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS court_url text;
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS drive_url text;
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS tags text;
