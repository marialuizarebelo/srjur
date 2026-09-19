import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { DollarSign, TrendingUp, Users, Target, Scale, ClipboardList } from 'lucide-react'
import { fmtBRL } from '@/lib/format'
import { KpiCard, trendText } from './shared'

export default function VisaoGeralTab() {
  const [loading, setLoading] = useState(true)
  const [saldoTotal, setSaldoTotal] = useState(0)
  const [receitasMes, setReceitasMes] = useState(0)
  const [despesasMes, setDespesasMes] = useState(0)
  const [receitasMesAnterior, setReceitasMesAnterior] = useState(0)
  const [despesasMesAnterior, setDespesasMesAnterior] = useState(0)
  const [clientesAtivos, setClientesAtivos] = useState(0)
  const [leadsAtivos, setLeadsAtivos] = useState(0)
  const [processosAtivos, setProcessosAtivos] = useState(0)
  const [pendenciasAtrasadas, setPendenciasAtrasadas] = useState(0)

  useEffect(() => {
    (async () => {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10)
      const today = now.toISOString().slice(0, 10)

      const [
        { data: finAll }, { data: finMonth }, { data: finMonthAnterior },
        { count: clientesCount }, { count: leadsCount }, { count: processosCount },
        { count: tarefasAtrasadasCount }, { count: prazosAtrasadosCount },
      ] = await Promise.all([
        supabase.from('finance').select('type, value, paid, impacts_cash'),
        supabase.from('finance').select('type, value, impacts_cash').gte('date', monthStart).lte('date', monthEnd),
        supabase.from('finance').select('type, value, impacts_cash').gte('date', prevMonthStart).lte('date', prevMonthEnd),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'ativo'),
        supabase.from('leads').select('id', { count: 'exact', head: true }).not('status', 'in', '(perdido,convertido)').is('client_id', null),
        supabase.from('processes').select('id', { count: 'exact', head: true }).eq('status', 'em_andamento'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'pendente').lt('due_date', today),
        supabase.from('deadlines').select('id', { count: 'exact', head: true }).eq('status', 'pendente').lt('due_date', today),
      ])

      const saldo = (finAll ?? []).reduce((s: number, r: any) => {
        if (!r.paid || r.impacts_cash === false) return s
        return s + (r.type === 'receita' ? Number(r.value) : -Number(r.value))
      }, 0)
      setSaldoTotal(saldo)
      setReceitasMes((finMonth ?? []).filter((r: any) => r.type === 'receita').reduce((s: number, r: any) => s + Number(r.value), 0))
      setDespesasMes((finMonth ?? []).filter((r: any) => r.type === 'despesa' && r.impacts_cash !== false).reduce((s: number, r: any) => s + Number(r.value), 0))
      setReceitasMesAnterior((finMonthAnterior ?? []).filter((r: any) => r.type === 'receita').reduce((s: number, r: any) => s + Number(r.value), 0))
      setDespesasMesAnterior((finMonthAnterior ?? []).filter((r: any) => r.type === 'despesa' && r.impacts_cash !== false).reduce((s: number, r: any) => s + Number(r.value), 0))
      setClientesAtivos(clientesCount ?? 0)
      setLeadsAtivos(leadsCount ?? 0)
      setProcessosAtivos(processosCount ?? 0)
      setPendenciasAtrasadas((tarefasAtrasadasCount ?? 0) + (prazosAtrasadosCount ?? 0))
      setLoading(false)
    })()
  }, [])

  const resultadoLiquido = useMemo(() => receitasMes - despesasMes, [receitasMes, despesasMes])

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Panorama geral do escritório neste mês. Veja o detalhe em cada aba.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KpiCard title="Saldo total" value={fmtBRL(saldoTotal)} icon={DollarSign} color="#8B5CF6" sensitive />
        <KpiCard title="Receitas (mês)" value={fmtBRL(receitasMes)} icon={TrendingUp} color="#22c55e" sensitive trend={trendText(receitasMes, receitasMesAnterior, 'vs mês anterior')} />
        <KpiCard title="Despesas (mês)" value={fmtBRL(despesasMes)} icon={TrendingUp} color="#ef4444" sensitive trend={trendText(despesasMes, despesasMesAnterior, 'vs mês anterior')} />
        <KpiCard title="Resultado líquido (mês)" value={fmtBRL(resultadoLiquido)} icon={DollarSign} color={resultadoLiquido >= 0 ? '#22c55e' : '#ef4444'} sensitive trend={trendText(resultadoLiquido, receitasMesAnterior - despesasMesAnterior, 'vs mês anterior')} />
        <KpiCard title="Clientes ativos" value={clientesAtivos} icon={Users} color="#3B82F6" />
        <KpiCard title="Leads ativos" value={leadsAtivos} icon={Target} color="#F59E0B" />
        <KpiCard title="Processos ativos" value={processosAtivos} icon={Scale} color="#6366F1" />
        <KpiCard title="Pendências atrasadas" value={pendenciasAtrasadas} icon={ClipboardList} color="#ef4444" />
      </div>
    </div>
  )
}
