import { supabase } from '@/integrations/supabase/client'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive`

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return `Bearer ${data.session?.access_token ?? ''}`
}

async function call(path: string, body?: unknown) {
  const res = await fetch(`${FUNCTION_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Erro na integração com o Drive')
  return json
}

export async function getDriveAccessToken(): Promise<string> {
  const json = await call('/token')
  return json.access_token
}

export interface DriveFolder { id: string; name: string; url: string }

// Cores oficiais da paleta de pastas do Google Drive
export const DRIVE_COLOR_RED = '#fb4c2f'
export const DRIVE_COLOR_GREEN = '#b3dc6c' // verde-limão, igual ao padrão já usado nas pastas de clientes ativos

export async function createDriveFolder(name: string, parentId?: string | null, color?: string): Promise<DriveFolder> {
  return call('/create-folder', { name, parent_id: parentId || undefined, color })
}

export async function updateDriveFolder(folderId: string, updates: { name?: string; color?: string }) {
  return call('/update-folder', { folder_id: folderId, ...updates })
}

export interface DriveFile {
  id: string; name: string; mimeType: string
  webViewLink: string; iconLink: string; modifiedTime: string; size?: string
}

export async function listDriveFiles(folderId: string): Promise<DriveFile[]> {
  const json = await call('/list-files', { folder_id: folderId })
  return json.files ?? []
}
