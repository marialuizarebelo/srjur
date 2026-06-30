// Edge Function: google-calendar
// OAuth + sincronização de mão dupla com Google Agenda.
// Regra: TUDO que tem data (tarefas, compromissos, prazos) sincroniza,
// usando responsible_ids (vínculo real com profiles, não mais texto livre):
//   - 1 responsável  → agenda PESSOAL dessa pessoa
//   - 0 ou 2+ responsáveis → agenda do ESCRITÓRIO (evento compartilhado)
// Cada item pode sincronizar com mais de uma agenda ao mesmo tempo
// (rastreado em google_event_links, um vínculo por conexão).
//
// Deploy: cole em Supabase Dashboard → Edge Functions → New Function
// (nome da função: google-calendar). Lembre de desativar "Verify JWT".
//
// Secrets necessárias: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/google-calendar`

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

// ── OAuth: gera URL de autorização ──────────────────────────────────────
async function handleAuthUrl(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = await getCallerProfile(authHeader)
  if (caller?.role !== 'admin') return json({ error: 'Apenas administradoras' }, 403)

  const { owner_type, profile_id, return_to } = await req.json()
  const state = btoa(JSON.stringify({ owner_type, profile_id: profile_id ?? null, return_to }))

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${FUNCTION_URL}/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive email',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` })
}

// ── OAuth: callback do Google ─────────────────────────────────────────
async function handleCallback(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return new Response('Faltando code/state', { status: 400 })

  const { owner_type, profile_id, return_to } = JSON.parse(atob(state))

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `${FUNCTION_URL}/callback`,
      grant_type: 'authorization_code',
    }),
  })
  const tokens = await tokenRes.json()
  if (!tokenRes.ok) return new Response(`Erro ao trocar token: ${JSON.stringify(tokens)}`, { status: 400 })

  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const userInfo = await userInfoRes.json()
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  // Não usamos upsert com onConflict aqui porque profile_id=NULL (caso "office")
  // quebra a comparação de unicidade do Postgres (NULL nunca é igual a NULL).
  // Em vez disso, apagamos qualquer conexão existente e inserimos uma nova.
  let delQ = adminClient.from('google_calendar_connections').delete().eq('owner_type', owner_type)
  delQ = owner_type === 'office' ? delQ.is('profile_id', null) : delQ.eq('profile_id', profile_id)
  await delQ

  await adminClient.from('google_calendar_connections').insert({
    owner_type,
    profile_id: owner_type === 'office' ? null : profile_id,
    google_email: userInfo.email ?? null,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry: expiry,
    updated_at: new Date().toISOString(),
  })

  const redirectTo = return_to || `${SUPABASE_URL}`
  const sep = redirectTo.includes('?') ? '&' : '?'
  return Response.redirect(`${redirectTo}${sep}google=connected`, 302)
}

// ── Desconectar ──────────────────────────────────────────────────────────
async function handleDisconnect(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = await getCallerProfile(authHeader)
  if (caller?.role !== 'admin') return json({ error: 'Apenas administradoras' }, 403)

  const { owner_type, profile_id } = await req.json()
  let q = adminClient.from('google_calendar_connections').delete().eq('owner_type', owner_type)
  q = owner_type === 'office' ? q.is('profile_id', null) : q.eq('profile_id', profile_id)
  await q
  return json({ success: true })
}

// ── Token refresh ──────────────────────────────────────────────────────
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

// ── Push de um item (task ou deadline) para uma conexão específica ──────
async function pushItem(conn: any, token: string, sourceTable: 'tasks' | 'deadlines', item: any) {
  const { data: link } = await adminClient.from('google_event_links').select('*')
    .eq('source_table', sourceTable).eq('source_id', item.id).eq('connection_id', conn.id).maybeSingle()

  const prefix = sourceTable === 'deadlines' ? '⚖️ Prazo: ' : ''
  const eventBody: any = {
    summary: `${prefix}${item.title}`,
    extendedProperties: { private: { srjur_id: item.id, srjur_table: sourceTable } },
  }
  if (sourceTable === 'tasks' && item.due_time) {
    // due_time pode vir como "HH:MM" ou "HH:MM:SS" do Postgres — normaliza para HH:MM:SS
    const hhmm = String(item.due_time).slice(0, 5)
    const startDate = new Date(`${item.due_date}T${hhmm}:00`)
    const endDate = new Date(startDate.getTime() + 30 * 60_000)
    const endHHMM = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
    eventBody.start = { dateTime: `${item.due_date}T${hhmm}:00`, timeZone: 'America/Sao_Paulo' }
    eventBody.end = { dateTime: `${item.due_date}T${endHHMM}:00`, timeZone: 'America/Sao_Paulo' }
  } else {
    eventBody.start = { date: item.due_date }
    eventBody.end = { date: item.due_date }
  }

  const method = link ? 'PATCH' : 'POST'
  const url = link
    ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendar_id)}/events/${link.google_event_id}`
    : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendar_id)}/events`

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(eventBody),
  })
  if (!res.ok) {
    const errBody = await res.text()
    return { ok: false, error: `${res.status} ${errBody.slice(0, 300)}`, title: item.title }
  }

  const created = await res.json()
  await adminClient.from('google_event_links').upsert({
    source_table: sourceTable, source_id: item.id, connection_id: conn.id,
    google_event_id: created.id, synced_at: new Date().toISOString(),
  }, { onConflict: 'source_table,source_id,connection_id' })
  return { ok: true }
}

// ── Sincronização (pull + push) de uma conexão ───────────────────────────
async function syncConnection(conn: any) {
  const token = await ensureFreshToken(conn)
  const timeMin = new Date(Date.now() - 7 * 86400_000)
  const timeMax = new Date(Date.now() + 180 * 86400_000)
  const dateMinStr = timeMin.toISOString().slice(0, 10)
  const dateMaxStr = timeMax.toISOString().slice(0, 10)

  // ── PULL: eventos do Google → tasks (compromissos) ──
  const listRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendar_id)}/events?` +
    new URLSearchParams({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), singleEvents: 'true', maxResults: '250' }),
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const list = await listRes.json()
  let pulled = 0

  if (list.items) {
    for (const ev of list.items) {
      if (ev.status === 'cancelled') continue
      if (ev.extendedProperties?.private?.srjur_id) continue // evento que o próprio SRJUR criou

      const { data: existingLink } = await adminClient.from('google_event_links')
        .select('source_id').eq('connection_id', conn.id).eq('google_event_id', ev.id).maybeSingle()

      const startDate = ev.start?.date ?? ev.start?.dateTime?.slice(0, 10)
      const startTime = ev.start?.dateTime ? ev.start.dateTime.slice(11, 16) : null
      if (!startDate) continue

      const payload = {
        title: ev.summary ?? '(sem título)',
        due_date: startDate,
        due_time: startTime,
        type: 'compromisso',
        responsible_ids: conn.owner_type === 'office' ? [] : [conn.profile_id],
        responsible: conn.owner_type === 'office' ? null : (conn.responsibleName ?? null),
        status: 'pendente',
      }

      let taskId = existingLink?.source_id
      if (taskId) {
        await adminClient.from('tasks').update(payload).eq('id', taskId)
      } else {
        const { data: created } = await adminClient.from('tasks').insert(payload).select().single()
        taskId = created?.id
        pulled++
      }
      if (taskId) {
        await adminClient.from('google_event_links').upsert({
          source_table: 'tasks', source_id: taskId, connection_id: conn.id,
          google_event_id: ev.id, synced_at: new Date().toISOString(),
        }, { onConflict: 'source_table,source_id,connection_id' })
      }
    }
  }

  // ── PUSH: tasks + deadlines → Google ──
  // Regra: 1 responsável → agenda pessoal dele; 0 ou 2+ → agenda do escritório.
  let pushed = 0

  const [{ data: allTasks }, { data: allDeadlines }] = await Promise.all([
    adminClient.from('tasks').select('*').neq('status', 'cancelada')
      .gte('due_date', dateMinStr).lte('due_date', dateMaxStr),
    adminClient.from('deadlines').select('*')
      .gte('due_date', dateMinStr).lte('due_date', dateMaxStr),
  ])

  function belongsToConnection(ids: string[] | null | undefined) {
    const list = ids ?? []
    if (conn.owner_type === 'office') return list.length !== 1
    return list.length === 1 && list[0] === conn.profile_id
  }

  const tasks = (allTasks ?? []).filter(t => belongsToConnection(t.responsible_ids))
  const deadlines = (allDeadlines ?? []).filter(d => belongsToConnection(d.responsible_ids))

  const pushErrors: { title: string; error: string }[] = []

  for (const t of tasks) {
    const r = await pushItem(conn, token, 'tasks', t)
    if (r.ok) pushed++
    else pushErrors.push({ title: r.title ?? t.title, error: r.error ?? 'erro desconhecido' })
  }
  for (const d of deadlines) {
    const r = await pushItem(conn, token, 'deadlines', d)
    if (r.ok) pushed++
    else pushErrors.push({ title: r.title ?? d.title, error: r.error ?? 'erro desconhecido' })
  }

  // ── CLEANUP: remove eventos que não pertencem mais a essa conexão ──
  // (ex: responsável foi trocado, item foi excluído, ou caiu fora do período)
  let removed = 0
  const { data: existingLinks } = await adminClient.from('google_event_links')
    .select('*').eq('connection_id', conn.id)

  for (const link of existingLinks ?? []) {
    const stillBelongs = link.source_table === 'tasks'
      ? tasks.some(t => t.id === link.source_id)
      : deadlines.some(d => d.id === link.source_id)
    if (stillBelongs) continue

    // Confere se o item ainda existe e se a falta de "pertencimento" é real
    // (não apenas porque saiu da janela de datas considerada)
    const { data: rec } = await adminClient.from(link.source_table)
      .select('responsible_ids').eq('id', link.source_id).maybeSingle()
    const shouldBeGone = !rec || !belongsToConnection(rec.responsible_ids)
    if (!shouldBeGone) continue

    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendar_id)}/events/${link.google_event_id}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    )
    await adminClient.from('google_event_links').delete().eq('id', link.id)
    removed++
  }

  await adminClient.from('google_calendar_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', conn.id)

  return {
    pulled, pushed, removed,
    candidatesFound: tasks.length + deadlines.length,
    pushErrors,
    totalTasksInRange: (allTasks ?? []).length,
    totalDeadlinesInRange: (allDeadlines ?? []).length,
  }
}

async function handleSync(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = await getCallerProfile(authHeader)
  if (!caller) return json({ error: 'Não autenticado' }, 401)

  const { data: connections } = await adminClient
    .from('google_calendar_connections').select('*, profiles(display_name)')

  if (!connections || connections.length === 0) {
    return json({ results: [], warning: 'Nenhuma conexão Google encontrada na tabela google_calendar_connections.' })
  }

  const results = []
  for (const conn of connections ?? []) {
    const base = {
      owner_type: conn.owner_type,
      email: conn.google_email,
      profile_id: conn.profile_id,
      has_refresh_token: !!conn.refresh_token,
    }
    try {
      if (!conn.refresh_token) {
        results.push({ ...base, error: 'Sem refresh_token salvo — reconecte essa agenda do zero (desconectar e conectar de novo).' })
        continue
      }
      const withName = { ...conn, responsibleName: (conn as any).profiles?.display_name }
      const r = await syncConnection(withName)
      results.push({ ...base, ...r })
    } catch (e) {
      results.push({ ...base, error: String(e) })
    }
  }
  return json({ results })
}

// ── Router ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/google-calendar/, '')

  try {
    if (path === '/callback' && req.method === 'GET') return await handleCallback(req)
    if (path === '/auth-url' && req.method === 'POST') return await handleAuthUrl(req)
    if (path === '/disconnect' && req.method === 'POST') return await handleDisconnect(req)
    if (path === '/sync' && req.method === 'POST') return await handleSync(req)
    return json({ error: 'Rota não encontrada: ' + path }, 404)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
