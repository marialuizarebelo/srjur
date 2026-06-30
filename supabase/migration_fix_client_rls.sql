-- Corrige as policies de cliente, que comparavam profiles.id = clients.id
-- (UUIDs não relacionados). Agora usamos o e-mail como elo entre o
-- usuário autenticado (auth.users) e o cadastro de cliente (clients).

CREATE OR REPLACE FUNCTION public.my_client_id()
RETURNS uuid AS $$
  SELECT c.id FROM public.clients c
  WHERE c.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- CLIENTS: cliente pode ver o próprio cadastro
DROP POLICY IF EXISTS "client_own_record" ON public.clients;
CREATE POLICY "client_own_record" ON public.clients FOR SELECT USING (
  id = public.my_client_id()
);

-- PROCESSES
DROP POLICY IF EXISTS "client_own_processes" ON public.processes;
CREATE POLICY "client_own_processes" ON public.processes FOR SELECT USING (
  portal_visible = true AND client_id = public.my_client_id()
);

-- PROCESS_UPDATES
DROP POLICY IF EXISTS "client_visible_updates" ON public.process_updates;
CREATE POLICY "client_visible_updates" ON public.process_updates FOR SELECT USING (
  portal_visible = true AND process_id IN (
    SELECT id FROM public.processes WHERE portal_visible = true AND client_id = public.my_client_id()
  )
);

-- FINANCE
DROP POLICY IF EXISTS "client_own_finance" ON public.finance;
CREATE POLICY "client_own_finance" ON public.finance FOR SELECT USING (
  portal_visible = true AND client_id = public.my_client_id()
);

-- DOCUMENTS
DROP POLICY IF EXISTS "client_own_documents" ON public.documents;
CREATE POLICY "client_own_documents" ON public.documents FOR SELECT USING (
  portal_visible = true AND client_id = public.my_client_id()
);

-- TASKS (compromissos visíveis no portal)
DROP POLICY IF EXISTS "client_own_tasks" ON public.tasks;
CREATE POLICY "client_own_tasks" ON public.tasks FOR SELECT USING (
  portal_visible = true AND client_id = public.my_client_id()
);

-- DEADLINES (prazos do processo do cliente)
DROP POLICY IF EXISTS "client_own_deadlines" ON public.deadlines;
CREATE POLICY "client_own_deadlines" ON public.deadlines FOR SELECT USING (
  portal_visible = true AND process_id IN (
    SELECT id FROM public.processes WHERE portal_visible = true AND client_id = public.my_client_id()
  )
);
