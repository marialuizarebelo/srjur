import { useEffect, useMemo, useState } from 'react'
import { Scale, Bell, Gavel, Handshake, Trophy, Clock, FolderOpen, FolderCheck, FolderPlus, AlertTriangle, Landmark, ShieldAlert, Banknote } from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import {
  monthsBack, usePeriod, KpiCard, ChartCard, DonutWithLegend, DetailDialog, useDetail,
  AttentionPanel, type Attention, previousPeriodRange, trendText, NotesPanel, useResponsavelFilter,
} from './shared'
import {
  PAL, ComboChart, HBars, BucketBars, MiniTable, SectionTitle,
  sum, avg, median, pct, fmtPct, fmtNum, daysBetween, addDays, inRange, todayISO, groupSum, groupCount, fetchAll, useFinanceData,
} from './kit'

interface ProcessRow {
  id: string; title: string; number: string | null; status: string; area: string | null; type: string | null; instance: string | null
  court: string | null; phase: string | null; cause_value: number | null; filing_date: string | null; closed_date: string | null
  created_at: string; client_id: string | null; client_role: string | null; responsible_ids: string[] | null
}
interface ClientRow { id: string; name: string; area: string | null; status: string; responsible_ids: string[] | null }
interface DeadlineRow { id: string; title: string; status: string; due_date: string; tipo: string | null; process_id: string | null; responsible_ids: string[] | null }
interface TaskRow { title: string; type: string; status: string; due_date: string | null; responsible_ids: string[] | null }
interface UpdateRow { process_id: string; created_at: string }

const TIPO_LABEL: Record<string, string> = { consultivo: 'Consultivo', contencioso: 'Contencioso', extrajudicial: 'Extrajudicial' }
const entrada = (p: ProcessRow) => (p.filing_date ?? p.created_at).slice(0, 10)

export default function JuridicoTab() {
  const period = usePeriod()
  const detail = useDetail()
  const respFilter = useResponsavelFilter()
  const { rows: finAll } = useFinanceData()
  const [loading, setLoading] = useState(true)
  const [processesRaw, setProcessesRaw] = useState<ProcessRow[]>([])
  const [clientsRaw, setClientsRaw] = useState<ClientRow[]>([])
  const [deadlinesRaw, setDeadlinesRaw] = useState<DeadlineRow[]>([])
  const [tasksRaw, setTasksRaw] = useState<TaskRow[]>([])
  const [updates, setUpdates] = useState<UpdateRow[]>([])

  useEffect(() => {
    Promise.all([
      fetchAll<ProcessRow>('processes', 'id, title, number, status, area, type, instance, court, phase, cause_value, filing_date, closed_date, created_at, client_id, client_role, responsible_ids'),
      fetchAll<ClientRow>('clients', 'id, name, area, status, responsible_ids'),
      fetchAll<DeadlineRow>('deadlines', 'id, title, status, due_date, tipo, process_id, responsible_ids'),
      fetchAll<TaskRow>('tasks', 'title, type, status, due_date, responsible_ids'),
      fetchAll<UpdateRow>('process_updates', 'process_id, created_at'),
    ]).then(([p, c, d, t, u]) => {
      setProcessesRaw(p); setClientsRaw(c); setDeadlinesRaw(d); setTasksRaw(t); setUpdates(u)
      setLoading(false)
    })
  }, [])

  const processes = useMemo(() => processesRaw.filter(p => respFilter.matches(p.responsible_ids)), [processesRaw, respFilter.responsavelId])
  const clients = useMemo(() => clientsRaw.filter(c => respFilter.matches(c.responsible_ids)), [clientsRaw, respFilter.responsavelId])
  const deadlines = useMemo(() => deadlinesRaw.filter(d => respFilter.matches(d.responsible_ids)), [deadlinesRaw, respFilter.responsavelId])
  const tasks = useMemo(() => tasksRaw.filter(t => respFilter.matches(t.responsible_ids)), [tasksRaw, respFilter.responsavelId])
  const processMap = useMemo(() => new Map(processes.map(p => [p.id, p])), [processes])
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])
  const finance = useMemo(() => {
    const adv = finAll.filter(f => f.business_unit !== 'saas')
    if (!respFilter.responsavelId) return adv
    const processIds = new Set(processes.map(p => p.id)); const clientIds = new Set(clients.map(c => c.id))
    return adv.filter(f => (f.process_id && processIds.has(f.process_id)) || (f.client_id && clientIds.has(f.client_id)))
  }, [finAll, processes, clients, respFilter.responsavelId])

  const hoje = todayISO()
  const { start, end } = period.range
  const prev = useMemo(() => previousPeriodRange(start, end), [start, end])
  const trendMonths = useMemo(() => monthsBack(12), [])

  /* ---------- Acervo ---------- */
  const ativos = useMemo(() => processes.filter(p => p.status === 'em_andamento'), [processes])
  const novos = useMemo(() => processes.filter(p => inRange(entrada(p), start, end)), [processes, start, end])
  const novosPrev = useMemo(() => processes.filter(p => inRange(entrada(p), prev.start, prev.end)), [processes, prev])
  const encerrados = useMemo(() => processes.filter(p => inRange(p.closed_date, start, end)), [processes, start, end])
  const encerradosPrev = useMemo(() => processes.filter(p => inRange(p.closed_date, prev.start, prev.end)), [processes, prev])
  const valorCausas = sum(ativos.map(p => Number(p.cause_value ?? 0)))
  const duracoes = useMemo(() => processes.filter(p => p.closed_date).map(p => ({ p, dias: Math.max(0, daysBetween(entrada(p), p.closed_date!)) })), [processes])
  const duracoesPeriodo = duracoes.filter(d => inRange(d.p.closed_date, start, end))
  const duracaoMedia = avg(duracoesPeriodo.length ? duracoesPeriodo.map(d => d.dias) : duracoes.map(d => d.dias))

  // Processos sem andamento recente / sem prazo futuro
  const ultimoAndamento = useMemo(() => {
    const m = new Map<string, string>()
    updates.forEach(u => { const cur = m.get(u.process_id); if (!cur || u.created_at > cur) m.set(u.process_id, u.created_at) })
    return m
  }, [updates])
  const semMovimento = ativos.filter(p => daysBetween((ultimoAndamento.get(p.id) ?? p.created_at), hoje) > 30)
  const prazosPendentesPorProcesso = useMemo(() => {
    const s = new Set<string>(); deadlines.forEach(d => { if (d.status === 'pendente' && d.process_id && d.due_date >= hoje) s.add(d.process_id) }); return s
  }, [deadlines, hoje])
  const semPrazoFuturo = ativos.filter(p => !prazosPendentesPorProcesso.has(p.id) && p.type !== 'consultivo')

  /* ---------- Prazos ---------- */
  const prazosPeriodo = deadlines.filter(d => inRange(d.due_date, start, end))
  const prazosPeriodoPrev = deadlines.filter(d => inRange(d.due_date, prev.start, prev.end))
  const cumpridos = prazosPeriodo.filter(d => d.status === 'cumprido')
  const perdidos = prazosPeriodo.filter(d => d.status === 'perdido')
  const taxaCumprimento = pct(cumpridos.length, cumpridos.length + perdidos.length)
  const taxaCumprimentoPrev = (() => { const c = prazosPeriodoPrev.filter(d => d.status === 'cumprido').length; const l = prazosPeriodoPrev.filter(d => d.status === 'perdido').length; return pct(c, c + l) })()
  const atrasados = deadlines.filter(d => d.status === 'pendente' && d.due_date < hoje)
  const proximos7 = deadlines.filter(d => d.status === 'pendente' && inRange(d.due_date, hoje, addDays(hoje, 7)))
  const proximos30 = deadlines.filter(d => d.status === 'pendente' && inRange(d.due_date, hoje, addDays(hoje, 30)))

  /* ---------- Audiências ---------- */
  const audiencias = tasks.filter(t => t.type === 'audiencia')
  const audRealizadas = audiencias.filter(t => t.status === 'concluida' && inRange(t.due_date, start, end))
  const audProximas = audiencias.filter(t => t.status === 'pendente' && t.due_date && inRange(t.due_date, hoje, addDays(hoje, 30)))

  /* ---------- Honorários ---------- */
  const acordos = useMemo(() => finance.filter(f => f.category === 'Acordo' && f.type === 'receita' && inRange(f.date, start, end)), [finance, start, end])
  const exitoPrevisto = useMemo(() => finance.filter(f => f.category === 'Êxito' && f.type === 'receita' && f.aberto > 0), [finance])
  const areaDe = (f: { process_id: string | null; client_id: string | null }) => (f.process_id && processMap.get(f.process_id)?.area) || (f.client_id && clientMap.get(f.client_id)?.area) || 'Não classificado'
  const receitaPeriodo = useMemo(() => finance.filter(f => f.type === 'receita' && inRange(f.date, start, end)), [finance, start, end])
  const receitaPorArea = useMemo(() => groupSum(receitaPeriodo, areaDe, f => f.value), [receitaPeriodo, processMap, clientMap])
  const receita12 = useMemo(() => finance.filter(f => f.type === 'receita' && inRange(f.date, trendMonths[0].start, trendMonths[11].end)), [finance, trendMonths])
  const ativosPorArea = useMemo(() => groupCount(ativos, p => p.area ?? 'Não classificado'), [ativos])
  const receitaPorProcessoArea = useMemo(() => {
    const rec = new Map(groupSum(receita12, areaDe, f => f.value).map(r => [r.name, r.value]))
    return ativosPorArea.map(a => ({ name: a.name, value: (rec.get(a.name) ?? 0) / Math.max(1, a.value), sub: `${a.value} proc.` })).sort((a, b) => b.value - a.value)
  }, [receita12, ativosPorArea, processMap, clientMap])
  const receitaMediaPorProcesso = ativos.length ? sum(receita12.map(f => f.value)) / ativos.length : 0

  /* ---------- Séries mensais ---------- */
  const acervo = useMemo(() => trendMonths.map(m => {
    const ativoNoFim = processes.filter(p => entrada(p) <= m.end && (p.closed_date ? p.closed_date > m.end : p.status === 'em_andamento')).length
    const cumpr = deadlines.filter(d => inRange(d.due_date, m.start, m.end) && d.status === 'cumprido').length
    const perd = deadlines.filter(d => inRange(d.due_date, m.start, m.end) && d.status === 'perdido').length
    return {
      month: m.label,
      novos: processes.filter(p => inRange(entrada(p), m.start, m.end)).length,
      encerrados: processes.filter(p => inRange(p.closed_date, m.start, m.end)).length,
      acervo: ativoNoFim,
      cumprimento: cumpr + perd > 0 ? Math.round(pct(cumpr, cumpr + perd)) : null,
      cumpridos: cumpr, perdidos: perd,
      audiencias: tasks.filter(t => t.type === 'audiencia' && t.status === 'concluida' && inRange(t.due_date, m.start, m.end)).length,
      acordos: sum(finance.filter(f => f.category === 'Acordo' && f.type === 'receita' && inRange(f.date, m.start, m.end)).map(f => f.value)),
      _start: m.start, _end: m.end,
    }
  }), [processes, deadlines, tasks, finance, trendMonths])

  /* ---------- Distribuições ---------- */
  const porArea = useMemo(() => groupCount(ativos, p => p.area ?? 'Não classificado'), [ativos])
  const porTipo = useMemo(() => groupCount(ativos, p => TIPO_LABEL[p.type ?? ''] ?? 'Não informado'), [ativos])
  const porInstancia = useMemo(() => groupCount(ativos, p => p.instance?.trim() || 'Não informada'), [ativos])
  const porTribunal = useMemo(() => groupCount(ativos.filter(p => p.court?.trim()), p => p.court!.trim()), [ativos])
  const porFase = useMemo(() => groupCount(ativos, p => p.phase?.trim() || 'Não informada'), [ativos])
  const porPapel = useMemo(() => groupCount(ativos.filter(p => p.client_role), p => p.client_role!), [ativos])
  const causasPorArea = useMemo(() => groupSum(ativos.filter(p => p.cause_value), p => p.area ?? 'Não classificado', p => Number(p.cause_value)), [ativos])
  const duracaoPorArea = useMemo(() => {
    const map = new Map<string, number[]>()
    duracoes.forEach(d => map.set(d.p.area ?? 'Não classificado', [...(map.get(d.p.area ?? 'Não classificado') ?? []), d.dias]))
    return Array.from(map.entries()).map(([name, ds]) => ({ name, value: avg(ds), sub: `${ds.length} encerrado(s)` })).sort((a, b) => b.value - a.value)
  }, [duracoes])
  const idadeAcervo = useMemo(() => {
    const faixas = [
      { name: 'até 6 meses', max: 183, color: PAL.green }, { name: '6–12 meses', max: 365, color: PAL.teal },
      { name: '1–2 anos', max: 730, color: PAL.amber }, { name: '2–5 anos', max: 1825, color: PAL.orange }, { name: '5+ anos', max: 99999, color: PAL.red },
    ]
    let ant = -1
    return faixas.map(f => {
      const min = ant + 1; ant = f.max
      const ps = ativos.filter(p => { const d = daysBetween(entrada(p), hoje); return d >= min && d <= f.max })
      return { name: f.name, color: f.color, value: ps.length, count: ps.length, rows: ps }
    })
  }, [ativos, hoje])
  const prazosTipo = useMemo(() => groupCount(prazosPeriodo, d => d.tipo?.trim() || 'Sem tipo'), [prazosPeriodo])
  const prazosStatus = useMemo(() => [
    { name: 'Cumpridos', value: cumpridos.length }, { name: 'Perdidos', value: perdidos.length },
    { name: 'Pendentes', value: prazosPeriodo.filter(d => d.status === 'pendente').length },
  ].filter(s => s.value > 0), [cumpridos, perdidos, prazosPeriodo])
  const prazosPorSemana = useMemo(() => {
    const semanas = [0, 1, 2, 3, 4, 5].map(i => ({ ini: addDays(hoje, i * 7), fim: addDays(hoje, i * 7 + 6), name: i === 0 ? 'Esta semana' : `+${i} sem.` }))
    return semanas.map(s => ({ name: s.name, value: deadlines.filter(d => d.status === 'pendente' && inRange(d.due_date, s.ini, s.fim)).length, rows: deadlines.filter(d => d.status === 'pendente' && inRange(d.due_date, s.ini, s.fim)) }))
  }, [deadlines, hoje])
  const prazosPorResp = useMemo(() => {
    const nome = (id: string) => respFilter.profiles.find(p => p.id === id)?.display_name ?? 'Sem responsável'
    const m = new Map<string, { nome: string; cumpridos: number; perdidos: number; pendentes: number; atrasados: number }>()
    deadlines.filter(d => inRange(d.due_date, start, end) || d.status === 'pendente').forEach(d => {
      (d.responsible_ids?.length ? d.responsible_ids : ['—']).forEach(id => {
        const cur = m.get(id) ?? { nome: id === '—' ? 'Sem responsável' : nome(id), cumpridos: 0, perdidos: 0, pendentes: 0, atrasados: 0 }
        if (d.status === 'cumprido' && inRange(d.due_date, start, end)) cur.cumpridos++
        if (d.status === 'perdido' && inRange(d.due_date, start, end)) cur.perdidos++
        if (d.status === 'pendente') { cur.pendentes++; if (d.due_date < hoje) cur.atrasados++ }
        m.set(id, cur)
      })
    })
    return Array.from(m.entries()).map(([id, r]) => ({ id, ...r, taxa: pct(r.cumpridos, r.cumpridos + r.perdidos) })).sort((a, b) => b.pendentes - a.pendentes)
  }, [deadlines, respFilter.profiles, start, end, hoje])

  /* ---------- Detalhes ---------- */
  function openProcs(title: string, list: ProcessRow[]) {
    detail.show(title, list.map((p, i) => ({ id: String(i), label: p.title, sublabel: [p.number, p.area, clientMap.get(p.client_id ?? '')?.name].filter(Boolean).join(' · ') || undefined, value: p.cause_value ? fmtBRL(Number(p.cause_value)) : undefined })))
  }
  function openDeadlines(title: string, list: DeadlineRow[]) {
    detail.show(title, list.map((d, i) => ({ id: String(i), label: d.title, sublabel: `${fmtDate(d.due_date)}${d.tipo ? ` · ${d.tipo}` : ''}${d.process_id ? ` · ${processMap.get(d.process_id)?.title ?? ''}` : ''}` })))
  }
  function openFin(title: string, list: { description: string; date: string; value: number }[]) {
    detail.show(title, list.map((f, i) => ({ id: String(i), label: f.description, sublabel: fmtDate(f.date), value: fmtBRL(f.value) })))
  }
  function openMonth(i: number) {
    const m = acervo[i]; if (!m) return
    openProcs(`Processos distribuídos em ${m.month}`, processes.filter(p => inRange(entrada(p), m._start, m._end)))
  }

  const attention = useMemo(() => {
    const items: Attention[] = []
    if (atrasados.length > 0) items.push({ text: `${atrasados.length} prazo(s) vencido(s) e ainda pendente(s).`, level: 'danger' })
    if (proximos7.length > 0) items.push({ text: `${proximos7.length} prazo(s) vencem nos próximos 7 dias.`, level: 'warn' })
    if (semMovimento.length > 0) items.push({ text: `${semMovimento.length} processo(s) ativo(s) sem andamento registrado há mais de 30 dias.`, level: 'warn' })
    if (semPrazoFuturo.length > 0) items.push({ text: `${semPrazoFuturo.length} processo(s) contencioso(s)/extrajudicial(is) ativo(s) sem nenhum prazo futuro cadastrado.`, level: 'info' })
    if (perdidos.length > 0) items.push({ text: `${perdidos.length} prazo(s) perdido(s) no período.`, level: 'danger' })
    return items
  }, [atrasados.length, proximos7.length, semMovimento.length, semPrazoFuturo.length, perdidos.length])

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  const sp = (k: 'novos' | 'encerrados' | 'acervo' | 'audiencias' | 'acordos') => acervo.map(m => m[k] as number)

  return (
    <div className="space-y-4">
      <AttentionPanel items={attention} />

      <SectionTitle hint="O tamanho do acervo e o fluxo de entrada e saída de processos.">Acervo</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard title="Processos ativos" hint="Processos com status em andamento hoje." value={ativos.length} icon={FolderOpen} color={PAL.purple} spark={sp('acervo')} onClick={() => openProcs('Processos ativos', ativos)} />
        <KpiCard title="Novos processos" hint="Processos distribuídos/cadastrados no período (data de distribuição, ou de cadastro se faltar)." value={novos.length} icon={FolderPlus} color={PAL.green} spark={sp('novos')}
          trend={trendText(novos.length, novosPrev.length)} onClick={() => openProcs('Novos processos', novos)} />
        <KpiCard title="Encerrados" hint="Processos com data de encerramento dentro do período." value={encerrados.length} icon={FolderCheck} color={PAL.teal} spark={sp('encerrados')}
          trend={trendText(encerrados.length, encerradosPrev.length)} trendTone="neutral" onClick={() => openProcs('Processos encerrados', encerrados)} />
        <KpiCard title="Saldo do acervo" hint="Novos menos encerrados no período: positivo = o acervo cresceu." value={`${novos.length - encerrados.length >= 0 ? '+' : ''}${novos.length - encerrados.length}`} icon={Scale} color={PAL.blue}
          onClick={() => openProcs('Novos e encerrados no período', [...novos, ...encerrados])} />
        <KpiCard title="Valor das causas ativas" hint="Soma do valor da causa dos processos ativos que têm esse campo preenchido." value={fmtBRL(valorCausas)} icon={Banknote} color={PAL.amber} sensitive
          trend={`${ativos.filter(p => p.cause_value).length} de ${ativos.length} com valor`} trendTone="neutral" onClick={() => openProcs('Causas com valor', ativos.filter(p => p.cause_value))} />
        <KpiCard title="Duração média" hint="Dias entre a distribuição e o encerramento dos processos encerrados (no período, ou de todo o histórico se não houve nenhum)." value={duracoes.length ? `${fmtNum(duracaoMedia, 0)} dias` : '—'} icon={Clock} color={PAL.sky}
          trend={duracoes.length ? `mediana ${fmtNum(median((duracoesPeriodo.length ? duracoesPeriodo : duracoes).map(d => d.dias)), 0)} dias` : undefined} trendTone="neutral"
          onClick={() => openProcs('Processos considerados na duração', (duracoesPeriodo.length ? duracoesPeriodo : duracoes).map(d => d.p))} />
        <KpiCard title="Sem andamento há 30+ dias" hint="Processos ativos sem nenhum andamento registrado nos últimos 30 dias." value={semMovimento.length} icon={AlertTriangle} color={semMovimento.length ? PAL.amber : PAL.green} trendTone="down-good"
          onClick={() => openProcs('Processos sem andamento recente', semMovimento)} />
        <KpiCard title="Sem prazo futuro" hint="Processos contenciosos/extrajudiciais ativos sem nenhum prazo pendente à frente — risco de esquecimento." value={semPrazoFuturo.length} icon={ShieldAlert} color={semPrazoFuturo.length ? PAL.amber : PAL.green} trendTone="down-good"
          onClick={() => openProcs('Ativos sem prazo futuro', semPrazoFuturo)} />
        <KpiCard title="Receita por processo ativo" hint="Receita dos últimos 12 meses ÷ processos ativos." value={fmtBRL(receitaMediaPorProcesso)} icon={Banknote} color={PAL.green} sensitive onClick={() => openFin('Receita dos últimos 12 meses', receita12)} />
        <KpiCard title="Êxito a receber" hint="Receitas da categoria Êxito ainda não pagas." value={fmtBRL(sum(exitoPrevisto.map(f => f.aberto)))} icon={Trophy} color={PAL.amber} sensitive onClick={() => openFin('Honorários de êxito previstos', exitoPrevisto.map(f => ({ description: f.description, date: f.date, value: f.aberto })))} />
      </div>

      <ChartCard title="Entrada, saída e tamanho do acervo (12 meses)" icon={Scale}>
        <ComboChart data={acervo} format={v => String(v)} yFormat={v => String(v)} onPointClick={openMonth} series={[
          { key: 'novos', name: 'Novos', color: PAL.green },
          { key: 'encerrados', name: 'Encerrados', color: PAL.teal },
          { key: 'acervo', name: 'Acervo ativo', color: PAL.purple, kind: 'line' },
        ]} />
      </ChartCard>

      <NotesPanel area="juridico" months={trendMonths} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Acervo ativo por área" icon={Scale}>
          <DonutWithLegend data={porArea} formatValue={v => String(v)} onSelect={name => openProcs(`Processos — ${name}`, ativos.filter(p => (p.area ?? 'Não classificado') === name))} />
        </ChartCard>
        <ChartCard title="Acervo ativo por tipo" icon={Gavel}>
          <DonutWithLegend data={porTipo} formatValue={v => String(v)} onSelect={name => openProcs(`Processos — ${name}`, ativos.filter(p => (TIPO_LABEL[p.type ?? ''] ?? 'Não informado') === name))} />
        </ChartCard>
        <ChartCard title="Por instância" icon={Landmark}>
          <HBars data={porInstancia} format={v => `${v}`} color={PAL.blue} onSelect={name => openProcs(`Instância — ${name}`, ativos.filter(p => (p.instance?.trim() || 'Não informada') === name))} />
        </ChartCard>
        <ChartCard title="Por fase" icon={FolderOpen}>
          <HBars data={porFase} format={v => `${v}`} color={PAL.teal} onSelect={name => openProcs(`Fase — ${name}`, ativos.filter(p => (p.phase?.trim() || 'Não informada') === name))} />
        </ChartCard>
        <ChartCard title="Principais tribunais / varas" icon={Landmark}>
          <HBars data={porTribunal} format={v => `${v}`} color={PAL.purple} empty="Nenhum processo com tribunal informado" onSelect={name => openProcs(`Tribunal — ${name}`, ativos.filter(p => p.court?.trim() === name))} />
        </ChartCard>
        <ChartCard title="Posição do cliente (autor / réu)" icon={Scale}>
          <DonutWithLegend data={porPapel} formatValue={v => String(v)} onSelect={name => openProcs(`Cliente como ${name}`, ativos.filter(p => p.client_role === name))} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Idade do acervo ativo" icon={Clock}>
          <BucketBars data={idadeAcervo.map(i => ({ name: i.name, value: i.value, color: i.color }))} format={v => `${v} proc.`}
            onSelect={name => { const f = idadeAcervo.find(i => i.name === name); if (f) openProcs(`Acervo — ${name}`, f.rows) }} />
        </ChartCard>
        <ChartCard title="Duração média por área (encerrados)" icon={Clock}>
          <HBars data={duracaoPorArea} format={v => `${fmtNum(v, 0)} dias`} color={PAL.sky} empty="Nenhum processo encerrado com datas"
            onSelect={name => openProcs(`Encerrados — ${name}`, duracoes.filter(d => (d.p.area ?? 'Não classificado') === name).map(d => d.p))} />
        </ChartCard>
      </div>

      <SectionTitle hint="Cumprimento, carga e calendário de prazos e audiências.">Prazos e audiências</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Taxa de cumprimento" hint="Prazos cumpridos ÷ (cumpridos + perdidos) com vencimento no período. O objetivo é 100%." value={cumpridos.length + perdidos.length ? fmtPct(taxaCumprimento) : '—'} icon={Bell} color={taxaCumprimento >= 98 ? PAL.green : PAL.amber}
          trend={cumpridos.length + perdidos.length > 0 && taxaCumprimentoPrev > 0 ? trendText(taxaCumprimento, taxaCumprimentoPrev) : undefined} onClick={() => openDeadlines('Prazos do período', prazosPeriodo)} />
        <KpiCard title="Prazos perdidos" hint="Prazos com vencimento no período marcados como perdidos." value={perdidos.length} icon={AlertTriangle} color={perdidos.length ? PAL.red : PAL.green} trendTone="down-good" onClick={() => openDeadlines('Prazos perdidos', perdidos)} />
        <KpiCard title="Prazos atrasados" hint="Prazos vencidos que continuam pendentes." value={atrasados.length} icon={AlertTriangle} color={atrasados.length ? PAL.red : PAL.green} trendTone="down-good" onClick={() => openDeadlines('Prazos atrasados', atrasados)} />
        <KpiCard title="Vencem em 7 dias" hint="Prazos pendentes com vencimento nos próximos 7 dias." value={proximos7.length} icon={Bell} color={PAL.amber} trend={`${proximos30.length} em 30 dias`} trendTone="neutral" onClick={() => openDeadlines('Prazos nos próximos 7 dias', proximos7)} />
        <KpiCard title="Audiências realizadas" hint="Compromissos do tipo audiência concluídos no período." value={audRealizadas.length} icon={Gavel} color={PAL.purple} spark={sp('audiencias')}
          onClick={() => detail.show('Audiências realizadas', audRealizadas.map((t, i) => ({ id: String(i), label: t.title, sublabel: t.due_date ? fmtDate(t.due_date) : undefined })))} />
        <KpiCard title="Próximas audiências" hint="Audiências pendentes nos próximos 30 dias." value={audProximas.length} icon={Gavel} color={PAL.blue}
          onClick={() => detail.show('Audiências nos próximos 30 dias', audProximas.map((t, i) => ({ id: String(i), label: t.title, sublabel: t.due_date ? fmtDate(t.due_date) : undefined })))} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Cumprimento de prazos (12 meses)" icon={Bell}>
          <ComboChart data={acervo} format={v => String(v)} yFormat={v => String(v)} series={[
            { key: 'cumpridos', name: 'Cumpridos', color: PAL.green, stack: 'p' },
            { key: 'perdidos', name: 'Perdidos', color: PAL.red, stack: 'p' },
            { key: 'cumprimento', name: 'Cumprimento (%)', color: PAL.purple, kind: 'line', axis: 'right' },
          ]} />
        </ChartCard>
        <ChartCard title="Prazos pendentes nas próximas semanas" icon={Bell}>
          <BucketBars data={prazosPorSemana.map((s, i) => ({ name: s.name, value: s.value, color: i === 0 ? PAL.red : i === 1 ? PAL.amber : PAL.blue }))} format={v => `${v} prazo(s)`}
            onSelect={name => { const s = prazosPorSemana.find(x => x.name === name); if (s) openDeadlines(`Prazos — ${name}`, s.rows) }} />
        </ChartCard>
        <ChartCard title="Situação dos prazos do período" icon={Bell}>
          <DonutWithLegend data={prazosStatus} formatValue={v => String(v)} onSelect={name => openDeadlines(`Prazos — ${name}`, prazosPeriodo.filter(d => d.status === (name === 'Cumpridos' ? 'cumprido' : name === 'Perdidos' ? 'perdido' : 'pendente')))} />
        </ChartCard>
        <ChartCard title="Prazos do período por tipo" icon={Bell}>
          <HBars data={prazosTipo} format={v => `${v}`} color={PAL.amber} onSelect={name => openDeadlines(`Prazos — ${name}`, prazosPeriodo.filter(d => (d.tipo?.trim() || 'Sem tipo') === name))} />
        </ChartCard>
      </div>

      <ChartCard title="Prazos por responsável" icon={Bell}>
        <MiniTable
          columns={[
            { key: 'nome', label: 'Responsável' },
            { key: 'pendentes', label: 'Pendentes', align: 'right' },
            { key: 'atrasados', label: 'Atrasados', align: 'right', render: r => <span className={r.atrasados ? 'text-red-700 dark:text-red-300 font-semibold' : ''}>{r.atrasados}</span> },
            { key: 'cumpridos', label: 'Cumpridos (período)', align: 'right' },
            { key: 'perdidos', label: 'Perdidos (período)', align: 'right', render: r => <span className={r.perdidos ? 'text-red-700 dark:text-red-300 font-semibold' : ''}>{r.perdidos}</span> },
            { key: 'taxa', label: 'Cumprimento', align: 'right', render: r => (r.cumpridos + r.perdidos ? fmtPct(r.taxa) : '—') },
          ]}
          rows={prazosPorResp}
          onRowClick={r => openDeadlines(`Prazos pendentes — ${r.nome}`, deadlines.filter(d => d.status === 'pendente' && (r.id === '—' ? !d.responsible_ids?.length : d.responsible_ids?.includes(r.id))))} />
      </ChartCard>

      <SectionTitle hint="Quanto cada frente do escritório gera.">Honorários</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Receita jurídica" hint="Receitas da Advocacia no período." value={fmtBRL(sum(receitaPeriodo.map(f => f.value)))} icon={Banknote} color={PAL.green} sensitive onClick={() => openFin('Receitas da Advocacia', receitaPeriodo)} />
        <KpiCard title="Acordos fechados" hint="Quantidade de receitas da categoria Acordo no período." value={acordos.length} icon={Handshake} color={PAL.teal} spark={sp('acordos')}
          trend={fmtBRL(sum(acordos.map(f => f.value)))} trendTone="neutral" onClick={() => openFin('Acordos do período', acordos)} />
        <KpiCard title="Ticket por acordo" hint="Valor médio das receitas de Acordo no período." value={fmtBRL(acordos.length ? sum(acordos.map(f => f.value)) / acordos.length : 0)} icon={Handshake} color={PAL.amber} sensitive onClick={() => openFin('Acordos do período', acordos)} />
        <KpiCard title="Êxito a receber" hint="Honorários de êxito lançados e ainda não pagos." value={fmtBRL(sum(exitoPrevisto.map(f => f.aberto)))} icon={Trophy} color={PAL.amber} sensitive onClick={() => openFin('Êxito previsto', exitoPrevisto.map(f => ({ description: f.description, date: f.date, value: f.aberto })))} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Receita por área jurídica (período)" icon={Scale}>
          <HBars data={receitaPorArea} format={fmtBRL} color={PAL.green} onSelect={name => openFin(`Receita — ${name}`, receitaPeriodo.filter(f => areaDe(f) === name))} />
        </ChartCard>
        <ChartCard title="Receita média por processo ativo, por área (12 meses)" icon={Banknote}>
          <HBars data={receitaPorProcessoArea} format={fmtBRL} color={PAL.purple} />
        </ChartCard>
        <ChartCard title="Valor das causas ativas por área" icon={Banknote}>
          <HBars data={causasPorArea} format={fmtBRL} color={PAL.amber} empty="Nenhuma causa com valor informado" onSelect={name => openProcs(`Causas — ${name}`, ativos.filter(p => (p.area ?? 'Não classificado') === name && p.cause_value))} />
        </ChartCard>
        <ChartCard title="Acordos por mês" icon={Handshake}>
          <ComboChart data={acervo} series={[{ key: 'acordos', name: 'Acordos', color: PAL.teal }]} />
        </ChartCard>
      </div>

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
