CREATE TABLE IF NOT EXISTS public.marketing_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  platform text DEFAULT 'Instagram', -- Instagram, LinkedIn, Facebook, Site, Outro
  content_type text DEFAULT 'Post', -- Post, Story, Reels, Artigo, Outro
  status text DEFAULT 'ideia' CHECK (status IN ('ideia', 'roteiro', 'producao', 'agendado', 'publicado')),
  scheduled_date date,
  scheduled_time time,
  caption text,
  reference_url text,
  drive_folder_id text,
  drive_url text,
  responsible_ids uuid[] DEFAULT '{}',
  tags text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.marketing_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_marketing" ON public.marketing_content FOR ALL USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_marketing_scheduled_date ON public.marketing_content(scheduled_date);
