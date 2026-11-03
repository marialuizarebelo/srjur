-- Classe processual (campo do cadastro de processos, igual ao Basic)
alter table public.processes add column if not exists procedural_class text;
