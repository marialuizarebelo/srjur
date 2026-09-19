import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Rocket, Users, DollarSign, TrendingUp } from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import {
  monthsBack, usePeriod, PeriodPicker, KpiCard, ChartCard, DonutWithLegend, TrendChart,
  DetailDialog, useDetail, previousPeriodRange, trendText,
} from './shared'

interface ClientRow { id: string; name: string; area: string | null; status: string; created_at: string; is_juridico: boolean }
interface FinanceRow { category: string | null; type: string; description: string; value: number; date: string; recurrence: string | null; client_id: string | null; business_unit: string | null }

export default function ProdutoSaasTab() {
  const period = usePeriod()
  const detail = useDetail()
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [finance, setFinance] = useState<FinanceRow[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('clients').select('id, name, area, status, created_at, is_juridico').eq('is_saas', true),
      supabase.from('finance').select('category, type, description, value, date, recurrence, client_id, business_unit').eq('business_unit', 'saas'),
    ]).then(([c, f]) => {
      setClients((c.data as ClientRow[]) ?? [])
      setFinance((f.data as FinanceRow[]) ?? [])
      setLoading(false)
    })
  }, [])

  const clientesAtivos = clients.filter(c => c.status === 'ativo')
  const somenteSaas = clients.filter(c => !c.is_juridico)
  const trendMonths = useMemo(() => monthsBack(12), [])

  const rowsNoPeriodo = useMemo(() => finance.filter(f => f.date >= period.range.start && f.date <= period.range.end), [finance, period.range])
  const receitaPeriodo = rowsNoPeriodo.filter(f => f.type === 'receita').reduce((s, f) => s + Number(f.value), 0)
  const despesaPeriodo = rowsNoPeriodo.filter(f => f.type === 'despesa').reduce((s, f) => s + Number(f.value), 0)

  const prevRange = useMemo(() => previousPeriodRange(period.range.start, period.range.end), [period.range])
  const rowsAnterior = useMemo(() => finance.filter(f => f.date >= prevRange.start && f.date <= prevRange.end), [finance, prevRange])
  const receitaAnterior = rowsAnterior.filter(f => f.type === 'receita').reduce((s, f) => s + Number(f.value), 0)

  // MRR aproximado: receitas recorrentes (qualquer recorrência != Única)
  // datadas dentro do mês atual -- é uma estimativa, não um controle de
  // assinatura de verdade (isso ainda não existe).
  const now = new Date()
  const mesAtualStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const mesAtualEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  const mrrAproximado = useMemo(() => finance
    .filter(f => f.type === 'receita' && f.recurrence && f.recurrence !== 'Única' && f.date >= mesAtualStart && f.date <= mesAtualEnd)
    .reduce((s, f) => s + Number(f.value), 0), [finance, mesAtualStart, mesAtualEnd])

  const evolution = useMemo(() => trendMonths.map(m => {
    const mRows = finance.filter(f => f.date >= m.start && f.date <= m.end)
    return {
      month: m.label,
      receitas: mRows.filter(f => f.type === 'receita').reduce((s, f) => s + Number(f.value), 0),
      despesas: mRows.filter(f => f.type === 'despesa').reduce((s, f) => s + Number(f.value), 0),
    }
  }), [finance, trendMonths])

  const receitaPorCategoria = useMemo(() => {
    const map = new Map<string, number>()
    rowsNoPeriodo.filter(f => f.type === 'receita').forEach(f => {
      const cat = f.category ?? 'Outros'
      map.set(cat, (map.get(cat) ?? 0) + Number(f.value))
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [rowsNoPeriodo])

  function openClientesDetail() {
    detail.show('Clientes SaaS ativos', clientesAtivos.map((c, i) => ({ id: String(i), label: c.name, sublabel: c.is_juridico ? 'Também é cliente jurídico' : 'Só sistema' })))
  }
  function openReceitaDetail() {
    const list = rowsNoPeriodo.filter(f => f.type === 'receita')
    detail.show('Receita SaaS do período', list.map((f, i) => ({ id: String(i), label: f.description, sublabel: fmtDate(f.date), value: fmtBRL(Number(f.value)) })))
  }
  function openDespesaDetail() {
    const list = rowsNoPeriodo.filter(f => f.type === 'despesa')
    detail.show('Despesas SaaS do período', list.map((f, i) => ({ id: String(i), label: f.description, sublabel: fmtDate(f.date), value: fmtBRL(Number(f.value)) })))
  }
  function openMrrDetail() {
    const list = finance.filter(f => f.type === 'receita' && f.recurrence && f.recurrence !== 'Única' && f.date >= mesAtualStart && f.date <= mesAtualEnd)
    detail.show('Receita recorrente considerada no MRR', list.map((f, i) => ({ id: String(i), label: f.description, sublabel: `${fmtDate(f.date)} · ${f.recurrence}`, value: fmtBRL(Number(f.value)) })))
  }
  function openCategoriaDetail(cat: string) {
    const list = rowsNoPeriodo.filter(f => f.type === 'receita' && (f.category ?? 'Outros') === cat)
    detail.show(`${cat} — Receita SaaS`, list.map((f, i) => ({ id: String(i), label: f.description, sublabel: fmtDate(f.date), value: fmtBRL(Number(f.value)) })))
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  if (clients.length === 0 && finance.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border p-8 text-center">
          <Rocket className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-sm font-medium">Nenhum cliente ou lançamento marcado como SaaS ainda</p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
            Marque um cliente como "Sistema (SaaS)" no cadastro dele, ou um lançamento financeiro com a unidade "Sistema (SaaS)",
            que os indicadores aqui passam a aparecer automaticamente.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PeriodPicker p={period} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Clientes SaaS ativos" value={clientesAtivos.length} icon={Users} color="#3B82F6"
          trend={somenteSaas.length > 0 ? `${somenteSaas.length} só sistema, sem questão jurídica` : undefined} onClick={openClientesDetail} />
        <KpiCard title="Receita SaaS (período)" value={fmtBRL(receitaPeriodo)} icon={TrendingUp} color="#22c55e" sensitive
          trend={trendText(receitaPeriodo, receitaAnterior)} onClick={openReceitaDetail} />
        <KpiCard title="Despesas SaaS (período)" value={fmtBRL(despesaPeriodo)} icon={TrendingUp} color="#ef4444" sensitive onClick={openDespesaDetail} />
        <KpiCard title="MRR aproximado" value={fmtBRL(mrrAproximado)} icon={DollarSign} color="#8B5CF6" sensitive onClick={openMrrDetail} />
      </div>

      <ChartCard title="Evolução SaaS (12 meses)" icon={Rocket}>
        <TrendChart data={evolution} formatValue={fmtBRL} series={[
          { key: 'receitas', name: 'Receitas', color: '#22c55e' },
          { key: 'despesas', name: 'Despesas', color: '#ef4444' },
        ]} />
      </ChartCard>

      <ChartCard title="Receita SaaS por categoria" icon={DollarSign}>
        <DonutWithLegend data={receitaPorCategoria} formatValue={fmtBRL} onSelect={openCategoriaDetail} />
      </ChartCard>

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
