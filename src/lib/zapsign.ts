// A API do ZapSign bloqueia chamada direta do navegador (sem CORS), então
// tudo passa pela Edge Function zapsign-proxy (servidor, token nunca exposto
// no bundle do navegador). Ver supabase/functions/zapsign-proxy.
const ZAPSIGN_ENABLED = (import.meta.env.VITE_ZAPSIGN_ENABLED ?? '').toLowerCase() === 'true'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export interface ZapSignDoc {
  open_id: string
  token: string
  status: string
  name: string
  created_at: string
  last_update_at: string
  signed_file: string | null
  original_file: string | null
  signers: ZapSignSigner[]
}

export interface ZapSignSigner {
  token: string
  name: string
  email: string
  status: string
  sign_url: string
}

export async function findDocsByName(searchName: string): Promise<ZapSignDoc[]> {
  if (!ZAPSIGN_ENABLED) return []
  try {
    const url = `${SUPABASE_URL}/functions/v1/zapsign-proxy?name=${encodeURIComponent(searchName)}`
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.docs ?? []) as ZapSignDoc[]
  } catch {
    // Nunca deixa a UI travada esperando pra sempre (ex: "Verificando ZapSign...")
    // por causa de uma falha de rede/infra — melhor mostrar "não encontrado".
    return []
  }
}

export function isZapSignConfigured(): boolean {
  return ZAPSIGN_ENABLED
}
