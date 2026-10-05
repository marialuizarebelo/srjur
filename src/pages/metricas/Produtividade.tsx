import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Bell, Scale, Users, Clock, CheckCircle2, AlertTriangle, Flame, CalendarClock, Inbox, Timer } from 'lucide-react'
import { fmtDate } from '@/lib/format'
import {
  monthsBack, usePeriod, KpiCard, ChartCard, DonutWithLegend, DetailDialog, useDetail, AttentionPanel, type Attention,
  previousPeriodRange, trendText, NotesPanel, useResponsavelFilter,
} from './shared'
import {
  PAL, ComboChart, HBars, BucketBars, MiniTable, SectionTitle,
  avg, median, pct, fmtPct, fmtNum, daysBetween, addDays, inRange, todayISO, groupCount, fetchAll,
} from './kit'

interface Task { title: string; type: string | null; status: string; priority: string | null; due_date: string | null; created_at: string; updated_at: string | null; workflow_stage: string | null; responsible_ids: string[] | null }
interface Deadline { title: string; status: string; due_date: string; tipo: string | null; responsible_ids: string[] | null }
interface ProcessRow { title: string; status: string; responsible_ids: string[] | null }

const TIPO_TAREFA: Record<string, string> = { tarefa: 'Tarefa', compromisso: 'Compromisso', reuniao: 'Reunião', audiencia: 'Audiência', diligencia: 'Diligência', interno: 'Interno', cliente: 'Cliente' }
const PRIORIDADE: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' }
const PRIORIDADE_COR: Record<string, string> = { baixa: PAL.gray, media: PAL.blue, alta: PAL.amber, urgente: PAL.red }
const PROCESS_STATUS_LABELS: Record<string, string> = { em_andamento: 'Em andamento', concluido: 'Concluído', arquivado: 'Arquivado', suspenso: 'Suspenso' }
const prettify = (s: string) => s.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

export default function ProdutividadeTab() {
  const [tasksRaw, setTasksRaw] = useState<Task[]>([])
  const [deadlinesRaw, setDeadlinesRaw] = useState<Deadline[]>([])
  const [processesRaw, setProcessesRaw] = useState<ProcessRow[]>([])
  const [loading, setLoading] = useState(true)
  const period = usePeriod()
  const detail = useDetail()
  const respFilter = useResponsavelFilter()
  const profiles = respFilter.profiles

  useEffect(() => {
    Promise.all([
      fetchAll<Task>('tasks', 'title, type, status, priority, due_date, created_at, updated_at, workflow_stage, responsible_ids'),
      fetchAll<Deadline>('deadlines', 'title, status, due_date, tipo, responsible_ids'),
      fetchAll<ProcessRow>('processes', 'title, status, responsible_ids'),
    ]).then(([t, d, p]) => { setTasksRaw(t); setDeadlinesRaw(d); setProcessesRaw(p); setLoading(false) })
  }, [])

  const tasks = useMemo(() => tasksRaw.filter(t => respFilter.matches(t.responsible_ids)), [tasksRaw, respFilter.responsavelId])
  const deadlines = useMemo(() => deadlinesRaw.filter(d => respFilter.matches(d.responsible_ids)), [deadlinesRaw, respFilter.responsavelId])
  const processes = useMemo(() => processesRaw.filter(p => respFilter.matches(p.responsible_ids)), [processesRaw, respFilter.responsavelId])

  const hoje = todayISO()
  const { start, end } = period.range
  const prev = useMemo(() => previousPeriodRange(start, end), [start, end])
  const trendMonths = useMemo(() => monthsBack(12), [])
  const nome = (id: string) => profiles.find(p => p.id === id)?.display_name ?? 'Sem nome'

  /* ---------- Tarefas ---------- */
  const pendentes = useMemo(() => tasks.filter(t => t.status === 'pendente'), [tasks])
  const atrasadas = useMemo(() => pendentes.filter(t => t.due_date && t.due_date < hoje), [pendentes, hoje])
  const comVencNoPeriodo = useMemo(() => tasks.filter(t => t.status !== 'cancelada' && inRange(t.due_date, start, end)), [tasks, start, end])
  const concluidasNoPeriodo = comVencNoPeriodo.filter(t => t.status === 'concluida')
  const taxaConclusao = pct(concluidasNoPeriodo.length, comVencNoPeriodo.length)
  const comVencPrev = tasks.filter(t => t.status !== 'cancelada' && inRange(t.due_date, prev.start, prev.end))
  const taxaConclusaoPrev = pct(comVencPrev.filter(t => t.status === 'concluida').length, comVencPrev.length)
  const criadasPeriodo = tasks.filter(t => inRange(t.created_at, start, end))
  const criadasPrev = tasks.filter(t => inRange(t.created_at, prev.start, prev.end))
  // Tempo até concluir: aproximado pela última atualização da tarefa já concluída (não há data de conclusão própria).
  const temposConclusao = tasks.filter(t => t.status === 'concluida' && t.updated_at && inRange(t.updated_at, start, end)).map(t => Math.max(0, daysBetween(t.created_at, t.updated_at!)))
  const idadeBacklog = avg(pendentes.map(t => daysBetween(t.created_at, hoje)))
  const urgentesAtrasadas = atrasadas.filter(t => t.priority === 'urgente' || t.priority === 'alta')
  const proximos14 = pendentes.filter(t => inRange(t.due_date, hoje, addDays(hoje, 14)))

  /* ---------- Prazos ---------- */
  const prazosPend = deadlines.filter(d => d.status === 'pendente')
  const prazosAtras = prazosPend.filter(d => d.due_date < hoje)
  const prazosProx7 = prazosPend.filter(d => inRange(d.due_date, hoje, addDays(hoje, 7)))
  const prazosProx14 = prazosPend.filter(d => inRange(d.due_date, hoje, addDays(hoje, 14)))
  const prazosPeriodo = deadlines.filter(d => inRange(d.due_date, start, end))
  const cumpridos = prazosPeriodo.filter(d => d.status === 'cumprido').length
  const perdidos = prazosPeriodo.filter(d => d.status === 'perdido').length

  /* ---------- Séries ---------- */
  const mensal = useMemo(() => trendMonths.map(m => {
    const comVenc = tasks.filter(t => t.status !== 'cancelada' && inRange(t.due_date, m.start, m.end))
    return {
      month: m.label,
      criadas: tasks.filter(t => inRange(t.created_at, m.start, m.end)).length,
      concluidas: comVenc.filter(t => t.status === 'concluida').length,
      atrasadas: comVenc.filter(t => t.status === 'pendente' && t.due_date! < hoje).length,
      conclusao: comVenc.length ? Math.round(pct(comVenc.filter(t => t.status === 'concluida').length, comVenc.length)) : null,
      cumpridos: deadlines.filter(d => d.status === 'cumprido' && inRange(d.due_date, m.start, m.end)).length,
      perdidos: deadlines.filter(d => d.status === 'perdido' && inRange(d.due_date, m.start, m.end)).length,
      _start: m.start, _end: m.end,
    }
  }), [tasks, deadlines, trendMonths, hoje])
  const cargaFutura = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const dia = addDays(hoje, i)
    const d = new Date(dia + 'T00:00:00')
    return {
      month: i === 0 ? 'Hoje' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
      tarefas: pendentes.filter(t => t.due_date === dia).length,
      prazos: prazosPend.filter(p => p.due_date === dia).length,
      _dia: dia,
    }
  }), [pendentes, prazosPend, hoje])
  const agingAtraso = useMemo(() => {
    const faixas = [
      { name: '1–3 dias', a: 1, b: 3, color: PAL.amber }, { name: '4–7', a: 4, b: 7, color: PAL.orange },
      { name: '8–30', a: 8, b: 30, color: PAL.pink }, { name: '30+ dias', a: 31, b: 99999, color: PAL.red },
    ]
    return faixas.map(f => { const ts = atrasadas.filter(t => { const d = daysBetween(t.due_date!, hoje); return d >= f.a && d <= f.b }); return { name: f.name, color: f.color, value: ts.length, rows: ts } })
  }, [atrasadas, hoje])

  /* ---------- Distribuições ---------- */
  const porPrioridade = useMemo(() => ['urgente', 'alta', 'media', 'baixa'].map(p => ({ name: PRIORIDADE[p], key: p, value: pendentes.filter(t => (t.priority ?? 'media') === p).length, color: PRIORIDADE_COR[p] })), [pendentes])
  const porTipo = useMemo(() => groupCount(pendentes, t => TIPO_TAREFA[t.type ?? ''] ?? 'Tarefa'), [pendentes])
  const porEtapa = useMemo(() => groupCount(pendentes, t => prettify(t.workflow_stage ?? 'a_fazer')), [pendentes])
  const prazosStatus = useMemo(() => [
    { name: 'Cumpridos', value: deadlines.filter(d => d.status === 'cumprido').length },
    { name: 'Perdidos', value: deadlines.filter(d => d.status === 'perdido').length },
    { name: 'Pendentes', value: prazosPend.length },
  ].filter(s => s.value > 0), [deadlines, prazosPend])
  const processosPorStatus = useMemo(() => groupCount(processes, p => PROCESS_STATUS_LABELS[p.status] ?? p.status), [processes])

  /* ---------- Equipe ---------- */
  const equipe = useMemo(() => {
    const ids = new Set<string>()
    ;[...tasks, ...deadlines, ...processes].forEach(x => (x.responsible_ids ?? []).forEach(id => ids.add(id)))
    return Array.from(ids).map(id => {
      const meus = (xs: { responsible_ids: string[] | null }[]) => xs.filter(x => x.responsible_ids?.includes(id))
      const tp = meus(pendentes) as Task[]; const dp = meus(prazosPend) as Deadline[]
      const venc = meus(comVencNoPeriodo) as Task[]
      const proc = (meus(processes) as ProcessRow[]).filter(p => p.status === 'em_andamento')
      return {
        id, nome: nome(id), pendentes: tp.length, atrasadas: tp.filter(t => t.due_date && t.due_date < hoje).length,
        prazos: dp.length, prazosAtras: dp.filter(d => d.due_date < hoje).length,
        concluidas: venc.filter(t => t.status === 'concluida').length, taxa: pct(venc.filter(t => t.status === 'concluida').length, venc.length),
        proximos14: tp.filter(t => inRange(t.due_date, hoje, addDays(hoje, 14))).length + dp.filter(d => inRange(d.due_date, hoje, addDays(hoje, 14))).length,
        processos: proc.length, carga: tp.length + dp.length,
        _tp: tp, _dp: dp,
      }
    }).sort((a, b) => b.carga - a.carga)
  }, [tasks, deadlines, processes, pendentes, prazosPend, comVencNoPeriodo, profiles, hoje])
  const cargaMedia = avg(equipe.map(e => e.carga))

  /* ---------- Detalhes ---------- */
  const openTasks = (title: string, list: Task[]) => detail.show(title, list.map((t, i) => ({ id: String(i), label: t.title, sublabel: [TIPO_TAREFA[t.type ?? ''], t.due_date ? fmtDate(t.due_date) : null, t.priority ? PRIORIDADE[t.priority] : null].filter(Boolean).join(' · ') })))
  const openDeadlines = (title: string, list: Deadline[]) => detail.show(title, list.map((d, i) => ({ id: String(i), label: d.title, sublabel: `${fmtDate(d.due_date)}${d.tipo ? ` · ${d.tipo}` : ''}` })))

  const attention = useMemo(() => {
    const items: Attention[] = []
    if (prazosAtras.length > 0) items.push({ text: `${prazosAtras.length} prazo(s) vencido(s) ainda pendente(s).`, level: 'danger' })
    if (urgentesAtrasadas.length > 0) items.push({ text: `${urgentesAtrasadas.length} tarefa(s) de prioridade alta/urgente atrasada(s).`, level: 'danger' })
    if (atrasadas.length > 0) items.push({ text: `${atrasadas.length} tarefa(s) atrasada(s) no total.`, level: 'warn' })
    if (equipe.length > 1 && equipe[0].carga > cargaMedia * 1.8) items.push({ text: `${equipe[0].nome} concentra bem mais pendências que a média da equipe (${equipe[0].carga} vs ${fmtNum(cargaMedia, 0)}).`, level: 'info' })
    const picos = cargaFutura.filter(d => d.tarefas + d.prazos >= 6)
    if (picos.length > 0) items.push({ text: `Pico de trabalho nos próximos 14 dias: ${picos.map(p => `${p.month} (${p.tarefas + p.prazos})`).join(', ')}.`, level: 'info' })
    return items
  }, [prazosAtras.length, urgentesAtrasadas.length, atrasadas.length, equipe, cargaMedia, cargaFutura])

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  const sp = (k: 'criadas' | 'concluidas' | 'atrasadas') => mensal.map(m => m[k] as number)

  return (
    <div className="space-y-4">
      <AttentionPanel items={attention} />

      <SectionTitle hint="Quanto trabalho está aberto hoje e quanto está fora do prazo.">Backlog agora</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Tarefas pendentes" hint="Tarefas e compromissos ainda não concluídos." value={pendentes.length} icon={ClipboardList} color={PAL.blue} onClick={() => openTasks('Tarefas pendentes', pendentes)} />
        <KpiCard title="Tarefas atrasadas" hint="Pendentes com data limite anterior a hoje." value={atrasadas.length} icon={AlertTriangle} color={atrasadas.length ? PAL.red : PAL.green} trendTone="down-good"
          trend={pendentes.length ? `${fmtPct(pct(atrasadas.length, pendentes.length))} do backlog` : undefined} onClick={() => openTasks('Tarefas atrasadas', atrasadas)} />
        <KpiCard title="Prazos pendentes" hint="Prazos processuais ainda não cumpridos." value={prazosPend.length} icon={Bell} color={PAL.amber} trend={`${prazosProx7.length} vencem em 7 dias`} trendTone="neutral" onClick={() => openDeadlines('Prazos pendentes', prazosPend)} />
        <KpiCard title="Prazos atrasados" hint="Prazos vencidos que continuam pendentes." value={prazosAtras.length} icon={Flame} color={prazosAtras.length ? PAL.red : PAL.green} trendTone="down-good" onClick={() => openDeadlines('Prazos atrasados', prazosAtras)} />
        <KpiCard title="Alta/urgente atrasadas" hint="Tarefas de prioridade alta ou urgente já vencidas." value={urgentesAtrasadas.length} icon={Flame} color={urgentesAtrasadas.length ? PAL.red : PAL.green} trendTone="down-good" onClick={() => openTasks('Alta/urgente atrasadas', urgentesAtrasadas)} />
        <KpiCard title="Idade do backlog" hint="Há quantos dias, em média, as tarefas pendentes foram criadas." value={pendentes.length ? `${fmtNum(idadeBacklog, 0)} dias` : '—'} icon={Clock} color={PAL.sky} trendTone="down-good" onClick={() => openTasks('Tarefas pendentes', pendentes)} />
      </div>

      <SectionTitle hint="O que foi entregue no período selecionado.">Entrega no período</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard title="Taxa de conclusão" hint="Das tarefas com data limite no período, quantas já foram concluídas." value={comVencNoPeriodo.length ? fmtPct(taxaConclusao) : '—'} icon={CheckCircle2} color={taxaConclusao >= 85 ? PAL.green : PAL.amber} spark={sp('concluidas')}
          trend={trendText(taxaConclusao, taxaConclusaoPrev)} onClick={() => openTasks('Tarefas com data no período', comVencNoPeriodo)} />
        <KpiCard title="Concluídas" hint="Tarefas concluídas entre as que venciam no período." value={concluidasNoPeriodo.length} icon={CheckCircle2} color={PAL.green} onClick={() => openTasks('Tarefas concluídas', concluidasNoPeriodo)} />
        <KpiCard title="Criadas" hint="Tarefas criadas no período (entrada de trabalho)." value={criadasPeriodo.length} icon={Inbox} color={PAL.blue} spark={sp('criadas')} trend={trendText(criadasPeriodo.length, criadasPrev.length)} trendTone="neutral" onClick={() => openTasks('Tarefas criadas no período', criadasPeriodo)} />
        <KpiCard title="Tempo até concluir" hint="Aproximação: dias entre a criação e a última atualização das tarefas concluídas no período (o sistema não guarda a data de conclusão)." value={temposConclusao.length ? `${fmtNum(avg(temposConclusao), 0)} dias` : '—'} icon={Timer} color={PAL.sky}
          trend={temposConclusao.length ? `mediana ${fmtNum(median(temposConclusao), 0)} dias` : undefined} trendTone="neutral" onClick={() => openTasks('Concluídas no período', tasks.filter(t => t.status === 'concluida' && t.updated_at && inRange(t.updated_at, start, end)))} />
        <KpiCard title="Cumprimento de prazos" hint="Prazos cumpridos ÷ (cumpridos + perdidos) com vencimento no período." value={cumpridos + perdidos ? fmtPct(pct(cumpridos, cumpridos + perdidos)) : '—'} icon={Bell} color={perdidos ? PAL.amber : PAL.green}
          trend={`${cumpridos} cumpridos · ${perdidos} perdidos`} trendTone="neutral" onClick={() => openDeadlines('Prazos do período', prazosPeriodo)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Entrada × saída de tarefas (12 meses)" icon={ClipboardList}>
          <ComboChart data={mensal} format={v => String(v)} yFormat={v => String(v)} onPointClick={i => { const m = mensal[i]; openTasks(`Tarefas com data em ${m.month}`, tasks.filter(t => inRange(t.due_date, m._start, m._end))) }} series={[
            { key: 'criadas', name: 'Criadas', color: PAL.blue },
            { key: 'concluidas', name: 'Concluídas', color: PAL.green },
            { key: 'atrasadas', name: 'Atrasadas', color: PAL.red, kind: 'line' },
          ]} />
        </ChartCard>
        <ChartCard title="Taxa de conclusão e prazos (12 meses)" icon={Bell}>
          <ComboChart data={mensal} format={v => String(v)} yFormat={v => String(v)} series={[
            { key: 'cumpridos', name: 'Prazos cumpridos', color: PAL.teal, stack: 'p' },
            { key: 'perdidos', name: 'Prazos perdidos', color: PAL.red, stack: 'p' },
            { key: 'conclusao', name: 'Conclusão de tarefas (%)', color: PAL.purple, kind: 'line', axis: 'right' },
          ]} />
        </ChartCard>
      </div>

      <NotesPanel area="produtividade" months={trendMonths} />

      <SectionTitle hint="O que está por vir e como distribuir o esforço.">Carga futura</SectionTitle>
      <ChartCard title="Tarefas e prazos nos próximos 14 dias" icon={CalendarClock}>
        <ComboChart data={cargaFutura} format={v => String(v)} yFormat={v => String(v)} onPointClick={i => { const d = cargaFutura[i]; openTasks(`Itens de ${d.month}`, pendentes.filter(t => t.due_date === d._dia)); }} series={[
          { key: 'tarefas', name: 'Tarefas', color: PAL.blue, stack: 'c' },
          { key: 'prazos', name: 'Prazos', color: PAL.amber, stack: 'c' },
        ]} />
        <p className="text-[11px] text-muted-foreground mt-2">{proximos14.length} tarefa(s) e {prazosProx14.length} prazo(s) nesse período.</p>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Idade do atraso (tarefas)" icon={AlertTriangle}>
          <BucketBars data={agingAtraso.map(a => ({ name: a.name, value: a.value, color: a.color }))} format={v => `${v} tarefa(s)`}
            onSelect={name => { const f = agingAtraso.find(a => a.name === name); if (f) openTasks(`Atrasadas — ${name}`, f.rows) }} />
        </ChartCard>
        <ChartCard title="Pendências por prioridade" icon={Flame}>
          <BucketBars data={porPrioridade.map(p => ({ name: p.name, value: p.value, color: p.color }))} format={v => `${v} tarefa(s)`}
            onSelect={name => { const f = porPrioridade.find(p => p.name === name); if (f) openTasks(`Prioridade ${name}`, pendentes.filter(t => (t.priority ?? 'media') === f.key)) }} />
        </ChartCard>
        <ChartCard title="Pendências por tipo" icon={ClipboardList}>
          <HBars data={porTipo} format={v => `${v}`} color={PAL.blue} onSelect={name => openTasks(`Pendentes — ${name}`, pendentes.filter(t => (TIPO_TAREFA[t.type ?? ''] ?? 'Tarefa') === name))} />
        </ChartCard>
        <ChartCard title="Pendências por etapa do fluxo" icon={ClipboardList}>
          <HBars data={porEtapa} format={v => `${v}`} color={PAL.teal} onSelect={name => openTasks(`Etapa — ${name}`, pendentes.filter(t => prettify(t.workflow_stage ?? 'a_fazer') === name))} />
        </ChartCard>
      </div>

      <SectionTitle hint="Como o trabalho está distribuído entre as pessoas.">Equipe</SectionTitle>
      <ChartCard title="Carga e entrega por responsável" icon={Users}>
        <MiniTable
          columns={[
            { key: 'nome', label: 'Responsável' },
            { key: 'pendentes', label: 'Tarefas', align: 'right' },
            { key: 'atrasadas', label: 'Atrasadas', align: 'right', render: r => <span className={r.atrasadas ? 'text-red-700 dark:text-red-300 font-semibold' : ''}>{r.atrasadas}</span> },
            { key: 'prazos', label: 'Prazos', align: 'right' },
            { key: 'prazosAtras', label: 'Prazos atras.', align: 'right', render: r => <span className={r.prazosAtras ? 'text-red-700 dark:text-red-300 font-semibold' : ''}>{r.prazosAtras}</span> },
            { key: 'proximos14', label: 'Próx. 14 dias', align: 'right' },
            { key: 'concluidas', label: 'Concluídas (período)', align: 'right' },
            { key: 'taxa', label: 'Conclusão', align: 'right', render: r => (r.concluidas || r.pendentes ? fmtPct(r.taxa) : '—') },
            { key: 'processos', label: 'Processos', align: 'right' },
          ]}
          rows={equipe}
          onRowClick={r => detail.show(`Pendências — ${r.nome}`, [
            ...r._tp.map((t: Task, i: number) => ({ id: `t${i}`, label: t.title, sublabel: `Tarefa${t.due_date ? ` · ${fmtDate(t.due_date)}` : ''}` })),
            ...r._dp.map((d: Deadline, i: number) => ({ id: `d${i}`, label: d.title, sublabel: `Prazo · ${fmtDate(d.due_date)}` })),
          ])} />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Equilíbrio da carga (tarefas + prazos pendentes)" icon={Users}>
          <HBars data={equipe.map(e => ({ name: e.nome, value: e.carga, sub: e.atrasadas + e.prazosAtras ? `${e.atrasadas + e.prazosAtras} atrasado(s)` : undefined }))} format={v => `${v}`} color={PAL.purple} empty="Nenhuma pendência atribuída"
            onSelect={name => { const e = equipe.find(x => x.nome === name); if (e) detail.show(`Pendências — ${name}`, [...e._tp.map((t: Task, i: number) => ({ id: `t${i}`, label: t.title, sublabel: `Tarefa${t.due_date ? ` · ${fmtDate(t.due_date)}` : ''}` })), ...e._dp.map((d: Deadline, i: number) => ({ id: `d${i}`, label: d.title, sublabel: `Prazo · ${fmtDate(d.due_date)}` }))]) }} />
          {equipe.length > 1 && <p className="text-[11px] text-muted-foreground mt-3">Média da equipe: {fmtNum(cargaMedia, 0)} pendência(s) por pessoa.</p>}
        </ChartCard>
        <ChartCard title="Processos em andamento por responsável" icon={Scale}>
          <HBars data={equipe.filter(e => e.processos > 0).map(e => ({ name: e.nome, value: e.processos })).sort((a, b) => b.value - a.value)} format={v => `${v}`} color={PAL.green} empty="Nenhum processo atribuído" />
        </ChartCard>
        <ChartCard title="Situação dos prazos (histórico)" icon={Bell}>
          <DonutWithLegend data={prazosStatus} formatValue={v => String(v)} onSelect={name => openDeadlines(`Prazos — ${name}`, deadlines.filter(d => d.status === (name === 'Cumpridos' ? 'cumprido' : name === 'Perdidos' ? 'perdido' : 'pendente')))} />
        </ChartCard>
        <ChartCard title="Processos por status" icon={Scale}>
          <DonutWithLegend data={processosPorStatus} formatValue={v => String(v)} onSelect={name => detail.show(`Processos — ${name}`, processes.filter(p => (PROCESS_STATUS_LABELS[p.status] ?? p.status) === name).map((p, i) => ({ id: String(i), label: p.title })))} />
        </ChartCard>
      </div>

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
