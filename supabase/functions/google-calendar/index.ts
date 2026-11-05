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
// Secret compartilhado com o job do pg_cron — autentica a chamada automática
// sem depender de um login de usuária (não existe usuária logada num cron).
const CRON_SECRET = Deno.env.get('CRON_SECRET')!
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
  let selQ = adminClient.from('google_calendar_connections').select('refresh_token').eq('owner_type', owner_type)
  selQ = owner_type === 'office' ? selQ.is('profile_id', null) : selQ.eq('profile_id', profile_id)
  const { data: existingRows } = await selQ.order('created_at', { ascending: false }).limit(1)
  const existing = existingRows?.[0] ?? null

  let delQ = adminClient.from('google_calendar_connections').delete().eq('owner_type', owner_type)
  delQ = owner_type === 'office' ? delQ.is('profile_id', null) : delQ.eq('profile_id', profile_id)
  await delQ

  // O Google só devolve refresh_token na primeira vez que a conta autoriza
  // este app (mesmo com prompt=consent, em alguns casos de reconexão ele
  // pode vir vazio) — se vier vazio aqui, mantemos o token antigo em vez de
  // sobrescrever com null, senão a reconexão "quebra" a sincronização.
  const refreshToken = tokens.refresh_token ?? existing?.refresh_token ?? null

  await adminClient.from('google_calendar_connections').insert({
    owner_type,
    profile_id: owner_type === 'office' ? null : profile_id,
    google_email: userInfo.email ?? null,
    access_token: tokens.access_token,
    refresh_token: refreshToken,
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

// ── Sincronização de verdade (dois sentidos) ─────────────────────────────
// Google → sistema: TODAS as agendas em que a pessoa pode escrever (principal, criadas por ela e compartilhadas
//   com edição) viram compromissos no sistema; mudanças e exclusões no Google chegam ao sistema.
// Sistema → Google: o que é criado no sistema vai para a agenda principal; mudanças e exclusões no sistema chegam
//   ao Google (inclusive nos eventos que vieram do Google).
// Cada lado só é escrito quando o outro mudou DEPOIS da última sincronização do item (synced_at).
const GCAL = 'https://www.googleapis.com/calendar/v3'
const SYNC_PAST_DAYS = 30
const SYNC_FUTURE_DAYS = 365
const MAX_GOOGLE_DELETES_PER_RUN = 25

const gh = (token: string) => ({ Authorization: `Bearer ${token}` })
const after = (a?: string | null, b?: string | null) => !!a && !!b && new Date(a).getTime() > new Date(b).getTime()

async function listWritableCalendars(token: string) {
  const cals: { id: string; summary: string; primary: boolean }[] = []
  let pageToken = ''
  do {
    const r = await fetch(`${GCAL}/users/me/calendarList?minAccessRole=writer&maxResults=250${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: gh(token) })
    if (!r.ok) throw new Error('Falha ao listar as agendas do Google: ' + (await r.text()).slice(0, 200))
    const j = await r.json()
    for (const c of j.items ?? []) cals.push({ id: c.id, summary: c.summary ?? c.id, primary: !!c.primary })
    pageToken = j.nextPageToken ?? ''
  } while (pageToken)
  return cals
}

// null = não foi possível ler esta agenda agora (nada deve ser apagado por causa disso)
async function listEvents(token: string, calId: string, timeMin: string, timeMax: string) {
  const items: any[] = []
  let pageToken = ''
  do {
    const r = await fetch(`${GCAL}/calendars/${encodeURIComponent(calId)}/events?` + new URLSearchParams({
      timeMin, timeMax, singleEvents: 'true', maxResults: '250', ...(pageToken ? { pageToken } : {}),
    }), { headers: gh(token) })
    if (!r.ok) return null
    const j = await r.json()
    items.push(...(j.items ?? []))
    pageToken = j.nextPageToken ?? ''
  } while (pageToken)
  return items
}

function eventToFields(ev: any) {
  const startDate: string | null = ev.start?.date ?? ev.start?.dateTime?.slice(0, 10) ?? null
  const startTime: string | null = ev.start?.dateTime ? ev.start.dateTime.slice(11, 16) : null
  let endDate: string | null = null
  let endTime: string | null = null
  if (ev.end?.dateTime) {
    endTime = ev.end.dateTime.slice(11, 16)
    const e = ev.end.dateTime.slice(0, 10)
    if (e !== startDate) endDate = e
  } else if (ev.end?.date && startDate) {
    const d = new Date(`${ev.end.date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 1) // no Google o fim de um evento de dia inteiro é exclusivo
    const e = d.toISOString().slice(0, 10)
    if (e > startDate) endDate = e
  }
  return { startDate, startTime, endDate, endTime }
}

// ── Push de um item (task ou deadline) criado no sistema ─────────────────
async function pushItem(conn: any, token: string, sourceTable: 'tasks' | 'deadlines', item: any, link: any | null) {
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

  const calId = link?.calendar_id ?? conn.calendar_id
  const method = link ? 'PATCH' : 'POST'
  const url = link
    ? `${GCAL}/calendars/${encodeURIComponent(calId)}/events/${link.google_event_id}`
    : `${GCAL}/calendars/${encodeURIComponent(conn.calendar_id)}/events`

  const res = await fetch(url, {
    method,
    headers: { ...gh(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(eventBody),
  })
  if (!res.ok) {
    // 404/410 num PATCH = a usuária excluiu o evento direto no Google. Isso conta como "resolvido" pra ela —
    // tratamos como concluído/cumprido no sistema também, em vez de recriar o evento do zero.
    if (method === 'PATCH' && (res.status === 404 || res.status === 410)) {
      await adminClient.from(sourceTable)
        .update({ status: sourceTable === 'tasks' ? 'concluida' : 'cumprido' })
        .eq('id', item.id)
      await adminClient.from('google_event_links').delete()
        .eq('source_table', sourceTable).eq('source_id', item.id).eq('connection_id', conn.id)
      return { ok: true, autoCompleted: true }
    }
    const errBody = await res.text()
    return { ok: false, error: `${res.status} ${errBody.slice(0, 300)}`, title: item.title }
  }

  const created = await res.json()
  const { error } = await adminClient.from('google_event_links').upsert({
    source_table: sourceTable, source_id: item.id, connection_id: conn.id,
    google_event_id: created.id, calendar_id: calId, synced_at: new Date().toISOString(), origin: 'push',
  }, { onConflict: 'source_table,source_id,connection_id' })
  if (error) return { ok: false, error: 'Evento criado no Google, mas o vínculo não foi salvo: ' + error.message, title: item.title }
  return { ok: true }
}

// ── Sincronização (pull + push) de uma conexão ───────────────────────────
async function syncConnection(conn: any) {
  const token = await ensureFreshToken(conn)
  const nowIso = () => new Date().toISOString()
  const timeMin = new Date(Date.now() - SYNC_PAST_DAYS * 86400_000)
  const timeMax = new Date(Date.now() + SYNC_FUTURE_DAYS * 86400_000)
  const dateMinStr = timeMin.toISOString().slice(0, 10)
  const dateMaxStr = timeMax.toISOString().slice(0, 10)

  const stats = { pulled: 0, updatedFromGoogle: 0, deletedInSystem: 0, pushed: 0, pushedBack: 0, removed: 0, deletedInGoogle: 0 }
  const errors: { title: string; error: string }[] = []

  // Todos os vínculos do escritório (qualquer conexão): um evento do Google vira UM item, mesmo que a mesma conta
  // esteja ligada como "escritório" e como "pessoal".
  const { data: allLinksData } = await adminClient.from('google_event_links').select('*')
  const allLinks: any[] = allLinksData ?? []
  const linkByEvent = new Map<string, any>()   // `${agenda}|${evento}` → vínculo (itens que vieram do Google)
  const linkByGoogleId = new Map<string, any>() // `${conexão}|${evento}` → vínculo (itens criados no sistema)
  for (const l of allLinks) {
    if (l.origin === 'pull' && l.calendar_id) linkByEvent.set(`${l.calendar_id}|${l.google_event_id}`, l)
    linkByGoogleId.set(`${l.connection_id}|${l.google_event_id}`, l)
  }
  const pulledIds = new Set(allLinks.filter(l => l.origin === 'pull').map(l => l.source_id))

  // Itens do sistema que existem (para saber o que foi apagado no sistema)
  async function loadByIds(table: 'tasks' | 'deadlines', ids: string[]) {
    const out = new Map<string, any>()
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await adminClient.from(table).select('*').in('id', ids.slice(i, i + 150))
      if (error) return null
      for (const r of data ?? []) out.set(r.id, r)
    }
    return out
  }
  const myLinks = allLinks.filter(l => l.connection_id === conn.id)
  const taskMap = await loadByIds('tasks', [...new Set(myLinks.filter(l => l.source_table === 'tasks').map(l => l.source_id))])
  const deadlineMap = await loadByIds('deadlines', [...new Set(myLinks.filter(l => l.source_table === 'deadlines').map(l => l.source_id))])
  const mapsOk = taskMap !== null && deadlineMap !== null

  // ── PULL: TODAS as agendas editáveis do Google → compromissos ──
  const calendars = await listWritableCalendars(token)
  const seen = new Map<string, Set<string>>() // agenda → ids de evento vistos
  const calendarNames: string[] = []

  for (const cal of calendars) {
    const items = await listEvents(token, cal.id, timeMin.toISOString(), timeMax.toISOString())
    if (items === null) { errors.push({ title: `Agenda "${cal.summary}"`, error: 'não foi possível ler agora' }); continue }
    calendarNames.push(cal.summary)
    const ids = new Set<string>()
    seen.set(cal.id, ids)

    for (const ev of items) {
      if (ev.status === 'cancelled') continue
      const f = eventToFields(ev)
      if (!f.startDate) continue
      const own = ev.extendedProperties?.private
      if (own?.srjur_id) {
        // Evento criado a partir do sistema: se mudou no Google depois do último envio, a mudança volta para o sistema.
        const link = linkByGoogleId.get(`${conn.id}|${ev.id}`)
        if (!link || !mapsOk) continue
        const rec = (link.source_table === 'tasks' ? taskMap : deadlineMap)!.get(link.source_id)
        if (!rec) continue
        const googleChanged = after(ev.updated, link.synced_at)
        const systemChanged = after(rec.updated_at, link.synced_at)
        if (googleChanged && !(systemChanged && after(rec.updated_at, ev.updated))) {
          const title = link.source_table === 'deadlines' ? String(ev.summary ?? rec.title).replace(/^⚖️ Prazo: /, '') : (ev.summary ?? rec.title)
          const patch: any = { title, due_date: f.startDate }
          if (link.source_table === 'tasks') patch.due_time = f.startTime
          const { error } = await adminClient.from(link.source_table).update(patch).eq('id', link.source_id)
          if (!error) {
            await adminClient.from('google_event_links').update({ synced_at: nowIso() }).eq('id', link.id)
            link.synced_at = nowIso(); stats.updatedFromGoogle++
          }
        }
        continue
      }

      ids.add(ev.id)
      const key = `${cal.id}|${ev.id}`
      const link = linkByEvent.get(key)
      if (!link) {
        const { data: created, error } = await adminClient.from('tasks').insert({
          title: ev.summary ?? '(sem título)',
          description: ev.description ?? null,
          due_date: f.startDate, due_time: f.startTime, end_date: f.endDate, end_time: f.endTime,
          type: 'compromisso', status: 'pendente',
          link: ev.htmlLink ?? null,
          responsible_ids: conn.owner_type === 'office' ? [] : [conn.profile_id],
          responsible: conn.owner_type === 'office' ? null : (conn.responsibleName ?? null),
        }).select().single()
        if (error || !created) { errors.push({ title: ev.summary ?? '(sem título)', error: error?.message ?? 'não foi possível criar o compromisso' }); continue }
        const nl = {
          source_table: 'tasks', source_id: created.id, connection_id: conn.id,
          google_event_id: ev.id, calendar_id: cal.id, synced_at: nowIso(), origin: 'pull',
        }
        await adminClient.from('google_event_links').upsert(nl, { onConflict: 'source_table,source_id,connection_id' })
        linkByEvent.set(key, nl); pulledIds.add(created.id); taskMap?.set(created.id, created)
        stats.pulled++
        continue
      }
      // Já existe: só a conexão dona do vínculo cuida dele.
      if (link.connection_id !== conn.id || !mapsOk) continue
      const task = taskMap!.get(link.source_id)
      if (!task) continue // apagado no sistema: tratado mais abaixo
      const googleChanged = after(ev.updated, link.synced_at)
      const systemChanged = after(task.updated_at, link.synced_at)
      if (googleChanged && !(systemChanged && after(task.updated_at, ev.updated))) {
        const { error } = await adminClient.from('tasks').update({
          title: ev.summary ?? '(sem título)', due_date: f.startDate, due_time: f.startTime, end_date: f.endDate, end_time: f.endTime,
        }).eq('id', task.id)
        if (!error) {
          await adminClient.from('google_event_links').update({ synced_at: nowIso() }).eq('id', link.id)
          link.synced_at = nowIso(); stats.updatedFromGoogle++
        }
      }
    }
  }

  // ── Itens que vieram do Google ──
  let googleDeletes = 0
  for (const link of myLinks.filter(l => l.origin === 'pull')) {
    if (!mapsOk) break
    const task = taskMap!.get(link.source_id)
    const calSeen = seen.get(link.calendar_id)
    if (!task) {
      // Apagado no sistema → apaga também no Google (vai para a lixeira do Google por 30 dias).
      if (googleDeletes >= MAX_GOOGLE_DELETES_PER_RUN) continue
      const r = await fetch(`${GCAL}/calendars/${encodeURIComponent(link.calendar_id)}/events/${link.google_event_id}`, { method: 'DELETE', headers: gh(token) })
      if (r.ok || r.status === 404 || r.status === 410) {
        await adminClient.from('google_event_links').delete().eq('id', link.id)
        googleDeletes++; stats.deletedInGoogle++
      }
      continue
    }
    if (!calSeen) continue // agenda não lida agora: não mexe
    if (!calSeen.has(link.google_event_id)) {
      // Sumiu do Google (dentro do período lido) → apaga no sistema.
      if (task.due_date < dateMinStr || task.due_date > dateMaxStr) continue
      await adminClient.from('tasks').delete().eq('id', task.id)
      await adminClient.from('google_event_links').delete().eq('id', link.id)
      stats.deletedInSystem++
      continue
    }
    // Mudou no sistema depois da última sincronização → volta para o Google (mantendo a duração do evento).
    if (after(task.updated_at, link.synced_at) && task.status !== 'concluida' && task.status !== 'cancelada') {
      const evUrl = `${GCAL}/calendars/${encodeURIComponent(link.calendar_id)}/events/${link.google_event_id}`
      const cur = await fetch(evUrl, { headers: gh(token) })
      if (!cur.ok) continue
      const ev = await cur.json()
      const patch: any = { summary: task.title }
      if (ev.start?.dateTime && task.due_time) {
        const oldStart = new Date(ev.start.dateTime).getTime()
        const oldEnd = new Date(ev.end?.dateTime ?? ev.start.dateTime).getTime()
        const dur = Math.max(oldEnd - oldStart, 15 * 60_000)
        const hhmm = String(task.due_time).slice(0, 5)
        const start = new Date(`${task.due_date}T${hhmm}:00-03:00`)
        const end = new Date(start.getTime() + dur)
        patch.start = { dateTime: `${task.due_date}T${hhmm}:00-03:00`, timeZone: 'America/Sao_Paulo' }
        patch.end = { dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo' }
      } else if (ev.start?.date) {
        const span = Math.max(1, Math.round((new Date(ev.end?.date ?? ev.start.date).getTime() - new Date(ev.start.date).getTime()) / 86400_000))
        const endD = new Date(`${task.due_date}T00:00:00Z`); endD.setUTCDate(endD.getUTCDate() + span)
        patch.start = { date: task.due_date }
        patch.end = { date: endD.toISOString().slice(0, 10) }
      }
      const r = await fetch(evUrl, { method: 'PATCH', headers: { ...gh(token), 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      if (r.ok) {
        await adminClient.from('google_event_links').update({ synced_at: nowIso() }).eq('id', link.id)
        stats.pushedBack++
      } else errors.push({ title: task.title, error: `${r.status} ${(await r.text()).slice(0, 200)}` })
    }
  }

  // ── PUSH: o que foi criado no sistema → Google ──
  // Regra: 1 responsável → agenda pessoal dele; 0 ou 2+ → agenda do escritório.
  // Tarefa concluída/cancelada ou prazo cumprido/perdido não entra mais como candidato — o CLEANUP abaixo apaga o evento.
  const [{ data: allTasks }, { data: allDeadlines }] = await Promise.all([
    adminClient.from('tasks').select('*').not('status', 'in', '(cancelada,concluida)')
      .gte('due_date', dateMinStr).lte('due_date', dateMaxStr),
    adminClient.from('deadlines').select('*').eq('status', 'pendente')
      .gte('due_date', dateMinStr).lte('due_date', dateMaxStr),
  ])

  function belongsToConnection(ids: string[] | null | undefined) {
    const list = ids ?? []
    if (conn.owner_type === 'office') return list.length !== 1
    return list.length === 1 && list[0] === conn.profile_id
  }

  const tasks = (allTasks ?? []).filter(t => !pulledIds.has(t.id) && belongsToConnection(t.responsible_ids))
  const deadlines = (allDeadlines ?? []).filter(d => belongsToConnection(d.responsible_ids))

  const pushLinkOf = (table: string, id: string) => myLinks.find(l => l.source_table === table && l.source_id === id && l.origin !== 'pull') ?? null
  for (const [table, list] of [['tasks', tasks], ['deadlines', deadlines]] as const) {
    for (const item of list) {
      const link = pushLinkOf(table, item.id)
      // Já enviado e sem mudança desde a última sincronização: não precisa mexer no Google.
      if (link && item.updated_at && !after(item.updated_at, link.synced_at)) continue
      const r = await pushItem(conn, token, table, item, link)
      if (r.ok) stats.pushed++
      else errors.push({ title: r.title ?? item.title, error: r.error ?? 'erro desconhecido' })
    }
  }

  // ── CLEANUP: remove eventos (criados pelo sistema) que não pertencem mais a essa conexão ──
  const { data: existingLinks } = await adminClient.from('google_event_links').select('*').eq('connection_id', conn.id)
  for (const link of (existingLinks ?? []).filter(l => l.origin !== 'pull')) {
    const stillBelongs = link.source_table === 'tasks'
      ? tasks.some(t => t.id === link.source_id)
      : deadlines.some(d => d.id === link.source_id)
    if (stillBelongs) continue

    // Confere se o item ainda existe e se a falta de "pertencimento" é real (não só porque saiu do período)
    const { data: rec } = await adminClient.from(link.source_table)
      .select('responsible_ids, status').eq('id', link.source_id).maybeSingle()
    const isDone = rec && (link.source_table === 'tasks'
      ? (rec.status === 'concluida' || rec.status === 'cancelada')
      : (rec.status === 'cumprido' || rec.status === 'perdido'))
    const shouldBeGone = !rec || isDone || !belongsToConnection(rec.responsible_ids)
    if (!shouldBeGone) continue

    await fetch(`${GCAL}/calendars/${encodeURIComponent(link.calendar_id ?? conn.calendar_id)}/events/${link.google_event_id}`, { method: 'DELETE', headers: gh(token) })
    await adminClient.from('google_event_links').delete().eq('id', link.id)
    stats.removed++
  }

  await adminClient.from('google_calendar_connections').update({ last_synced_at: nowIso() }).eq('id', conn.id)

  return {
    ...stats,
    calendars: calendarNames,
    candidatesFound: tasks.length + deadlines.length,
    pushErrors: errors,
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

// ── Sincronização automática (chamada pelo pg_cron, sem usuária logada) ──
// Roda pra TODAS as conexões do projeto (todos os tenants, se houver mais de
// um) — não tem "quem está pedindo" num cron, então não faz sentido filtrar
// por tenant_id como no /sync manual.
async function handleCronSync(req: Request) {
  const secret = req.headers.get('x-cron-secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) return json({ error: 'Não autorizado' }, 401)

  const { data: connections } = await adminClient
    .from('google_calendar_connections').select('*, profiles(display_name)')

  const results = []
  for (const conn of connections ?? []) {
    if (!conn.refresh_token) continue
    try {
      const withName = { ...conn, responsibleName: (conn as any).profiles?.display_name }
      const r = await syncConnection(withName)
      results.push({ owner_type: conn.owner_type, email: conn.google_email, ...r })
    } catch (e) {
      results.push({ owner_type: conn.owner_type, email: conn.google_email, error: String(e) })
    }
  }
  return json({ ranAt: new Date().toISOString(), results })
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
    if (path === '/cron-sync' && req.method === 'POST') return await handleCronSync(req)
    return json({ error: 'Rota não encontrada: ' + path }, 404)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
