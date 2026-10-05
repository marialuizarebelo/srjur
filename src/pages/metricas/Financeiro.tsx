import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import {
  DollarSign, TrendingUp, Calendar, BarChart3, Wallet, Percent, Clock, AlertTriangle, ArrowDownToLine, ArrowUpFromLine,
  ShieldCheck, Scale, Repeat, CreditCard, Users,
} from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import {
  MONTHS, monthsBack, usePeriod, KpiCard, ChartCard, DonutWithLegend,
  DetailDialog, useDetail, AttentionPanel, type Attention, previousPeriodRange, trendText, NotesPanel,
  useResponsavelFilter, useUnidadeFilter, matchUnidadeFinance, UNIDADE_LABELS,
} from './shared'
import {
  PAL, SERIES_COLORS, ComboChart, HBars, BucketBars, MiniTable, StatStrip, SectionTitle,
  sum, avg, pct, fmtPct, fmtNum, daysBetween, addDays, inRange, todayISO, groupSum,
  useFinanceData, isDespesaCaixa, isRecorrente, type FinRow,
} from './kit'

// Compatibilidade: as Metas leem as linhas financeiras daqui.
export function useFinanceRows() {
  const { rows, loading } = useFinanceData()
  return { reflectingRows: rows, loading }
}
export type FinanceRow = FinRow

// Vínculo do responsável no financeiro é texto livre (nome digitado à mão,
// não um perfil de verdade) — casa por aproximação com o nome/apelido da
// usuária em vez de um id exato, já que não dá pra comparar com precisão.
function matchesResponsibleText(responsibleText: string | null, profileName: string | null | undefined) {
  if (!profileName) return true
  if (!responsibleText) return false
  const a = responsibleText.toLowerCase()
  const b = profileName.toLowerCase()
  return a.includes(b) || b.includes(a)
}

const dataCaixa = (r: FinRow) => (r.payment_date ?? r.date).slice(0, 10)
const vencimento = (r: FinRow) => (r.due_date ?? r.date).slice(0, 10)

export default function FinanceiroTab() {
  const { rows: allRows, loading } = useFinanceData()
  const [projectionMonths, setProjectionMonths] = useState(6)
  const period = usePeriod()
  const detail = useDetail()
  const respFilter = useResponsavelFilter()
  const { unidade } = useUnidadeFilter()
  const selectedProfileName = respFilter.profiles.find(p => p.id === respFilter.responsavelId)?.display_name
  const rows = useMemo(() => allRows.filter(r =>
    matchesResponsibleText(r.responsible, selectedProfileName) && matchUnidadeFinance(r.business_unit, unidade)
  ), [allRows, selectedProfileName, unidade])

  const hoje = todayISO()
  const { start, end } = period.range
  const prev = useMemo(() => previousPeriodRange(start, end), [start, end])
  const trendMonths = useMemo(() => monthsBack(12), [])

  /* ---------- Períodos ---------- */
  const rowsP = useMemo(() => rows.filter(r => inRange(r.date, start, end)), [rows, start, end])
  const rowsPrev = useMemo(() => rows.filter(r => inRange(r.date, prev.start, prev.end)), [rows, prev])
  const receitasRows = rowsP.filter(r => r.type === 'receita')
  const despesasRows = rowsP.filter(isDespesaCaixa)
  const receitas = sum(receitasRows.map(r => r.value))
  const despesas = sum(despesasRows.map(r => r.value))
  const resultado = receitas - despesas
  const margem = pct(resultado, receitas)
  const receitasPrev = sum(rowsPrev.filter(r => r.type === 'receita').map(r => r.value))
  const despesasPrev = sum(rowsPrev.filter(isDespesaCaixa).map(r => r.value))
  const resultadoPrev = receitasPrev - despesasPrev

  /* ---------- Caixa (regime de caixa: quando o dinheiro realmente entrou/saiu) ---------- */
  const pagos = useMemo(() => rows.filter(r => r.paid && r.impacts_cash !== false), [rows])
  const saldoTotal = sum(pagos.map(r => (r.type === 'receita' ? r.value : -r.value)))
  const entradasP = pagos.filter(r => r.type === 'receita' && inRange(dataCaixa(r), start, end))
  const saidasP = pagos.filter(r => r.type === 'despesa' && inRange(dataCaixa(r), start, end))
  const recebido = sum(entradasP.map(r => r.value))
  const pago = sum(saidasP.map(r => r.value))

  /* ---------- Contas a receber / pagar ---------- */
  const aReceber = useMemo(() => rows.filter(r => r.type === 'receita' && !r.paid && r.aberto > 0), [rows])
  const vencidas = aReceber.filter(r => vencimento(r) < hoje)
  const valorVencido = sum(vencidas.map(r => r.aberto))
  const vencimentoNoPeriodo = rows.filter(r => r.type === 'receita' && inRange(vencimento(r), start, end))
  const taxaRecebimento = pct(sum(vencimentoNoPeriodo.map(r => r.value - r.aberto)), sum(vencimentoNoPeriodo.map(r => r.value)))
  const taxaInadimplencia = pct(valorVencido, sum(rows.filter(r => r.type === 'receita' && vencimento(r) <= hoje).map(r => r.value)))
  const prazosRecebimento = entradasP.filter(r => r.payment_date).map(r => Math.max(0, daysBetween(r.date, r.payment_date!)))
  const pmr = avg(prazosRecebimento)
  const receber30 = aReceber.filter(r => inRange(vencimento(r), hoje, addDays(hoje, 30)))
  const aPagar = useMemo(() => rows.filter(r => isDespesaCaixa(r) && !r.paid && r.aberto > 0), [rows])
  const pagar30 = aPagar.filter(r => vencimento(r) <= addDays(hoje, 30))

  /* ---------- Sustentabilidade ---------- */
  const ultimos3 = useMemo(() => {
    const ms = monthsBack(4).slice(0, 3) // 3 meses fechados antes do atual
    return ms.map(m => {
      const rs = rows.filter(r => inRange(r.date, m.start, m.end))
      return { receita: sum(rs.filter(r => r.type === 'receita').map(r => r.value)), despesa: sum(rs.filter(isDespesaCaixa).map(r => r.value)) }
    })
  }, [rows])
  const despesaMedia = avg(ultimos3.map(m => m.despesa))
  const receitaMedia = avg(ultimos3.map(m => m.receita))
  const coberturaCaixa = despesaMedia > 0 ? saldoTotal / despesaMedia : 0
  const coberturaReceita = pct(receitaMedia, despesaMedia)
  const margemSeguranca = receitaMedia > 0 ? ((receitaMedia - despesaMedia) / receitaMedia) * 100 : 0

  /* ---------- Séries de 12 meses ---------- */
  const evolution = useMemo(() => {
    let acumulado = sum(pagos.filter(r => dataCaixa(r) < trendMonths[0].start).map(r => (r.type === 'receita' ? r.value : -r.value)))
    return trendMonths.map(m => {
      const comp = rows.filter(r => inRange(r.date, m.start, m.end))
      const rec = sum(comp.filter(r => r.type === 'receita').map(r => r.value))
      const desp = sum(comp.filter(isDespesaCaixa).map(r => r.value))
      const ent = sum(pagos.filter(r => r.type === 'receita' && inRange(dataCaixa(r), m.start, m.end)).map(r => r.value))
      const sai = sum(pagos.filter(r => r.type === 'despesa' && inRange(dataCaixa(r), m.start, m.end)).map(r => r.value))
      acumulado += ent - sai
      return {
        month: m.label, receitas: rec, despesas: desp, resultado: rec - desp, margem: Math.round(pct(rec - desp, rec)),
        entradas: ent, saidas: -sai, fluxo: ent - sai, saldo: acumulado,
        recorrente: sum(comp.filter(r => r.type === 'receita' && isRecorrente(r)).map(r => r.value)),
        avulsa: sum(comp.filter(r => r.type === 'receita' && !isRecorrente(r)).map(r => r.value)),
        advocacia: sum(comp.filter(r => r.type === 'receita' && r.business_unit !== 'saas').map(r => r.value)),
        saas: sum(comp.filter(r => r.type === 'receita' && r.business_unit === 'saas').map(r => r.value)),
        _start: m.start, _end: m.end,
      }
    })
  }, [rows, pagos, trendMonths])

  const topCategoriasDesp = useMemo(() => groupSum(rows.filter(r => isDespesaCaixa(r) && inRange(r.date, trendMonths[0].start, trendMonths[11].end)), r => r.category ?? 'Outros', r => r.value).slice(0, 5).map(c => c.name), [rows, trendMonths])
  const despesaPorCategoriaMes = useMemo(() => trendMonths.map(m => {
    const out: Record<string, any> = { month: m.label }
    const rs = rows.filter(r => isDespesaCaixa(r) && inRange(r.date, m.start, m.end))
    topCategoriasDesp.forEach(c => { out[c] = sum(rs.filter(r => (r.category ?? 'Outros') === c).map(r => r.value)) })
    out['Outras'] = sum(rs.filter(r => !topCategoriasDesp.includes(r.category ?? 'Outros')).map(r => r.value))
    return out
  }), [rows, trendMonths, topCategoriasDesp])

  /* ---------- Ano contra ano ---------- */
  const anoAtual = new Date().getFullYear()
  const yoy = useMemo(() => MONTHS.map((label, i) => {
    const rec = (y: number) => sum(rows.filter(r => r.type === 'receita' && r.date.startsWith(`${y}-${String(i + 1).padStart(2, '0')}`)).map(r => r.value))
    return { month: label, [`${anoAtual}`]: i <= new Date().getMonth() ? rec(anoAtual) : null, [`${anoAtual - 1}`]: rec(anoAtual - 1) }
  }), [rows, anoAtual])

  /* ---------- DRE gerencial ---------- */
  const dre = useMemo(() => {
    const cats = (rs: FinRow[]) => {
      const map = new Map<string, number>()
      rs.filter(isDespesaCaixa).forEach(r => map.set(r.category ?? 'Outros', (map.get(r.category ?? 'Outros') ?? 0) + r.value))
      return map
    }
    const cur = cats(rowsP); const prv = cats(rowsPrev)
    const nomes = Array.from(new Set([...cur.keys(), ...prv.keys()])).sort((a, b) => (cur.get(b) ?? 0) - (cur.get(a) ?? 0))
    const imposto = (m: Map<string, number>) => sum(Array.from(m.entries()).filter(([k]) => k.toLowerCase().includes('imposto')).map(([, v]) => v))
    const linhas: { label: string; atual: number; anterior: number; tipo: 'receita' | 'despesa' | 'subtotal' | 'total'; pctRec?: number }[] = []
    linhas.push({ label: 'Receita bruta', atual: receitas, anterior: receitasPrev, tipo: 'receita' })
    linhas.push({ label: '(−) Impostos', atual: -imposto(cur), anterior: -imposto(prv), tipo: 'despesa' })
    linhas.push({ label: 'Receita líquida', atual: receitas - imposto(cur), anterior: receitasPrev - imposto(prv), tipo: 'subtotal' })
    nomes.filter(n => !n.toLowerCase().includes('imposto')).forEach(n => linhas.push({ label: `(−) ${n}`, atual: -(cur.get(n) ?? 0), anterior: -(prv.get(n) ?? 0), tipo: 'despesa' }))
    linhas.push({ label: 'Resultado', atual: resultado, anterior: resultadoPrev, tipo: 'total' })
    return linhas.map(l => ({ ...l, pctRec: pct(Math.abs(l.atual), receitas) }))
  }, [rowsP, rowsPrev, receitas, receitasPrev, resultado, resultadoPrev])

  /* ---------- Aging ---------- */
  const agingReceber = useMemo(() => {
    const faixas = [
      { name: 'A vencer', test: (d: number) => d <= 0, color: PAL.green },
      { name: '1–30 dias', test: (d: number) => d >= 1 && d <= 30, color: PAL.amber },
      { name: '31–60', test: (d: number) => d >= 31 && d <= 60, color: PAL.orange },
      { name: '61–90', test: (d: number) => d >= 61 && d <= 90, color: PAL.pink },
      { name: '90+ dias', test: (d: number) => d > 90, color: PAL.red },
    ]
    return faixas.map(f => { const rs = aReceber.filter(r => f.test(daysBetween(vencimento(r), hoje))); return { name: f.name, color: f.color, value: sum(rs.map(r => r.aberto)), count: rs.length, rows: rs } })
  }, [aReceber, hoje])
  const agingPagar = useMemo(() => {
    const faixas = [
      { name: 'Vencidas', test: (d: number) => d > 0, color: PAL.red },
      { name: 'Próx. 7 dias', test: (d: number) => d <= 0 && d >= -7, color: PAL.amber },
      { name: '8–30 dias', test: (d: number) => d < -7 && d >= -30, color: PAL.blue },
      { name: '31–60', test: (d: number) => d < -30 && d >= -60, color: PAL.teal },
      { name: '60+ dias', test: (d: number) => d < -60, color: PAL.gray },
    ]
    return faixas.map(f => { const rs = aPagar.filter(r => f.test(daysBetween(vencimento(r), hoje))); return { name: f.name, color: f.color, value: sum(rs.map(r => r.aberto)), count: rs.length, rows: rs } })
  }, [aPagar, hoje])

  /* ---------- Quebras do período ---------- */
  const receitaCategoria = useMemo(() => groupSum(receitasRows, r => r.category ?? 'Outros', r => r.value), [receitasRows])
  const despesaCategoria = useMemo(() => groupSum(despesasRows, r => r.category ?? 'Outros', r => r.value), [despesasRows])
  const formaPagamento = useMemo(() => groupSum(entradasP, r => r.payment_method?.trim() || 'Não informado', r => r.value), [entradasP])
  const unidadeData = useMemo(() => [
    { name: 'Advocacia', value: sum(receitasRows.filter(r => r.business_unit !== 'saas').map(r => r.value)) },
    { name: 'SaaS', value: sum(receitasRows.filter(r => r.business_unit === 'saas').map(r => r.value)) },
  ].filter(d => d.value > 0), [receitasRows])
  const diaDoMes = useMemo(() => {
    const faixas = [{ n: '1–5', a: 1, b: 5 }, { n: '6–10', a: 6, b: 10 }, { n: '11–15', a: 11, b: 15 }, { n: '16–20', a: 16, b: 20 }, { n: '21–25', a: 21, b: 25 }, { n: '26–31', a: 26, b: 31 }]
    const doze = pagos.filter(r => r.type === 'receita' && dataCaixa(r) >= trendMonths[0].start)
    return faixas.map(f => ({ name: f.n, value: sum(doze.filter(r => { const d = Number(dataCaixa(r).slice(8, 10)); return d >= f.a && d <= f.b }).map(r => r.value)) }))
  }, [pagos, trendMonths])

  /* ---------- Clientes: concentração ---------- */
  const [clientNames, setClientNames] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    supabase.from('clients').select('id, name').then(({ data }) => setClientNames(new Map((data ?? []).map((c: any) => [c.id, c.name]))))
  }, [])
  const porCliente = useMemo(() => groupSum(receitasRows.filter(r => r.client_id), r => r.client_id!, r => r.value)
    .map(c => ({ ...c, name: clientNames.get(c.name) ?? 'Cliente' })), [receitasRows, clientNames])
  const receitaComCliente = sum(porCliente.map(c => c.value))
  const top3 = pct(sum(porCliente.slice(0, 3).map(c => c.value)), receitas)
  const topCliente = pct(porCliente[0]?.value ?? 0, receitas)

  /* ---------- Projeção ---------- */
  const projection = useMemo(() => {
    const result: { month: string; aReceber: number; aPagar: number; saldo: number }[] = []
    let acc = saldoTotal
    const now = new Date()
    for (let i = 0; i <= projectionMonths; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const s = i === 0 ? hoje : new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
      const mr = rows.filter(r => !r.paid && r.aberto > 0 && r.impacts_cash !== false && inRange(vencimento(r), i === 0 ? '0000-01-01' : s, e))
      const rec = sum(mr.filter(r => r.type === 'receita').map(r => r.aberto))
      const desp = sum(mr.filter(r => r.type === 'despesa').map(r => r.aberto))
      acc += rec - desp
      result.push({ month: `${MONTHS[d.getMonth()]}/${d.getFullYear() % 100}`, aReceber: rec, aPagar: -desp, saldo: acc })
    }
    return result
  }, [rows, projectionMonths, saldoTotal, hoje])

  /* ---------- Detalhes ---------- */
  function openRows(title: string, list: FinRow[], valueOf: (r: FinRow) => number = r => r.value) {
    detail.show(title, list.map((r, i) => ({ id: String(i), label: r.description, sublabel: `${fmtDate(r.date)} · ${r.category ?? 'Outros'}${r.due_date && !r.paid ? ` · vence ${fmtDate(r.due_date)}` : ''}`, value: fmtBRL(valueOf(r)) })))
  }
  function openMonth(i: number) {
    const m = evolution[i]; if (!m) return
    openRows(`Lançamentos de ${m.month}`, rows.filter(r => inRange(r.date, m._start, m._end) && (r.type === 'receita' || r.impacts_cash !== false)))
  }

  const attention = useMemo(() => {
    const items: Attention[] = []
    if (saldoTotal < 0) items.push({ text: 'Saldo em caixa está negativo.', level: 'danger' })
    if (receitas > 0 && despesas > receitas) items.push({ text: 'As despesas superaram as receitas no período.', level: 'warn' })
    if (despesaMedia > 0 && coberturaCaixa < 3 && saldoTotal >= 0) items.push({ text: `O caixa cobre ${fmtNum(coberturaCaixa, 1)} mês(es) de despesas — o recomendado costuma ser 3 a 6.`, level: 'warn' })
    if (valorVencido > 0) items.push({ text: `${fmtBRL(valorVencido)} em recebimentos vencidos (${fmtPct(taxaInadimplencia, 1)} do que já venceu).`, level: 'warn' })
    if (topCliente > 40) items.push({ text: `Um único cliente concentra ${fmtPct(topCliente)} da receita do período — risco de dependência.`, level: 'info' })
    const maior = despesaCategoria[0]
    if (maior && despesas > 0 && maior.value / despesas > 0.4) items.push({ text: `"${maior.name}" concentra ${fmtPct(pct(maior.value, despesas))} das despesas.`, level: 'info' })
    if (pmr > 30) items.push({ text: `Os clientes levam em média ${fmtNum(pmr, 0)} dias para pagar.`, level: 'info' })
    return items
  }, [saldoTotal, receitas, despesas, despesaMedia, coberturaCaixa, valorVencido, taxaInadimplencia, topCliente, despesaCategoria, pmr])

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  const sp = (k: 'receitas' | 'despesas' | 'resultado' | 'saldo' | 'margem') => evolution.map(m => m[k] as number)
  const custoCartao = sum(receitasRows.filter(r => r.card_fee_percent).map(r => r.value * Number(r.card_fee_percent) / 100))

  return (
    <div className="space-y-4">
      <AttentionPanel items={attention} />

      <SectionTitle hint={`Resultado do período (regime de competência) — ${UNIDADE_LABELS[unidade].toLowerCase()}.`}>Resultado</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard title="Receita" hint="Receitas lançadas com data dentro do período (recebidas ou não)." value={fmtBRL(receitas)} icon={TrendingUp} color={PAL.green} sensitive spark={sp('receitas')}
          trend={trendText(receitas, receitasPrev)} onClick={() => openRows('Receitas do período', receitasRows)} />
        <KpiCard title="Despesas" hint="Despesas do período que afetam o caixa." value={fmtBRL(despesas)} icon={TrendingUp} color={PAL.red} sensitive spark={sp('despesas')} trendTone="down-good"
          trend={trendText(despesas, despesasPrev)} onClick={() => openRows('Despesas do período', despesasRows)} />
        <KpiCard title="Resultado" hint="Receitas menos despesas do período." value={fmtBRL(resultado)} icon={DollarSign} color={resultado >= 0 ? PAL.green : PAL.red} sensitive spark={sp('resultado')}
          trend={trendText(resultado, resultadoPrev)} onClick={() => openRows('Receitas e despesas do período', rowsP.filter(r => r.type === 'receita' || r.impacts_cash !== false))} />
        <KpiCard title="Margem líquida" hint="Resultado ÷ receitas. Quanto de cada R$ 100 recebidos sobra." value={fmtPct(margem)} icon={Percent} color={PAL.blue} spark={sp('margem')}
          trend={receitasPrev > 0 ? `${fmtPct(pct(resultadoPrev, receitasPrev))} no período anterior` : undefined} trendTone="neutral" onClick={() => openRows('Lançamentos do período', rowsP)} />
        <KpiCard title="Saldo em caixa" hint="Tudo que já foi recebido menos tudo que já foi pago, desde o início (só lançamentos pagos que afetam o caixa)." value={fmtBRL(saldoTotal)} icon={Wallet} color={PAL.purple} sensitive spark={sp('saldo')}
          onClick={() => openRows('Lançamentos pagos que compõem o saldo', pagos)} />
      </div>

      <SectionTitle hint="Quanto do que foi vendido virou dinheiro, e quanto tempo isso leva.">Caixa e recebimento</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Recebido" hint="Dinheiro que entrou no período (pelo dia do pagamento)." value={fmtBRL(recebido)} icon={ArrowDownToLine} color={PAL.green} sensitive onClick={() => openRows('Entradas do período', entradasP)} />
        <KpiCard title="Pago" hint="Dinheiro que saiu no período (pelo dia do pagamento)." value={fmtBRL(pago)} icon={ArrowUpFromLine} color={PAL.red} sensitive trendTone="down-good" onClick={() => openRows('Saídas do período', saidasP)} />
        <KpiCard title="Taxa de recebimento" hint="Das receitas que venciam no período, quanto já foi pago." value={fmtPct(taxaRecebimento)} icon={ShieldCheck} color={PAL.teal} onClick={() => openRows('Receitas com vencimento no período', vencimentoNoPeriodo)} />
        <KpiCard title="Prazo médio de recebimento" hint="Dias entre a data da receita e o pagamento, nas entradas do período." value={prazosRecebimento.length ? `${fmtNum(pmr, 0)} dias` : '—'} icon={Clock} color={PAL.sky} onClick={() => openRows('Entradas consideradas', entradasP.filter(r => r.payment_date))} />
        <KpiCard title="Em atraso" hint="Receitas vencidas e ainda não pagas (saldo em aberto)." value={fmtBRL(valorVencido)} icon={AlertTriangle} color={PAL.red} sensitive trendTone="down-good"
          trend={`${fmtPct(taxaInadimplencia, 1)} do vencido`} onClick={() => openRows('Receitas vencidas', vencidas, r => r.aberto)} />
        <KpiCard title="A receber em 30 dias" hint="Receitas em aberto com vencimento nos próximos 30 dias." value={fmtBRL(sum(receber30.map(r => r.aberto)))} icon={Calendar} color={PAL.blue} sensitive
          trend={`a pagar: ${fmtBRL(sum(pagar30.map(r => r.aberto)))}`} trendTone="neutral" onClick={() => openRows('A receber nos próximos 30 dias', receber30, r => r.aberto)} />
      </div>

      <SectionTitle hint="Quanto tempo a empresa aguenta e onde está o equilíbrio.">Sustentabilidade</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard title="Cobertura de caixa" hint="Saldo em caixa ÷ despesa média mensal dos últimos 3 meses fechados. Quantos meses a empresa sobreviveria sem receber nada." value={despesaMedia > 0 ? `${fmtNum(coberturaCaixa, 1)} meses` : '—'} icon={ShieldCheck} color={coberturaCaixa >= 3 ? PAL.green : PAL.amber} onClick={() => openRows('Lançamentos que compõem o saldo', pagos)} />
        <KpiCard title="Ponto de equilíbrio" hint="Estimado pela despesa média mensal dos últimos 3 meses fechados: a receita mínima por mês para não ter prejuízo." value={fmtBRL(despesaMedia)} icon={Scale} color={PAL.purple} sensitive
          trend={`receita média: ${fmtBRL(receitaMedia)}`} trendTone="neutral" onClick={() => detail.show('Últimos 3 meses fechados', ultimos3.map((m, i) => ({ id: String(i), label: monthsBack(4)[i].label, sublabel: `receita ${fmtBRL(m.receita)}`, value: fmtBRL(m.despesa) })))} />
        <KpiCard title="Margem de segurança" hint="Quanto a receita média pode cair antes de encostar no ponto de equilíbrio." value={receitaMedia > 0 ? fmtPct(margemSeguranca) : '—'} icon={ShieldCheck} color={margemSeguranca >= 20 ? PAL.green : PAL.amber}
          trend={`cobertura ${fmtPct(coberturaReceita)}`} trendTone="neutral" onClick={() => detail.show('Receita × despesa (3 meses)', ultimos3.map((m, i) => ({ id: String(i), label: monthsBack(4)[i].label, sublabel: `despesa ${fmtBRL(m.despesa)}`, value: fmtBRL(m.receita) })))} />
        <KpiCard title="Receita recorrente" hint="Parte da receita do período que é recorrente (mensalidades, assinaturas)." value={fmtPct(pct(sum(receitasRows.filter(isRecorrente).map(r => r.value)), receitas))} icon={Repeat} color={PAL.teal}
          onClick={() => openRows('Receita recorrente do período', receitasRows.filter(isRecorrente))} />
        <KpiCard title="Concentração (top 3)" hint="Parte da receita do período que vem dos 3 maiores clientes." value={fmtPct(top3)} icon={Users} color={top3 > 60 ? PAL.amber : PAL.blue} trendTone="down-good"
          trend={`maior cliente: ${fmtPct(topCliente)}`} onClick={() => detail.show('Maiores clientes do período', porCliente.slice(0, 10).map((c, i) => ({ id: String(i), label: c.name, value: fmtBRL(c.value), sublabel: fmtPct(pct(c.value, receitas), 1) })))} />
      </div>

      <ChartCard title="Receitas, despesas e resultado (12 meses)" icon={BarChart3}>
        <ComboChart data={evolution} onPointClick={openMonth} series={[
          { key: 'receitas', name: 'Receitas', color: PAL.green },
          { key: 'despesas', name: 'Despesas', color: PAL.red },
          { key: 'resultado', name: 'Resultado', color: PAL.purple, kind: 'line' },
        ]} />
      </ChartCard>

      <NotesPanel area="financeiro" months={trendMonths} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Fluxo de caixa realizado e saldo" icon={Wallet}>
          <ComboChart data={evolution} series={[
            { key: 'entradas', name: 'Entradas', color: PAL.green, stack: 'f' },
            { key: 'saidas', name: 'Saídas', color: PAL.red, stack: 'f' },
            { key: 'saldo', name: 'Saldo acumulado', color: PAL.purple, kind: 'line' },
          ]} />
        </ChartCard>
        <ChartCard title="Margem líquida mês a mês" icon={Percent}>
          <ComboChart data={evolution} format={v => `${v}%`} yFormat={v => `${v}%`} series={[
            { key: 'margem', name: 'Margem líquida', color: PAL.blue, kind: 'area' },
          ]} />
        </ChartCard>
      </div>

      <ChartCard title="DRE gerencial do período" icon={Scale}>
        <MiniTable
          columns={[
            { key: 'label', label: 'Conta', render: r => <span className={r.tipo === 'subtotal' || r.tipo === 'total' ? 'font-bold' : ''}>{r.label}</span> },
            { key: 'atual', label: 'Período', align: 'right', render: r => <span className={`${r.tipo === 'total' ? 'font-bold' : ''} ${r.atual < 0 ? 'text-red-700 dark:text-red-300' : ''}`}>{fmtBRL(r.atual)}</span> },
            { key: 'pctRec', label: '% da receita', align: 'right', render: r => <span className="text-muted-foreground">{fmtPct(r.pctRec ?? 0, 1)}</span> },
            { key: 'anterior', label: 'Anterior', align: 'right', render: r => <span className="text-muted-foreground">{fmtBRL(r.anterior)}</span> },
            { key: 'var', label: 'Variação', align: 'right', render: r => {
              if (r.anterior === 0) return <span className="text-muted-foreground">—</span>
              const v = ((r.atual - r.anterior) / Math.abs(r.anterior)) * 100
              const bom = r.tipo === 'despesa' ? v > 0 : v >= 0 // despesa é negativa: subir (menos negativa) é bom
              return <span className={bom ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>{v >= 0 ? '↑' : '↓'} {Math.abs(v).toFixed(0)}%</span>
            } },
          ]}
          rows={dre}
          onRowClick={r => {
            if (r.tipo === 'receita') return openRows('Receitas do período', receitasRows)
            if (r.tipo === 'despesa') { const cat = String(r.label).replace('(−) ', ''); return openRows(`${cat} — despesas`, despesasRows.filter(x => (x.category ?? 'Outros') === cat || (cat === 'Impostos' && (x.category ?? '').toLowerCase().includes('imposto')))) }
          }} />
        <p className="text-[11px] text-muted-foreground mt-3">Visão gerencial a partir dos lançamentos (competência). Não substitui a contabilidade.</p>
      </ChartCard>

      <SectionTitle hint="Quem deve, quanto e há quanto tempo — e o que vence nas próximas semanas.">Contas a receber e a pagar</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="A receber por idade do vencimento" icon={ArrowDownToLine}>
          <BucketBars data={agingReceber.map(a => ({ name: a.name, value: a.value, color: a.color, count: a.count }))}
            onSelect={name => { const a = agingReceber.find(x => x.name === name); if (a) openRows(`A receber — ${name}`, a.rows, r => r.aberto) }} />
        </ChartCard>
        <ChartCard title="A pagar por vencimento" icon={ArrowUpFromLine}>
          <BucketBars data={agingPagar.map(a => ({ name: a.name, value: a.value, color: a.color, count: a.count }))}
            onSelect={name => { const a = agingPagar.find(x => x.name === name); if (a) openRows(`A pagar — ${name}`, a.rows, r => r.aberto) }} />
        </ChartCard>
      </div>

      <ChartCard title="Projeção de caixa" icon={Calendar} >
        <div className="flex items-center gap-1 mb-3">
          {[3, 6, 12].map(n => (
            <Button key={n} variant={projectionMonths === n ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setProjectionMonths(n)}>{n} meses</Button>
          ))}
        </div>
        <ComboChart data={projection} series={[
          { key: 'aReceber', name: 'A receber', color: PAL.green, stack: 'p' },
          { key: 'aPagar', name: 'A pagar', color: PAL.red, stack: 'p' },
          { key: 'saldo', name: 'Saldo projetado', color: PAL.purple, kind: 'line' },
        ]} />
        <p className="text-[11px] text-muted-foreground mt-2">Considera só o que já está lançado com vencimento futuro (inclusive atrasado no mês atual). Não prevê vendas novas.</p>
      </ChartCard>

      <SectionTitle hint="De onde vem e para onde vai o dinheiro.">Composição</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Receitas por categoria" icon={DollarSign}>
          <DonutWithLegend data={receitaCategoria} formatValue={fmtBRL} onSelect={name => openRows(`${name} — receitas`, receitasRows.filter(r => (r.category ?? 'Outros') === name))} />
        </ChartCard>
        <ChartCard title="Despesas por categoria" icon={DollarSign}>
          <DonutWithLegend data={despesaCategoria} formatValue={fmtBRL} onSelect={name => openRows(`${name} — despesas`, despesasRows.filter(r => (r.category ?? 'Outros') === name))} />
        </ChartCard>
      </div>

      <ChartCard title="Evolução das maiores despesas (12 meses)" icon={BarChart3}>
        <ComboChart data={despesaPorCategoriaMes} series={[...topCategoriasDesp, 'Outras'].map((c, i) => ({ key: c, name: c, color: SERIES_COLORS[i % SERIES_COLORS.length], stack: 'd' }))} />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Receita recorrente × avulsa (12 meses)" icon={Repeat}>
          <ComboChart data={evolution} series={[
            { key: 'recorrente', name: 'Recorrente', color: PAL.teal, stack: 'r' },
            { key: 'avulsa', name: 'Avulsa', color: PAL.amber, stack: 'r' },
          ]} />
        </ChartCard>
        {unidade === '' ? (
          <ChartCard title="Receita por unidade (12 meses)" icon={Scale}>
            <ComboChart data={evolution} series={[
              { key: 'advocacia', name: 'Advocacia', color: PAL.purple, stack: 'u' },
              { key: 'saas', name: 'SaaS', color: PAL.teal, stack: 'u' },
            ]} />
          </ChartCard>
        ) : (
          <ChartCard title="Entradas por forma de pagamento" icon={CreditCard}>
            <DonutWithLegend data={formaPagamento} formatValue={fmtBRL} onSelect={name => openRows(`Entradas — ${name}`, entradasP.filter(r => (r.payment_method?.trim() || 'Não informado') === name))} />
          </ChartCard>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {unidade === '' && (
          <ChartCard title="Receita do período por unidade" icon={Scale}>
            <DonutWithLegend data={unidadeData} formatValue={fmtBRL} onSelect={name => openRows(`Receita — ${name}`, receitasRows.filter(r => (name === 'SaaS') === (r.business_unit === 'saas')))} />
          </ChartCard>
        )}
        {unidade === '' && (
          <ChartCard title="Entradas por forma de pagamento" icon={CreditCard}>
            <DonutWithLegend data={formaPagamento} formatValue={fmtBRL} onSelect={name => openRows(`Entradas — ${name}`, entradasP.filter(r => (r.payment_method?.trim() || 'Não informado') === name))} />
          </ChartCard>
        )}
        <ChartCard title="Maiores clientes do período" icon={Users}>
          <HBars data={porCliente} format={fmtBRL} color={PAL.purple} limit={8} empty="Nenhuma receita vinculada a cliente"
            suffix={d => `· ${fmtPct(pct(d.value, receitas), 0)}`}
            onSelect={name => { const id = Array.from(clientNames.entries()).find(([, n]) => n === name)?.[0]; openRows(`Receitas — ${name}`, receitasRows.filter(r => r.client_id === id)) }} />
          {receitas > 0 && <p className="text-[11px] text-muted-foreground mt-3">{fmtPct(pct(receitaComCliente, receitas))} da receita está vinculada a um cliente.</p>}
        </ChartCard>
        <ChartCard title="Maiores despesas do período" icon={ArrowUpFromLine}>
          <HBars data={[...despesasRows].sort((a, b) => b.value - a.value).slice(0, 8).map(r => ({ name: r.description, value: r.value, sub: r.category ?? undefined }))} format={fmtBRL} color={PAL.red} empty="Sem despesas no período" />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Receita ano contra ano" icon={TrendingUp}>
          <ComboChart data={yoy} series={[
            { key: String(anoAtual - 1), name: String(anoAtual - 1), color: PAL.gray, kind: 'line', dashed: true },
            { key: String(anoAtual), name: String(anoAtual), color: PAL.purple, kind: 'line' },
          ]} />
        </ChartCard>
        <ChartCard title="Em que dia do mês o dinheiro entra (12 meses)" icon={Calendar}>
          <HBars data={diaDoMes} format={fmtBRL} color={PAL.teal} limit={6} />
          <p className="text-[11px] text-muted-foreground mt-3">Ajuda a planejar o caixa: concentra as entradas nos dias em que você mais recebe.</p>
        </ChartCard>
      </div>

      {custoCartao > 0 && (
        <ChartCard title="Custos financeiros" icon={CreditCard}>
          <StatStrip items={[
            { label: 'Taxas de cartão (estimado)', value: fmtBRL(custoCartao), hint: 'Receitas com taxa de cartão informada × percentual' },
            { label: '% da receita', value: fmtPct(pct(custoCartao, receitas), 1) },
          ]} />
        </ChartCard>
      )}

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
