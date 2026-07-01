import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

// Fixa a visualização preferida (kanban/lista/etc) por usuário e por página,
// salva em profiles.view_prefs (jsonb). Cai para localStorage se não houver perfil.
export function usePinnedView<T extends string>(pageKey: string, defaultValue: T) {
  const { profile } = useAuth()
  const [pinned, setPinned] = useState<T | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (profile?.id) {
        const { data } = await supabase.from('profiles').select('view_prefs').eq('id', profile.id).maybeSingle()
        if (!cancelled) {
          const v = (data?.view_prefs as Record<string, string> | null)?.[pageKey]
          setPinned((v as T) ?? null)
          setLoaded(true)
        }
      } else {
        const v = localStorage.getItem(`view_pref_${pageKey}`)
        if (!cancelled) { setPinned((v as T) ?? null); setLoaded(true) }
      }
    }
    load()
    return () => { cancelled = true }
  }, [profile?.id, pageKey])

  const pin = useCallback(async (value: T) => {
    setPinned(value)
    if (profile?.id) {
      const { data } = await supabase.from('profiles').select('view_prefs').eq('id', profile.id).maybeSingle()
      const next = { ...(data?.view_prefs as Record<string, string> ?? {}), [pageKey]: value }
      await supabase.from('profiles').update({ view_prefs: next }).eq('id', profile.id)
    } else {
      localStorage.setItem(`view_pref_${pageKey}`, value)
    }
  }, [profile?.id, pageKey])

  const unpin = useCallback(async () => {
    setPinned(null)
    if (profile?.id) {
      const { data } = await supabase.from('profiles').select('view_prefs').eq('id', profile.id).maybeSingle()
      const next = { ...(data?.view_prefs as Record<string, string> ?? {}) }
      delete next[pageKey]
      await supabase.from('profiles').update({ view_prefs: next }).eq('id', profile.id)
    } else {
      localStorage.removeItem(`view_pref_${pageKey}`)
    }
  }, [profile?.id, pageKey])

  return {
    value: loaded ? (pinned ?? defaultValue) : defaultValue,
    isPinned: pinned !== null,
    pinnedValue: pinned,
    pin,
    unpin,
    loaded,
  }
}
