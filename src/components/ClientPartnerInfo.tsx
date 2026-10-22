import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Handshake } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { fmtBRL, fmtDate } from '@/lib/format'
import { Sensitive } from '@/components/Sensitive'
import { categoriesLabel } from '@/lib/partners'

interface LinkRow { id: string; pct: number; categories: string[]; business_unit: string | null; valid_from: string; valid_until: string | null; partners: { id: string; name: string } | null }
interface CommRow { id: string; amount: number; link_id: string | null; historical: boolean }

// Na ficha do cliente: quem indicou, a regra da comissão e quanto já foi / falta repassar.
export function ClientPartnerInfo({ clientId }: { clientId: string }) {
  const [links, setLinks] = useState<LinkRow[]>([])
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set())
  const [comms, setComms] = useState<CommRow[]>([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: l } = await supabase.from('partner_clients')
        .select('id, pct, categories, business_unit, valid_from, valid_until, partners(id, name)').eq('client_id', clientId).eq('active', true)
      const { data: c } = await supabase.from('partner_commissions').select('id, amount, link_id, historical').eq('client_id', clientId)
      const ids = (c ?? []).map(x => x.id)
      const { data: e } = ids.length
        ? await supabase.from('finance').select('partner_commission_id, paid').in('partner_commission_id', ids)
        : { data: [] as { partner_commission_id: string; paid: boolean }[] }
      if (!alive) return
      setLinks((l ?? []) as unknown as LinkRow[])
      setComms((c ?? []) as CommRow[])
      setPaidIds(new Set([...(e ?? []).filter(x => x.paid).map(x => x.partner_commission_id), ...(c ?? []).filter(x => x.historical).map(x => x.id)]))
    })()
    return () => { alive = false }
  }, [clientId])

  if (links.length === 0) return null
  return (
    <div className="rounded-xl border p-3 space-y-2 bg-muted/30">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Handshake className="h-3 w-3" />Parceria</p>
      {links.map(l => {
        const mine = comms.filter(c => c.link_id === l.id)
        const pago = mine.filter(c => paidIds.has(c.id)).reduce((s, c) => s + Number(c.amount), 0)
        const aPagar = mine.filter(c => !paidIds.has(c.id)).reduce((s, c) => s + Number(c.amount), 0)
        return (
          <div key={l.id} className="text-sm space-y-0.5">
            <p><Link to="/parcerias" className="font-medium hover:underline">{l.partners?.name ?? 'Parceiro'}</Link>
              <span className="text-muted-foreground"> · {String(l.pct).replace('.', ',')}% sobre {categoriesLabel(l.categories)}{l.business_unit ? ` · só ${l.business_unit === 'saas' ? 'sistema' : 'advocacia'}` : ''}</span></p>
            <p className="text-xs text-muted-foreground">
              Vigência: {fmtDate(l.valid_from)} → {l.valid_until ? fmtDate(l.valid_until) : 'indeterminada'}
              {' · '}Já repassado: <Sensitive>{fmtBRL(pago)}</Sensitive>{' · '}A repassar: <Sensitive>{fmtBRL(aPagar)}</Sensitive>
            </p>
          </div>
        )
      })}
    </div>
  )
}
