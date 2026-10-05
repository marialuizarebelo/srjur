import { useEffect, useMemo, useState } from 'react'
import {
  Users, DollarSign, TrendingUp, Repeat, Percent, UserMinus, UserPlus, Gauge, Hourglass, AlertTriangle, PiggyBank, ArrowLeftRight,
} from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import {
  monthsBack, usePeriod, useUnidadeFilter, KpiCard, ChartCard, DonutWithLegend, AttentionPanel, type Attention, NotesPanel,
  DetailDialog, useDetail, previousPeriodRange, trendText,
} from './shared'
import {
  PAL, ComboChart, HBars, MiniTable, StatStrip, SectionTitle,
  sum, avg, pct, fmtPct, fmtNum, addDays, inRange, todayISO, groupSum, groupCount, fetchAllSafe, daysBetween,
  useFinanceData, isDespesaCaixa, isRecorrente, isCaixa, assinaturasDoMes, pontesMrr, type Assinatura, type FinRow,
} from './kit'

interface ClientRow { id: string; name: string; area: string | null; status: string; created_at: string; is_juridico: boolean; is_saas: boolean; inactivated_at?: string | null; inactive_reason?: string | null }

export default function ProdutoSaasTab() {
  const period = usePeriod()
  const { unidade } = useUnidadeFilter()
  const detail = useDetail()
  const { rows: finAll, loading: loadingFin } = useFinanceData()
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<ClientRow[]>([])

  useEffect(() => {
    fetchAllSafe<ClientRow>('clients', 'id, name, area, status, created_at, is_juridico, is_saas', ['inactivated_at', 'inactive_reason'], q => q.eq('is_saas', true)).then(c => { setClients(c.rows); setLoading(false) })
  }, [])

  // Na visão "Empresa toda" as licenças pagas entre as duas empresas ficam fora (não são cliente de fora).
  const finance = useMemo(() => finAll.filter(f => f.business_unit === 'saas' && !(unidade === '' && f.intragrupo)), [finAll, unidade])
  const clientById = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])
  const nomeCliente = (a: Assinatura) => (a.clientId && clientById.get(a.clientId)?.name) || a.descricao
  const hoje = todayISO()
  const { start, end } = period.range
  const prev = useMemo(() => previousPeriodRange(start, end), [start, end])
  const trendMonths = useMemo(() => monthsBack(13), [])

  /* ---------- MRR mês a mês ---------- */
  const mrrMeses = useMemo(() => trendMonths.map(m => ({ m, ass: assinaturasDoMes(finance, m.start, m.end) })), [finance, trendMonths])
  const serie = useMemo(() => mrrMeses.map((cur, i) => {
    const ant = i > 0 ? mrrMeses[i - 1].ass : new Map<string, Assinatura>()
    const mrr = sum(Array.from(cur.ass.values()).map(a => a.mrr))
    const pontes = i > 0 ? pontesMrr(cur.ass, ant) : { novo: 0, expansao: 0, contracao: 0, encerrado: 0, novos: [], encerrados: [] }
    const clientesPagantes = new Set(Array.from(cur.ass.values()).map(a => a.clientId ?? a.key)).size
    return {
      month: cur.m.label, mrr, arr: mrr * 12, clientes: clientesPagantes, arpa: clientesPagantes ? mrr / clientesPagantes : 0,
      novo: pontes.novo, expansao: pontes.expansao, contracao: -pontes.contracao, encerrado: -pontes.encerrado,
      liquido: pontes.novo + pontes.expansao - pontes.contracao - pontes.encerrado,
      novos: pontes.novos, encerrados: pontes.encerrados,
      _start: cur.m.start, _end: cur.m.end,
    }
  }), [mrrMeses])
  const doze = serie.slice(1) // 12 meses exibidos
  const atual = serie[serie.length - 1]
  const anterior = serie[serie.length - 2]
  const mrrAtual = atual.mrr
  const crescimento = anterior.mrr > 0 ? ((atual.mrr - anterior.mrr) / anterior.mrr) * 100 : 0
  const crescimentoMedio = (() => { const gs = doze.slice(-6).map((m, i, arr) => { const p = i === 0 ? serie[serie.length - 7]?.mrr : arr[i - 1].mrr; return p > 0 ? ((m.mrr - p) / p) * 100 : 0 }); return avg(gs) })()
  const churnMrrPct = anterior.mrr > 0 ? (-atual.encerrado / anterior.mrr) * 100 : 0
  const nrr = anterior.mrr > 0 ? ((anterior.mrr + atual.expansao + atual.contracao + atual.encerrado) / anterior.mrr) * 100 : 0
  const grr = anterior.mrr > 0 ? ((anterior.mrr + atual.contracao + atual.encerrado) / anterior.mrr) * 100 : 0
  const quickRatio = (-atual.contracao - atual.encerrado) > 0 ? (atual.novo + atual.expansao) / (-atual.contracao - atual.encerrado) : 0
  // churn médio dos últimos 6 meses (mais estável que um mês só)
  const churnMedio6 = (() => {
    const ult = serie.slice(-6); const xs = ult.map((m, i) => { const base = serie[serie.length - 6 + i - 1]; return base && base.mrr > 0 ? (-m.encerrado / base.mrr) * 100 : 0 })
    return avg(xs)
  })()

  /* ---------- Clientes ---------- */
  const ativos = clients.filter(c => c.status === 'ativo')
  const inativos = clients.filter(c => c.status === 'inativo')
  const novosPeriodo = clients.filter(c => inRange(c.created_at, start, end))
  const novosPrev = clients.filter(c => inRange(c.created_at, prev.start, prev.end))
  const retencaoClientes = pct(ativos.length, ativos.length + inativos.length)
  // Churn de clientes com a data real de encerramento (gatilho do banco). Sem a data, o cliente
  // inativo não entra na conta mensal (fica só no total de inativos).
  const encerradoEm = (c: ClientRow) => (c.status === 'inativo' ? c.inactivated_at?.slice(0, 10) ?? null : null)
  const baseAtivaEm = (data: string) => clients.filter(c => c.status !== 'prospecto' && c.created_at.slice(0, 10) <= data && (!encerradoEm(c) || encerradoEm(c)! > data))
  const mesAtualIni = trendMonths[12].start
  const ativosInicioMes = baseAtivaEm(addDays(mesAtualIni, -1))
  const encerradosMes = clients.filter(c => inRange(encerradoEm(c), mesAtualIni, trendMonths[12].end))
  const churnClientes = pct(encerradosMes.length, ativosInicioMes.length)
  const encerradosPeriodo = clients.filter(c => inRange(encerradoEm(c), start, end))
  const tambemJuridico = ativos.filter(c => c.is_juridico)

  /* ---------- Financeiro SaaS ---------- */
  const rowsP = useMemo(() => finance.filter(f => inRange(f.date, start, end)), [finance, start, end])
  const rowsPrev = useMemo(() => finance.filter(f => inRange(f.date, prev.start, prev.end)), [finance, prev])
  const receita = sum(rowsP.filter(f => f.type === 'receita').map(f => f.value))
  const despesa = sum(rowsP.filter(isDespesaCaixa).map(f => f.value))
  const receitaPrev = sum(rowsPrev.filter(f => f.type === 'receita').map(f => f.value))
  const despesaPrev = sum(rowsPrev.filter(isDespesaCaixa).map(f => f.value))
  const resultado = receita - despesa
  const margem = pct(resultado, receita)
  const recorrentePct = pct(sum(rowsP.filter(f => f.type === 'receita' && isRecorrente(f)).map(f => f.value)), receita)
  const marketingSaas = rowsP.filter(f => isDespesaCaixa(f) && (f.category ?? '').toLowerCase().includes('marketing'))
  const cacSaas = novosPeriodo.length > 0 ? sum(marketingSaas.map(f => f.value)) / novosPeriodo.length : 0
  // LTV = ARPA × margem ÷ churn mensal  (só calcula com churn > 0 observado)
  const margemBruta = Math.max(0, Math.min(1, receita > 0 ? (receita - despesa) / receita : 0.8))
  const ltv = churnMedio6 > 0 ? (atual.arpa * (margemBruta || 0.8)) / (churnMedio6 / 100) : 0
  const vidaMediaMeses = churnMedio6 > 0 ? 100 / churnMedio6 : 0
  const vencidas = useMemo(() => finance.filter(f => f.type === 'receita' && isCaixa(f) && f.aberto > 0 && !!f.due_date && f.due_date < hoje), [finance, hoje])
  const valorVencido = sum(vencidas.map(f => f.aberto))
  const burn = avg(monthsBack(4).slice(0, 3).map(m => sum(finance.filter(f => isDespesaCaixa(f) && inRange(f.date, m.start, m.end)).map(f => f.value))))

  /* ---------- Quebras ---------- */
  const assAtuais = useMemo(() => Array.from(mrrMeses[mrrMeses.length - 1].ass.values()), [mrrMeses])
  const mrrPorCliente = useMemo(() => groupSum(assAtuais, a => nomeCliente(a), a => a.mrr), [assAtuais, clientById])
  const mrrPorCategoria = useMemo(() => groupSum(assAtuais, a => a.categoria ?? 'Sem categoria', a => a.mrr), [assAtuais])
  const topCliente = pct(mrrPorCliente[0]?.value ?? 0, mrrAtual)
  const top3 = pct(sum(mrrPorCliente.slice(0, 3).map(c => c.value)), mrrAtual)
  const despesaCategoria = useMemo(() => groupSum(rowsP.filter(isDespesaCaixa), f => f.category ?? 'Outros', f => f.value), [rowsP])
  const receitaCategoria = useMemo(() => groupSum(rowsP.filter(f => f.type === 'receita'), f => f.category ?? 'Outros', f => f.value), [rowsP])
  const faixasMrr = useMemo(() => {
    const faixas = [{ n: 'até R$ 100', a: 0, b: 100 }, { n: 'R$ 100–300', a: 100, b: 300 }, { n: 'R$ 300–600', a: 300, b: 600 }, { n: 'R$ 600–1.000', a: 600, b: 1000 }, { n: 'acima de R$ 1.000', a: 1000, b: Infinity }]
    return faixas.map(f => ({ name: f.n, value: assAtuais.filter(a => a.mrr > f.a && a.mrr <= f.b).length, rows: assAtuais.filter(a => a.mrr > f.a && a.mrr <= f.b) }))
  }, [assAtuais])
  const evolucaoFin = useMemo(() => trendMonths.slice(1).map(m => {
    const rs = finance.filter(f => inRange(f.date, m.start, m.end))
    const rec = sum(rs.filter(f => f.type === 'receita').map(f => f.value)); const des = sum(rs.filter(isDespesaCaixa).map(f => f.value))
    return { month: m.label, receita: rec, despesa: des, resultado: rec - des, recorrente: sum(rs.filter(f => f.type === 'receita' && isRecorrente(f)).map(f => f.value)), avulsa: sum(rs.filter(f => f.type === 'receita' && !isRecorrente(f)).map(f => f.value)), _start: m.start, _end: m.end }
  }), [finance, trendMonths])
  const clientesEvol = useMemo(() => trendMonths.slice(1).map(m => ({
    month: m.label, novos: clients.filter(c => inRange(c.created_at, m.start, m.end)).length,
    saidas: -clients.filter(c => inRange(encerradoEm(c), m.start, m.end)).length,
    base: baseAtivaEm(m.end).length,
  })), [clients, trendMonths])
  const motivosEncerramento = useMemo(() => groupCount(clients.filter(c => c.status === 'inativo'), c => c.inactive_reason?.trim() || 'Motivo não informado'), [clients])
  const coortes = useMemo(() => {
    const map = new Map<string, ClientRow[]>()
    clients.forEach(c => { const d = new Date(c.created_at); const k = `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`; map.set(k, [...(map.get(k) ?? []), c]) })
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8).map(([k, cs]) => ({ coorte: k.replace('-', ' '), entraram: cs.length, ativos: cs.filter(c => c.status === 'ativo').length, retencao: pct(cs.filter(c => c.status === 'ativo').length, cs.length), _cs: cs }))
  }, [clients])

  /* ---------- Detalhes ---------- */
  const openAss = (title: string, list: Assinatura[]) => detail.show(title, list.sort((a, b) => b.mrr - a.mrr).map((a, i) => ({ id: String(i), label: nomeCliente(a), sublabel: `${a.categoria ?? 'Sem categoria'} · ${a.descricao}`, value: fmtBRL(a.mrr) })))
  const openFin = (title: string, list: FinRow[], v: (f: FinRow) => number = f => f.value) => detail.show(title, list.map((f, i) => ({ id: String(i), label: f.description, sublabel: `${fmtDate(f.date)} · ${f.category ?? 'Outros'}`, value: fmtBRL(v(f)) })))
  const openClients = (title: string, list: ClientRow[]) => detail.show(title, list.map((c, i) => ({ id: String(i), label: c.name, sublabel: `${fmtDate(c.created_at)}${c.is_juridico ? ' · também é cliente jurídico' : ''}` })))
  function openMonth(i: number) {
    const m = doze[i]; if (!m) return
    detail.show(`Movimento de MRR — ${m.month}`, [
      ...m.novos.map((a: Assinatura, j: number) => ({ id: `n${j}`, label: nomeCliente(a), sublabel: 'Novo', value: `+${fmtBRL(a.mrr)}` })),
      ...m.encerrados.map((a: Assinatura, j: number) => ({ id: `e${j}`, label: nomeCliente(a), sublabel: 'Encerrado', value: `−${fmtBRL(a.mrr)}` })),
    ])
  }

  const attention = useMemo(() => {
    const items: Attention[] = []
    if (atual.encerrado < 0) items.push({ text: `${fmtBRL(-atual.encerrado)} de MRR encerrado neste mês (${fmtPct(churnMrrPct, 1)} da base).`, level: 'warn' })
    if (nrr > 0 && nrr < 100) items.push({ text: `Retenção líquida de receita em ${fmtPct(nrr)} — a base atual está encolhendo sem contar clientes novos.`, level: 'warn' })
    if (topCliente > 30) items.push({ text: `Um único cliente representa ${fmtPct(topCliente)} do MRR.`, level: 'info' })
    if (valorVencido > 0) items.push({ text: `${fmtBRL(valorVencido)} do SaaS em cobranças vencidas.`, level: 'warn' })
    if (mrrAtual > 0 && burn > mrrAtual) items.push({ text: `A despesa média mensal do SaaS (${fmtBRL(burn)}) é maior que o MRR.`, level: 'info' })
    return items
  }, [atual.encerrado, churnMrrPct, nrr, topCliente, valorVencido, burn, mrrAtual])

  if (loading || loadingFin) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  const sp = (k: 'mrr' | 'clientes' | 'arpa') => doze.map(m => m[k] as number)

  return (
    <div className="space-y-4">
      <AttentionPanel items={attention} />

      <SectionTitle hint="Receita recorrente mensal, calculada a partir das cobranças recorrentes lançadas no Financeiro (uma assinatura = uma série de cobranças).">Receita recorrente</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard title="MRR" hint="Receita recorrente mensal: soma das assinaturas ativas no mês, com valores trimestrais/anuais convertidos para mensal." value={fmtBRL(mrrAtual)} icon={Repeat} color={PAL.purple} sensitive spark={sp('mrr')}
          trend={anterior.mrr > 0 ? `${crescimento >= 0 ? '↑' : '↓'} ${Math.abs(crescimento).toFixed(1)}% vs mês anterior` : undefined} onClick={() => openAss('Assinaturas que compõem o MRR', assAtuais)} />
        <KpiCard title="ARR" hint="Receita recorrente anualizada: MRR × 12." value={fmtBRL(atual.arr)} icon={TrendingUp} color={PAL.blue} sensitive onClick={() => openAss('Assinaturas que compõem o ARR', assAtuais)} />
        <KpiCard title="Crescimento do MRR" hint="Variação do MRR sobre o mês anterior. Abaixo, a média dos últimos 6 meses." value={`${crescimento >= 0 ? '+' : ''}${crescimento.toFixed(1)}%`} icon={Gauge} color={crescimento >= 0 ? PAL.green : PAL.red}
          trend={`média 6 meses: ${crescimentoMedio >= 0 ? '+' : ''}${crescimentoMedio.toFixed(1)}%`} trendTone="neutral" onClick={() => openAss('MRR do mês', assAtuais)} />
        <KpiCard title="Clientes pagantes" hint="Clientes distintos com assinatura ativa no mês." value={atual.clientes} icon={Users} color={PAL.teal} spark={sp('clientes')} onClick={() => openAss('Assinaturas ativas', assAtuais)} />
        <KpiCard title="ARPA" hint="Receita média por conta: MRR ÷ clientes pagantes." value={fmtBRL(atual.arpa)} icon={DollarSign} color={PAL.amber} sensitive spark={sp('arpa')} onClick={() => openAss('Assinaturas ativas', assAtuais)} />
      </div>

      <SectionTitle hint="O que entrou, cresceu, encolheu e saiu em relação ao mês anterior.">Movimento do MRR no mês</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="MRR novo" hint="Assinaturas que apareceram neste mês e não existiam no mês anterior." value={fmtBRL(atual.novo)} icon={UserPlus} color={PAL.green} sensitive onClick={() => openAss('MRR novo do mês', atual.novos)} />
        <KpiCard title="Expansão" hint="Aumento de valor em assinaturas que já existiam." value={fmtBRL(atual.expansao)} icon={TrendingUp} color={PAL.teal} sensitive onClick={() => openAss('Assinaturas ativas', assAtuais)} />
        <KpiCard title="Contração" hint="Redução de valor em assinaturas que continuaram." value={fmtBRL(-atual.contracao)} icon={ArrowLeftRight} color={PAL.amber} sensitive trendTone="down-good" onClick={() => openAss('Assinaturas ativas', assAtuais)} />
        <KpiCard title="MRR encerrado" hint="Assinaturas que existiam no mês anterior e não aparecem neste (cancelamentos ou planos que terminaram)." value={fmtBRL(-atual.encerrado)} icon={UserMinus} color={PAL.red} sensitive trendTone="down-good"
          trend={`${fmtPct(churnMrrPct, 1)} da base`} onClick={() => openAss('MRR encerrado no mês', atual.encerrados)} />
        <KpiCard title="MRR líquido novo" hint="Novo + expansão − contração − encerrado." value={`${atual.liquido >= 0 ? '+' : ''}${fmtBRL(atual.liquido)}`} icon={Gauge} color={atual.liquido >= 0 ? PAL.green : PAL.red} sensitive
          onClick={() => openMonth(doze.length - 1)} />
        <KpiCard title="Quick ratio" hint="(Novo + expansão) ÷ (contração + encerrado). Acima de 4 é excelente; abaixo de 1 a base encolhe." value={quickRatio > 0 ? fmtNum(quickRatio, 1) : '—'} icon={Gauge} color={quickRatio >= 4 ? PAL.green : quickRatio >= 1 ? PAL.amber : PAL.red}
          onClick={() => openMonth(doze.length - 1)} />
      </div>

      <ChartCard title="Ponte do MRR (12 meses)" icon={Repeat}>
        <ComboChart data={doze} onPointClick={openMonth} series={[
          { key: 'novo', name: 'Novo', color: PAL.green, stack: 'b' },
          { key: 'expansao', name: 'Expansão', color: PAL.teal, stack: 'b' },
          { key: 'contracao', name: 'Contração', color: PAL.amber, stack: 'b' },
          { key: 'encerrado', name: 'Encerrado', color: PAL.red, stack: 'b' },
          { key: 'liquido', name: 'Líquido', color: PAL.purple, kind: 'line' },
        ]} />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="MRR e ARR (12 meses)" icon={TrendingUp}>
          <ComboChart data={doze} series={[
            { key: 'mrr', name: 'MRR', color: PAL.purple, kind: 'area' },
          ]} />
        </ChartCard>
        <ChartCard title="Clientes pagantes e ARPA" icon={Users}>
          <ComboChart data={doze} series={[
            { key: 'clientes', name: 'Clientes pagantes', color: PAL.teal },
            { key: 'arpa', name: 'ARPA', color: PAL.amber, kind: 'line', axis: 'right', format: fmtBRL },
          ]} format={v => String(Math.round(v))} yFormat={v => String(v)} rightFormat={v => `R$ ${v}`} />
        </ChartCard>
      </div>

      <NotesPanel area="saas" months={trendMonths.slice(1)} />

      <SectionTitle hint="Retenção, valor do cliente ao longo da vida e eficiência de aquisição.">Retenção e unit economics</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Churn de MRR" hint="MRR encerrado no mês ÷ MRR do mês anterior. Abaixo, a média dos últimos 6 meses." value={fmtPct(churnMrrPct, 1)} icon={UserMinus} color={PAL.red} trendTone="down-good"
          trend={`média 6 meses: ${fmtPct(churnMedio6, 1)}`} onClick={() => openAss('MRR encerrado no mês', atual.encerrados)} />
        <KpiCard title="Retenção líquida (NRR)" hint="(MRR anterior + expansão − contração − encerrado) ÷ MRR anterior. Acima de 100% a base cresce sozinha." value={anterior.mrr > 0 ? fmtPct(nrr) : '—'} icon={Percent} color={nrr >= 100 ? PAL.green : PAL.amber}
          onClick={() => openAss('Assinaturas ativas', assAtuais)} />
        <KpiCard title="Retenção bruta (GRR)" hint="Igual ao NRR, mas sem contar expansão: mede só o que se perdeu." value={anterior.mrr > 0 ? fmtPct(grr) : '—'} icon={Percent} color={grr >= 90 ? PAL.green : PAL.amber} onClick={() => openAss('Assinaturas ativas', assAtuais)} />
        <KpiCard title="LTV" hint="Valor do cliente ao longo da vida: ARPA × margem ÷ churn mensal médio (6 meses). Só calcula quando já houve cancelamentos." value={ltv > 0 ? fmtBRL(ltv) : '—'} icon={PiggyBank} color={PAL.purple} sensitive
          trend={vidaMediaMeses > 0 ? `vida média ≈ ${fmtNum(vidaMediaMeses, 0)} meses` : 'sem churn observado'} trendTone="neutral" onClick={() => openAss('Assinaturas ativas', assAtuais)} />
        <KpiCard title="CAC do SaaS" hint="Despesas de Marketing do SaaS no período ÷ clientes novos. Zero se não houver lançamentos de Marketing no SaaS." value={cacSaas > 0 ? fmtBRL(cacSaas) : '—'} icon={Hourglass} color={PAL.pink} sensitive
          trend={ltv > 0 && cacSaas > 0 ? `LTV:CAC ${fmtNum(ltv / cacSaas, 1)}×` : undefined} trendTone="neutral" onClick={() => openFin('Marketing do SaaS no período', marketingSaas)} />
        <KpiCard title="Churn de clientes" hint="Clientes que encerraram no mês ÷ clientes ativos no início do mês (pela data de encerramento do cadastro)." value={fmtPct(churnClientes, 1)} icon={UserMinus} color={PAL.red} trendTone="down-good"
          trend={`${encerradosMes.length} encerrado(s) no mês`} onClick={() => openClients('Clientes que encerraram no mês', encerradosMes)} />
        <KpiCard title="Clientes retidos" hint="Clientes SaaS ativos ÷ todos os já cadastrados (ativos + inativos)." value={fmtPct(retencaoClientes)} icon={Users} color={PAL.teal}
          trend={`${ativos.length} ativos · ${inativos.length} inativos`} trendTone="neutral" onClick={() => openClients('Clientes SaaS inativos', inativos)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Entrada de clientes e tamanho da base" icon={UserPlus}>
          <ComboChart data={clientesEvol} format={v => String(Math.abs(v))} yFormat={v => String(v)} series={[
            { key: 'novos', name: 'Entraram', color: PAL.green, stack: 'e' },
            { key: 'saidas', name: 'Encerraram', color: PAL.red, stack: 'e' },
            { key: 'base', name: 'Base ativa', color: PAL.purple, kind: 'line' },
          ]} onPointClick={i => { const m = clientesEvol[i]; const t = trendMonths[i + 1]; openClients(`Clientes novos — ${m.month}`, clients.filter(c => inRange(c.created_at, t.start, t.end))) }} />
        </ChartCard>
        <ChartCard title="Por que clientes encerraram" icon={UserMinus}>
          <HBars data={motivosEncerramento} format={v => `${v} cliente(s)`} color={PAL.red} empty="Nenhum cliente encerrado"
            onSelect={name => openClients(`Encerrados — ${name}`, clients.filter(c => c.status === 'inativo' && (c.inactive_reason?.trim() || 'Motivo não informado') === name))} />
          <p className="text-[11px] text-muted-foreground mt-3">{encerradosPeriodo.length} encerramento(s) no período. Preencha data e motivo ao marcar o cliente como Encerrado.</p>
        </ChartCard>
        <ChartCard title="Retenção por coorte de entrada" icon={Users}>
          <MiniTable
            columns={[
              { key: 'coorte', label: 'Entrada' },
              { key: 'entraram', label: 'Entraram', align: 'right' },
              { key: 'ativos', label: 'Ativos hoje', align: 'right' },
              { key: 'retencao', label: 'Retenção', align: 'right', render: r => <span className={r.retencao >= 80 ? 'text-green-700 dark:text-green-300 font-semibold' : r.retencao < 50 ? 'text-red-700 dark:text-red-300 font-semibold' : ''}>{fmtPct(r.retencao)}</span> },
            ]}
            rows={coortes} onRowClick={r => openClients(`Coorte ${r.coorte}`, r._cs)} />
          <p className="text-[11px] text-muted-foreground mt-2">Mostra quantos dos clientes que entraram em cada trimestre continuam ativos.</p>
        </ChartCard>
      </div>

      <SectionTitle hint="Quem sustenta a receita recorrente.">Composição do MRR</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Maiores clientes por MRR" icon={Users}>
          <HBars data={mrrPorCliente} format={fmtBRL} color={PAL.purple} limit={8} suffix={d => `· ${fmtPct(pct(d.value, mrrAtual), 0)}`} empty="Nenhuma assinatura ativa"
            onSelect={name => openAss(`MRR — ${name}`, assAtuais.filter(a => nomeCliente(a) === name))} />
          {mrrAtual > 0 && <p className="text-[11px] text-muted-foreground mt-3">Os 3 maiores representam {fmtPct(top3)} do MRR.</p>}
        </ChartCard>
        <ChartCard title="MRR por plano / categoria" icon={Repeat}>
          <DonutWithLegend data={mrrPorCategoria} formatValue={fmtBRL} onSelect={name => openAss(`MRR — ${name}`, assAtuais.filter(a => (a.categoria ?? 'Sem categoria') === name))} />
        </ChartCard>
        <ChartCard title="Assinaturas por faixa de valor mensal" icon={DollarSign}>
          <HBars data={faixasMrr.map(f => ({ name: f.name, value: f.value }))} format={v => `${v} assinatura(s)`} color={PAL.blue} limit={6}
            onSelect={name => { const f = faixasMrr.find(x => x.name === name); if (f) openAss(`Assinaturas — ${name}`, f.rows) }} />
        </ChartCard>
        <ChartCard title="Base de clientes SaaS" icon={Users}>
          <StatStrip items={[
            { label: 'Ativos', value: String(ativos.length), tone: 'good' },
            { label: 'Novos no período', value: String(novosPeriodo.length), hint: trendText(novosPeriodo.length, novosPrev.length) ?? undefined },
            { label: 'Também jurídicos', value: String(tambemJuridico.length), hint: 'Clientes que usam o SaaS e também são clientes do escritório' },
            { label: 'Inativos', value: String(inativos.length), tone: inativos.length ? 'bad' : 'neutral' },
          ]} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => openClients('Clientes SaaS ativos', ativos)} className="text-xs underline decoration-dotted text-muted-foreground hover:text-foreground">ver ativos</button>
            <button onClick={() => openClients('Clientes também jurídicos', tambemJuridico)} className="text-xs underline decoration-dotted text-muted-foreground hover:text-foreground">ver clientes em comum com a advocacia</button>
          </div>
        </ChartCard>
      </div>

      <SectionTitle hint="Quanto o produto gera e custa, no período selecionado.">Financeiro do SaaS</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard title="Receita" hint="Receitas SaaS lançadas no período." value={fmtBRL(receita)} icon={TrendingUp} color={PAL.green} sensitive trend={trendText(receita, receitaPrev)} onClick={() => openFin('Receita SaaS do período', rowsP.filter(f => f.type === 'receita'))} />
        <KpiCard title="Despesas" hint="Despesas SaaS (infraestrutura, ferramentas, etc.) do período." value={fmtBRL(despesa)} icon={TrendingUp} color={PAL.red} sensitive trendTone="down-good" trend={trendText(despesa, despesaPrev)} onClick={() => openFin('Despesas SaaS do período', rowsP.filter(isDespesaCaixa))} />
        <KpiCard title="Resultado" hint="Receita menos despesas do SaaS no período." value={fmtBRL(resultado)} icon={DollarSign} color={resultado >= 0 ? PAL.green : PAL.red} sensitive onClick={() => openFin('Lançamentos SaaS do período', rowsP)} />
        <KpiCard title="Margem" hint="Resultado ÷ receita do SaaS." value={fmtPct(margem)} icon={Percent} color={PAL.blue} onClick={() => openFin('Lançamentos SaaS do período', rowsP)} />
        <KpiCard title="Receita recorrente" hint="Parte da receita do período que é recorrente (o resto é avulsa: setup, licenças pontuais)." value={fmtPct(recorrentePct)} icon={Repeat} color={PAL.teal} onClick={() => openFin('Receita recorrente', rowsP.filter(f => f.type === 'receita' && isRecorrente(f)))} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Receita, despesas e resultado (12 meses)" icon={TrendingUp}>
          <ComboChart data={evolucaoFin} onPointClick={i => { const m = evolucaoFin[i]; openFin(`Lançamentos SaaS — ${m.month}`, finance.filter(f => inRange(f.date, m._start, m._end))) }} series={[
            { key: 'receita', name: 'Receita', color: PAL.green }, { key: 'despesa', name: 'Despesas', color: PAL.red }, { key: 'resultado', name: 'Resultado', color: PAL.purple, kind: 'line' },
          ]} />
        </ChartCard>
        <ChartCard title="Recorrente × avulsa (12 meses)" icon={Repeat}>
          <ComboChart data={evolucaoFin} series={[
            { key: 'recorrente', name: 'Recorrente', color: PAL.teal, stack: 'r' }, { key: 'avulsa', name: 'Avulsa', color: PAL.amber, stack: 'r' },
          ]} />
        </ChartCard>
        <ChartCard title="Receita SaaS por categoria" icon={DollarSign}>
          <DonutWithLegend data={receitaCategoria} formatValue={fmtBRL} onSelect={name => openFin(`${name} — receita SaaS`, rowsP.filter(f => f.type === 'receita' && (f.category ?? 'Outros') === name))} />
        </ChartCard>
        <ChartCard title="Despesas SaaS por categoria" icon={DollarSign}>
          <DonutWithLegend data={despesaCategoria} formatValue={fmtBRL} onSelect={name => openFin(`${name} — despesas SaaS`, rowsP.filter(f => isDespesaCaixa(f) && (f.category ?? 'Outros') === name))} />
        </ChartCard>
      </div>

      {valorVencido > 0 && (
        <ChartCard title="Cobranças vencidas do SaaS" icon={AlertTriangle}>
          <HBars data={vencidas.map(f => ({ name: f.description, value: f.aberto, sub: `${daysBetween(f.due_date ?? f.date, hoje)} dia(s)` })).sort((a, b) => b.value - a.value)} format={fmtBRL} color={PAL.red} limit={8}
            onSelect={() => openFin('Cobranças vencidas', vencidas, f => f.aberto)} />
        </ChartCard>
      )}

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
