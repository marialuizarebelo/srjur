-- Advogadas cadastradas para busca no DJEN
CREATE TABLE IF NOT EXISTS oab_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  numero_oab text NOT NULL,
  uf_oab text NOT NULL,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE oab_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON oab_config FOR ALL USING (public.is_admin());

-- Cache local das intimações puxadas do DJEN
CREATE TABLE IF NOT EXISTS intimacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  djen_id bigint UNIQUE NOT NULL,
  numero_processo text,
  numero_processo_mascara text,
  tribunal text,
  orgao text,
  tipo_comunicacao text,
  texto text,
  data_disponibilizacao date,
  link text,
  advogado_nome text,
  advogado_oab text,
  advogado_uf text,
  process_id uuid REFERENCES processes(id),
  deadline_id uuid REFERENCES deadlines(id),
  status text DEFAULT 'novo', -- novo | vinculado | ignorado
  created_at timestamptz DEFAULT now()
);

ALTER TABLE intimacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON intimacoes FOR ALL USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_intimacoes_data ON intimacoes(data_disponibilizacao DESC);
CREATE INDEX IF NOT EXISTS idx_intimacoes_processo ON intimacoes(numero_processo);
