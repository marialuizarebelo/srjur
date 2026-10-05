import { useEffect, useMemo, useState } from 'react'
import {
  DollarSign, TrendingUp, Users, Target, Scale, ClipboardList, Wallet, Percent, AlertTriangle, Repeat, UserPlus, Bell, Handshake, FolderPlus, Trophy,
} from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import { Sensitive } from '@/components/Sensitive'
import {
  monthsBack, usePeriod, KpiCard, ChartCard, DetailDialog, useDetail, AttentionPanel, type Attention, previousPeriodRange, trendText,
  NotesPanel, useUnidadeFilter, matchUnidadeFinance, matchUnidadeCliente, UNIDADE_LABELS,
} from './shared'
import {
  PAL, ComboChart, HBars, MiniTable, SectionTitle,
  sum, pct, fmtPct, daysBetween, addDays, inRange, todayISO, groupSum, fetchAll,
  useFinanceData, isDespesaCaixa, assinaturasDoMes, type FinRow,
} from './kit'
import { useMetasData, metaProjecao } from './Metas'

interface ClientLite { id: string; name: string; status: string; created_at: string; is_juridico: boolean; is_saas: boolean; is_cortesia: boolean }
interface LeadLite { name: string; status: string; client_id: string | null; created_at: string; potential_value: number | null; updated_at: string | null; next_followup: string | null }
interface ProcessLite { title: string; status: string; created_at: string; filing_date: string | null; closed_date: string | null }
interface TaskLite { title: string; status: string; due_date: string | null }
interface DeadlineLite { title: string; status: string; due_date: string }

const isConv = (l: LeadLite) => l.status === 'convertido' || !!l.client_id
const isAberto = (l: LeadLite) => !isConv(l) && l.status !== 'perdido'

export default function VisaoGeralTab() {
  const period = usePeriod()
  const detail = useDetail()
  const { unidade } = useUnidadeFilter()
  const { rows: finAll, loading: loadingFin } = useFinanceData()
  const metas = useMetasData()
  const [loading, setLoading] = useState(true)
  const [clientsRaw, setClients] = useState<ClientLite[]>([])
  const [leads, setLeads] = useState<LeadLite[]>([])
  const [processes, setProcesses] = useState<ProcessLite[]>([])
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [deadlines, setDeadlines] = useState<DeadlineLite[]>([])

  useEffect(() => {
    Promise.all([
      fetchAll<ClientLite>('clients', 'id, name, status, created_at, is_juridico, is_saas, is_cortesia'),
      fetchAll<LeadLite>('leads', 'name, status, client_id, created_at, potential_value, updated_at, next_followup'),
      fetchAll<ProcessLite>('processes', 'title, status, created_at, filing_date, closed_date'),
      fetchAll<TaskLite>('tasks', 'title, status, due_date'),
      fetchAll<DeadlineLite>('deadlines', 'title, status, due_date'),
    ]).then(([c, l, p, t, d]) => { setClients(c); setLeads(l); setProcesses(p); setTasks(t); setDeadlines(d); setLoading(false) })
  }, [])

  const hoje = todayISO()
  const { start, end } = period.range
  const prev = useMemo(() => previousPeriodRange(start, end), [start, end])
  const trendMonths = useMemo(() => monthsBack(12), [])

  /* ---------- Base por Visão ---------- */
  const fin = useMemo(() => finAll.filter(r => matchUnidadeFinance(r.business_unit, unidade)), [finAll, unidade])
  const clients = useMemo(() => clientsRaw.filter(c => !c.is_cortesia && matchUnidadeCliente(c, unidade)), [clientsRaw, unidade])

  /* ---------- Financeiro ---------- */
  const calc = (rows: FinRow[], s: string, e: string) => {
    const rs = rows.filter(r => inRange(r.date, s, e))
    const receitas = sum(rs.filter(r => r.type === 'receita').map(r => r.value))
    const despesas = sum(rs.filter(isDespesaCaixa).map(r => r.value))
    return { receitas, despesas, resultado: receitas - despesas, margem: pct(receitas - despesas, receitas) }
  }
  const cur = useMemo(() => calc(fin, start, end), [fin, start, end])
  const ant = useMemo(() => calc(fin, prev.start, prev.end), [fin, prev])
  const saldo = (rows: FinRow[]) => sum(rows.filter(r => r.paid && r.impacts_cash !== false).map(r => (r.type === 'receita' ? r.value : -r.value)))
  const saldoTotal = useMemo(() => saldo(fin), [fin])
  const vencidas = useMemo(() => fin.filter(r => r.type === 'receita' && !r.paid && r.aberto > 0 && (r.due_date ?? r.date) < hoje), [fin, hoje])
  const valorVencido = sum(vencidas.map(r => r.aberto))

  const serie = useMemo(() => {
    let acc = sum(fin.filter(r => r.paid && r.impacts_cash !== false && (r.payment_date ?? r.date) < trendMonths[0].start).map(r => (r.type === 'receita' ? r.value : -r.value)))
    return trendMonths.map(m => {
      const c = calc(fin, m.start, m.end)
      acc += sum(fin.filter(r => r.paid && r.impacts_cash !== false && inRange(r.payment_date ?? r.date, m.start, m.end)).map(r => (r.type === 'receita' ? r.value : -r.value)))
      const recAdv = sum(finAll.filter(r => r.type === 'receita' && r.business_unit !== 'saas' && inRange(r.date, m.start, m.end)).map(r => r.value))
      const recSaas = sum(finAll.filter(r => r.type === 'receita' && r.business_unit === 'saas' && inRange(r.date, m.start, m.end)).map(r => r.value))
      return { month: m.label, receitas: c.receitas, despesas: c.despesas, resultado: c.resultado, saldo: acc, advocacia: recAdv, saas: recSaas, _start: m.start, _end: m.end }
    })
  }, [fin, finAll, trendMonths])

  /* ---------- Comparativo Advocacia × SaaS × Empresa ---------- */
  const comparativo = useMemo(() => {
    const adv = finAll.filter(r => r.business_unit !== 'saas'); const saas = finAll.filter(r => r.business_unit === 'saas')
    const bloco = (rows: FinRow[], clientsOf: ClientLite[]) => {
      const c = calc(rows, start, end); const p = calc(rows, prev.start, prev.end)
      return { ...c, prevResultado: p.resultado, prevReceitas: p.receitas, caixa: saldo(rows), atraso: sum(rows.filter(r => r.type === 'receita' && !r.paid && r.aberto > 0 && (r.due_date ?? r.date) < hoje).map(r => r.aberto)), clientes: clientsOf.filter(x => x.status === 'ativo').length }
    }
    const cl = clientsRaw.filter(c => !c.is_cortesia)
    return {
      adv: bloco(adv, cl.filter(c => c.is_juridico)),
      saas: bloco(saas, cl.filter(c => c.is_saas)),
      emp: bloco(finAll, cl.filter(c => c.is_juridico || c.is_saas)),
    }
  }, [finAll, clientsRaw, start, end, prev, hoje])
  const mrrSaas = useMemo(() => sum(Array.from(assinaturasDoMes(finAll.filter(r => r.business_unit === 'saas'), trendMonths[11].start, trendMonths[11].end).values()).map(a => a.mrr)), [finAll, trendMonths])
  const mrrSaasAnt = useMemo(() => sum(Array.from(assinaturasDoMes(finAll.filter(r => r.business_unit === 'saas'), trendMonths[10].start, trendMonths[10].end).values()).map(a => a.mrr)), [finAll, trendMonths])

  /* ---------- Clientes e vendas ---------- */
  const ativos = clients.filter(c => c.status === 'ativo')
  const novos = clients.filter(c => inRange(c.created_at, start, end))
  const novosPrev = clients.filter(c => inRange(c.created_at, prev.start, prev.end))
  const leadsPeriodo = leads.filter(l => inRange(l.created_at, start, end))
  const leadsPrev = leads.filter(l => inRange(l.created_at, prev.start, prev.end))
  const conversao = pct(leadsPeriodo.filter(isConv).length, leadsPeriodo.length)
  const conversaoPrev = pct(leadsPrev.filter(isConv).length, leadsPrev.length)
  const abertos = leads.filter(isAberto)
  const pipeline = sum(abertos.map(l => Number(l.potential_value ?? 0)))
  const followAtras = abertos.filter(l => l.next_followup && l.next_followup < hoje)

  /* ---------- Operação ---------- */
  const procAtivos = processes.filter(p => p.status === 'em_andamento')
  const procNovos = processes.filter(p => inRange(p.filing_date ?? p.created_at, start, end))
  const procEncerrados = processes.filter(p => inRange(p.closed_date, start, end))
  const prazosAtras = deadlines.filter(d => d.status === 'pendente' && d.due_date < hoje)
  const prazosProx7 = deadlines.filter(d => d.status === 'pendente' && inRange(d.due_date, hoje, addDays(hoje, 7)))
  const prazosPer = deadlines.filter(d => inRange(d.due_date, start, end))
  const cumpr = prazosPer.filter(d => d.status === 'cumprido').length
  const perd = prazosPer.filter(d => d.status === 'perdido').length
  const tarefasAtras = tasks.filter(t => t.status === 'pendente' && t.due_date && t.due_date < hoje)

  /* ---------- Rankings ---------- */
  const topClientes = useMemo(() => {
    const nomes = new Map(clientsRaw.map(c => [c.id, c.name]))
    return groupSum(fin.filter(r => r.type === 'receita' && r.client_id && inRange(r.date, start, end)), r => r.client_id!, r => r.value).map(c => ({ ...c, name: nomes.get(c.name) ?? 'Cliente' })).slice(0, 6)
  }, [fin, clientsRaw, start, end])
  const progressoMetas = useMemo(() => metas.activeMetas.map(m => {
    const t = metas.tipoDe(m); const at = metas.computeAtingido(m)
    return { name: m.label, value: m.valor_alvo > 0 ? Math.round((at / m.valor_alvo) * 100) : 0, color: metas.statusDe(m).color, sub: metas.statusDe(m).label, meta: m, at, t, proj: metaProjecao(m, at) }
  }).sort((a, b) => a.value - b.value).slice(0, 8), [metas])

  /* ---------- Detalhes ---------- */
  const openFin = (title: string, list: FinRow[], v: (r: FinRow) => number = r => r.value) => detail.show(title, list.map((r, i) => ({ id: String(i), label: r.description, sublabel: `${fmtDate(r.date)} · ${r.category ?? 'Outros'}`, value: fmtBRL(v(r)) })))
  const openClients = (title: string, list: ClientLite[]) => detail.show(title, list.map((c, i) => ({ id: String(i), label: c.name, sublabel: fmtDate(c.created_at) })))
  const openLeads = (title: string, list: LeadLite[]) => detail.show(title, list.map((l, i) => ({ id: String(i), label: l.name, sublabel: fmtDate(l.created_at), value: l.potential_value ? fmtBRL(Number(l.potential_value)) : undefined })))
  const openProc = (title: string, list: ProcessLite[]) => detail.show(title, list.map((p, i) => ({ id: String(i), label: p.title })))
  const openDead = (title: string, list: DeadlineLite[]) => detail.show(title, list.map((d, i) => ({ id: String(i), label: d.title, sublabel: fmtDate(d.due_date) })))

  const attention = useMemo(() => {
    const items: Attention[] = []
    if (saldoTotal < 0) items.push({ text: 'O saldo em caixa está negativo.', level: 'danger' })
    if (cur.receitas > 0 && cur.despesas > cur.receitas) items.push({ text: 'As despesas superaram as receitas no período.', level: 'warn' })
    if (valorVencido > 0) items.push({ text: `${fmtBRL(valorVencido)} em recebimentos vencidos e não pagos.`, level: 'warn' })
    if (prazosAtras.length > 0) items.push({ text: `${prazosAtras.length} prazo(s) processual(is) vencido(s) e pendente(s).`, level: 'danger' })
    if (prazosProx7.length > 0) items.push({ text: `${prazosProx7.length} prazo(s) vencem nos próximos 7 dias.`, level: 'info' })
    if (followAtras.length > 0) items.push({ text: `${followAtras.length} lead(s) com follow-up atrasado.`, level: 'info' })
    const emRisco = progressoMetas.filter(m => m.color === '#D9A441' || m.color === '#D96C87')
    if (emRisco.length > 0) items.push({ text: `${emRisco.length} meta(s) em risco ou estourada(s): ${emRisco.slice(0, 3).map(m => m.name).join(', ')}.`, level: 'warn' })
    return items
  }, [saldoTotal, cur, valorVencido, prazosAtras.length, prazosProx7.length, followAtras.length, progressoMetas])

  if (loading || loadingFin || metas.loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  const sp = (k: 'receitas' | 'despesas' | 'resultado' | 'saldo') => serie.map(m => m[k] as number)
  const mostrarSaas = unidade !== 'advocacia'
  const mostrarJuridico = unidade !== 'saas'
  const varPct = (a: number, b: number) => (b === 0 ? '—' : `${a >= b ? '↑' : '↓'} ${Math.abs(((a - b) / Math.abs(b)) * 100).toFixed(0)}%`)

  return (
    <div className="space-y-4">
      <AttentionPanel items={attention} />

      <SectionTitle hint={`Período selecionado · ${UNIDADE_LABELS[unidade]}`}>Dinheiro</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Receita" hint="Receitas lançadas com data no período." value={fmtBRL(cur.receitas)} icon={TrendingUp} color={PAL.green} sensitive spark={sp('receitas')} trend={trendText(cur.receitas, ant.receitas)} onClick={() => openFin('Receitas do período', fin.filter(r => r.type === 'receita' && inRange(r.date, start, end)))} />
        <KpiCard title="Despesas" hint="Despesas do período que afetam o caixa." value={fmtBRL(cur.despesas)} icon={TrendingUp} color={PAL.red} sensitive spark={sp('despesas')} trendTone="down-good" trend={trendText(cur.despesas, ant.despesas)} onClick={() => openFin('Despesas do período', fin.filter(r => isDespesaCaixa(r) && inRange(r.date, start, end)))} />
        <KpiCard title="Resultado" hint="Receitas menos despesas." value={fmtBRL(cur.resultado)} icon={DollarSign} color={cur.resultado >= 0 ? PAL.green : PAL.red} sensitive spark={sp('resultado')} trend={trendText(cur.resultado, ant.resultado)} onClick={() => openFin('Lançamentos do período', fin.filter(r => inRange(r.date, start, end) && (r.type === 'receita' || r.impacts_cash !== false)))} />
        <KpiCard title="Margem" hint="Resultado ÷ receitas." value={fmtPct(cur.margem)} icon={Percent} color={PAL.blue} trend={ant.receitas > 0 ? `${fmtPct(ant.margem)} no período anterior` : undefined} trendTone="neutral" onClick={() => openFin('Lançamentos do período', fin.filter(r => inRange(r.date, start, end)))} />
        <KpiCard title="Saldo em caixa" hint="Tudo que foi recebido menos tudo que foi pago, desde o início." value={fmtBRL(saldoTotal)} icon={Wallet} color={PAL.purple} sensitive spark={sp('saldo')} onClick={() => openFin('Lançamentos pagos', fin.filter(r => r.paid && r.impacts_cash !== false))} />
        <KpiCard title="Em atraso" hint="Receitas vencidas e ainda não pagas." value={fmtBRL(valorVencido)} icon={AlertTriangle} color={valorVencido ? PAL.red : PAL.green} sensitive trendTone="down-good" onClick={() => openFin('Receitas vencidas', vencidas, r => r.aberto)} />
      </div>

      <SectionTitle hint="Quem são, quantos entram e o que está no funil.">Clientes e vendas</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Clientes ativos" hint="Clientes com status ativo (sem casos gratuitos), conforme a Visão." value={ativos.length} icon={Users} color={PAL.blue} onClick={() => openClients('Clientes ativos', ativos)} />
        <KpiCard title="Novos clientes" hint="Cadastrados no período." value={novos.length} icon={UserPlus} color={PAL.teal} trend={trendText(novos.length, novosPrev.length)} onClick={() => openClients('Novos clientes', novos)} />
        {mostrarJuridico && <KpiCard title="Leads em aberto" hint="Leads em andamento hoje e o valor potencial somado." value={abertos.length} icon={Target} color={PAL.amber} trend={fmtBRL(pipeline)} trendTone="neutral" onClick={() => openLeads('Leads em aberto', abertos)} />}
        {mostrarJuridico && <KpiCard title="Conversão" hint="Dos leads que entraram no período, quantos viraram cliente." value={fmtPct(conversao)} icon={Handshake} color={PAL.green} trend={trendText(conversao, conversaoPrev)} onClick={() => openLeads('Leads convertidos', leadsPeriodo.filter(isConv))} />}
        {mostrarSaas && <KpiCard title="MRR (SaaS)" hint="Receita recorrente mensal do sistema." value={fmtBRL(mrrSaas)} icon={Repeat} color={PAL.purple} sensitive trend={mrrSaasAnt > 0 ? trendText(mrrSaas, mrrSaasAnt, 'vs mês anterior') : undefined} onClick={() => detail.show('Veja a aba Produto/SaaS', [{ id: '0', label: 'O detalhe do MRR por cliente está na aba Produto/SaaS', value: fmtBRL(mrrSaas) }])} />}
      </div>

      {mostrarJuridico && (
        <>
          <SectionTitle hint="Acervo, prazos e tarefas da equipe.">Operação</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard title="Processos ativos" hint="Processos em andamento hoje." value={procAtivos.length} icon={Scale} color={PAL.purple} onClick={() => openProc('Processos ativos', procAtivos)} />
            <KpiCard title="Novos / encerrados" hint="Processos distribuídos e encerrados no período." value={`${procNovos.length} / ${procEncerrados.length}`} icon={FolderPlus} color={PAL.teal} onClick={() => openProc('Novos processos', procNovos)} />
            <KpiCard title="Prazos atrasados" hint="Vencidos e pendentes." value={prazosAtras.length} icon={Bell} color={prazosAtras.length ? PAL.red : PAL.green} trendTone="down-good" trend={`${prazosProx7.length} vencem em 7 dias`} onClick={() => openDead('Prazos atrasados', prazosAtras)} />
            <KpiCard title="Cumprimento de prazos" hint="Cumpridos ÷ (cumpridos + perdidos) com vencimento no período." value={cumpr + perd ? fmtPct(pct(cumpr, cumpr + perd)) : '—'} icon={Bell} color={perd ? PAL.amber : PAL.green} trend={`${cumpr} cumpridos · ${perd} perdidos`} trendTone="neutral" onClick={() => openDead('Prazos do período', prazosPer)} />
            <KpiCard title="Tarefas atrasadas" hint="Pendentes com data limite anterior a hoje." value={tarefasAtras.length} icon={ClipboardList} color={tarefasAtras.length ? PAL.amber : PAL.green} trendTone="down-good" onClick={() => detail.show('Tarefas atrasadas', tarefasAtras.map((t, i) => ({ id: String(i), label: t.title, sublabel: t.due_date ? fmtDate(t.due_date) : undefined })))} />
            <KpiCard title="Metas em andamento" hint="Metas cujo período inclui hoje." value={metas.activeMetas.length} icon={Trophy} color={PAL.amber} trend={`${metas.activeAtingidas.length} já atingida(s)`} trendTone="neutral"
              onClick={() => detail.show('Metas em andamento', metas.activeMetas.map((m, i) => ({ id: String(i), label: m.label, sublabel: metas.statusDe(m).label })))} />
          </div>
        </>
      )}

      <ChartCard title="Advocacia × SaaS × Empresa toda" icon={Scale}>
        <p className="text-xs text-muted-foreground mb-3">Sempre mostra as duas unidades lado a lado e a soma delas, independente da Visão escolhida acima. Período: {fmtDate(start)} a {fmtDate(end)}.</p>
        <MiniTable
          columns={[
            { key: 'label', label: '' },
            { key: 'adv', label: 'Advocacia', align: 'right' },
            { key: 'saas', label: 'SaaS', align: 'right' },
            { key: 'emp', label: 'Empresa toda', align: 'right', render: r => <strong>{r.emp}</strong> },
          ]}
          rows={[
            { label: 'Receitas', adv: <Sensitive>{fmtBRL(comparativo.adv.receitas)}</Sensitive>, saas: <Sensitive>{fmtBRL(comparativo.saas.receitas)}</Sensitive>, emp: <Sensitive>{fmtBRL(comparativo.emp.receitas)}</Sensitive> },
            { label: 'Despesas', adv: <Sensitive>{fmtBRL(comparativo.adv.despesas)}</Sensitive>, saas: <Sensitive>{fmtBRL(comparativo.saas.despesas)}</Sensitive>, emp: <Sensitive>{fmtBRL(comparativo.emp.despesas)}</Sensitive> },
            { label: 'Resultado', adv: <Sensitive>{fmtBRL(comparativo.adv.resultado)}</Sensitive>, saas: <Sensitive>{fmtBRL(comparativo.saas.resultado)}</Sensitive>, emp: <Sensitive>{fmtBRL(comparativo.emp.resultado)}</Sensitive> },
            { label: 'Margem', adv: fmtPct(comparativo.adv.margem), saas: fmtPct(comparativo.saas.margem), emp: fmtPct(comparativo.emp.margem) },
            { label: 'Variação do resultado', adv: varPct(comparativo.adv.resultado, comparativo.adv.prevResultado), saas: varPct(comparativo.saas.resultado, comparativo.saas.prevResultado), emp: varPct(comparativo.emp.resultado, comparativo.emp.prevResultado) },
            { label: 'Parte da receita da empresa', adv: fmtPct(pct(comparativo.adv.receitas, comparativo.emp.receitas)), saas: fmtPct(pct(comparativo.saas.receitas, comparativo.emp.receitas)), emp: '100%' },
            { label: 'Saldo em caixa', adv: <Sensitive>{fmtBRL(comparativo.adv.caixa)}</Sensitive>, saas: <Sensitive>{fmtBRL(comparativo.saas.caixa)}</Sensitive>, emp: <Sensitive>{fmtBRL(comparativo.emp.caixa)}</Sensitive> },
            { label: 'Em atraso', adv: <Sensitive>{fmtBRL(comparativo.adv.atraso)}</Sensitive>, saas: <Sensitive>{fmtBRL(comparativo.saas.atraso)}</Sensitive>, emp: <Sensitive>{fmtBRL(comparativo.emp.atraso)}</Sensitive> },
            { label: 'Clientes ativos', adv: comparativo.adv.clientes, saas: comparativo.saas.clientes, emp: comparativo.emp.clientes },
          ]} />
        <p className="text-[11px] text-muted-foreground mt-2">Clientes que usam as duas frentes aparecem nas duas colunas; a soma conta cada um uma vez.</p>
      </ChartCard>

      <ChartCard title="Receitas, despesas e resultado (12 meses)" icon={DollarSign}>
        <ComboChart data={serie} onPointClick={i => { const m = serie[i]; openFin(`Lançamentos de ${m.month}`, fin.filter(r => inRange(r.date, m._start, m._end) && (r.type === 'receita' || r.impacts_cash !== false))) }} series={[
          { key: 'receitas', name: 'Receitas', color: PAL.green }, { key: 'despesas', name: 'Despesas', color: PAL.red }, { key: 'resultado', name: 'Resultado', color: PAL.purple, kind: 'line' },
        ]} />
      </ChartCard>

      <NotesPanel area="geral" months={trendMonths} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {unidade === '' ? (
          <ChartCard title="Receita por unidade (12 meses)" icon={Scale}>
            <ComboChart data={serie} series={[{ key: 'advocacia', name: 'Advocacia', color: PAL.purple, stack: 'u' }, { key: 'saas', name: 'SaaS', color: PAL.teal, stack: 'u' }]} />
          </ChartCard>
        ) : (
          <ChartCard title="Caixa acumulado (12 meses)" icon={Wallet}>
            <ComboChart data={serie} series={[{ key: 'saldo', name: 'Saldo', color: PAL.purple, kind: 'area' }]} />
          </ChartCard>
        )}
        <ChartCard title="Maiores clientes do período" icon={Users}>
          <HBars data={topClientes} format={fmtBRL} color={PAL.green} limit={6} suffix={d => `· ${fmtPct(pct(d.value, cur.receitas), 0)}`} empty="Nenhuma receita vinculada a cliente"
            onSelect={name => { const id = clientsRaw.find(c => c.name === name)?.id; openFin(`Receitas — ${name}`, fin.filter(r => r.type === 'receita' && r.client_id === id && inRange(r.date, start, end))) }} />
        </ChartCard>
        <ChartCard title="Metas que mais precisam de atenção" icon={Trophy}>
          <HBars data={progressoMetas.map(p => ({ name: p.name, value: p.value, sub: p.sub }))} format={v => `${v}%`} colors={progressoMetas.map(p => p.color)} limit={8} empty="Nenhuma meta em andamento"
            onSelect={name => { const p = progressoMetas.find(x => x.name === name); if (p) detail.show(`O que compõe "${name}"`, metas.computeDetailRowsFor(p.meta)) }} />
        </ChartCard>
        {mostrarJuridico && (
          <ChartCard title="Agenda crítica" icon={Bell}>
            <div className="space-y-1.5">
              {[...prazosAtras.map(d => ({ ...d, atraso: true })), ...prazosProx7.map(d => ({ ...d, atraso: false }))].sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 8).map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs rounded-xl border border-[var(--glass-border)] px-3 py-2">
                  <span className="truncate font-medium">{d.title}</span>
                  <span className={`shrink-0 ${d.atraso ? 'text-red-700 dark:text-red-300 font-semibold' : 'text-muted-foreground'}`}>{d.atraso ? `${daysBetween(d.due_date, hoje)} dia(s) de atraso` : fmtDate(d.due_date)}</span>
                </div>
              ))}
              {prazosAtras.length + prazosProx7.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum prazo atrasado ou nos próximos 7 dias 🎉</p>}
            </div>
          </ChartCard>
        )}
      </div>

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
