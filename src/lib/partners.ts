import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

export type PartnerBase = 'inicial' | 'mensalidade' | 'tudo'

export const PARTNER_BASES: { value: PartnerBase; label: string; short: string }[] = [
  { value: 'inicial', label: 'Honorários iniciais / implementação', short: 'Iniciais' },
  { value: 'mensalidade', label: 'Mensalidades', short: 'Mensalidades' },
  { value: 'tudo', label: 'Tudo (iniciais e mensalidades)', short: 'Tudo' },
]
export const baseLabel = (b: string | null | undefined) => PARTNER_BASES.find(x => x.value === b)?.short ?? '—'

export const PARTNER_KINDS = [
  { value: 'pessoa', label: 'Pessoa' },
  { value: 'empresa', label: 'Empresa' },
  { value: 'advogado', label: 'Advogado(a) / escritório' },
]

export interface Partner {
  id: string
  name: string
  kind: string
  document: string | null
  oab: string | null
  email: string | null
  phone: string | null
  pix_key: string | null
  bank_info: string | null
  notes: string | null
  status: 'ativo' | 'encerrado'
  started_at: string | null
  drive_url: string | null
  client_id: string | null
  default_pct: number | null
  default_base: PartnerBase
  valid_from: string | null
  valid_until: string | null
}

export interface PartnerLink {
  id: string
  partner_id: string
  client_id: string
  process_id: string | null
  pct: number
  base: PartnerBase
  valid_from: string
  valid_until: string | null
  active: boolean
  notes: string | null
}

// Parceiros ativos, pra escolher no cadastro do cliente.
export function usePartners() {
  const [partners, setPartners] = useState<Partner[]>([])
  const reload = useCallback(async () => {
    const { data } = await supabase.from('partners').select('*').order('name')
    setPartners((data ?? []) as Partner[])
  }, [])
  useEffect(() => { reload() }, [reload])
  return { partners, reload }
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export interface ClientPartnerFields {
  partner_id?: string
  referral_fee_pct: string
  partner_base?: string
  partner_valid_from?: string
  partner_valid_until?: string
}

// Vínculo vigente do cliente com um parceiro (sem processo específico), pra preencher o formulário.
export async function loadClientPartnerLink(clientId: string): Promise<Partial<ClientPartnerFields>> {
  const { data } = await supabase.from('partner_clients').select('*')
    .eq('client_id', clientId).eq('active', true).is('process_id', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!data) return {}
  return {
    partner_id: data.partner_id,
    referral_fee_pct: String(data.pct).replace('.', ','),
    partner_base: data.base,
    partner_valid_from: data.valid_from ?? '',
    partner_valid_until: data.valid_until ?? '',
  }
}

// Grava (ou desativa) o vínculo cliente ↔ parceiro conforme o formulário do cliente.
// Retorna uma mensagem de erro, ou null se deu certo.
export async function syncClientPartnerLink(clientId: string, f: ClientPartnerFields): Promise<string | null> {
  const { data: existing, error: e0 } = await supabase.from('partner_clients').select('*')
    .eq('client_id', clientId).is('process_id', null)
  if (e0) return e0.message
  const links = (existing ?? []) as PartnerLink[]

  if (!f.partner_id) {
    const ids = links.filter(l => l.active).map(l => l.id)
    if (ids.length) {
      const { error } = await supabase.from('partner_clients').update({ active: false }).in('id', ids)
      if (error) return error.message
    }
    return null
  }

  const pct = parseFloat((f.referral_fee_pct || '').replace(',', '.'))
  if (isNaN(pct) || pct < 0 || pct > 100) return 'Informe a % de comissão do parceiro (entre 0 e 100).'
  const base = (f.partner_base || 'inicial') as PartnerBase
  const until = f.partner_valid_until || null

  // desativa vínculo com outro parceiro
  const others = links.filter(l => l.active && l.partner_id !== f.partner_id).map(l => l.id)
  if (others.length) {
    const { error } = await supabase.from('partner_clients').update({ active: false }).in('id', others)
    if (error) return error.message
  }

  const mine = links.find(l => l.partner_id === f.partner_id)
  if (mine) {
    const { error } = await supabase.from('partner_clients').update({
      pct, base, valid_from: f.partner_valid_from || mine.valid_from, valid_until: until, active: true,
    }).eq('id', mine.id)
    return error?.message ?? null
  }
  const { error } = await supabase.from('partner_clients').insert({
    partner_id: f.partner_id, client_id: clientId, pct, base,
    valid_from: f.partner_valid_from || todayISO(), valid_until: until,
  })
  return error?.message ?? null
}
