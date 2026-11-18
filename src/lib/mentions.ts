import { supabase } from '@/integrations/supabase/client'

// Menções (@nome) em comentários: ficam guardadas no próprio comentário (activity_log.mentions) e
// aparecem no sino e no painel inicial de quem foi mencionado, até a pessoa marcar como visto.
// O histórico guarda tudo: o que a pessoa recebeu (visto ou não) e o que ela mesma enviou.

export const firstName = (n: string | null | undefined) => (n ?? '').trim().split(/\s+/)[0] ?? ''

// Sem acento e sem diferenciar maiúsculas, para achar "João" digitando "joao"
export const normName = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const ENTIDADES: Record<string, { table: string; col: string; label: string; path: (id: string) => string }> = {
  task: { table: 'tasks', col: 'title', label: 'Tarefa', path: id => `/tarefas?open=${id}` },
  deadline: { table: 'deadlines', col: 'title', label: 'Prazo', path: id => `/prazos?open=${id}` },
  process: { table: 'processes', col: 'title', label: 'Processo', path: id => `/processos?open=${id}` },
  client: { table: 'clients', col: 'name', label: 'Cliente', path: id => `/clientes?open=${id}` },
}

export interface PendingMention {
  id: string
  entity_type: string
  entity_id: string
  text: string
  author: string | null
  created_at: string
  title: string
  label: string
  path: string
}

export interface MentionHistoryItem extends PendingMention {
  user_id: string | null
  mentions: string[]
  mentions_done: string[]
}

type Row = {
  id: string; entity_type: string; entity_id: string; text: string; author: string | null; created_at: string
  user_id?: string | null; mentions?: string[] | null; mentions_done?: string[] | null
}

export async function getMyProfileId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('id').eq('user_id', user.id).maybeSingle()
  return data?.id ?? null
}

// títulos das coisas mencionadas (uma consulta por tipo)
async function titulosDe(rows: Row[]): Promise<Record<string, string>> {
  const porTipo: Record<string, string[]> = {}
  for (const r of rows) (porTipo[r.entity_type] ??= []).push(r.entity_id)
  const titulos: Record<string, string> = {}
  await Promise.all(Object.entries(porTipo).map(async ([tipo, ids]) => {
    const e = ENTIDADES[tipo]
    if (!e) return
    const { data } = await supabase.from(e.table).select(`id, ${e.col}`).in('id', [...new Set(ids)])
    for (const row of (data ?? []) as unknown as Array<Record<string, string>>) titulos[row.id] = row[e.col]
  }))
  return titulos
}

function montar(rows: Row[], titulos: Record<string, string>): MentionHistoryItem[] {
  return rows
    .filter(r => ENTIDADES[r.entity_type] && titulos[r.entity_id] !== undefined)
    .map(r => ({
      id: r.id, entity_type: r.entity_type, entity_id: r.entity_id, text: r.text, author: r.author, created_at: r.created_at,
      user_id: r.user_id ?? null, mentions: r.mentions ?? [], mentions_done: r.mentions_done ?? [],
      title: titulos[r.entity_id], label: ENTIDADES[r.entity_type].label, path: ENTIDADES[r.entity_type].path(r.entity_id),
    }))
}

const COLUNAS = 'id, entity_type, entity_id, text, author, created_at, user_id, mentions, mentions_done'

// Menções ainda não vistas por esta pessoa. Se o banco ainda não tem a coluna, devolve vazio sem quebrar nada.
export async function fetchPendingMentions(profileId: string, limit = 30): Promise<PendingMention[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select(COLUNAS)
    .contains('mentions', [profileId])
    .eq('kind', 'comment')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit * 2)
  if (error || !data) return []
  const pendentes = (data as Row[]).filter(r => !(r.mentions_done ?? []).includes(profileId)).slice(0, limit)
  return montar(pendentes, await titulosDe(pendentes))
}

// Histórico completo: o que a pessoa recebeu (visto ou não) e o que ela enviou
export async function fetchMentionHistory(profileId: string): Promise<{ received: MentionHistoryItem[]; sent: MentionHistoryItem[] }> {
  const [rec, sen] = await Promise.all([
    supabase.from('activity_log').select(COLUNAS).contains('mentions', [profileId]).eq('kind', 'comment').is('deleted_at', null).order('created_at', { ascending: false }).limit(100),
    supabase.from('activity_log').select(COLUNAS).eq('user_id', profileId).eq('kind', 'comment').is('deleted_at', null).order('created_at', { ascending: false }).limit(300),
  ])
  const recebidas = ((rec.data ?? []) as Row[])
  const enviadas = ((sen.data ?? []) as Row[]).filter(r => (r.mentions ?? []).length > 0).slice(0, 100)
  const titulos = await titulosDe([...recebidas, ...enviadas])
  return { received: montar(recebidas, titulos), sent: montar(enviadas, titulos) }
}

export async function markMentionDone(commentId: string, profileId: string): Promise<boolean> {
  const { data } = await supabase.from('activity_log').select('mentions_done').eq('id', commentId).maybeSingle()
  const atual = ((data?.mentions_done as string[] | null) ?? [])
  if (atual.includes(profileId)) return true
  const { error } = await supabase.from('activity_log').update({ mentions_done: [...atual, profileId] }).eq('id', commentId)
  return !error
}
