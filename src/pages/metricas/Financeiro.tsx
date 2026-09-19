import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { DollarSign, TrendingUp, Calendar, BarChart3 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts'
import { fmtBRL, fmtDate } from '@/lib/format'
import {
  MONTHS, monthsBack, usePeriod, PeriodPicker, KpiCard, ChartCard, DonutWithLegend,
  DetailDialog, useDetail, AttentionPanel, type Attention,
} from './shared'

export interface FinanceRow {
  type: 'receita' | 'despesa'
  category: string | null
  description: string
  value: number
  date: string
  due_date: string | null
  paid: boolean
  impacts_cash: boolean
  process_id: string | null
  client_id: string | null
}

export function useFinanceRows() {
  const [rows, setRows] = useState<FinanceRow[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.from('finance').select('type, category, description, value, date, due_date, paid, impacts_cash, process_id, client_id').then(({ data }) => {
      setRows((data as FinanceRow[]) ?? [])
      setLoading(false)
    })
  }, [])
  return { rows, loading }
}

export default function FinanceiroTab() {
  const { rows, loading } = useFinanceRows()
  const [projectionMonths, setProjectionMonths] = useState(3)
  const period = usePeriod()
  const detail = useDetail()

  const trendMonths = useMemo(() => monthsBack(12), [])
  const evolution = useMemo(() => trendMonths.map(m => {
    const mRows = rows.filter(r => r.date >= m.start && r.date <= m.end)
    return {
      month: m.label,
      receitas: mRows.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0),
      despesas: mRows.filter(r => r.type === 'despesa' && r.impacts_cash !== false).reduce((s, r) => s + Number(r.value), 0),
    }
  }), [rows, trendMonths])

  const saldoTotal = useMemo(() => rows.reduce((s, r) => {
    if (!r.paid || r.impacts_cash === false) return s
    return s + (r.type === 'receita' ? Number(r.value) : -Number(r.value))
  }, 0), [rows])

  const rowsNoPeriodo = useMemo(() => rows.filter(r => r.date >= period.range.start && r.date <= period.range.end), [rows, period.range])
  const receitasPeriodo = useMemo(() => rowsNoPeriodo.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0), [rowsNoPeriodo])
  const despesasPeriodo = useMemo(() => rowsNoPeriodo.filter(r => r.type === 'despesa' && r.impacts_cash !== false).reduce((s, r) => s + Number(r.value), 0), [rowsNoPeriodo])
  const resultadoLiquido = receitasPeriodo - despesasPeriodo
  const margemLiquida = receitasPeriodo > 0 ? (resultadoLiquido / receitasPeriodo) * 100 : 0

  function categoryBreakdown(type: 'receita' | 'despesa') {
    const map = new Map<string, number>()
    rowsNoPeriodo.filter(r => r.type === type && (type === 'receita' || r.impacts_cash !== false)).forEach(r => {
      const cat = r.category ?? 'Outros'
      map.set(cat, (map.get(cat) ?? 0) + Number(r.value))
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }
  const receitaCategoryData = useMemo(() => categoryBreakdown('receita'), [rowsNoPeriodo])
  const despesaCategoryData = useMemo(() => categoryBreakdown('despesa'), [rowsNoPeriodo])

  function openCategoryDetail(type: 'receita' | 'despesa', category: string) {
    const list = rowsNoPeriodo.filter(r => r.type === type && (r.category ?? 'Outros') === category)
    detail.show(`${category} — ${type === 'receita' ? 'Receitas' : 'Despesas'}`,
      list.map((r, i) => ({ id: String(i), label: r.description, sublabel: fmtDate(r.date), value: fmtBRL(Number(r.value)) })))
  }

  const projection = useMemo(() => {
    const result: { month: string; aReceber: number; aPagar: number; saldo: number }[] = []
    let saldoAcumulado = saldoTotal
    const today = new Date()
    for (let i = 0; i <= projectionMonths; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
      const start = i === 0 ? today.toISOString().slice(0, 10) : new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
      const monthRows = rows.filter(r => r.due_date && r.due_date >= start && r.due_date <= end && !r.paid && r.impacts_cash !== false)
      const rec = monthRows.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0)
      const desp = monthRows.filter(r => r.type === 'despesa').reduce((s, r) => s + Number(r.value), 0)
      saldoAcumulado += rec - desp
      result.push({ month: `${MONTHS[d.getMonth()]}/${d.getFullYear() % 100}`, aReceber: rec, aPagar: desp, saldo: saldoAcumulado })
    }
    return result
  }, [rows, projectionMonths, saldoTotal])

  const attention = useMemo(() => {
    const items: Attention[] = []
    if (saldoTotal < 0) items.push({ text: 'Saldo total está negativo.', level: 'danger' })
    if (receitasPeriodo > 0 && despesasPeriodo > receitasPeriodo) items.push({ text: 'Despesas superaram receitas no período selecionado.', level: 'warn' })
    const totalDesp = despesaCategoryData.reduce((s, d) => s + d.value, 0)
    if (despesaCategoryData.length > 0 && totalDesp > 0) {
      const maior = despesaCategoryData[0]
      if (maior.value / totalDesp > 0.4) items.push({ text: `"${maior.name}" concentra ${((maior.value / totalDesp) * 100).toFixed(0)}% das despesas do período.`, level: 'info' })
    }
    const vencidos = rows.filter(r => r.type === 'receita' && !r.paid && r.due_date && r.due_date < new Date().toISOString().slice(0, 10))
    if (vencidos.length > 0) {
      const totalVencido = vencidos.reduce((s, r) => s + Number(r.value), 0)
      items.push({ text: `${fmtBRL(totalVencido)} em recebimentos vencidos e ainda não pagos.`, level: 'warn' })
    }
    return items
  }, [saldoTotal, receitasPeriodo, despesasPeriodo, despesaCategoryData, rows])

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-4">
      <PeriodPicker p={period} />

      <AttentionPanel items={attention} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard title="Saldo total" value={fmtBRL(saldoTotal)} icon={DollarSign} color="#8B5CF6" sensitive />
        <KpiCard title="Receitas (período)" value={fmtBRL(receitasPeriodo)} icon={TrendingUp} color="#22c55e" sensitive />
        <KpiCard title="Despesas (período)" value={fmtBRL(despesasPeriodo)} icon={TrendingUp} color="#ef4444" sensitive />
        <KpiCard title="Resultado líquido" value={fmtBRL(resultadoLiquido)} icon={DollarSign} color={resultadoLiquido >= 0 ? '#22c55e' : '#ef4444'} sensitive />
        <KpiCard title="Margem líquida" value={`${margemLiquida.toFixed(0)}%`} icon={TrendingUp} color="#3B82F6" />
      </div>

      <ChartCard title="Evolução (12 meses)" icon={BarChart3}>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={evolution}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <RTooltip formatter={(v) => fmtBRL(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="receitas" name="Receitas" stroke="#22c55e" fill="#22c55e20" strokeWidth={2} />
              <Area type="monotone" dataKey="despesas" name="Despesas" stroke="#ef4444" fill="#ef444420" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Receitas por categoria" icon={DollarSign}>
          <DonutWithLegend data={receitaCategoryData} formatValue={fmtBRL} onSelect={name => openCategoryDetail('receita', name)} />
        </ChartCard>
        <ChartCard title="Despesas por categoria" icon={DollarSign}>
          <DonutWithLegend data={despesaCategoryData} formatValue={fmtBRL} onSelect={name => openCategoryDetail('despesa', name)} />
        </ChartCard>
      </div>

      <ChartCard title="Projeção futura" icon={Calendar}>
        <div className="flex items-center gap-1 mb-3">
          {[3, 6, 12].map(n => (
            <Button key={n} variant={projectionMonths === n ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setProjectionMonths(n)}>
              {n} meses
            </Button>
          ))}
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={projection}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <RTooltip formatter={(v) => fmtBRL(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="aReceber" name="A Receber" fill="#86efac" radius={[4, 4, 0, 0]} />
              <Bar dataKey="aPagar" name="A Pagar" fill="#fca5a5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
