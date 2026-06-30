import { createClient } from 'npm:@supabase/supabase-js'
import webpush from 'npm:web-push'

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

webpush.setVapidDetails('mailto:escritorio@scartezzinirebelo.com', VAPID_PUBLIC, VAPID_PRIVATE)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } })
  }

  try {
    const body = await req.json()
    const { title, message, url = '/', user_id } = body

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    let query = supabase.from('push_subscriptions').select('*')
    if (user_id) query = query.eq('user_id', user_id)

    const { data: subs, error } = await query
    if (error) throw error

    const payload = JSON.stringify({ title, body: message, url })

    const results = await Promise.allSettled(
      (subs ?? []).map(sub =>
        webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }, payload)
      )
    )

    const failed = results.filter(r => r.status === 'rejected').length
    return new Response(JSON.stringify({ sent: results.length - failed, failed }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
