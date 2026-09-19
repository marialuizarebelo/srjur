import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Scale, Users, Bell, Gavel, Handshake, Trophy } from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import {
  usePeriod, PeriodPicker, KpiCard, ChartCard, DetailDialog, useDetail,
  useResponsavelFilter, ResponsavelFilter,
} from './shared'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts'

interface ProcessRow { id: string; title: string; status: string; area: string | null; created_at: string; closed_date: string | null; client_id: string | null; responsible_ids: string[] | null }
interface ClientRow { id: string; name: string; area: string | null; status: string; responsible_ids: string[] | null }
interface DeadlineRow { title: string; status: string; due_date: string; responsible_ids: string[] | null }
interface TaskRow { title: string; type: string; status: string; due_date: string | null; responsible_ids: string[] | null }
interface FinanceLite { category: string | null; type: string; value: number; date: string; paid: boolean; process_id: string | null; client_id: string | null; description: string; business_unit: string | null }

export default function JuridicoTab() {
  const period = usePeriod()
  const detail = useDetail()
  const respFilter = useResponsavelFilter()
  const [loading, setLoading] = useState(true)
  const [processesRaw, setProcessesRaw] = useState<ProcessRow[]>([])
  const [clientsRaw, setClientsRaw] = useState<ClientRow[]>([])
  const [deadlinesRaw, setDeadlinesRaw] = useState<DeadlineRow[]>([])
  const [tasksRaw, setTasksRaw] = useState<TaskRow[]>([])
  const [financeAll, setFinanceAll] = useState<FinanceLite[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('processes').select('id, title, status, area, created_at, closed_date, client_id, responsible_ids'),
      supabase.from('clients').select('id, name, area, status, responsible_ids'),
      supabase.from('deadlines').select('title, status, due_date, responsible_ids'),
      supabase.from('tasks').select('title, type, status, due_date, responsible_ids'),
      supabase.from('finance').select('category, type, value, date, paid, process_id, client_id, description, business_unit'),
    ]).then(([p, c, d, t, f]) => {
      setProcessesRaw((p.data as ProcessRow[]) ?? [])
      setClientsRaw((c.data as ClientRow[]) ?? [])
      setDeadlinesRaw((d.data as DeadlineRow[]) ?? [])
      setTasksRaw((t.data as TaskRow[]) ?? [])
      setFinanceAll((f.data as FinanceLite[]) ?? [])
      setLoading(false)
    })
  }, [])

  const processes = useMemo(() => processesRaw.filter(p => respFilter.matches(p.responsible_ids)), [processesRaw, respFilter.responsavelId])
  const clients = useMemo(() => clientsRaw.filter(c => respFilter.matches(c.responsible_ids)), [clientsRaw, respFilter.responsavelId])
  const deadlines = useMemo(() => deadlinesRaw.filter(d => respFilter.matches(d.responsible_ids)), [deadlinesRaw, respFilter.responsavelId])
  const tasks = useMemo(() => tasksRaw.filter(t => respFilter.matches(t.responsible_ids)), [tasksRaw, respFilter.responsavelId])
  const finance = useMemo(() => {
    const advocacia = financeAll.filter(f => f.business_unit !== 'saas')
    if (!respFilter.responsavelId) return advocacia
    const processIds = new Set(processes.map(p => p.id))
    const clientIds = new Set(clients.map(c => c.id))
    return advocacia.filter(f => (f.process_id && processIds.has(f.process_id)) || (f.client_id && clientIds.has(f.client_id)))
  }, [financeAll, processes, clients, respFilter.responsavelId])

  const todayStr = new Date().toISOString().slice(0, 10)
  const clientesAtivos = clients.filter(c => c.status === 'ativo').length
  const processosAtivos = processes.filter(p => p.status === 'em_andamento').length
  const novosProcessos = processes.filter(p => p.created_at >= period.range.start && p.created_at <= period.range.end + 'T23:59:59').length
  const processosEncerrados = processes.filter(p => p.closed_date && p.closed_date >= period.range.start && p.closed_date <= period.range.end).length

  const prazosNoPeriodo = deadlines.filter(d => d.due_date >= period.range.start && d.due_date <= period.range.end)
  const prazosConcluidos = prazosNoPeriodo.filter(d => d.status === 'cumprido').length
  const prazosAtrasados = deadlines.filter(d => d.status === 'pendente' && d.due_date < todayStr).length

  const audienciasRealizadas = tasks.filter(t => t.type === 'audiencia' && t.status === 'concluida' && t.due_date && t.due_date >= period.range.start && t.due_date <= period.range.end).length

  const acordosNoPeriodo = useMemo(() => finance.filter(f => f.category === 'Acordo' && f.type === 'receita' && f.date >= period.range.start && f.date <= period.range.end), [finance, period.range])
  const valorAcordos = acordosNoPeriodo.reduce((s, f) => s + Number(f.value), 0)

  const honorariosExitoPrevistos = useMemo(() =>
    finance.filter(f => f.category === 'Êxito' && f.type === 'receita' && !f.paid).reduce((s, f) => s + Number(f.value), 0)
  , [finance])

  const processMap = useMemo(() => new Map(processes.map(p => [p.id, p])), [processes])
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])

  const receitaPorArea = useMemo(() => {
    const map = new Map<string, number>()
    const inPeriodo = finance.filter(f => f.type === 'receita' && f.date >= period.range.start && f.date <= period.range.end)
    for (const f of inPeriodo) {
      const area = (f.process_id && processMap.get(f.process_id)?.area) || (f.client_id && clientMap.get(f.client_id)?.area) || 'Não classificado'
      map.set(area, (map.get(area) ?? 0) + Number(f.value))
    }
    return Array.from(map.entries()).map(([area, total]) => ({ area, total })).sort((a, b) => b.total - a.total)
  }, [finance, period.range, processMap, clientMap])

  function openAreaDetail(area: string) {
    const inPeriodo = finance.filter(f => f.type === 'receita' && f.date >= period.range.start && f.date <= period.range.end)
    const list = inPeriodo.filter(f => {
      const a = (f.process_id && processMap.get(f.process_id)?.area) || (f.client_id && clientMap.get(f.client_id)?.area) || 'Não classificado'
      return a === area
    })
    detail.show(`Receita — ${area}`, list.map((f, i) => ({ id: String(i), label: f.description, sublabel: fmtDate(f.date), value: fmtBRL(Number(f.value)) })))
  }

  const processosAtivosList = processes.filter(p => p.status === 'em_andamento')
  const novosProcessosList = processes.filter(p => p.created_at >= period.range.start && p.created_at <= period.range.end + 'T23:59:59')
  const processosEncerradosList = processes.filter(p => p.closed_date && p.closed_date >= period.range.start && p.closed_date <= period.range.end)
  const prazosAtrasadosList = deadlines.filter(d => d.status === 'pendente' && d.due_date < todayStr)
  const audienciasRealizadasList = tasks.filter(t => t.type === 'audiencia' && t.status === 'concluida' && t.due_date && t.due_date >= period.range.start && t.due_date <= period.range.end)
  const honorariosExitoList = finance.filter(f => f.category === 'Êxito' && f.type === 'receita' && !f.paid)
  const clientesAtivosList = clients.filter(c => c.status === 'ativo')

  function openClientsDetail() {
    detail.show('Clientes ativos', clientesAtivosList.map((c, i) => ({ id: String(i), label: c.name })))
  }
  function openProcessesDetail(title: string, list: ProcessRow[]) {
    detail.show(title, list.map((p, i) => ({ id: String(i), label: p.title, sublabel: p.area ?? undefined })))
  }
  function openDeadlinesDetail(title: string, list: DeadlineRow[]) {
    detail.show(title, list.map((d, i) => ({ id: String(i), label: d.title, sublabel: fmtDate(d.due_date) })))
  }
  function openTasksDetail(title: string, list: TaskRow[]) {
    detail.show(title, list.map((t, i) => ({ id: String(i), label: t.title, sublabel: t.due_date ? fmtDate(t.due_date) : undefined })))
  }
  function openFinanceDetail(title: string, list: FinanceLite[]) {
    detail.show(title, list.map((f, i) => ({ id: String(i), label: f.description, sublabel: fmtDate(f.date), value: fmtBRL(Number(f.value)) })))
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <PeriodPicker p={period} />
        <ResponsavelFilter f={respFilter} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KpiCard title="Clientes ativos" value={clientesAtivos} icon={Users} color="#3B82F6" onClick={openClientsDetail} />
        <KpiCard title="Processos ativos" value={processosAtivos} icon={Scale} color="#6366F1" onClick={() => openProcessesDetail('Processos ativos', processosAtivosList)} />
        <KpiCard title="Novos processos (período)" value={novosProcessos} icon={Scale} color="#22c55e" onClick={() => openProcessesDetail('Novos processos no período', novosProcessosList)} />
        <KpiCard title="Processos encerrados (período)" value={processosEncerrados} icon={Scale} color="#94a3b8" onClick={() => openProcessesDetail('Processos encerrados no período', processosEncerradosList)} />
        <KpiCard title="Prazos no período" value={prazosNoPeriodo.length} icon={Bell} color="#F59E0B" onClick={() => openDeadlinesDetail('Prazos no período', prazosNoPeriodo)} />
        <KpiCard title="Prazos concluídos (período)" value={prazosConcluidos} icon={Bell} color="#22c55e" onClick={() => openDeadlinesDetail('Prazos concluídos no período', prazosNoPeriodo.filter(d => d.status === 'cumprido'))} />
        <KpiCard title="Prazos atrasados" value={prazosAtrasados} icon={Bell} color="#ef4444" onClick={() => openDeadlinesDetail('Prazos atrasados', prazosAtrasadosList)} />
        <KpiCard title="Audiências realizadas (período)" value={audienciasRealizadas} icon={Gavel} color="#8B5CF6" onClick={() => openTasksDetail('Audiências realizadas no período', audienciasRealizadasList)} />
        <KpiCard title="Acordos fechados (período)" value={acordosNoPeriodo.length} icon={Handshake} color="#14B8A6" trend={fmtBRL(valorAcordos)} onClick={() => openFinanceDetail('Acordos fechados no período', acordosNoPeriodo)} />
        <KpiCard title="Honorários de êxito previstos" value={fmtBRL(honorariosExitoPrevistos)} icon={Trophy} color="#F59E0B" sensitive onClick={() => openFinanceDetail('Honorários de êxito previstos', honorariosExitoList)} />
      </div>

      <ChartCard title="Receita por área jurídica (período)" icon={Scale}>
        <div className="h-64">
          {receitaPorArea.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-20">Sem receita classificada por área neste período</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={receitaPorArea} layout="vertical" margin={{ left: 24 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="area" tick={{ fontSize: 10 }} width={130} />
                <RTooltip formatter={(v) => fmtBRL(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="total" name="Receita" fill="#6366F1" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => openAreaDetail(d.area)} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
