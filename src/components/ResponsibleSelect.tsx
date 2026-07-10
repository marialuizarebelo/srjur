import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Check } from 'lucide-react'
import { UserAvatar } from '@/components/UserAvatar'

export interface ProfileOption { id: string; display_name: string | null; color: string | null; photo_url: string | null }

let cachedProfiles: ProfileOption[] | null = null

export async function getAdminProfiles(): Promise<ProfileOption[]> {
  if (cachedProfiles) return cachedProfiles
  const { data } = await supabase.from('profiles').select('id, display_name, nickname, color, photo_url').eq('role', 'admin').order('display_name')
  // Prioriza o apelido sobre o nome/e-mail cadastrado — é o que deve aparecer em toda a UI
  cachedProfiles = ((data ?? []) as any[]).map(p => ({
    id: p.id, color: p.color, display_name: p.nickname || p.display_name, photo_url: p.photo_url,
  }))
  return cachedProfiles!
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
        return <UserAvatar key={id} name={p?.display_name} photoUrl={p?.photo_url} color={p?.color} className={dim} />
      })}
    </div>
  )
}
