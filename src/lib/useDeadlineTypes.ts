import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { TIPOS_PRAZO } from '@/lib/deadlineTypes'

export interface CustomDeadlineType { id: string; name: string }

/** Tipos de prazo do escritório: lista padrão do sistema + os que o escritório criou. */
export function useDeadlineTypes() {
  const { profile } = useAuth()
  const [custom, setCustom] = useState<CustomDeadlineType[]>([])

  const load = useCallback(async () => {
    const { data } = await supabase.from('deadline_types').select('id, name').order('name')
    setCustom((data as CustomDeadlineType[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const all = useMemo(
    () => [...new Set([...TIPOS_PRAZO, ...custom.map(c => c.name)])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [custom],
  )

  /** Cria o tipo (se ainda não existir, sem diferenciar maiúsculas) e devolve o nome a usar, ou null se falhar. */
  async function add(raw: string): Promise<string | null> {
    const name = raw.replace(/\s+/g, ' ').trim()
    if (!name) return null
    const existing = all.find(t => t.toLowerCase() === name.toLowerCase())
    if (existing) return existing
    const { error } = await supabase.from('deadline_types').insert({ name, ...(profile?.tenant_id ? { tenant_id: profile.tenant_id } : {}) })
    if (error) return null
    await load()
    return name
  }

  async function remove(id: string) {
    await supabase.from('deadline_types').delete().eq('id', id)
    await load()
  }

  return { all, custom, add, remove }
}
