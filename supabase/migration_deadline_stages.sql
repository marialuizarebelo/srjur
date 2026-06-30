-- Stages for Prazos kanban
CREATE TABLE IF NOT EXISTS deadline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text DEFAULT '#6B7280',
  position int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE deadline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON deadline_stages FOR ALL USING (public.is_admin());

INSERT INTO deadline_stages (name, color, position) VALUES
  ('Identificado', '#6B7280', 0),
  ('Em Análise', '#3B82F6', 1),
  ('Aguardando Peças', '#F59E0B', 2),
  ('Em Recurso', '#8B5CF6', 3),
  ('Aguardando Decisão', '#EF4444', 4),
  ('Encerrado', '#10B981', 5)
ON CONFLICT DO NOTHING;

ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES deadline_stages(id);
