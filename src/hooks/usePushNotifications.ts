import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const { session } = useAuth()

  useEffect(() => {
    if (!session || !('serviceWorker' in navigator) || !('PushManager' in window)) return

    async function subscribe() {
      try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        const sub = existing ?? await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
        })

        const { endpoint, keys } = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }

        await supabase.from('push_subscriptions').upsert({
          user_id: session.user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        }, { onConflict: 'endpoint' })
      } catch (e) {
        console.warn('Push subscription failed:', e)
      }
    }

    // Delay for 3s so it doesn't pop immediately on login
    const t = setTimeout(subscribe, 3000)
    return () => clearTimeout(t)
  }, [session])
}
