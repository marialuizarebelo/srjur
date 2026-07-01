// Chamada via cron 1x por dia (ex: 08:00 Brasília) — cria tarefas automáticas:
// 1) Cobrança 7 e 3 dias antes do vencimento de receitas não pagas
// 2) Aniversário de clientes (por dia/mês de birth_date)
// 3) Conferência mensal do financeiro (todo dia 30)
import { createClient } from 'npm:@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function nowBrasilia() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
}

function addDays(d: Date, n: number) {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

Deno.serve(async () => {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
    const today = nowBrasilia()
    const todayStr = toDateStr(today)

    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
    const adminIds = (admins ?? []).map(a => a.id)

    let created = 0

    async function createTaskIfNotExists(payload: {
      title: string; type: string; due_date: string; client_id?: string | null
    }) {
      const { data: existing } = await supabase
        .from('tasks')
        .select('id')
        .eq('title', payload.title)
        .eq('due_date', payload.due_date)
        .limit(1)
      if (existing && existing.length > 0) return
      const { error } = await supabase.from('tasks').insert({
        title: payload.title,
        type: payload.type,
        status: 'pendente',
        priority: 'media',
        due_date: todayStr,
        responsible_ids: adminIds,
        client_id: payload.client_id ?? null,
      })
      if (!error) created++
    }

    // 1) Cobranças a vencer em 7 e 3 dias (receitas não pagas)
    for (const daysAhead of [7, 3]) {
      const targetDate = toDateStr(addDays(today, daysAhead))
      const { data: rows } = await supabase
        .from('finance')
        .select('id, description, due_date, client_id, clients(name)')
        .eq('type', 'receita')
        .eq('paid', false)
        .eq('due_date', targetDate)

      for (const row of rows ?? []) {
        const clientName = (row as any).clients?.name ?? row.description
        await createTaskIfNotExists({
          title: `Cobrar ${clientName} — vence em ${daysAhead} dia(s) (${row.description})`,
          type: 'cliente',
          due_date: targetDate,
          client_id: row.client_id,
        })
      }
    }

    // 2) Aniversário de clientes hoje
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, birth_date')
      .eq('status', 'ativo')
      .not('birth_date', 'is', null)

    for (const c of clients ?? []) {
      if (!c.birth_date) continue
      const [, bMonth, bDay] = c.birth_date.split('-')
      if (bMonth === mm && bDay === dd) {
        await createTaskIfNotExists({
          title: `Mandar feliz aniversário para ${c.name}`,
          type: 'cliente',
          due_date: todayStr,
          client_id: c.id,
        })
      }
    }

    // 3) Conferência mensal do financeiro (todo dia 30)
    if (today.getDate() === 30) {
      await createTaskIfNotExists({
        title: 'Importar extrato e conferir financeiro do mês',
        type: 'interno',
        due_date: todayStr,
      })
    }

    return new Response(JSON.stringify({ created }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
