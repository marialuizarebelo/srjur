// Edge Function: google-drive
// Reaproveita a conexão Google do ESCRITÓRIO (criada em google-calendar) para:
//   - fornecer um access_token temporário pro Google Picker (escolher pasta)
//   - criar pastas
//   - listar arquivos de uma pasta
//
// Pré-requisito: a conexão "office" precisa ter sido (re)autorizada já incluindo
// o escopo do Drive (https://www.googleapis.com/auth/drive). Se a pasta não
// aparecer / der erro de permissão, desconecte e reconecte a agenda do escritório.
//
// Deploy: cole em Supabase Dashboard → Edge Functions → New Function
// (nome da função: google-drive). Desative "Verify JWT".
// Usa as mesmas secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function getCallerProfile(authHeader: string) {
  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await callerClient.auth.getUser()
  if (!user) return null
  const { data: profile } = await adminClient.from('profiles').select('*').eq('user_id', user.id).maybeSingle()
  return profile
}

async function getOfficeConnection() {
  const { data } = await adminClient.from('google_calendar_connections')
    .select('*').eq('owner_type', 'office').maybeSingle()
  return data
}

async function ensureFreshToken(conn: any) {
  if (new Date(conn.token_expiry) > new Date(Date.now() + 60_000)) return conn.access_token

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error('Falha ao renovar token: ' + JSON.stringify(data))

  const expiry = new Date(Date.now() + data.expires_in * 1000).toISOString()
  await adminClient.from('google_calendar_connections').update({
    access_token: data.access_token, token_expiry: expiry,
  }).eq('id', conn.id)

  return data.access_token
}

async function requireAdminAndToken(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = await getCallerProfile(authHeader)
  if (caller?.role !== 'admin') throw new Error('Apenas administradoras')

  const conn = await getOfficeConnection()
  if (!conn || !conn.refresh_token) {
    throw new Error('Drive do escritório não conectado. Vá em Configurações → Escritório e conecte (ou reconecte) a Google Agenda do escritório.')
  }
  const token = await ensureFreshToken(conn)
  return token
}

// ── Token temporário pro Picker do navegador ────────────────────────────
async function handleToken(req: Request) {
  const token = await requireAdminAndToken(req)
  return json({ access_token: token })
}

// ── Criar pasta ──────────────────────────────────────────────────────────
async function handleCreateFolder(req: Request) {
  const token = await requireAdminAndToken(req)
  const { name, parent_id, color } = await req.json()
  if (!name) return json({ error: 'Nome é obrigatório' }, 400)

  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parent_id ? [parent_id] : undefined,
      folderColorRgb: color || undefined,
    }),
  })
  const data = await res.json()
  if (!res.ok) return json({ error: data.error?.message ?? 'Erro ao criar pasta' }, 400)

  return json({
    id: data.id,
    name: data.name,
    url: `https://drive.google.com/drive/folders/${data.id}`,
  })
}

// ── Renomear / recolorir pasta (ex: lead vira cliente) ──────────────────
async function handleUpdateFolder(req: Request) {
  const token = await requireAdminAndToken(req)
  const { folder_id, name, color } = await req.json()
  if (!folder_id) return json({ error: 'folder_id é obrigatório' }, 400)

  const body: Record<string, string> = {}
  if (name) body.name = name
  if (color) body.folderColorRgb = color

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folder_id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) return json({ error: data.error?.message ?? 'Erro ao atualizar pasta' }, 400)

  return json({ id: data.id, name: data.name })
}

// ── Listar arquivos de uma pasta ─────────────────────────────────────────
async function handleListFiles(req: Request) {
  const token = await requireAdminAndToken(req)
  const { folder_id } = await req.json()
  if (!folder_id) return json({ error: 'folder_id é obrigatório' }, 400)

  const params = new URLSearchParams({
    q: `'${folder_id}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size)',
    orderBy: 'folder,modifiedTime desc',
    pageSize: '100',
  })

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) return json({ error: data.error?.message ?? 'Erro ao listar arquivos' }, 400)

  return json({ files: data.files ?? [] })
}

// ── Router ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/google-drive/, '')

  try {
    if (path === '/token' && req.method === 'POST') return await handleToken(req)
    if (path === '/create-folder' && req.method === 'POST') return await handleCreateFolder(req)
    if (path === '/update-folder' && req.method === 'POST') return await handleUpdateFolder(req)
    if (path === '/list-files' && req.method === 'POST') return await handleListFiles(req)
    return json({ error: 'Rota não encontrada: ' + path }, 404)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
