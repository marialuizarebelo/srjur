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
CREATE POLICY "client_read_own" ON portal_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = portal_messages.client_id
        AND c.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
