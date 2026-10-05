import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Users, AlertTriangle, Wallet, Percent } from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import {
  KpiCard, ChartCard, DonutWithLegend, DetailDialog, useDetail, useResponsavelFilter,
} from './shared'

interface ClientRow { id: string; name: string; area: string | null; status: string; created_at: string; responsible_ids: string[] | null; is_cortesia: boolean; is_juridico: boolean }
interface FinanceLite { client_id: string | null; description: string; value: number; due_date: string | null; paid: boolean; type: string; business_unit: string | null; refletir_metricas: boolean }

/** section='carteira' (quem são os clientes) ou 'inadimplencia' (quem está devendo). */
export default function ClientesTab({ section }: { section: 'carteira' | 'inadimplencia' }) {
  const detail = useDetail()
  const respFilter = useResponsavelFilter()
  const [loading, setLoading] = useState(true)
  const [clientsRaw, setClientsRaw] = useState<ClientRow[]>([])
  const [financeAll, setFinanceAll] = useState<FinanceLite[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('clients').select('id, name, area, status, created_at, responsible_ids, is_cortesia, is_juridico'),
      supabase.from('finance').select('client_id, description, value, due_date, paid, type, business_unit, refletir_metricas'),
    ]).then(([c, f]) => {
      setClientsRaw((c.data as ClientRow[]) ?? [])
      setFinanceAll((f.data as FinanceLite[]) ?? [])
      setLoading(false)
    })
  }, [])

  // Fora da carteira/comercial jurídica: casos gratuitos e clientes puramente SaaS.
  const clients = useMemo(() => clientsRaw.filter(c => respFilter.matches(c.responsible_ids) && !c.is_cortesia && c.is_juridico !== false), [clientsRaw, respFilter.responsavelId])
  const finance = useMemo(() => financeAll.filter(f => f.business_unit !== 'saas' && f.refletir_metricas !== false), [financeAll])

  const todayStr = new Date().toISOString().slice(0, 10)
  const clientesAtivos = clients.filter(c => c.status === 'ativo').length

  const carteiraPorArea = useMemo(() => {
    const map = new Map<string, number>()
    clients.filter(c => c.status === 'ativo').forEach(c => {
      const area = c.area ?? 'Não classificado'
      map.set(area, (map.get(area) ?? 0) + 1)
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [clients])

  function openAreaDetail(area: string) {
    const list = clients.filter(c => c.status === 'ativo' && (c.area ?? 'Não classificado') === area)
    detail.show(`Clientes ativos — ${area}`, list.map((c, i) => ({ id: String(i), label: c.name })))
  }

  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])
  const vencidosNaoPagos = useMemo(() => finance.filter(f => f.type === 'receita' && !f.paid && f.due_date && f.due_date < todayStr), [finance, todayStr])
  const valorInadimplente = vencidosNaoPagos.reduce((s, f) => s + Number(f.value), 0)
  const totalVencido = useMemo(() => finance.filter(f => f.type === 'receita' && f.due_date && f.due_date <= todayStr).reduce((s, f) => s + Number(f.value), 0), [finance, todayStr])
  const taxaInadimplencia = totalVencido > 0 ? (valorInadimplente / totalVencido) * 100 : 0
  const clientesInadimplentes = useMemo(() => new Set(vencidosNaoPagos.filter(f => f.client_id).map(f => f.client_id)).size, [vencidosNaoPagos])

  function openInadimplenciaDetail() {
    detail.show('Recebimentos vencidos e não pagos', vencidosNaoPagos.map((f, i) => ({
      id: String(i), label: f.client_id ? (clientMap.get(f.client_id)?.name ?? f.description) : f.description,
      sublabel: f.due_date ? `Venceu em ${fmtDate(f.due_date)}` : undefined, value: fmtBRL(Number(f.value)),
    })))
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  if (section === 'inadimplencia') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KpiCard title="Valor em atraso" value={fmtBRL(valorInadimplente)} icon={Wallet} color="#D96C87" sensitive onClick={openInadimplenciaDetail}
            hint="Soma das receitas com vencimento anterior a hoje que ainda não foram pagas." />
          <KpiCard title="Taxa de inadimplência" value={`${taxaInadimplencia.toFixed(1)}%`} icon={Percent} color="#D9A441" onClick={openInadimplenciaDetail}
            hint="Valor em atraso ÷ total de receitas já vencidas (pagas + em atraso). Quanto menor, melhor." />
          <KpiCard title="Clientes inadimplentes" value={clientesInadimplentes} icon={AlertTriangle} color="#D96C87" onClick={openInadimplenciaDetail}
            hint="Clientes distintos com pelo menos uma receita vencida e não paga." />
        </div>
        <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Clientes ativos" value={clientesAtivos} icon={Users} color="#6A8FC7"
          hint="Clientes jurídicos com status ativo (exclui casos gratuitos e clientes só de SaaS)."
          onClick={() => detail.show('Clientes ativos', clients.filter(c => c.status === 'ativo').map((c, i) => ({ id: String(i), label: c.name, sublabel: c.area ?? undefined })))} />
      </div>

      <ChartCard title="Carteira de clientes por área" icon={Users}>
        <DonutWithLegend data={carteiraPorArea} formatValue={v => String(v)} onSelect={openAreaDetail} />
      </ChartCard>

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
