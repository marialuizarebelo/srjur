import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Target, TrendingUp, Users, Clock, AlertTriangle, Handshake, Megaphone, Hourglass, PhoneCall, Layers } from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import {
  monthsBack, usePeriod, KpiCard, ChartCard, DonutWithLegend,
  DetailDialog, useDetail, AttentionPanel, type Attention, previousPeriodRange, trendText, NotesPanel,
  useResponsavelFilter, TrendChart,
} from './shared'
import {
  PAL, ComboChart, HBars, FunnelBars, BucketBars, MiniTable, StatStrip, SectionTitle,
  sum, avg, median, pct, fmtPct, fmtNum, daysBetween, addDays, inRange, todayISO, groupCount, useFinanceData, fetchAll,
} from './kit'

export interface Lead {
  name: string; status: string; potential_value: number | null; created_at: string; updated_at: string | null
  signed_at: string | null; client_id: string | null; next_followup: string | null; source: string | null
  responsible_ids: string[] | null; first_contact_at: string | null; referred_by: string | null; referral_fee_pct: number | null
}
interface ClientRow { id: string; name: string; status: string; created_at: string; responsible_ids: string[] | null; is_cortesia: boolean; is_juridico: boolean }
interface Stage { label: string; value: string; position: number }

const isConvertido = (l: Lead) => l.status === 'convertido' || !!l.client_id
const isPerdido = (l: Lead) => l.status === 'perdido'
const isAberto = (l: Lead) => !isConvertido(l) && !isPerdido(l)

export default function ComercialTab() {
  const [leadsRaw, setLeadsRaw] = useState<Lead[]>([])
  const [clientsRaw, setClientsRaw] = useState<ClientRow[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const period = usePeriod()
  const detail = useDetail()
  const respFilter = useResponsavelFilter()
  const { rows: finRows } = useFinanceData()

  useEffect(() => {
    Promise.all([
      fetchAll<Lead>('leads', 'name, status, potential_value, created_at, updated_at, signed_at, client_id, next_followup, source, responsible_ids, first_contact_at, referred_by, referral_fee_pct'),
      fetchAll<ClientRow>('clients', 'id, name, status, created_at, responsible_ids, is_cortesia, is_juridico'),
      supabase.from('pipeline_stages').select('label, value, position').order('position'),
    ]).then(([l, c, s]) => {
      setLeadsRaw(l)
      setClientsRaw(c)
      setStages((s.data as Stage[]) ?? [])
      setLoading(false)
    })
  }, [])

  // Clientes puramente SaaS (sem questão jurídica) e casos gratuitos/cortesia
  // não entram no funil comercial jurídico -- são contados em Produto/SaaS
  // ou simplesmente não contam em métrica nenhuma, respectivamente.
  const clients = useMemo(() => clientsRaw.filter(c => respFilter.matches(c.responsible_ids) && !c.is_cortesia && c.is_juridico !== false), [clientsRaw, respFilter.responsavelId])
  const clientesExcluidosIds = useMemo(() => new Set(clientsRaw.filter(c => c.is_cortesia || c.is_juridico === false).map(c => c.id)), [clientsRaw])
  const clientById = useMemo(() => new Map(clientsRaw.map(c => [c.id, c])), [clientsRaw])
  const leads = useMemo(() => leadsRaw.filter(l => respFilter.matches(l.responsible_ids) && !(l.client_id && clientesExcluidosIds.has(l.client_id))), [leadsRaw, respFilter.responsavelId, clientesExcluidosIds])

  const trendMonths = useMemo(() => monthsBack(12), [])
  const stagePos = useMemo(() => new Map(stages.map(s => [s.value, s.position])), [stages])
  const hoje = todayISO()
  const { start, end } = period.range
  const prev = useMemo(() => previousPeriodRange(start, end), [start, end])

  // Data em que o lead virou cliente: assinatura > criação do cliente vinculado > última atualização.
  const dataConversao = (l: Lead) => (l.signed_at ?? (l.client_id ? clientById.get(l.client_id)?.created_at : null) ?? l.updated_at ?? l.created_at).slice(0, 10)

  const leadsNoPeriodo = useMemo(() => leads.filter(l => inRange(l.created_at, start, end)), [leads, start, end])
  const leadsAnterior = useMemo(() => leads.filter(l => inRange(l.created_at, prev.start, prev.end)), [leads, prev])
  const convertidosPeriodo = useMemo(() => leads.filter(l => isConvertido(l) && inRange(dataConversao(l), start, end)), [leads, start, end, clientById])
  const convertidosAnterior = useMemo(() => leads.filter(l => isConvertido(l) && inRange(dataConversao(l), prev.start, prev.end)), [leads, prev, clientById])
  const clientesNoPeriodo = useMemo(() => clients.filter(c => inRange(c.created_at, start, end)), [clients, start, end])
  const clientesAnterior = useMemo(() => clients.filter(c => inRange(c.created_at, prev.start, prev.end)), [clients, prev])
  const perdidosPeriodo = leadsNoPeriodo.filter(isPerdido)

  // Conversão por coorte: dos leads que entraram no período, quantos já viraram cliente.
  const taxaConversao = pct(leadsNoPeriodo.filter(isConvertido).length, leadsNoPeriodo.length)
  const taxaAnterior = pct(leadsAnterior.filter(isConvertido).length, leadsAnterior.length)
  const taxaPerda = pct(perdidosPeriodo.length, leadsNoPeriodo.length)

  const abertos = useMemo(() => leads.filter(isAberto), [leads])
  const valorAberto = sum(abertos.map(l => Number(l.potential_value ?? 0)))
  const contratadoPeriodo = sum(convertidosPeriodo.map(l => Number(l.potential_value ?? 0)))
  const comValor = convertidosPeriodo.filter(l => l.potential_value)
  const ticketMedio = comValor.length ? sum(comValor.map(l => Number(l.potential_value))) / comValor.length : 0

  // Pipeline ponderado: a chance de fechar cresce linearmente da 1ª etapa (10%) à última antes da conversão (80%).
  const etapasAbertas = useMemo(() => stages.filter(s => s.value !== 'convertido' && s.value !== 'perdido'), [stages])
  const probDe = (status: string) => {
    const idx = etapasAbertas.findIndex(s => s.value === status)
    if (idx < 0) return 0.1
    return etapasAbertas.length <= 1 ? 0.5 : 0.1 + 0.7 * (idx / (etapasAbertas.length - 1))
  }
  const pipelinePonderado = sum(abertos.map(l => Number(l.potential_value ?? 0) * probDe(l.status)))

  // Ciclo de venda: do primeiro contato (ou entrada do lead) até a assinatura.
  const ciclos = convertidosPeriodo.map(l => Math.max(0, daysBetween(l.first_contact_at ?? l.created_at, dataConversao(l))))
  const cicloMedio = avg(ciclos)
  const cicloMediano = median(ciclos)

  // CAC: investimento em marketing (categoria Marketing, só Advocacia — o funil é jurídico) ÷ novos clientes.
  const marketing = useMemo(() => finRows.filter(r => r.type === 'despesa' && r.impacts_cash !== false && r.business_unit !== 'saas' && (r.category ?? '').toLowerCase().includes('marketing') && inRange(r.date, start, end)), [finRows, start, end])
  const investMarketing = sum(marketing.map(r => r.value))
  const novosClientes = clientesNoPeriodo.length
  const cac = novosClientes > 0 ? investMarketing / novosClientes : 0
  const custoPorLead = leadsNoPeriodo.length > 0 ? investMarketing / leadsNoPeriodo.length : 0

  // Follow-ups
  const semFollowup = abertos.filter(l => !l.next_followup)
  const followAtrasado = abertos.filter(l => l.next_followup && l.next_followup < hoje)
  const followProximos = abertos.filter(l => l.next_followup && l.next_followup >= hoje && l.next_followup <= addDays(hoje, 7))

  // Séries mensais
  const mensal = useMemo(() => trendMonths.map(m => {
    const entradas = leads.filter(l => inRange(l.created_at, m.start, m.end))
    const conv = leads.filter(l => isConvertido(l) && inRange(dataConversao(l), m.start, m.end))
    return {
      month: m.label,
      leads: entradas.length,
      clientes: clients.filter(c => inRange(c.created_at, m.start, m.end)).length,
      conversao: Math.round(pct(entradas.filter(isConvertido).length, entradas.length)),
      contratado: sum(conv.map(l => Number(l.potential_value ?? 0))),
      _start: m.start, _end: m.end,
    }
  }), [leads, clients, trendMonths, clientById])

  // Funil acumulado
  const funil = useMemo(() => stages.filter(s => s.value !== 'perdido').map(s => ({
    name: s.label,
    value: leadsNoPeriodo.filter(l => !isPerdido(l) && (stagePos.get(l.status) ?? -1) >= s.position).length,
    position: s.position,
  })), [stages, leadsNoPeriodo, stagePos])

  // Situação atual por etapa (quantos e quanto $ em cada etapa agora)
  const porEtapa = useMemo(() => etapasAbertas.map(s => {
    const ls = abertos.filter(l => l.status === s.value)
    return { name: s.label, qtd: ls.length, valor: sum(ls.map(l => Number(l.potential_value ?? 0))), value: s.value }
  }), [etapasAbertas, abertos])

  // Origem
  const origens = useMemo(() => {
    const map = new Map<string, Lead[]>()
    leadsNoPeriodo.forEach(l => { const k = l.source?.trim() || 'Não informado'; map.set(k, [...(map.get(k) ?? []), l]) })
    return Array.from(map.entries()).map(([name, ls]) => {
      const conv = ls.filter(isConvertido)
      return { name, leads: ls.length, convertidos: conv.length, taxa: pct(conv.length, ls.length), valor: sum(conv.map(l => Number(l.potential_value ?? 0))), pipeline: sum(ls.filter(isAberto).map(l => Number(l.potential_value ?? 0))) }
    }).sort((a, b) => b.leads - a.leads)
  }, [leadsNoPeriodo])

  // Desempenho por responsável
  const porResponsavel = useMemo(() => {
    const nome = (id: string) => respFilter.profiles.find(p => p.id === id)?.display_name ?? 'Sem responsável'
    const rows = new Map<string, { nome: string; leads: Lead[]; abertos: Lead[]; conv: Lead[] }>()
    const add = (key: string, nm: string) => { if (!rows.has(key)) rows.set(key, { nome: nm, leads: [], abertos: [], conv: [] }); return rows.get(key)! }
    leadsNoPeriodo.forEach(l => { (l.responsible_ids?.length ? l.responsible_ids : ['—']).forEach(id => add(id, id === '—' ? 'Sem responsável' : nome(id)).leads.push(l)) })
    abertos.forEach(l => { (l.responsible_ids?.length ? l.responsible_ids : ['—']).forEach(id => add(id, id === '—' ? 'Sem responsável' : nome(id)).abertos.push(l)) })
    convertidosPeriodo.forEach(l => { (l.responsible_ids?.length ? l.responsible_ids : ['—']).forEach(id => add(id, id === '—' ? 'Sem responsável' : nome(id)).conv.push(l)) })
    return Array.from(rows.values()).map(r => ({
      nome: r.nome, leads: r.leads.length, abertos: r.abertos.length, fechados: r.conv.length,
      taxa: pct(r.leads.filter(isConvertido).length, r.leads.length),
      valor: sum(r.conv.map(l => Number(l.potential_value ?? 0))),
      atrasados: r.abertos.filter(l => l.next_followup && l.next_followup < hoje).length,
      _leads: r.leads, _abertos: r.abertos, _conv: r.conv,
    })).sort((a, b) => b.valor - a.valor || b.leads - a.leads)
  }, [leadsNoPeriodo, abertos, convertidosPeriodo, respFilter.profiles, hoje])

  // Idade do pipeline (dias sem movimentação)
  const idade = useMemo(() => {
    const faixas = [
      { name: 'até 7 dias', min: 0, max: 7, color: PAL.green },
      { name: '8–15', min: 8, max: 15, color: PAL.teal },
      { name: '16–30', min: 16, max: 30, color: PAL.amber },
      { name: '31–60', min: 31, max: 60, color: PAL.orange },
      { name: '60+ dias', min: 61, max: 99999, color: PAL.red },
    ]
    return faixas.map(f => {
      const ls = abertos.filter(l => { const d = daysBetween((l.updated_at ?? l.created_at), hoje); return d >= f.min && d <= f.max })
      return { name: f.name, color: f.color, value: ls.length, count: ls.length, leads: ls }
    })
  }, [abertos, hoje])

  // Indicações
  const indicados = leadsNoPeriodo.filter(l => l.referred_by?.trim())
  const comissaoDevida = sum(indicados.filter(isConvertido).map(l => Number(l.potential_value ?? 0) * Number(l.referral_fee_pct ?? 0) / 100))
  const porIndicador = useMemo(() => groupCount(indicados, l => l.referred_by!.trim()).slice(0, 8), [indicados])

  /* ---------- Detalhes (todo número é clicável) ---------- */
  function openLeads(title: string, list: Lead[]) {
    detail.show(title, list.map((l, i) => ({
      id: String(i), label: l.name,
      sublabel: `${fmtDate(l.created_at)} · ${isConvertido(l) ? 'Convertido' : isPerdido(l) ? 'Perdido' : stages.find(s => s.value === l.status)?.label ?? 'Em andamento'}${l.source ? ` · ${l.source}` : ''}`,
      value: l.potential_value ? fmtBRL(Number(l.potential_value)) : undefined,
    })))
  }
  function openClients(title: string, list: ClientRow[]) {
    detail.show(title, list.map((c, i) => ({ id: String(i), label: c.name, sublabel: fmtDate(c.created_at) })))
  }
  function openMonth(i: number) {
    const m = mensal[i]; if (!m) return
    openLeads(`Leads de ${m.month}`, leads.filter(l => inRange(l.created_at, m._start, m._end)))
  }

  const attention = useMemo(() => {
    const items: Attention[] = []
    if (followAtrasado.length > 0) items.push({ text: `${followAtrasado.length} lead(s) com follow-up atrasado.`, level: 'warn' })
    if (semFollowup.length > 0) items.push({ text: `${semFollowup.length} lead(s) em aberto sem follow-up agendado.`, level: 'warn' })
    const velhos = idade[4].count
    if (velhos > 0) items.push({ text: `${velhos} lead(s) parados há mais de 60 dias — vale decidir entre retomar ou marcar como perdido.`, level: 'info' })
    if (taxaPerda > 40 && leadsNoPeriodo.length >= 5) items.push({ text: `${fmtPct(taxaPerda)} dos leads do período foram perdidos.`, level: 'danger' })
    if (taxaAnterior > 0 && taxaConversao < taxaAnterior * 0.7) items.push({ text: `A conversão caiu de ${fmtPct(taxaAnterior)} para ${fmtPct(taxaConversao)} em relação ao período anterior.`, level: 'warn' })
    return items
  }, [followAtrasado.length, semFollowup.length, idade, taxaPerda, leadsNoPeriodo.length, taxaAnterior, taxaConversao])

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  const spark = (k: 'leads' | 'clientes' | 'conversao' | 'contratado') => mensal.map(m => m[k] as number)

  return (
    <div className="space-y-4">
      <AttentionPanel items={attention} />

      <SectionTitle hint="Entrada de oportunidades e resultado do período selecionado.">Resultado do período</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard title="Leads recebidos" hint="Leads que entraram no período." value={leadsNoPeriodo.length} icon={Target} color={PAL.blue} spark={spark('leads')}
          trend={trendText(leadsNoPeriodo.length, leadsAnterior.length)} onClick={() => openLeads('Leads recebidos no período', leadsNoPeriodo)} />
        <KpiCard title="Novos clientes" hint="Clientes cadastrados no período (contratos fechados)." value={novosClientes} icon={Users} color={PAL.purple} spark={spark('clientes')}
          trend={trendText(novosClientes, clientesAnterior.length)} onClick={() => openClients('Novos clientes no período', clientesNoPeriodo)} />
        <KpiCard title="Taxa de conversão" hint="Dos leads que entraram no período, quantos já viraram cliente (coorte)." value={fmtPct(taxaConversao)} icon={TrendingUp} color={PAL.green} spark={spark('conversao')}
          trend={trendText(taxaConversao, taxaAnterior)} onClick={() => openLeads('Leads convertidos (coorte do período)', leadsNoPeriodo.filter(isConvertido))} />
        <KpiCard title="Receita contratada" hint="Soma do valor potencial dos leads que assinaram no período." value={fmtBRL(contratadoPeriodo)} icon={Handshake} color={PAL.amber} sensitive spark={spark('contratado')}
          trend={trendText(contratadoPeriodo, sum(convertidosAnterior.map(l => Number(l.potential_value ?? 0))))} onClick={() => openLeads('Contratos assinados no período', convertidosPeriodo)} />
        <KpiCard title="Ticket médio" hint="Valor potencial médio dos contratos fechados no período (só os que têm valor informado)." value={fmtBRL(ticketMedio)} icon={TrendingUp} color={PAL.teal} sensitive
          onClick={() => openLeads('Contratos considerados no ticket médio', comValor)} />
        <KpiCard title="Ciclo de venda" hint="Dias entre o primeiro contato (ou entrada do lead) e a assinatura, nos contratos fechados no período. Mediana evita distorção por casos fora da curva." value={convertidosPeriodo.length ? `${fmtNum(cicloMedio, 0)} dias` : '—'} icon={Clock} color={PAL.sky}
          trend={convertidosPeriodo.length ? `mediana ${fmtNum(cicloMediano, 0)} dias` : undefined} trendTone="neutral" onClick={() => openLeads('Contratos considerados no ciclo de venda', convertidosPeriodo)} />
        <KpiCard title="Taxa de perda" hint="Leads do período marcados como perdidos ÷ leads recebidos." value={fmtPct(taxaPerda)} icon={AlertTriangle} color={PAL.red} trendTone="down-good"
          onClick={() => openLeads('Leads perdidos no período', perdidosPeriodo)} />
        <KpiCard title="CAC" hint="Custo de aquisição: despesas da categoria Marketing no período ÷ novos clientes. Zero quando não há lançamentos de Marketing." value={fmtBRL(cac)} icon={Megaphone} color={PAL.pink} sensitive
          trend={investMarketing > 0 ? `${fmtBRL(investMarketing)} investidos · ${fmtBRL(custoPorLead)}/lead` : 'sem lançamentos de Marketing'} trendTone="neutral"
          onClick={() => detail.show('Despesas de Marketing no período', marketing.map((r, i) => ({ id: String(i), label: r.description, sublabel: fmtDate(r.date), value: fmtBRL(r.value) })))} />
        <KpiCard title="Pipeline em aberto" hint="Valor potencial de todos os leads ainda em andamento (fotografia de hoje)." value={fmtBRL(valorAberto)} icon={Layers} color={PAL.blue} sensitive
          trend={`${abertos.length} lead(s)`} trendTone="neutral" onClick={() => openLeads('Pipeline em aberto', abertos)} />
        <KpiCard title="Previsão ponderada" hint="Pipeline em aberto × chance de fechar por etapa (10% na primeira etapa, subindo até 80% na última antes da conversão). É uma estimativa, não uma promessa." value={fmtBRL(pipelinePonderado)} icon={Hourglass} color={PAL.green} sensitive
          onClick={() => openLeads('Pipeline considerado na previsão', abertos)} />
      </div>

      <SectionTitle hint="Como os leads avançam e onde se perdem.">Funil e pipeline</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Funil de conversão (leads do período)" icon={Target}>
          <FunnelBars steps={funil.map(f => ({ name: f.name, value: f.value }))}
            onSelect={name => { const f = funil.find(x => x.name === name); if (f) openLeads(`Leads que chegaram em "${name}"`, leadsNoPeriodo.filter(l => !isPerdido(l) && (stagePos.get(l.status) ?? -1) >= f.position)) }} />
          <p className="text-[11px] text-muted-foreground mt-3">Cada barra conta quem chegou naquela etapa ou além (sem perdidos). A % mostra quanto sobrou da etapa anterior.</p>
        </ChartCard>
        <ChartCard title="Pipeline agora, por etapa" icon={Layers}>
          <HBars data={porEtapa.map(e => ({ name: e.name, value: e.valor, sub: `${e.qtd} lead(s)` }))} format={fmtBRL} color={PAL.blue}
            onSelect={name => { const e = porEtapa.find(x => x.name === name); if (e) openLeads(`Leads em "${name}"`, abertos.filter(l => l.status === e.value)) }} />
          <div className="mt-4"><StatStrip items={[
            { label: 'Em aberto', value: fmtBRL(valorAberto) },
            { label: 'Ponderado', value: fmtBRL(pipelinePonderado), hint: 'Pipeline × chance de fechar por etapa' },
            { label: 'Contratado no período', value: fmtBRL(contratadoPeriodo), tone: 'good' },
            { label: 'Cobertura', value: contratadoPeriodo > 0 ? `${fmtNum(valorAberto / contratadoPeriodo, 1)}×` : '—', hint: 'Quantas vezes o pipeline em aberto cobre o que foi fechado no período' },
          ]} /></div>
        </ChartCard>
      </div>

      <ChartCard title="Leads, clientes novos e conversão (12 meses)" icon={TrendingUp}>
        <ComboChart data={mensal} format={v => String(v)} yFormat={v => String(v)} onPointClick={openMonth} series={[
          { key: 'leads', name: 'Leads', color: PAL.blue },
          { key: 'clientes', name: 'Clientes novos', color: PAL.purple },
          { key: 'conversao', name: 'Conversão (%)', color: PAL.green, kind: 'line', axis: 'right' },
        ]} />
      </ChartCard>

      <NotesPanel area="comercial" months={trendMonths} />

      <ChartCard title="Receita contratada por mês" icon={Handshake}>
        <TrendChart data={mensal.map(m => ({ month: m.month, contratado: m.contratado }))} formatValue={fmtBRL} series={[{ key: 'contratado', name: 'Contratado', color: PAL.amber }]} />
      </ChartCard>

      <SectionTitle hint="De onde vêm os clientes e quem os conduz.">Origem e equipe</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Leads por origem" icon={Megaphone}>
          <DonutWithLegend data={origens.map(o => ({ name: o.name, value: o.leads }))} formatValue={v => String(v)}
            onSelect={name => openLeads(`Leads — origem ${name}`, leadsNoPeriodo.filter(l => (l.source?.trim() || 'Não informado') === name))} />
        </ChartCard>
        <ChartCard title="Receita contratada por origem" icon={Handshake}>
          <HBars data={origens.filter(o => o.valor > 0).map(o => ({ name: o.name, value: o.valor }))} format={fmtBRL} color={PAL.amber} empty="Nenhum contrato fechado no período"
            onSelect={name => openLeads(`Contratos — origem ${name}`, convertidosPeriodo.filter(l => (l.source?.trim() || 'Não informado') === name))} />
        </ChartCard>
      </div>

      <ChartCard title="Qualidade de cada origem" icon={Megaphone}>
        <MiniTable
          columns={[
            { key: 'name', label: 'Origem' },
            { key: 'leads', label: 'Leads', align: 'right' },
            { key: 'convertidos', label: 'Fechados', align: 'right' },
            { key: 'taxa', label: 'Conversão', align: 'right', render: r => fmtPct(r.taxa) },
            { key: 'valor', label: 'Contratado', align: 'right', render: r => fmtBRL(r.valor) },
            { key: 'pipeline', label: 'Em aberto', align: 'right', render: r => fmtBRL(r.pipeline) },
          ]}
          rows={origens}
          onRowClick={r => openLeads(`Leads — origem ${r.name}`, leadsNoPeriodo.filter(l => (l.source?.trim() || 'Não informado') === r.name))} />
      </ChartCard>

      <ChartCard title="Desempenho por responsável" icon={Users}>
        <MiniTable
          columns={[
            { key: 'nome', label: 'Responsável' },
            { key: 'leads', label: 'Leads', align: 'right' },
            { key: 'abertos', label: 'Em aberto', align: 'right' },
            { key: 'fechados', label: 'Fechados', align: 'right' },
            { key: 'taxa', label: 'Conversão', align: 'right', render: r => fmtPct(r.taxa) },
            { key: 'valor', label: 'Contratado', align: 'right', render: r => fmtBRL(r.valor) },
            { key: 'atrasados', label: 'Follow-up atrasado', align: 'right', render: r => <span className={r.atrasados > 0 ? 'text-red-700 dark:text-red-300 font-semibold' : ''}>{r.atrasados}</span> },
          ]}
          rows={porResponsavel}
          onRowClick={r => openLeads(`Leads — ${r.nome}`, r._leads)} />
      </ChartCard>

      <SectionTitle hint="Onde o pipeline está esfriando e o que precisa de contato.">Cadência e saúde do pipeline</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Idade do pipeline (dias sem movimentação)" icon={Hourglass}>
          <BucketBars data={idade.map(i => ({ name: i.name, value: i.value, color: i.color, count: undefined }))} format={v => `${v} lead(s)`}
            onSelect={name => { const f = idade.find(i => i.name === name); if (f) openLeads(`Leads parados — ${name}`, f.leads) }} />
        </ChartCard>
        <ChartCard title="Follow-ups" icon={PhoneCall}>
          <StatStrip items={[
            { label: 'Atrasados', value: String(followAtrasado.length), tone: followAtrasado.length ? 'bad' : 'good' },
            { label: 'Próx. 7 dias', value: String(followProximos.length) },
            { label: 'Sem agendamento', value: String(semFollowup.length), tone: semFollowup.length ? 'bad' : 'good' },
            { label: 'Em aberto', value: String(abertos.length) },
          ]} />
          <div className="mt-4 space-y-1.5">
            {followAtrasado.sort((a, b) => (a.next_followup ?? '').localeCompare(b.next_followup ?? '')).slice(0, 6).map((l, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-xs rounded-xl border border-[var(--glass-border)] px-3 py-2">
                <span className="truncate font-medium">{l.name}</span>
                <span className="shrink-0 text-red-700 dark:text-red-300">{daysBetween(l.next_followup!, hoje)} dia(s) de atraso</span>
              </div>
            ))}
            {followAtrasado.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhum follow-up atrasado 🎉</p>}
          </div>
        </ChartCard>
      </div>

      {indicados.length > 0 && (
        <ChartCard title="Indicações" icon={Handshake}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <HBars data={porIndicador} format={v => `${v} lead(s)`} color={PAL.pink} empty="Sem indicações" />
            <StatStrip items={[
              { label: 'Leads indicados', value: String(indicados.length) },
              { label: 'Fechados', value: String(indicados.filter(isConvertido).length), tone: 'good' },
              { label: 'Conversão', value: fmtPct(pct(indicados.filter(isConvertido).length, indicados.length)) },
              { label: 'Comissão estimada', value: fmtBRL(comissaoDevida), hint: 'Valor potencial dos fechados × % de comissão de indicação' },
            ]} />
          </div>
        </ChartCard>
      )}

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
