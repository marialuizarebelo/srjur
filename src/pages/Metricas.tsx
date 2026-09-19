import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DollarSign, TrendingUp, Users, Scale, ClipboardList, Bell,
  BarChart3, Target, Calendar,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip as RTooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts'
import { fmtBRL } from '@/lib/format'
import { Sensitive } from '@/components/Sensitive'
import { getAdminProfiles, type ProfileOption } from '@/components/ResponsibleSelect'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const PIE_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1', '#14B8A6']

function last12Months() {
  const out: { start: string; end: string; label: string }[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
    out.push({ start, end, label: MONTHS[d.getMonth()] })
  }
  return out
}

/* ---------- KPI card ---------- */
function KpiCard({ title, value, icon: Icon, color, sensitive }: {
  title: string; value: string | number; icon: React.ElementType; color: string; sensitive?: boolean
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '1a' }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <p className="text-2xl font-bold text-foreground">
        {sensitive ? <Sensitive>{value}</Sensitive> : value}
      </p>
    </Card>
  )
}

function ChartCard({ title, icon: Icon, children, className }: {
  title: string; icon: React.ElementType; children: React.ReactNode; className?: string
}) {
  return (
    <Card className={`p-5 ${className ?? ''}`}>
      <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-primary" />{title}
      </h3>
      {children}
    </Card>
  )
}

/* ---------- Financeiro ---------- */
interface FinanceRow {
  type: 'receita' | 'despesa'
  category: string | null
  value: number
  date: string
  due_date: string | null
  paid: boolean
  impacts_cash: boolean
}

function FinanceiroTab() {
  const [rows, setRows] = useState<FinanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [projectionMonths, setProjectionMonths] = useState(3)

  useEffect(() => {
    supabase.from('finance').select('type, category, value, date, due_date, paid, impacts_cash').then(({ data }) => {
      setRows((data as FinanceRow[]) ?? [])
      setLoading(false)
    })
  }, [])

  const months = useMemo(() => last12Months(), [])

  const evolution = useMemo(() => months.map(m => {
    const mRows = rows.filter(r => r.date >= m.start && r.date <= m.end)
    return {
      month: m.label,
      receitas: mRows.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0),
      despesas: mRows.filter(r => r.type === 'despesa' && r.impacts_cash !== false).reduce((s, r) => s + Number(r.value), 0),
    }
  }), [rows, months])

  const saldoTotal = useMemo(() => rows.reduce((s, r) => {
    if (!r.paid || r.impacts_cash === false) return s
    return s + (r.type === 'receita' ? Number(r.value) : -Number(r.value))
  }, 0), [rows])

  const receitasMes = evolution[evolution.length - 1]?.receitas ?? 0
  const despesasMes = evolution[evolution.length - 1]?.despesas ?? 0

  function categoryBreakdown(type: 'receita' | 'despesa') {
    const map = new Map<string, number>()
    rows.filter(r => r.type === type && (type === 'receita' || r.impacts_cash !== false)).forEach(r => {
      const cat = r.category ?? 'Outros'
      map.set(cat, (map.get(cat) ?? 0) + Number(r.value))
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }
  const receitaCategoryData = useMemo(() => categoryBreakdown('receita'), [rows])
  const despesaCategoryData = useMemo(() => categoryBreakdown('despesa'), [rows])

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

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard title="Saldo total" value={fmtBRL(saldoTotal)} icon={DollarSign} color="#8B5CF6" sensitive />
        <KpiCard title="Receitas (mês)" value={fmtBRL(receitasMes)} icon={TrendingUp} color="#22c55e" sensitive />
        <KpiCard title="Despesas (mês)" value={fmtBRL(despesasMes)} icon={TrendingUp} color="#ef4444" sensitive />
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
          <div className="h-52">
            {receitaCategoryData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-14">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={receitaCategoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {receitaCategoryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip formatter={(v) => fmtBRL(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
        <ChartCard title="Despesas por categoria" icon={DollarSign}>
          <div className="h-52">
            {despesaCategoryData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-14">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={despesaCategoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {despesaCategoryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip formatter={(v) => fmtBRL(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
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
    </div>
  )
}

/* ---------- Comercial ---------- */
interface Lead { status: string; potential_value: number | null; created_at: string; signed_at: string | null; client_id: string | null }
interface ClientRow { status: string; created_at: string }
interface Stage { label: string; value: string; position: number }

function ComercialTab() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('leads').select('status, potential_value, created_at, signed_at, client_id'),
      supabase.from('clients').select('status, created_at'),
      supabase.from('pipeline_stages').select('label, value, position').order('position'),
    ]).then(([l, c, s]) => {
      setLeads((l.data as Lead[]) ?? [])
      setClients((c.data as ClientRow[]) ?? [])
      setStages((s.data as Stage[]) ?? [])
      setLoading(false)
    })
  }, [])

  const months = useMemo(() => last12Months(), [])

  const leadsAtivos = leads.filter(l => l.status !== 'perdido' && l.status !== 'convertido' && !l.client_id).length
  const leadsNoPeriodo = leads.filter(l => l.created_at >= months[0].start)
  const convertidos = leadsNoPeriodo.filter(l => l.status === 'convertido' || l.client_id).length
  const taxaConversao = leadsNoPeriodo.length > 0 ? (convertidos / leadsNoPeriodo.length) * 100 : 0
  const novosClientesMes = clients.filter(c => c.created_at >= months[months.length - 1].start).length

  const funil = useMemo(() => stages.map(s => ({
    stage: s.label,
    total: leads.filter(l => l.status === s.value).length,
  })).filter(s => s.total > 0), [stages, leads])

  const novosLeadsPorMes = useMemo(() => months.map(m => ({
    month: m.label,
    leads: leads.filter(l => l.created_at >= m.start && l.created_at <= m.end + 'T23:59:59').length,
  })), [leads, months])

  const novosClientesPorMes = useMemo(() => months.map(m => ({
    month: m.label,
    clientes: clients.filter(c => c.created_at >= m.start && c.created_at <= m.end + 'T23:59:59').length,
  })), [clients, months])

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard title="Leads ativos" value={leadsAtivos} icon={Target} color="#3B82F6" />
        <KpiCard title="Taxa de conversão (12m)" value={`${taxaConversao.toFixed(0)}%`} icon={TrendingUp} color="#22c55e" />
        <KpiCard title="Novos clientes (mês)" value={novosClientesMes} icon={Users} color="#8B5CF6" />
      </div>

      <ChartCard title="Funil de leads" icon={Target}>
        <div className="h-64">
          {funil.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-20">Sem leads cadastrados</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funil} layout="vertical" margin={{ left: 24 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="stage" tick={{ fontSize: 10 }} width={140} />
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="total" name="Leads" fill="#3B82F6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Novos leads por mês" icon={Target}>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={novosLeadsPorMes}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="leads" name="Leads" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Novos clientes por mês" icon={Users}>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={novosClientesPorMes}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="clientes" name="Clientes" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}

/* ---------- Produtividade ---------- */
interface Task { status: string; due_date: string | null; responsible_ids: string[] | null }
interface Deadline { status: string; due_date: string; responsible_ids: string[] | null }
interface ProcessRow { status: string }

const PROCESS_STATUS_LABELS: Record<string, string> = {
  em_andamento: 'Em andamento', concluido: 'Concluído', arquivado: 'Arquivado', suspenso: 'Suspenso',
}

function ProdutividadeTab() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [processes, setProcesses] = useState<ProcessRow[]>([])
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('tasks').select('status, due_date, responsible_ids'),
      supabase.from('deadlines').select('status, due_date, responsible_ids'),
      supabase.from('processes').select('status'),
      getAdminProfiles(),
    ]).then(([t, d, p, profs]) => {
      setTasks((t.data as Task[]) ?? [])
      setDeadlines((d.data as Deadline[]) ?? [])
      setProcesses((p.data as ProcessRow[]) ?? [])
      setProfiles(profs)
      setLoading(false)
    })
  }, [])

  const todayStr = new Date().toISOString().slice(0, 10)
  const tarefasPendentes = tasks.filter(t => t.status === 'pendente').length
  const tarefasAtrasadas = tasks.filter(t => t.status === 'pendente' && t.due_date && t.due_date < todayStr).length
  const prazosPendentes = deadlines.filter(d => d.status === 'pendente').length
  const prazosAtrasados = deadlines.filter(d => d.status === 'pendente' && d.due_date < todayStr).length

  const months = useMemo(() => last12Months(), [])
  const tarefasPorMes = useMemo(() => months.map(m => {
    const mTasks = tasks.filter(t => t.due_date && t.due_date >= m.start && t.due_date <= m.end)
    return {
      month: m.label,
      concluidas: mTasks.filter(t => t.status === 'concluida').length,
      atrasadas: mTasks.filter(t => t.status === 'pendente' && t.due_date! < todayStr).length,
    }
  }), [tasks, months])

  const prazosStatus = useMemo(() => ([
    { name: 'Cumpridos', value: deadlines.filter(d => d.status === 'cumprido').length },
    { name: 'Perdidos', value: deadlines.filter(d => d.status === 'perdido').length },
    { name: 'Pendentes', value: deadlines.filter(d => d.status === 'pendente').length },
  ].filter(s => s.value > 0)), [deadlines])

  const processosPorStatus = useMemo(() => {
    const map = new Map<string, number>()
    processes.forEach(p => map.set(p.status, (map.get(p.status) ?? 0) + 1))
    return Array.from(map.entries()).map(([status, total]) => ({ status: PROCESS_STATUS_LABELS[status] ?? status, total }))
  }, [processes])

  const cargaPorResponsavel = useMemo(() => {
    const map = new Map<string, number>()
    const openTasks = tasks.filter(t => t.status === 'pendente')
    const openDeadlines = deadlines.filter(d => d.status === 'pendente')
    for (const t of openTasks) for (const id of t.responsible_ids ?? []) map.set(id, (map.get(id) ?? 0) + 1)
    for (const d of openDeadlines) for (const id of d.responsible_ids ?? []) map.set(id, (map.get(id) ?? 0) + 1)
    return Array.from(map.entries())
      .map(([id, total]) => ({ name: profiles.find(p => p.id === id)?.display_name ?? 'Sem nome', total }))
      .sort((a, b) => b.total - a.total)
  }, [tasks, deadlines, profiles])

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Tarefas pendentes" value={tarefasPendentes} icon={ClipboardList} color="#3B82F6" />
        <KpiCard title="Tarefas atrasadas" value={tarefasAtrasadas} icon={ClipboardList} color="#ef4444" />
        <KpiCard title="Prazos pendentes" value={prazosPendentes} icon={Bell} color="#F59E0B" />
        <KpiCard title="Prazos atrasados" value={prazosAtrasados} icon={Bell} color="#ef4444" />
      </div>

      <ChartCard title="Tarefas concluídas x atrasadas por mês" icon={ClipboardList}>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tarefasPorMes}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="concluidas" name="Concluídas" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="atrasadas" name="Atrasadas" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Prazos: cumpridos x perdidos" icon={Bell}>
          <div className="h-52">
            {prazosStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-14">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={prazosStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {prazosStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
        <ChartCard title="Processos por status" icon={Scale}>
          <div className="h-52">
            {processosPorStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-14">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={processosPorStatus}>
                  <XAxis dataKey="status" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="total" name="Processos" fill="#6366F1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Carga por responsável (pendências abertas)" icon={Users}>
        <div className="h-56">
          {cargaPorResponsavel.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">Sem pendências atribuídas</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cargaPorResponsavel} layout="vertical" margin={{ left: 24 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="total" name="Pendências" fill="#14B8A6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>
    </div>
  )
}

/* ---------- Métricas (main) ---------- */
const TABS = [
  { key: 'financeiro', label: 'Financeiro', icon: DollarSign },
  { key: 'comercial', label: 'Comercial', icon: Target },
  { key: 'produtividade', label: 'Produtividade', icon: ClipboardList },
] as const

type TabKey = typeof TABS[number]['key']

export default function Metricas() {
  const [tab, setTab] = useState<TabKey>('financeiro')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Métricas</h1>
        <p className="text-sm text-muted-foreground">Indicadores comerciais, financeiros e de produtividade do escritório</p>
      </div>

      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 flex-wrap w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'financeiro' && <FinanceiroTab />}
      {tab === 'comercial' && <ComercialTab />}
      {tab === 'produtividade' && <ProdutividadeTab />}
    </div>
  )
}
