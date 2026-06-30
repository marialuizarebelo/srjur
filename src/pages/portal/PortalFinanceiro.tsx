import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DollarSign, CheckCircle2, Clock, ExternalLink } from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'

interface FinanceEntry {
  id: string; description: string; value: number; date: string; due_date: string | null
  paid: boolean; payment_link: string | null
}

export default function PortalFinanceiro() {
  const [entries, setEntries] = useState<FinanceEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('finance').select('*').eq('type', 'receita').order('due_date', { ascending: true }).then(({ data }) => {
      setEntries((data as FinanceEntry[]) ?? [])
      setLoading(false)
    })
  }, [])

  const pending = useMemo(() => entries.filter(e => !e.paid), [entries])
  const paid = useMemo(() => entries.filter(e => e.paid), [entries])
  const totalPending = pending.reduce((s, e) => s + Number(e.value), 0)
  const totalPaid = paid.reduce((s, e) => s + Number(e.value), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Seus honorários e pagamentos</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-5">
          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide">A pagar</p>
          <p className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-1">{fmtBRL(totalPending)}</p>
          <p className="text-[11px] text-amber-600/70 mt-0.5">{pending.length} pendência(s)</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-5">
          <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Já pago</p>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{fmtBRL(totalPaid)}</p>
          <p className="text-[11px] text-emerald-600/70 mt-0.5">{paid.length} pagamento(s)</p>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-1">Pendências</p>
          {pending.map(e => (
            <div key={e.id} className="rounded-2xl border border-border/60 bg-card shadow-sm p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.description}</p>
                <p className="text-[11px] text-muted-foreground">{e.due_date ? `Vence em ${fmtDate(e.due_date)}` : fmtDate(e.date)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold">{fmtBRL(e.value)}</p>
                {e.payment_link && (
                  <a href={e.payment_link} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="h-6 text-[10px] mt-1 rounded-lg">
                      <ExternalLink className="h-2.5 w-2.5 mr-1" />Pagar
                    </Button>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {paid.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-1">Histórico</p>
          {paid.map(e => (
            <div key={e.id} className="rounded-2xl border border-border/60 bg-card shadow-sm p-4 flex items-center gap-3 opacity-70">
              <div className="h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.description}</p>
                <p className="text-[11px] text-muted-foreground">{fmtDate(e.date)}</p>
              </div>
              <p className="text-sm font-semibold shrink-0">{fmtBRL(e.value)}</p>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 && !loading && (
        <div className="py-16 text-center text-muted-foreground">
          <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum lançamento financeiro disponível</p>
        </div>
      )}
    </div>
  )
}
