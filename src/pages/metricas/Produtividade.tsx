import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Users, Scale, ClipboardList, Bell } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts'
import { fmtDate } from '@/lib/format'
import {
  monthsBack, KpiCard, ChartCard, DonutWithLegend,
  DetailDialog, useDetail, AttentionPanel, type Attention, type DetailRow,
  useResponsavelFilter, ResponsavelFilter, TrendChart,
} from './shared'

interface Task { title: string; status: string; due_date: string | null; responsible_ids: string[] | null }
interface Deadline { title: string; status: string; due_date: string; responsible_ids: string[] | null }
interface ProcessRow { title: string; status: string; responsible_ids: string[] | null }

const PROCESS_STATUS_LABELS: Record<string, string> = {
  em_andamento: 'Em andamento', concluido: 'Concluído', arquivado: 'Arquivado', suspenso: 'Suspenso',
}

export default function ProdutividadeTab() {
  const [tasksRaw, setTasksRaw] = useState<Task[]>([])
  const [deadlinesRaw, setDeadlinesRaw] = useState<Deadline[]>([])
  const [processesRaw, setProcessesRaw] = useState<ProcessRow[]>([])
  const [loading, setLoading] = useState(true)
  const detail = useDetail()
  const respFilter = useResponsavelFilter()
  const profiles = respFilter.profiles

  useEffect(() => {
    Promise.all([
      supabase.from('tasks').select('title, status, due_date, responsible_ids'),
      supabase.from('deadlines').select('title, status, due_date, responsible_ids'),
      supabase.from('processes').select('title, status, responsible_ids'),
    ]).then(([t, d, p]) => {
      setTasksRaw((t.data as Task[]) ?? [])
      setDeadlinesRaw((d.data as Deadline[]) ?? [])
      setProcessesRaw((p.data as ProcessRow[]) ?? [])
      setLoading(false)
    })
  }, [])

  const tasks = useMemo(() => tasksRaw.filter(t => respFilter.matches(t.responsible_ids)), [tasksRaw, respFilter.responsavelId])
  const deadlines = useMemo(() => deadlinesRaw.filter(d => respFilter.matches(d.responsible_ids)), [deadlinesRaw, respFilter.responsavelId])
  const processes = useMemo(() => processesRaw.filter(p => respFilter.matches(p.responsible_ids)), [processesRaw, respFilter.responsavelId])

  const todayStr = new Date().toISOString().slice(0, 10)
  const tarefasPendentes = tasks.filter(t => t.status === 'pendente').length
  const tarefasAtrasadas = tasks.filter(t => t.status === 'pendente' && t.due_date && t.due_date < todayStr).length
  const prazosPendentes = deadlines.filter(d => d.status === 'pendente').length
  const prazosAtrasados = deadlines.filter(d => d.status === 'pendente' && d.due_date < todayStr).length

  const trendMonths = useMemo(() => monthsBack(12), [])
  const tarefasPorMes = useMemo(() => trendMonths.map(m => {
    const mTasks = tasks.filter(t => t.due_date && t.due_date >= m.start && t.due_date <= m.end)
    return {
      month: m.label,
      concluidas: mTasks.filter(t => t.status === 'concluida').length,
      atrasadas: mTasks.filter(t => t.status === 'pendente' && t.due_date! < todayStr).length,
    }
  }), [tasks, trendMonths])

  const prazosStatus = useMemo(() => ([
    { name: 'Cumpridos', value: deadlines.filter(d => d.status === 'cumprido').length },
    { name: 'Perdidos', value: deadlines.filter(d => d.status === 'perdido').length },
    { name: 'Pendentes', value: deadlines.filter(d => d.status === 'pendente').length },
  ].filter(s => s.value > 0)), [deadlines])

  function openPrazoStatusDetail(name: string) {
    const statusKey = name === 'Cumpridos' ? 'cumprido' : name === 'Perdidos' ? 'perdido' : 'pendente'
    const list = deadlines.filter(d => d.status === statusKey)
    detail.show(`Prazos — ${name}`, list.map((d, i) => ({ id: String(i), label: d.title, sublabel: fmtDate(d.due_date) })))
  }

  const processosPorStatus = useMemo(() => {
    const map = new Map<string, number>()
    processes.forEach(p => map.set(p.status, (map.get(p.status) ?? 0) + 1))
    return Array.from(map.entries()).map(([status, total]) => ({ status: PROCESS_STATUS_LABELS[status] ?? status, statusKey: status, total }))
  }, [processes])

  function openProcessStatusDetail(statusKey: string, label: string) {
    const list = processes.filter(p => p.status === statusKey)
    detail.show(`Processos — ${label}`, list.map((p, i) => ({ id: String(i), label: p.title })))
  }

  const cargaPorResponsavel = useMemo(() => {
    const map = new Map<string, { total: number; itens: DetailRow[] }>()
    const openTasks = tasks.filter(t => t.status === 'pendente')
    const openDeadlines = deadlines.filter(d => d.status === 'pendente')
    for (const t of openTasks) for (const id of t.responsible_ids ?? []) {
      const cur = map.get(id) ?? { total: 0, itens: [] }
      cur.total++; cur.itens.push({ id: `t${cur.itens.length}`, label: t.title, sublabel: t.due_date ? `Tarefa · ${fmtDate(t.due_date)}` : 'Tarefa' })
      map.set(id, cur)
    }
    for (const d of openDeadlines) for (const id of d.responsible_ids ?? []) {
      const cur = map.get(id) ?? { total: 0, itens: [] }
      cur.total++; cur.itens.push({ id: `d${cur.itens.length}`, label: d.title, sublabel: `Prazo · ${fmtDate(d.due_date)}` })
      map.set(id, cur)
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, name: profiles.find(p => p.id === id)?.display_name ?? 'Sem nome', total: v.total, itens: v.itens }))
      .sort((a, b) => b.total - a.total)
  }, [tasks, deadlines, profiles])

  function openResponsavelDetail(name: string, itens: DetailRow[]) {
    detail.show(`Pendências — ${name}`, itens)
  }

  const attention = useMemo(() => {
    const items: Attention[] = []
    if (prazosAtrasados > 0) items.push({ text: `${prazosAtrasados} prazo(s) vencido(s) ainda pendente(s).`, level: 'danger' })
    if (tarefasAtrasadas > 0) items.push({ text: `${tarefasAtrasadas} tarefa(s) atrasada(s).`, level: 'warn' })
    if (cargaPorResponsavel.length > 1) {
      const media = cargaPorResponsavel.reduce((s, r) => s + r.total, 0) / cargaPorResponsavel.length
      const sobrecarregado = cargaPorResponsavel[0]
      if (sobrecarregado.total > media * 1.8) items.push({ text: `${sobrecarregado.name} concentra bem mais pendências que a média da equipe (${sobrecarregado.total} vs ${media.toFixed(0)}).`, level: 'info' })
    }
    return items
  }, [prazosAtrasados, tarefasAtrasadas, cargaPorResponsavel])

  function openTasksDetail(title: string, list: Task[]) {
    detail.show(title, list.map((t, i) => ({ id: String(i), label: t.title, sublabel: t.due_date ? fmtDate(t.due_date) : undefined })))
  }
  function openDeadlinesDetail(title: string, list: Deadline[]) {
    detail.show(title, list.map((d, i) => ({ id: String(i), label: d.title, sublabel: fmtDate(d.due_date) })))
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ResponsavelFilter f={respFilter} />
      </div>

      <AttentionPanel items={attention} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Tarefas pendentes" value={tarefasPendentes} icon={ClipboardList} color="#3B82F6" onClick={() => openTasksDetail('Tarefas pendentes', tasks.filter(t => t.status === 'pendente'))} />
        <KpiCard title="Tarefas atrasadas" value={tarefasAtrasadas} icon={ClipboardList} color="#ef4444" onClick={() => openTasksDetail('Tarefas atrasadas', tasks.filter(t => t.status === 'pendente' && t.due_date && t.due_date < todayStr))} />
        <KpiCard title="Prazos pendentes" value={prazosPendentes} icon={Bell} color="#F59E0B" onClick={() => openDeadlinesDetail('Prazos pendentes', deadlines.filter(d => d.status === 'pendente'))} />
        <KpiCard title="Prazos atrasados" value={prazosAtrasados} icon={Bell} color="#ef4444" onClick={() => openDeadlinesDetail('Prazos atrasados', deadlines.filter(d => d.status === 'pendente' && d.due_date < todayStr))} />
      </div>

      <ChartCard title="Tarefas concluídas x atrasadas por mês" icon={ClipboardList}>
        <TrendChart data={tarefasPorMes} series={[
          { key: 'concluidas', name: 'Concluídas', color: '#22c55e' },
          { key: 'atrasadas', name: 'Atrasadas', color: '#ef4444' },
        ]} />
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Prazos: cumpridos x perdidos" icon={Bell}>
          {prazosStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-14">Sem dados</p>
          ) : (
            <DonutWithLegend data={prazosStatus} formatValue={v => String(v)} onSelect={openPrazoStatusDetail} />
          )}
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
                  <Bar dataKey="total" name="Processos" fill="#6366F1" radius={[4, 4, 0, 0]} cursor="pointer"
                    onClick={(d: any) => openProcessStatusDetail(d.statusKey, d.status)} />
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
                <Bar dataKey="total" name="Pendências" fill="#14B8A6" radius={[0, 4, 4, 0]} cursor="pointer"
                  onClick={(d: any) => openResponsavelDetail(d.name, d.itens)} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
