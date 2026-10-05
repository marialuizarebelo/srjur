import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { DollarSign, TrendingUp, Users, Target, Scale, ClipboardList } from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import { Sensitive } from '@/components/Sensitive'
import { KpiCard, trendText, DetailDialog, useDetail, useUnidadeFilter, matchUnidadeFinance, matchUnidadeCliente, UnidadeNotice } from './shared'
import { Card } from '@/components/ui/card'

interface FinanceLite { type: string; value: number; paid: boolean; impacts_cash: boolean; date: string; description: string; category: string | null; business_unit: string | null; refletir_metricas: boolean }
interface ClientLite { name: string; status: string; is_juridico: boolean; is_saas: boolean }
interface LeadLite { name: string; status: string; client_id: string | null; created_at: string }
interface ProcessLite { title: string; status: string }
interface TaskLite { title: string; status: string; due_date: string | null }
interface DeadlineLite { title: string; status: string; due_date: string }

export default function VisaoGeralTab() {
  const detail = useDetail()
  const [loading, setLoading] = useState(true)
  const { unidade } = useUnidadeFilter()
  const [finAllRaw, setFinAll] = useState<FinanceLite[]>([])
  const [finMonthRaw, setFinMonth] = useState<FinanceLite[]>([])
  const [finPrevRaw, setFinPrev] = useState<FinanceLite[]>([])
  const [clientsRaw, setClients] = useState<ClientLite[]>([])
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
        supabase.from('finance').select('type, value, paid, impacts_cash, date, description, category, business_unit, refletir_metricas'),
        supabase.from('finance').select('type, value, impacts_cash, date, description, category, business_unit, refletir_metricas').gte('date', monthStart).lte('date', monthEnd),
        supabase.from('finance').select('type, value, paid, impacts_cash, date, description, category, business_unit, refletir_metricas').gte('date', prevMonthStart).lte('date', prevMonthEnd),
        supabase.from('clients').select('name, status, is_juridico, is_saas').eq('status', 'ativo').eq('is_cortesia', false),
        supabase.from('leads').select('name, status, client_id, created_at').not('status', 'in', '(perdido,convertido)').is('client_id', null),
        supabase.from('processes').select('title, status').eq('status', 'em_andamento'),
        supabase.from('tasks').select('title, status, due_date').eq('status', 'pendente').lt('due_date', today),
        supabase.from('deadlines').select('title, status, due_date').eq('status', 'pendente').lt('due_date', today),
      ])

      const reflete = (rows: FinanceLite[]) => rows.filter(r => r.refletir_metricas !== false)
      setFinAll(reflete((fa as FinanceLite[]) ?? []))
      setFinMonth(reflete((fm as FinanceLite[]) ?? []))
      setFinPrev(reflete((fmPrev as FinanceLite[]) ?? []))
      setClients((cl as ClientLite[]) ?? [])
      setLeads((ld as LeadLite[]) ?? [])
      setProcesses((pr as ProcessLite[]) ?? [])
      setTasksAtrasadas((ta as TaskLite[]) ?? [])
      setDeadlinesAtrasados((da as DeadlineLite[]) ?? [])
      setLoading(false)
    })()
  }, [])

  const finAll = useMemo(() => finAllRaw.filter(r => matchUnidadeFinance(r.business_unit, unidade)), [finAllRaw, unidade])
  const finMonth = useMemo(() => finMonthRaw.filter(r => matchUnidadeFinance(r.business_unit, unidade)), [finMonthRaw, unidade])
  const finPrev = useMemo(() => finPrevRaw.filter(r => matchUnidadeFinance(r.business_unit, unidade)), [finPrevRaw, unidade])
  const clients = useMemo(() => clientsRaw.filter(c => matchUnidadeCliente(c, unidade)), [clientsRaw, unidade])
  const receitasMesAnterior = finPrev.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0)
  const despesasMesAnterior = finPrev.filter(r => r.type === 'despesa' && r.impacts_cash !== false).reduce((s, r) => s + Number(r.value), 0)

  // Comparativo fixo (não depende da Visão escolhida): Advocacia, SaaS e a soma dos dois.
  const comparativo = useMemo(() => {
    const calc = (rows: FinanceLite[]) => {
      const receitas = rows.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0)
      const despesas = rows.filter(r => r.type === 'despesa' && r.impacts_cash !== false).reduce((s, r) => s + Number(r.value), 0)
      return { receitas, despesas, resultado: receitas - despesas, margem: receitas > 0 ? ((receitas - despesas) / receitas) * 100 : 0 }
    }
    return [
      { key: 'adv', label: 'Advocacia', ...calc(finMonthRaw.filter(r => r.business_unit !== 'saas')) },
      { key: 'saas', label: 'SaaS', ...calc(finMonthRaw.filter(r => r.business_unit === 'saas')) },
      { key: 'emp', label: 'Empresa toda', ...calc(finMonthRaw) },
    ]
  }, [finMonthRaw])

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
      {unidade === 'saas' && <UnidadeNotice>Leads, processos, tarefas e prazos não são separados por unidade — aparecem iguais em todas as visões. Os valores financeiros e de clientes seguem a visão escolhida.</UnidadeNotice>}
      <p className="text-sm text-muted-foreground">Panorama geral do escritório neste mês. Para ver o detalhe e filtrar por período, use as áreas acima.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KpiCard title="Saldo total" value={fmtBRL(saldoTotal)} icon={DollarSign} color="#8577C9" sensitive onClick={openSaldoDetail} />
        <KpiCard title="Receitas (mês)" value={fmtBRL(receitasMes)} icon={TrendingUp} color="#6E9C7D" sensitive trend={trendText(receitasMes, receitasMesAnterior, 'vs mês anterior')} onClick={openReceitasDetail} />
        <KpiCard title="Despesas (mês)" value={fmtBRL(despesasMes)} icon={TrendingUp} color="#D96C87" sensitive trend={trendText(despesasMes, despesasMesAnterior, 'vs mês anterior')} onClick={openDespesasDetail} />
        <KpiCard title="Resultado líquido (mês)" value={fmtBRL(resultadoLiquido)} icon={DollarSign} color={resultadoLiquido >= 0 ? '#6E9C7D' : '#D96C87'} sensitive trend={trendText(resultadoLiquido, receitasMesAnterior - despesasMesAnterior, 'vs mês anterior')} onClick={openResultadoDetail} />
        <KpiCard title="Clientes ativos" value={clients.length} icon={Users} color="#6A8FC7" onClick={openClientesDetail} />
        <KpiCard title="Leads ativos" value={leads.length} icon={Target} color="#D9A441" onClick={openLeadsDetail} />
        <KpiCard title="Processos ativos" hint="Processos jurídicos em andamento (só existem na Advocacia)." value={processes.length} icon={Scale} color="#7A84C9" onClick={openProcessosDetail} />
        <KpiCard title="Pendências atrasadas" value={tasksAtrasadas.length + deadlinesAtrasados.length} icon={ClipboardList} color="#D96C87" onClick={openPendenciasDetail} />
      </div>

      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-1">Advocacia × SaaS × Empresa toda (mês)</h3>
        <p className="text-xs text-muted-foreground mb-3">Sempre mostra as duas unidades lado a lado e a soma, independente da Visão escolhida acima.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 pr-4 font-semibold"></th>
                {comparativo.map(c => <th key={c.key} className={`py-1.5 px-3 font-semibold text-right ${c.key === 'emp' ? 'text-foreground' : ''}`}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {([['Receitas', 'receitas'], ['Despesas', 'despesas'], ['Resultado', 'resultado']] as const).map(([label, k]) => (
                <tr key={k} className="border-t border-border/60">
                  <td className="py-2 pr-4 text-muted-foreground">{label}</td>
                  {comparativo.map(c => <td key={c.key} className={`py-2 px-3 text-right ${c.key === 'emp' ? 'font-semibold' : ''}`}><Sensitive>{fmtBRL(c[k])}</Sensitive></td>)}
                </tr>
              ))}
              <tr className="border-t border-border/60">
                <td className="py-2 pr-4 text-muted-foreground">Margem</td>
                {comparativo.map(c => <td key={c.key} className={`py-2 px-3 text-right ${c.key === 'emp' ? 'font-semibold' : ''}`}>{c.margem.toFixed(0)}%</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
