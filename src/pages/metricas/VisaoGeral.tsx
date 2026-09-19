import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { DollarSign, TrendingUp, Users, Target, Scale, ClipboardList } from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import { KpiCard, trendText, DetailDialog, useDetail } from './shared'

interface FinanceLite { type: string; value: number; paid: boolean; impacts_cash: boolean; date: string; description: string; category: string | null }
interface ClientLite { name: string; status: string }
interface LeadLite { name: string; status: string; client_id: string | null; created_at: string }
interface ProcessLite { title: string; status: string }
interface TaskLite { title: string; status: string; due_date: string | null }
interface DeadlineLite { title: string; status: string; due_date: string }

export default function VisaoGeralTab() {
  const detail = useDetail()
  const [loading, setLoading] = useState(true)
  const [finAll, setFinAll] = useState<FinanceLite[]>([])
  const [finMonth, setFinMonth] = useState<FinanceLite[]>([])
  const [receitasMesAnterior, setReceitasMesAnterior] = useState(0)
  const [despesasMesAnterior, setDespesasMesAnterior] = useState(0)
  const [clients, setClients] = useState<ClientLite[]>([])
  const [leads, setLeads] = useState<LeadLite[]>([])
  const [processes, setProcesses] = useState<ProcessLite[]>([])
  const [tasksAtrasadas, setTasksAtrasadas] = useState<TaskLite[]>([])
  const [deadlinesAtrasados, setDeadlinesAtrasados] = useState<DeadlineLite[]>([])

  useEffect(() => {
    (async () => {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10)
      const today = now.toISOString().slice(0, 10)

      const [
        { data: fa }, { data: fm }, { data: fmPrev },
        { data: cl }, { data: ld }, { data: pr }, { data: ta }, { data: da },
      ] = await Promise.all([
        supabase.from('finance').select('type, value, paid, impacts_cash, date, description, category'),
        supabase.from('finance').select('type, value, impacts_cash, date, description, category').gte('date', monthStart).lte('date', monthEnd),
        supabase.from('finance').select('type, value, impacts_cash').gte('date', prevMonthStart).lte('date', prevMonthEnd),
        supabase.from('clients').select('name, status').eq('status', 'ativo'),
        supabase.from('leads').select('name, status, client_id, created_at').not('status', 'in', '(perdido,convertido)').is('client_id', null),
        supabase.from('processes').select('title, status').eq('status', 'em_andamento'),
        supabase.from('tasks').select('title, status, due_date').eq('status', 'pendente').lt('due_date', today),
        supabase.from('deadlines').select('title, status, due_date').eq('status', 'pendente').lt('due_date', today),
      ])

      setFinAll((fa as FinanceLite[]) ?? [])
      setFinMonth((fm as FinanceLite[]) ?? [])
      const finPrev = (fmPrev as FinanceLite[]) ?? []
      setReceitasMesAnterior(finPrev.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0))
      setDespesasMesAnterior(finPrev.filter(r => r.type === 'despesa' && r.impacts_cash !== false).reduce((s, r) => s + Number(r.value), 0))
      setClients((cl as ClientLite[]) ?? [])
      setLeads((ld as LeadLite[]) ?? [])
      setProcesses((pr as ProcessLite[]) ?? [])
      setTasksAtrasadas((ta as TaskLite[]) ?? [])
      setDeadlinesAtrasados((da as DeadlineLite[]) ?? [])
      setLoading(false)
    })()
  }, [])

  const saldoTotal = useMemo(() => finAll.reduce((s, r) => {
    if (!r.paid || r.impacts_cash === false) return s
    return s + (r.type === 'receita' ? Number(r.value) : -Number(r.value))
  }, 0), [finAll])
  const receitasMes = useMemo(() => finMonth.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0), [finMonth])
  const despesasMes = useMemo(() => finMonth.filter(r => r.type === 'despesa' && r.impacts_cash !== false).reduce((s, r) => s + Number(r.value), 0), [finMonth])
  const resultadoLiquido = receitasMes - despesasMes

  function openSaldoDetail() {
    const list = finAll.filter(r => r.paid && r.impacts_cash !== false)
    detail.show('Lançamentos pagos que compõem o saldo', list.map((r, i) => ({ id: String(i), label: r.description, sublabel: `${fmtDate(r.date)} · ${r.category ?? 'Outros'}`, value: fmtBRL(Number(r.value)) })))
  }
  function openReceitasDetail() {
    const list = finMonth.filter(r => r.type === 'receita')
    detail.show('Receitas do mês', list.map((r, i) => ({ id: String(i), label: r.description, sublabel: fmtDate(r.date), value: fmtBRL(Number(r.value)) })))
  }
  function openDespesasDetail() {
    const list = finMonth.filter(r => r.type === 'despesa' && r.impacts_cash !== false)
    detail.show('Despesas do mês', list.map((r, i) => ({ id: String(i), label: r.description, sublabel: fmtDate(r.date), value: fmtBRL(Number(r.value)) })))
  }
  function openResultadoDetail() {
    const list = finMonth.filter(r => r.type === 'receita' || r.impacts_cash !== false)
    detail.show('Receitas e despesas do mês', list.map((r, i) => ({ id: String(i), label: r.description, sublabel: fmtDate(r.date), value: fmtBRL(Number(r.value)) })))
  }
  function openClientesDetail() {
    detail.show('Clientes ativos', clients.map((c, i) => ({ id: String(i), label: c.name })))
  }
  function openLeadsDetail() {
    detail.show('Leads ativos', leads.map((l, i) => ({ id: String(i), label: l.name, sublabel: fmtDate(l.created_at) })))
  }
  function openProcessosDetail() {
    detail.show('Processos ativos', processes.map((p, i) => ({ id: String(i), label: p.title })))
  }
  function openPendenciasDetail() {
    const rows = [
      ...tasksAtrasadas.map((t, i) => ({ id: `t${i}`, label: t.title, sublabel: `Tarefa · ${t.due_date ? fmtDate(t.due_date) : ''}` })),
      ...deadlinesAtrasados.map((d, i) => ({ id: `d${i}`, label: d.title, sublabel: `Prazo · ${fmtDate(d.due_date)}` })),
    ]
    detail.show('Pendências atrasadas', rows)
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Panorama geral do escritório neste mês. Veja o detalhe em cada aba.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KpiCard title="Saldo total" value={fmtBRL(saldoTotal)} icon={DollarSign} color="#8B5CF6" sensitive onClick={openSaldoDetail} />
        <KpiCard title="Receitas (mês)" value={fmtBRL(receitasMes)} icon={TrendingUp} color="#22c55e" sensitive trend={trendText(receitasMes, receitasMesAnterior, 'vs mês anterior')} onClick={openReceitasDetail} />
        <KpiCard title="Despesas (mês)" value={fmtBRL(despesasMes)} icon={TrendingUp} color="#ef4444" sensitive trend={trendText(despesasMes, despesasMesAnterior, 'vs mês anterior')} onClick={openDespesasDetail} />
        <KpiCard title="Resultado líquido (mês)" value={fmtBRL(resultadoLiquido)} icon={DollarSign} color={resultadoLiquido >= 0 ? '#22c55e' : '#ef4444'} sensitive trend={trendText(resultadoLiquido, receitasMesAnterior - despesasMesAnterior, 'vs mês anterior')} onClick={openResultadoDetail} />
        <KpiCard title="Clientes ativos" value={clients.length} icon={Users} color="#3B82F6" onClick={openClientesDetail} />
        <KpiCard title="Leads ativos" value={leads.length} icon={Target} color="#F59E0B" onClick={openLeadsDetail} />
        <KpiCard title="Processos ativos" value={processes.length} icon={Scale} color="#6366F1" onClick={openProcessosDetail} />
        <KpiCard title="Pendências atrasadas" value={tasksAtrasadas.length + deadlinesAtrasados.length} icon={ClipboardList} color="#ef4444" onClick={openPendenciasDetail} />
      </div>

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
