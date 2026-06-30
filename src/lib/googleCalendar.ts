import { supabase } from '@/integrations/supabase/client'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar`

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return `Bearer ${data.session?.access_token ?? ''}`
}

export async function connectGoogle(ownerType: 'user' | 'office', profileId: string | null) {
  const res = await fetch(`${FUNCTION_URL}/auth-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
    body: JSON.stringify({ owner_type: ownerType, profile_id: profileId, return_to: window.location.href }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Erro ao gerar URL de autorização')
  window.location.href = json.url
}

export async function disconnectGoogle(ownerType: 'user' | 'office', profileId: string | null) {
  const res = await fetch(`${FUNCTION_URL}/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
    body: JSON.stringify({ owner_type: ownerType, profile_id: profileId }),
  })
  if (!res.ok) throw new Error('Erro ao desconectar')
}

export interface SyncResult {
  owner_type: string
  email: string | null
  profile_id: string | null
  has_refresh_token: boolean
  pulled?: number
  pushed?: number
  removed?: number
  candidatesFound?: number
  totalTasksInRange?: number
  totalDeadlinesInRange?: number
  pushErrors?: { title: string; error: string }[]
  error?: string
}

export async function syncGoogleCalendar() {
  const res = await fetch(`${FUNCTION_URL}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Erro ao sincronizar')
  if (json.warning) throw new Error(json.warning)
  return json.results as SyncResult[]
}
