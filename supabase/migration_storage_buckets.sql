-- Buckets públicos para logo do escritório e fotos de perfil
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Qualquer um pode visualizar (bucket público)
CREATE POLICY "public_read_logos" ON storage.objects FOR SELECT USING (bucket_id = 'logos');
CREATE POLICY "public_read_avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

-- Só admins podem enviar/atualizar/excluir
CREATE POLICY "admin_write_logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'logos' AND public.is_admin());
CREATE POLICY "admin_update_logos" ON storage.objects FOR UPDATE USING (bucket_id = 'logos' AND public.is_admin());
CREATE POLICY "admin_delete_logos" ON storage.objects FOR DELETE USING (bucket_id = 'logos' AND public.is_admin());

CREATE POLICY "admin_write_avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND public.is_admin());
CREATE POLICY "admin_update_avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND public.is_admin());
CREATE POLICY "admin_delete_avatars" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND public.is_admin());
