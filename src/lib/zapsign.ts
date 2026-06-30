const ZAPSIGN_TOKEN = import.meta.env.VITE_ZAPSIGN_TOKEN ?? ''
const BASE_URL = 'https://api.zapsign.com.br/api/v1'

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

export async function listDocuments(): Promise<ZapSignDoc[]> {
  const res = await fetch(`${BASE_URL}/docs/?api_token=${ZAPSIGN_TOKEN}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.results ?? []
}

export async function getDocument(token: string): Promise<ZapSignDoc | null> {
  const res = await fetch(`${BASE_URL}/docs/${token}/?api_token=${ZAPSIGN_TOKEN}`)
  if (!res.ok) return null
  return res.json()
}

export async function findDocsByName(searchName: string): Promise<ZapSignDoc[]> {
  const docs = await listDocuments()
  const lower = searchName.toLowerCase()
  return docs.filter(d =>
    d.name.toLowerCase().includes(lower) ||
    d.signers?.some(s => s.name.toLowerCase().includes(lower))
  )
}

export function isZapSignConfigured(): boolean {
  return ZAPSIGN_TOKEN.length > 10
}
