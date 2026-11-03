import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

// Campos visíveis nos cartões de cada tela ("Campos"). A escolha fica salva por usuário em
// profiles.view_prefs (a mesma coluna do alfinete de visualização) e segue o login em qualquer
// aparelho; o navegador guarda uma cópia para abrir já com a escolha certa, sem piscar.
export function useCardFields(pageKey: string, defaults: Record<string, boolean>, legacyLocalKey?: string) {
  const { profile } = useAuth()
  const prefKey = `campos_${pageKey}`
  const localKey = `card_fields_${pageKey}`
  const defaultsRef = useRef(defaults)

  const readLocal = useCallback((): Record<string, boolean> | null => {
    try {
      const raw = localStorage.getItem(localKey) ?? (legacyLocalKey ? localStorage.getItem(legacyLocalKey) : null)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }, [localKey, legacyLocalKey])

  const [fields, setFields] = useState<Record<string, boolean>>(() => ({ ...defaults, ...(readLocal() ?? {}) }))

  // carrega do perfil (vale mais que a cópia do navegador)
  useEffect(() => {
    let cancelled = false
    if (!profile?.id) return
    supabase.from('profiles').select('view_prefs').eq('id', profile.id).maybeSingle().then(({ data }) => {
      if (cancelled) return
      const saved = (data?.view_prefs as Record<string, unknown> | null)?.[prefKey]
      if (saved && typeof saved === 'object') setFields({ ...defaultsRef.current, ...(saved as Record<string, boolean>) })
    })
    return () => { cancelled = true }
  }, [profile?.id, prefKey])

  // grava no perfil em fila: só a última escolha vai para o banco, sempre depois da anterior
  const pending = useRef<Record<string, boolean> | null>(null)
  const writing = useRef(false)
  const flush = useCallback(async () => {
    if (writing.current || !profile?.id) return
    writing.current = true
    try {
      while (pending.current) {
        const next = pending.current
        pending.current = null
        const { data } = await supabase.from('profiles').select('view_prefs').eq('id', profile.id).maybeSingle()
        const merged = { ...((data?.view_prefs as Record<string, unknown> | null) ?? {}), [prefKey]: next }
        await supabase.from('profiles').update({ view_prefs: merged }).eq('id', profile.id)
      }
    } finally { writing.current = false }
  }, [profile?.id, prefKey])

  const save = useCallback((next: Record<string, boolean>) => {
    setFields(next)
    try { localStorage.setItem(localKey, JSON.stringify(next)) } catch { /* navegador sem armazenamento */ }
    pending.current = next
    void flush()
  }, [localKey, flush])

  const reset = useCallback(() => save({ ...defaultsRef.current }), [save])

  return { fields, save, reset }
}
