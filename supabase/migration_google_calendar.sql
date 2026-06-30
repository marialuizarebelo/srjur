-- Conexões com Google Agenda — uma por usuária + uma do escritório
CREATE TABLE IF NOT EXISTS public.google_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('user', 'office')),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_email text,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  calendar_id text DEFAULT 'primary',
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (owner_type, profile_id)
);

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_google_conn" ON public.google_calendar_connections FOR ALL USING (public.is_admin());

-- Rastreamento de sincronização nos eventos
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS google_event_id text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS google_synced_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS google_source boolean DEFAULT false;

ALTER TABLE public.deadlines ADD COLUMN IF NOT EXISTS google_event_id text;
ALTER TABLE public.deadlines ADD COLUMN IF NOT EXISTS google_synced_at timestamptz;
