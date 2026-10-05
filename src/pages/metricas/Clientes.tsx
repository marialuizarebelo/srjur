import { useEffect, useMemo, useState } from 'react'
import {
  Users, AlertTriangle, Wallet, Percent, UserPlus, UserMinus, Clock, Repeat, Layers, PiggyBank, Moon, Scale,
} from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import {
  monthsBack, usePeriod, KpiCard, ChartCard, DonutWithLegend, DetailDialog, useDetail, AttentionPanel, type Attention,
  previousPeriodRange, trendText, NotesPanel, useResponsavelFilter, useUnidadeFilter, matchUnidadeFinance, matchUnidadeCliente,
} from './shared'
import {
  PAL, ComboChart, HBars, BucketBars, MiniTable, StatStrip, SectionTitle,
  sum, avg, pct, fmtPct, fmtNum, daysBetween, addDays, inRange, todayISO, groupSum, groupCount, fetchAll, useFinanceData, isRecorrente,
} from './kit'

interface ClientRow {
  id: string; name: string; area: string | null; status: string; type: string | null; origin: string | null; city: string | null; state: string | null
  created_at: string; responsible_ids: string[] | null; is_cortesia: boolean; is_juridico: boolean; is_saas: boolean
}
interface ProcessLite { client_id: string | null; status: string }

export default function ClientesTab() {
  const period = usePeriod()
  const detail = useDetail()
  const respFilter = useResponsavelFilter()
  const { unidade } = useUnidadeFilter()
  const { rows: finAll, loading: loadingFin } = useFinanceData()
  const [loading, setLoading] = useState(true)
  const [clientsRaw, setClientsRaw] = useState<ClientRow[]>([])
  const [processes, setProcesses] = useState<ProcessLite[]>([])

  useEffect(() => {
    Promise.all([
      fetchAll<ClientRow>('clients', 'id, name, area, status, type, origin, city, state, created_at, responsible_ids, is_cortesia, is_juridico, is_saas'),
      fetchAll<ProcessLite>('processes', 'client_id, status'),
    ]).then(([c, p]) => { setClientsRaw(c); setProcesses(p); setLoading(false) })
  }, [])

  // Fora da carteira: casos gratuitos (cortesia). Jurídico x SaaS segue a Visão escolhida no topo.
  const clients = useMemo(() => clientsRaw.filter(c => respFilter.matches(c.responsible_ids) && !c.is_cortesia && matchUnidadeCliente(c, unidade)), [clientsRaw, respFilter.responsavelId, unidade])
  const clientById = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])
  const finance = useMemo(() => finAll.filter(f => matchUnidadeFinance(f.business_unit, unidade) && f.client_id && clientById.has(f.client_id)), [finAll, unidade, clientById])

  const hoje = todayISO()
  const { start, end } = period.range
  const prev = useMemo(() => previousPeriodRange(start, end), [start, end])
  const trendMonths = useMemo(() => monthsBack(12), [])

  /* ---------- Carteira ---------- */
  const ativos = useMemo(() => clients.filter(c => c.status === 'ativo'), [clients])
  const inativos = useMemo(() => clients.filter(c => c.status === 'inativo'), [clients])
  const prospectos = useMemo(() => clients.filter(c => c.status === 'prospecto'), [clients])
  const novos = useMemo(() => clients.filter(c => inRange(c.created_at, start, end)), [clients, start, end])
  const novosPrev = useMemo(() => clients.filter(c => inRange(c.created_at, prev.start, prev.end)), [clients, prev])
  const retencao = pct(ativos.length, ativos.length + inativos.length)
  const idadeAnos = (c: ClientRow) => daysBetween(c.created_at, hoje) / 365
  const relacionamentoMedio = avg(ativos.map(idadeAnos))

  /* ---------- Receita por cliente ---------- */
  const receitaPeriodo = useMemo(() => finance.filter(f => f.type === 'receita' && inRange(f.date, start, end)), [finance, start, end])
  const receita12 = useMemo(() => finance.filter(f => f.type === 'receita' && inRange(f.date, trendMonths[0].start, trendMonths[11].end)), [finance, trendMonths])
  const porClientePeriodo = useMemo(() => groupSum(receitaPeriodo, f => f.client_id!, f => f.value), [receitaPeriodo])
  const porCliente12 = useMemo(() => groupSum(receita12, f => f.client_id!, f => f.value), [receita12])
  const pagantesPeriodo = porClientePeriodo.length
  const arpc = pagantesPeriodo ? sum(porClientePeriodo.map(c => c.value)) / pagantesPeriodo : 0
  const receita12Total = sum(porCliente12.map(c => c.value))
  const top5Pct = pct(sum(porCliente12.slice(0, 5).map(c => c.value)), receita12Total)
  const nome = (id: string) => clientById.get(id)?.name ?? 'Cliente'
  // Curva ABC: quantos clientes respondem por 80% da receita
  const abc = useMemo(() => {
    let acc = 0; let n = 0
    for (const c of porCliente12) { acc += c.value; n++; if (acc >= receita12Total * 0.8) break }
    return { n, de: porCliente12.length }
  }, [porCliente12, receita12Total])
  const recorrentes = useMemo(() => new Set(finance.filter(f => f.type === 'receita' && isRecorrente(f) && inRange(f.date, addDays(hoje, -60), hoje)).map(f => f.client_id!)), [finance, hoje])

  /* ---------- Inadimplência por cliente ---------- */
  const vencidas = useMemo(() => finance.filter(f => f.type === 'receita' && !f.paid && f.aberto > 0 && (f.due_date ?? f.date) < hoje), [finance, hoje])
  const valorAtraso = sum(vencidas.map(f => f.aberto))
  const totalVencidoHistorico = sum(finance.filter(f => f.type === 'receita' && (f.due_date ?? f.date) <= hoje).map(f => f.value))
  const devedores = useMemo(() => {
    const m = new Map<string, { id: string; valor: number; maxDias: number; qtd: number }>()
    vencidas.forEach(f => {
      const cur = m.get(f.client_id!) ?? { id: f.client_id!, valor: 0, maxDias: 0, qtd: 0 }
      cur.valor += f.aberto; cur.qtd++; cur.maxDias = Math.max(cur.maxDias, daysBetween(f.due_date ?? f.date, hoje)); m.set(f.client_id!, cur)
    })
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor)
  }, [vencidas])

  /* ---------- Risco / oportunidades ---------- */
  const processosPorCliente = useMemo(() => {
    const m = new Map<string, number>(); processes.filter(p => p.status === 'em_andamento' && p.client_id).forEach(p => m.set(p.client_id!, (m.get(p.client_id!) ?? 0) + 1)); return m
  }, [processes])
  const juridicosAtivos = ativos.filter(c => c.is_juridico)
  const semProcesso = juridicosAtivos.filter(c => !processosPorCliente.has(c.id))
  const ultimaReceita = useMemo(() => {
    const m = new Map<string, string>(); finance.filter(f => f.type === 'receita').forEach(f => { const c = m.get(f.client_id!); if (!c || f.date > c) m.set(f.client_id!, f.date) }); return m
  }, [finance])
  const dormentes = ativos.filter(c => { const u = ultimaReceita.get(c.id); return !u || daysBetween(u, hoje) > 90 })
  const multiProcesso = juridicosAtivos.filter(c => (processosPorCliente.get(c.id) ?? 0) >= 2)
  const distribProcessos = useMemo(() => [0, 1, 2, 3].map(n => ({ name: n === 3 ? '3 ou mais' : n === 0 ? 'nenhum' : `${n} processo${n > 1 ? 's' : ''}`, value: juridicosAtivos.filter(c => { const q = processosPorCliente.get(c.id) ?? 0; return n === 3 ? q >= 3 : q === n }).length, rows: juridicosAtivos.filter(c => { const q = processosPorCliente.get(c.id) ?? 0; return n === 3 ? q >= 3 : q === n }) })), [juridicosAtivos, processosPorCliente])

  /* ---------- Séries ---------- */
  const crescimento = useMemo(() => trendMonths.map(m => ({
    month: m.label,
    novos: clients.filter(c => inRange(c.created_at, m.start, m.end)).length,
    base: clients.filter(c => c.created_at.slice(0, 10) <= m.end && c.status !== 'prospecto').length,
    _start: m.start, _end: m.end,
  })), [clients, trendMonths])

  /* ---------- Distribuições ---------- */
  const porArea = useMemo(() => groupCount(ativos, c => c.area ?? 'Não classificado'), [ativos])
  const porTipo = useMemo(() => groupCount(ativos, c => (c.type === 'pessoa_juridica' ? 'Pessoa jurídica' : c.type === 'pessoa_fisica' ? 'Pessoa física' : 'Não informado')), [ativos])
  const porOrigem = useMemo(() => groupCount(ativos, c => c.origin?.trim() || 'Não informada'), [ativos])
  const porUF = useMemo(() => groupCount(ativos.filter(c => c.state?.trim()), c => c.state!.trim().toUpperCase()), [ativos])
  const porCidade = useMemo(() => groupCount(ativos.filter(c => c.city?.trim()), c => c.city!.trim()), [ativos])
  const porResp = useMemo(() => {
    const nomeP = (id: string) => respFilter.profiles.find(p => p.id === id)?.display_name ?? 'Sem responsável'
    const m = new Map<string, ClientRow[]>(); ativos.forEach(c => (c.responsible_ids?.length ? c.responsible_ids : ['—']).forEach(id => m.set(id, [...(m.get(id) ?? []), c])))
    return Array.from(m.entries()).map(([id, cs]) => ({ id, nome: id === '—' ? 'Sem responsável' : nomeP(id), clientes: cs.length, receita: sum(cs.map(c => porCliente12.find(p => p.name === c.id)?.value ?? 0)), _cs: cs })).sort((a, b) => b.clientes - a.clientes)
  }, [ativos, respFilter.profiles, porCliente12])
  const tempoCasa = useMemo(() => {
    const faixas = [{ n: 'menos de 1 ano', a: 0, b: 1, color: PAL.green }, { n: '1–2 anos', a: 1, b: 2, color: PAL.teal }, { n: '2–5 anos', a: 2, b: 5, color: PAL.blue }, { n: '5+ anos', a: 5, b: 999, color: PAL.purple }]
    return faixas.map(f => { const cs = ativos.filter(c => idadeAnos(c) >= f.a && idadeAnos(c) < f.b); return { name: f.n, color: f.color, value: cs.length, rows: cs } })
  }, [ativos])

  /* ---------- Detalhes ---------- */
  const openClients = (title: string, list: ClientRow[]) => detail.show(title, list.map((c, i) => ({ id: String(i), label: c.name, sublabel: [c.area, fmtDate(c.created_at)].filter(Boolean).join(' · ') })))
  const openFin = (title: string, list: typeof finance, v: (f: (typeof finance)[number]) => number = f => f.value) => detail.show(title, list.map((f, i) => ({ id: String(i), label: nome(f.client_id!), sublabel: `${f.description} · ${fmtDate(f.date)}`, value: fmtBRL(v(f)) })))
  const openDevedores = () => detail.show('Clientes com valores em atraso', devedores.map((d, i) => ({ id: String(i), label: nome(d.id), sublabel: `${d.qtd} cobrança(s) · atraso máx. ${d.maxDias} dia(s)`, value: fmtBRL(d.valor) })))

  const attention = useMemo(() => {
    const items: Attention[] = []
    if (devedores.length > 0) items.push({ text: `${devedores.length} cliente(s) com ${fmtBRL(valorAtraso)} em atraso${devedores[0] ? ` — o maior é ${nome(devedores[0].id)}` : ''}.`, level: 'warn' })
    if (top5Pct > 70 && porCliente12.length >= 5) items.push({ text: `Os 5 maiores clientes concentram ${fmtPct(top5Pct)} da receita dos últimos 12 meses.`, level: 'info' })
    if (dormentes.length > 0) items.push({ text: `${dormentes.length} cliente(s) ativo(s) sem nenhuma receita há mais de 90 dias.`, level: 'info' })
    if (semProcesso.length > 0) items.push({ text: `${semProcesso.length} cliente(s) jurídico(s) ativo(s) sem processo em andamento — vale confirmar se o contrato segue vigente.`, level: 'info' })
    return items
  }, [devedores, valorAtraso, top5Pct, porCliente12.length, dormentes.length, semProcesso.length, clientById])

  if (loading || loadingFin) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  const sp = (k: 'novos' | 'base') => crescimento.map(m => m[k] as number)

  return (
    <div className="space-y-4">
      <AttentionPanel items={attention} />

      <SectionTitle hint="Tamanho da carteira e quem entrou ou saiu.">Carteira</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Clientes ativos" hint="Clientes com status ativo (sem casos gratuitos). Segue a Visão escolhida: jurídicos, SaaS ou os dois." value={ativos.length} icon={Users} color={PAL.blue} spark={sp('base')} onClick={() => openClients('Clientes ativos', ativos)} />
        <KpiCard title="Novos clientes" hint="Clientes cadastrados no período." value={novos.length} icon={UserPlus} color={PAL.green} spark={sp('novos')} trend={trendText(novos.length, novosPrev.length)} onClick={() => openClients('Novos clientes no período', novos)} />
        <KpiCard title="Inativos" hint="Clientes com status inativo." value={inativos.length} icon={UserMinus} color={PAL.gray} trendTone="down-good" onClick={() => openClients('Clientes inativos', inativos)} />
        <KpiCard title="Retenção da carteira" hint="Ativos ÷ (ativos + inativos): quantos dos clientes que já tivemos seguem conosco." value={fmtPct(retencao)} icon={Percent} color={retencao >= 85 ? PAL.green : PAL.amber} onClick={() => openClients('Clientes inativos', inativos)} />
        <KpiCard title="Tempo de relacionamento" hint="Idade média dos clientes ativos, a partir da data de cadastro." value={ativos.length ? `${fmtNum(relacionamentoMedio, 1)} ${Math.round(relacionamentoMedio * 10) === 10 ? "ano" : "anos"}` : '—'} icon={Clock} color={PAL.sky} onClick={() => openClients('Clientes ativos', ativos)} />
        <KpiCard title="Prospectos" hint="Cadastros ainda como prospecto (não são contados como clientes ativos)." value={prospectos.length} icon={Layers} color={PAL.purple} onClick={() => openClients('Prospectos', prospectos)} />
      </div>

      <ChartCard title="Entrada de clientes e tamanho da carteira (12 meses)" icon={Users}>
        <ComboChart data={crescimento} format={v => String(v)} yFormat={v => String(v)} series={[
          { key: 'novos', name: 'Novos', color: PAL.green },
          { key: 'base', name: 'Carteira acumulada', color: PAL.purple, kind: 'line' },
        ]} onPointClick={i => { const m = crescimento[i]; openClients(`Novos clientes — ${m.month}`, clients.filter(c => inRange(c.created_at, m._start, m._end))) }} />
      </ChartCard>

      <NotesPanel area="clientes" months={trendMonths} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Carteira por área" icon={Scale}>
          <DonutWithLegend data={porArea} formatValue={v => String(v)} onSelect={name => openClients(`Clientes — ${name}`, ativos.filter(c => (c.area ?? 'Não classificado') === name))} />
        </ChartCard>
        <ChartCard title="Pessoa física × jurídica" icon={Users}>
          <DonutWithLegend data={porTipo} formatValue={v => String(v)} onSelect={name => openClients(`Clientes — ${name}`, ativos.filter(c => (c.type === 'pessoa_juridica' ? 'Pessoa jurídica' : c.type === 'pessoa_fisica' ? 'Pessoa física' : 'Não informado') === name))} />
        </ChartCard>
        <ChartCard title="Como chegaram (origem)" icon={Layers}>
          <HBars data={porOrigem} format={v => `${v}`} color={PAL.amber} onSelect={name => openClients(`Origem — ${name}`, ativos.filter(c => (c.origin?.trim() || 'Não informada') === name))} />
        </ChartCard>
        <ChartCard title="Onde estão (UF e cidade)" icon={Layers}>
          <div className="grid grid-cols-2 gap-4">
            <HBars data={porUF} format={v => `${v}`} color={PAL.teal} limit={6} empty="Sem UF informada" onSelect={name => openClients(`Clientes — ${name}`, ativos.filter(c => c.state?.trim().toUpperCase() === name))} />
            <HBars data={porCidade} format={v => `${v}`} color={PAL.blue} limit={6} empty="Sem cidade informada" onSelect={name => openClients(`Clientes — ${name}`, ativos.filter(c => c.city?.trim() === name))} />
          </div>
        </ChartCard>
        <ChartCard title="Tempo de relacionamento" icon={Clock}>
          <BucketBars data={tempoCasa.map(t => ({ name: t.name, value: t.value, color: t.color }))} format={v => `${v} cliente(s)`}
            onSelect={name => { const f = tempoCasa.find(t => t.name === name); if (f) openClients(`Clientes — ${name}`, f.rows) }} />
        </ChartCard>
        <ChartCard title="Processos em andamento por cliente jurídico" icon={Scale}>
          <BucketBars data={distribProcessos.map((d, i) => ({ name: d.name, value: d.value, color: [PAL.red, PAL.green, PAL.teal, PAL.purple][i] }))} format={v => `${v} cliente(s)`}
            onSelect={name => { const f = distribProcessos.find(t => t.name === name); if (f) openClients(`Clientes com ${name}`, f.rows) }} />
          <p className="text-[11px] text-muted-foreground mt-2">{multiProcesso.length} cliente(s) com 2 ou mais processos — bons candidatos a relacionamento mais próximo.</p>
        </ChartCard>
      </div>

      <SectionTitle hint="Quanto cada cliente gera e o quanto dependemos dos maiores.">Receita por cliente</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard title="Receita média por cliente" hint="Receita do período ÷ clientes que pagaram no período." value={fmtBRL(arpc)} icon={Wallet} color={PAL.green} sensitive onClick={() => openFin('Receitas do período', receitaPeriodo)} />
        <KpiCard title="Clientes que pagaram" hint="Clientes com receita no período." value={pagantesPeriodo} icon={Users} color={PAL.teal}
          trend={`${fmtPct(pct(pagantesPeriodo, ativos.length))} da carteira`} trendTone="neutral" onClick={() => detail.show('Clientes que pagaram no período', porClientePeriodo.map((c, i) => ({ id: String(i), label: nome(c.name), value: fmtBRL(c.value) })))} />
        <KpiCard title="Concentração (top 5)" hint="Parte da receita dos últimos 12 meses que vem dos 5 maiores clientes." value={fmtPct(top5Pct)} icon={PiggyBank} color={top5Pct > 70 ? PAL.amber : PAL.blue} trendTone="down-good"
          onClick={() => detail.show('Maiores clientes (12 meses)', porCliente12.slice(0, 10).map((c, i) => ({ id: String(i), label: nome(c.name), sublabel: fmtPct(pct(c.value, receita12Total), 1), value: fmtBRL(c.value) })))} />
        <KpiCard title="Curva ABC" hint="Quantos clientes respondem por 80% da receita dos últimos 12 meses." value={porCliente12.length ? `${abc.n} de ${abc.de}` : '—'} icon={Layers} color={PAL.purple}
          trend={porCliente12.length ? `${fmtPct(pct(abc.n, abc.de))} dos clientes` : undefined} trendTone="neutral"
          onClick={() => detail.show('Clientes que somam 80% da receita', porCliente12.slice(0, abc.n).map((c, i) => ({ id: String(i), label: nome(c.name), value: fmtBRL(c.value) })))} />
        <KpiCard title="Clientes recorrentes" hint="Clientes com cobrança recorrente nos últimos 60 dias." value={recorrentes.size} icon={Repeat} color={PAL.teal}
          onClick={() => openClients('Clientes recorrentes', ativos.filter(c => recorrentes.has(c.id)))} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Maiores clientes (12 meses)" icon={Wallet}>
          <HBars data={porCliente12.map(c => ({ name: nome(c.name), value: c.value }))} format={fmtBRL} color={PAL.green} limit={10} suffix={d => `· ${fmtPct(pct(d.value, receita12Total), 0)}`} empty="Nenhuma receita vinculada a cliente"
            onSelect={name => { const id = clients.find(c => c.name === name)?.id; openFin(`Receitas — ${name}`, receita12.filter(f => f.client_id === id)) }} />
        </ChartCard>
        <ChartCard title="Carteira por responsável" icon={Users}>
          <MiniTable
            columns={[
              { key: 'nome', label: 'Responsável' }, { key: 'clientes', label: 'Clientes', align: 'right' },
              { key: 'receita', label: 'Receita 12m', align: 'right', render: r => fmtBRL(r.receita) },
              { key: 'ticket', label: 'Por cliente', align: 'right', render: r => fmtBRL(r.clientes ? r.receita / r.clientes : 0) },
            ]}
            rows={porResp} onRowClick={r => openClients(`Clientes — ${r.nome}`, r._cs)} />
        </ChartCard>
      </div>

      <SectionTitle hint="Quem está devendo e quanto tempo faz.">Inadimplência</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Valor em atraso" hint="Soma do que está vencido e não foi pago (descontando pagamentos parciais)." value={fmtBRL(valorAtraso)} icon={Wallet} color={PAL.red} sensitive trendTone="down-good" onClick={openDevedores} />
        <KpiCard title="Taxa de inadimplência" hint="Valor em atraso ÷ total de receitas já vencidas (pagas + em atraso). Quanto menor, melhor." value={fmtPct(pct(valorAtraso, totalVencidoHistorico), 1)} icon={Percent} color={PAL.amber} trendTone="down-good" onClick={openDevedores} />
        <KpiCard title="Clientes inadimplentes" hint="Clientes distintos com pelo menos uma cobrança vencida e não paga." value={devedores.length} icon={AlertTriangle} color={PAL.red} trendTone="down-good"
          trend={`${fmtPct(pct(devedores.length, ativos.length), 1)} da carteira`} onClick={openDevedores} />
        <KpiCard title="Sem receita há 90+ dias" hint="Clientes ativos sem nenhuma receita lançada nos últimos 90 dias." value={dormentes.length} icon={Moon} color={PAL.gray} trendTone="down-good" onClick={() => openClients('Clientes sem receita há 90+ dias', dormentes)} />
      </div>
      <ChartCard title="Maiores devedores" icon={AlertTriangle}>
        <MiniTable
          columns={[
            { key: 'cliente', label: 'Cliente', render: r => nome(r.id) },
            { key: 'qtd', label: 'Cobranças', align: 'right' },
            { key: 'maxDias', label: 'Maior atraso', align: 'right', render: r => <span className={r.maxDias > 60 ? 'text-red-700 dark:text-red-300 font-semibold' : ''}>{r.maxDias} dias</span> },
            { key: 'valor', label: 'Em atraso', align: 'right', render: r => fmtBRL(r.valor) },
          ]}
          rows={devedores.slice(0, 10)} empty="Nenhum cliente com valor em atraso 🎉"
          onRowClick={r => openFin(`Em atraso — ${nome(r.id)}`, vencidas.filter(f => f.client_id === r.id), f => f.aberto)} />
      </ChartCard>

      <StatStrip items={[
        { label: 'Jurídicos sem processo ativo', value: String(semProcesso.length), tone: semProcesso.length ? 'bad' : 'good', hint: 'Clientes jurídicos ativos sem nenhum processo em andamento' },
        { label: 'Com 2+ processos', value: String(multiProcesso.length) },
        { label: 'Também SaaS', value: String(ativos.filter(c => c.is_juridico && c.is_saas).length), hint: 'Clientes que são do escritório e usam o sistema' },
        { label: 'Recorrentes', value: String(recorrentes.size) },
      ]} />

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
