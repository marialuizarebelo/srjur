import { supabase } from '@/integrations/supabase/client'

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export async function subscribeToPush(userId: string): Promise<'granted' | 'denied' | 'unsupported' | 'error'> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'

    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    })

    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }

    await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }, { onConflict: 'endpoint' })

    return 'granted'
  } catch (e) {
    console.warn('Push subscription failed:', e)
    return 'error'
  }
}

export async function getNotificationStatus(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission as 'granted' | 'denied' | 'default'
}
