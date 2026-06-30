// Chamada via pg_cron a cada hora — verifica tarefas/compromissos com horário
import { createClient } from 'npm:@supabase/supabase-js'
import webpush from 'npm:web-push'

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

webpush.setVapidDetails('mailto:escritorio@scartezzinirebelo.com', VAPID_PUBLIC, VAPID_PRIVATE)

function nowBrasilia() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
}

Deno.serve(async () => {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
    const now = nowBrasilia()

    // Janela: tarefas/compromissos com horário nos próximos 60 minutos
    const todayStr = now.toISOString().slice(0, 10)
    const nowHH = now.getHours().toString().padStart(2, '0')
    const nowMM = now.getMinutes().toString().padStart(2, '0')
    const inHour = new Date(now.getTime() + 60 * 60 * 1000)
    const inHH = inHour.getHours().toString().padStart(2, '0')
    const inMM = inHour.getMinutes().toString().padStart(2, '0')

    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, due_date, due_time, type, responsible_ids')
      .eq('due_date', todayStr)
      .not('due_time', 'is', null)
      .gte('due_time', `${nowHH}:${nowMM}`)
      .lte('due_time', `${inHH}:${inMM}`)
      .in('status', ['pendente', 'em_andamento'])

    if (!tasks?.length) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } })
    }

    const { data: subs } = await supabase.from('push_subscriptions').select('*')
    if (!subs?.length) return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } })

    let sent = 0
    for (const task of tasks) {
      const payload = JSON.stringify({
        title: `⏰ ${task.due_time} — ${task.title}`,
        body: task.type ?? 'Compromisso agendado',
        url: '/tarefas',
      })
      await Promise.allSettled(
        subs.map(sub =>
          webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
        )
      )
      sent++
    }

    return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
