import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env')
}

// Login de suporte do SRJUR (profiles.is_support): é UM login só e vale em todos
// os escritórios. O banco descobre em qual escritório ele está pelo link em que
// o sistema foi aberto (<slug>.srjur.com), lendo o cabeçalho x-tenant-slug.
//   - O cabeçalho só é enviado quando quem está logado é suporte (AuthContext liga
//     o "modo suporte"); para todo mundo o sistema funciona exatamente como antes.
//   - O banco ignora o cabeçalho de qualquer pessoa que não seja suporte.
const TENANT_ROOT_DOMAIN = (import.meta.env.VITE_TENANT_ROOT_DOMAIN as string | undefined) || 'srjur.com'
const RESERVED_SUBDOMAINS = new Set(['www', 'app'])

function slugFromHost(hostname: string): string | null {
  const host = hostname.toLowerCase()
  const suffix = `.${TENANT_ROOT_DOMAIN}`
  if (!host.endsWith(suffix)) return null
  const sub = host.slice(0, -suffix.length)
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(sub) && !RESERVED_SUBDOMAINS.has(sub) ? sub : null
}

const tenantSlug = slugFromHost(window.location.hostname)
let supportMode = false

export function setSupportMode(on: boolean) {
  supportMode = on
}

/** Cabeçalho do link do escritório — vazio fora do modo suporte. Use em fetch() direto às Edge Functions. */
export function tenantHeaders(): Record<string, string> {
  return supportMode && tenantSlug ? { 'x-tenant-slug': tenantSlug } : {}
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input, init) => {
      const extra = tenantHeaders()
      if (!extra['x-tenant-slug']) return fetch(input, init)
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      headers.set('x-tenant-slug', extra['x-tenant-slug'])
      return fetch(input, { ...init, headers })
    },
  },
})
