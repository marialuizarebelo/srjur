import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Users, AlertTriangle, Wallet } from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import {
  usePeriod, PeriodPicker, KpiCard, ChartCard, DonutWithLegend, DetailDialog, useDetail,
} from './shared'

interface ClientRow { id: string; name: string; area: string | null; status: string; created_at: string }
interface FinanceLite { client_id: string | null; description: string; value: number; due_date: string | null; paid: boolean; type: string }

export default function ClientesTab() {
  const period = usePeriod()
  const detail = useDetail()
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [finance, setFinance] = useState<FinanceLite[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('clients').select('id, name, area, status, created_at'),
      supabase.from('finance').select('client_id, description, value, due_date, paid, type'),
    ]).then(([c, f]) => {
      setClients((c.data as ClientRow[]) ?? [])
      setFinance((f.data as FinanceLite[]) ?? [])
      setLoading(false)
    })
  }, [])

  const todayStr = new Date().toISOString().slice(0, 10)
  const clientesAtivos = clients.filter(c => c.status === 'ativo').length
  const novosNoPeriodo = clients.filter(c => c.created_at >= period.range.start && c.created_at <= period.range.end + 'T23:59:59')

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
  const clientesInadimplentes = useMemo(() => new Set(vencidosNaoPagos.filter(f => f.client_id).map(f => f.client_id)).size, [vencidosNaoPagos])

  function openInadimplenciaDetail() {
    detail.show('Recebimentos vencidos e não pagos', vencidosNaoPagos.map((f, i) => ({
      id: String(i), label: f.client_id ? (clientMap.get(f.client_id)?.name ?? f.description) : f.description,
      sublabel: f.due_date ? `Venceu em ${fmtDate(f.due_date)}` : undefined, value: fmtBRL(Number(f.value)),
    })))
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-4">
      <PeriodPicker p={period} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Clientes ativos" value={clientesAtivos} icon={Users} color="#3B82F6" />
        <KpiCard title="Novos clientes (período)" value={novosNoPeriodo.length} icon={Users} color="#22c55e" />
        <KpiCard title="Clientes inadimplentes" value={clientesInadimplentes} icon={AlertTriangle} color="#ef4444" onClick={openInadimplenciaDetail} />
        <KpiCard title="Valor em atraso" value={fmtBRL(valorInadimplente)} icon={Wallet} color="#ef4444" sensitive onClick={openInadimplenciaDetail} />
      </div>

      <ChartCard title="Carteira de clientes por área" icon={Users}>
        <DonutWithLegend data={carteiraPorArea} formatValue={v => String(v)} onSelect={openAreaDetail} />
      </ChartCard>

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
