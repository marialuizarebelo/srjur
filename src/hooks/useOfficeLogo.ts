import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

let cachedLogo: string | null | undefined

export function useOfficeLogo() {
  const [logo, setLogo] = useState<string | null>(cachedLogo ?? null)

  useEffect(() => {
    if (cachedLogo !== undefined) return
    supabase.from('office_settings').select('logo_url').limit(1).maybeSingle().then(({ data }) => {
      cachedLogo = data?.logo_url ?? null
      setLogo(cachedLogo)
    })
  }, [])

  return logo
}
