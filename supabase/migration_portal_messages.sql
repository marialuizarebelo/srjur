CREATE TABLE IF NOT EXISTS portal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  sent_by text,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "admin_all" ON portal_messages FOR ALL USING (public.is_admin());

-- Client: read only their own messages
-- Usa my_client_id() (SECURITY DEFINER, ver migration_fix_client_rls.sql) em vez de
-- consultar auth.users diretamente aqui: a role "authenticated" não tem GRANT nessa
-- tabela, e uma policy permissiva que erra na avaliação derruba a query inteira
-- (inclusive pra admins, que também passam pela policy "admin_all" via OR) — foi
-- assim que "Comunicar" ficava sempre mostrando "Nenhum comunicado" pra todo mundo.
CREATE POLICY "client_read_own" ON portal_messages
  FOR SELECT USING (
    client_id = public.my_client_id()
  );
