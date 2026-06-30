-- Remove conexões duplicadas do escritório, mantendo só a mais recente
DELETE FROM public.google_calendar_connections a
USING public.google_calendar_connections b
WHERE a.owner_type = 'office'
  AND b.owner_type = 'office'
  AND a.profile_id IS NULL
  AND b.profile_id IS NULL
  AND a.created_at < b.created_at;

-- Confere quantas linhas restaram (deve mostrar só 1 para 'office')
SELECT id, owner_type, profile_id, google_email, created_at,
       (refresh_token IS NOT NULL) AS tem_refresh_token
FROM public.google_calendar_connections
ORDER BY owner_type, created_at;
