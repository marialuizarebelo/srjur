import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Check } from 'lucide-react'

export interface ProfileOption { id: string; display_name: string | null; color: string | null }

let cachedProfiles: ProfileOption[] | null = null

export async function getAdminProfiles(): Promise<ProfileOption[]> {
  if (cachedProfiles) return cachedProfiles
  const { data } = await supabase.from('profiles').select('id, display_name, color').eq('role', 'admin').order('display_name')
  cachedProfiles = (data as ProfileOption[]) ?? []
  return cachedProfiles
}

interface ResponsibleSelectProps {
  value: string[]
  onChange: (ids: string[]) => void
  className?: string
}

export function ResponsibleSelect({ value, onChange, className }: ResponsibleSelectProps) {
  const [profiles, setProfiles] = useState<ProfileOption[]>([])

  useEffect(() => { getAdminProfiles().then(setProfiles) }, [])

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ''}`}>
      {profiles.map(p => {
        const selected = value.includes(p.id)
        return (
          <button key={p.id} type="button" onClick={() => toggle(p.id)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border transition-all"
            style={selected
              ? { backgroundColor: `${p.color ?? '#8B5CF6'}1A`, borderColor: p.color ?? '#8B5CF6', color: p.color ?? '#8B5CF6' }
              : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            {selected && <Check className="h-3 w-3" />}
            {p.display_name ?? 'Sem nome'}
          </button>
        )
      })}
      {profiles.length === 0 && <p className="text-xs text-muted-foreground">Carregando usuárias...</p>}
    </div>
  )
}

// Resolve nomes/cores para exibição (avatares etc.)
export function useProfilesMap() {
  const [map, setMap] = useState<Record<string, ProfileOption>>({})
  useEffect(() => {
    getAdminProfiles().then(profiles => {
      setMap(Object.fromEntries(profiles.map(p => [p.id, p])))
    })
  }, [])
  return map
}

export function ResponsibleAvatars({ ids, profilesMap, size = 'sm' }: { ids: string[] | null | undefined; profilesMap: Record<string, ProfileOption>; size?: 'sm' | 'xs' }) {
  if (!ids || ids.length === 0) return null
  const dim = size === 'xs' ? 'h-5 w-5 text-[8px]' : 'h-6 w-6 text-[9px]'
  return (
    <div className="flex items-center -space-x-1.5">
      {ids.map(id => {
        const p = profilesMap[id]
        return (
          <div key={id} className={`${dim} rounded-full flex items-center justify-center text-white font-bold shrink-0 ring-2 ring-background`}
            style={{ backgroundColor: p?.color ?? '#6B7280' }} title={p?.display_name ?? ''}>
            {(p?.display_name ?? '?').charAt(0).toUpperCase()}
          </div>
        )
      })}
    </div>
  )
}
