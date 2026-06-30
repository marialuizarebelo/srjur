-- ============================================
-- Permite que o cliente atualize a própria foto e dados de contato,
-- com histórico de alterações e notificação para o escritório.
-- Campos de identidade (e-mail, CPF/CNPJ) NÃO são editáveis pelo cliente
-- porque o e-mail é a chave de vínculo com a conta de login.
-- ============================================

-- 1. Foto de perfil — função restrita (não dá pra alterar role/outros campos)
CREATE OR REPLACE FUNCTION public.update_my_avatar(new_photo_url text)
RETURNS void AS $$
  UPDATE public.profiles SET photo_url = new_photo_url, updated_at = now() WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. Histórico de alterações cadastrais feitas pelo próprio cliente
CREATE TABLE IF NOT EXISTS public.client_field_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  changed_by text DEFAULT 'cliente',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.client_field_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_history" ON public.client_field_history FOR ALL USING (public.is_admin());
CREATE POLICY "client_read_own_history" ON public.client_field_history FOR SELECT USING (
  client_id = public.my_client_id()
);

-- 3. Função que atualiza dados de contato do próprio cliente, registrando
--    histórico e um evento em audit_log para o escritório ver.
--    Campos permitidos: phone, cep, street, address_number, complement,
--    neighborhood, city, state, profession
CREATE OR REPLACE FUNCTION public.update_my_client_info(updates jsonb)
RETURNS void AS $$
DECLARE
  cid uuid;
  allowed_fields text[] := ARRAY['phone','cep','street','address_number','complement','neighborhood','city','state','profession'];
  field text;
  old_val text;
  new_val text;
  changes jsonb := '{}'::jsonb;
BEGIN
  cid := public.my_client_id();
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado para o usuário autenticado';
  END IF;

  FOREACH field IN ARRAY allowed_fields LOOP
    IF updates ? field THEN
      EXECUTE format('SELECT %I::text FROM public.clients WHERE id = $1', field) INTO old_val USING cid;
      new_val := updates ->> field;
      IF old_val IS DISTINCT FROM new_val THEN
        EXECUTE format('UPDATE public.clients SET %I = $1 WHERE id = $2', field) USING new_val, cid;
        INSERT INTO public.client_field_history (client_id, field_name, old_value, new_value)
        VALUES (cid, field, old_val, new_val);
        changes := changes || jsonb_build_object(field, jsonb_build_object('de', old_val, 'para', new_val));
      END IF;
    END IF;
  END LOOP;

  IF changes <> '{}'::jsonb THEN
    INSERT INTO public.audit_log (user_id, action, table_name, record_id, details)
    VALUES (auth.uid(), 'cliente_atualizou_dados', 'clients', cid, changes);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
