import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Target, TrendingUp, Users } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { fmtBRL, fmtDate } from '@/lib/format'
import {
  monthsBack, usePeriod, PeriodPicker, KpiCard, ChartCard,
  DetailDialog, useDetail, AttentionPanel, type Attention, previousPeriodRange, trendText, NotesPanel,
  useResponsavelFilter, ResponsavelFilter, TrendChart,
} from './shared'

export interface Lead {
  name: string; status: string; potential_value: number | null; created_at: string
  signed_at: string | null; client_id: string | null; next_followup: string | null; source: string | null
  responsible_ids: string[] | null
}
interface ClientRow { id: string; name: string; status: string; created_at: string; responsible_ids: string[] | null; is_cortesia: boolean; is_juridico: boolean }
interface Stage { label: string; value: string; position: number }

export default function ComercialTab() {
  const [leadsRaw, setLeadsRaw] = useState<Lead[]>([])
  const [clientsRaw, setClientsRaw] = useState<ClientRow[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const period = usePeriod()
  const detail = useDetail()
  const respFilter = useResponsavelFilter()

  useEffect(() => {
    Promise.all([
      supabase.from('leads').select('name, status, potential_value, created_at, signed_at, client_id, next_followup, source, responsible_ids'),
      supabase.from('clients').select('id, name, status, created_at, responsible_ids, is_cortesia, is_juridico'),
      supabase.from('pipeline_stages').select('label, value, position').order('position'),
    ]).then(([l, c, s]) => {
      setLeadsRaw((l.data as Lead[]) ?? [])
      setClientsRaw((c.data as ClientRow[]) ?? [])
      setStages((s.data as Stage[]) ?? [])
      setLoading(false)
    })
  }, [])

  // Clientes puramente SaaS (sem questão jurídica) e casos gratuitos/cortesia
  // não entram no funil comercial jurídico -- são contados em Produto/SaaS
  // ou simplesmente não contam em métrica nenhuma, respectivamente.
  const clients = useMemo(() => clientsRaw.filter(c => respFilter.matches(c.responsible_ids) && !c.is_cortesia && c.is_juridico !== false), [clientsRaw, respFilter.responsavelId])
  const clientesExcluidosIds = useMemo(() => new Set(clientsRaw.filter(c => c.is_cortesia || c.is_juridico === false).map(c => c.id)), [clientsRaw])
  const leads = useMemo(() => leadsRaw.filter(l => respFilter.matches(l.responsible_ids) && !(l.client_id && clientesExcluidosIds.has(l.client_id))), [leadsRaw, respFilter.responsavelId, clientesExcluidosIds])

  const trendMonths = useMemo(() => monthsBack(12), [])
  const stagePos = useMemo(() => new Map(stages.map(s => [s.value, s.position])), [stages])

  const leadsAtivos = leads.filter(l => l.status !== 'perdido' && l.status !== 'convertido' && !l.client_id).length

  // Pipeline comercial: quanto já está "garantido" (contratos assinados) vs
  // provável (negociação avançada) vs todo o funil aberto — não é filtrado
  // por período, é uma fotografia do agora (igual "quanto tenho em jogo hoje").
  const propostaPos = stagePos.get('proposta_enviada') ?? Infinity
  const leadsContratados = useMemo(() => leads.filter(l => l.status === 'convertido' || l.client_id), [leads])
  const leadsAvancados = useMemo(() => leads.filter(l => l.status !== 'perdido' && l.status !== 'convertido' && !l.client_id && (stagePos.get(l.status) ?? -1) >= propostaPos), [leads, stagePos, propostaPos])
  const leadsPipelineAberto = useMemo(() => leads.filter(l => l.status !== 'perdido' && l.status !== 'convertido' && !l.client_id), [leads])
  const receitaContratada = leadsContratados.reduce((s, l) => s + Number(l.potential_value ?? 0), 0)
  const receitaProvavel = leadsAvancados.reduce((s, l) => s + Number(l.potential_value ?? 0), 0)
  const receitaPipeline = leadsPipelineAberto.reduce((s, l) => s + Number(l.potential_value ?? 0), 0)
  const leadsNoPeriodo = useMemo(() => leads.filter(l => l.created_at >= period.range.start && l.created_at <= period.range.end + 'T23:59:59'), [leads, period.range])
  const convertidosPeriodo = leadsNoPeriodo.filter(l => l.status === 'convertido' || l.client_id).length
  const taxaConversao = leadsNoPeriodo.length > 0 ? (convertidosPeriodo / leadsNoPeriodo.length) * 100 : 0
  const clientesNoPeriodo = useMemo(() => clients.filter(c => c.created_at >= period.range.start && c.created_at <= period.range.end + 'T23:59:59'), [clients, period.range])

  const prevRange = useMemo(() => previousPeriodRange(period.range.start, period.range.end), [period.range])
  const leadsPeriodoAnterior = useMemo(() => leads.filter(l => l.created_at >= prevRange.start && l.created_at <= prevRange.end + 'T23:59:59'), [leads, prevRange])
  const clientesPeriodoAnterior = useMemo(() => clients.filter(c => c.created_at >= prevRange.start && c.created_at <= prevRange.end + 'T23:59:59'), [clients, prevRange])
  const taxaConversaoAnterior = leadsPeriodoAnterior.length > 0
    ? (leadsPeriodoAnterior.filter(l => l.status === 'convertido' || l.client_id).length / leadsPeriodoAnterior.length) * 100 : 0
  const ticketMedio = useMemo(() => {
    const comValor = leadsNoPeriodo.filter(l => (l.status === 'convertido' || l.client_id) && l.potential_value)
    if (comValor.length === 0) return 0
    return comValor.reduce((s, l) => s + Number(l.potential_value), 0) / comValor.length
  }, [leadsNoPeriodo])

  // Funil ACUMULADO: quantos leads chegaram (ou passaram d)esse estágio ou além, excluindo perdidos.
  const funil = useMemo(() => {
    if (stages.length === 0) return []
    return stages
      .filter(s => s.value !== 'perdido')
      .map(s => ({
        stage: s.label, value: s.value,
        total: leadsNoPeriodo.filter(l => l.status !== 'perdido' && (stagePos.get(l.status) ?? -1) >= s.position).length,
      }))
  }, [stages, leadsNoPeriodo, stagePos])

  function openStageDetail(position: number, stageLabel: string) {
    const list = leadsNoPeriodo.filter(l => l.status !== 'perdido' && (stagePos.get(l.status) ?? -1) >= position)
    detail.show(`Leads que chegaram em "${stageLabel}"`, list.map((l, i) => ({
      id: String(i), label: l.name, sublabel: fmtDate(l.created_at),
      value: l.potential_value ? fmtBRL(Number(l.potential_value)) : undefined,
    })))
  }

  const leadsPerdidosPeriodo = leadsNoPeriodo.filter(l => l.status === 'perdido').length

  const origemData = useMemo(() => {
    const map = new Map<string, { origem: string; leads: number; convertidos: number }>()
    for (const l of leadsNoPeriodo) {
      const origem = l.source ?? 'Não informado'
      const cur = map.get(origem) ?? { origem, leads: 0, convertidos: 0 }
      cur.leads++
      if (l.status === 'convertido' || l.client_id) cur.convertidos++
      map.set(origem, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.leads - a.leads)
  }, [leadsNoPeriodo])

  function openOrigemDetail(origem: string) {
    const list = leadsNoPeriodo.filter(l => (l.source ?? 'Não informado') === origem)
    detail.show(`Leads — origem ${origem}`, list.map((l, i) => ({
      id: String(i), label: l.name, sublabel: `${fmtDate(l.created_at)} · ${l.status === 'convertido' || l.client_id ? 'Convertido' : 'Em andamento'}`,
    })))
  }

  const leadsClientesPorMes = useMemo(() => trendMonths.map(m => ({
    month: m.label,
    leads: leads.filter(l => l.created_at >= m.start && l.created_at <= m.end + 'T23:59:59').length,
    clientes: clients.filter(c => c.created_at >= m.start && c.created_at <= m.end + 'T23:59:59').length,
  })), [leads, clients, trendMonths])

  function openMonthDetail(m: { start: string; end: string; label: string }) {
    const leadRows = leads.filter(l => l.created_at >= m.start && l.created_at <= m.end + 'T23:59:59')
      .map((l, i) => ({ id: `l${i}`, label: l.name, sublabel: `Lead · ${fmtDate(l.created_at)}` }))
    const clientRows = clients.filter(c => c.created_at >= m.start && c.created_at <= m.end + 'T23:59:59')
      .map((c, i) => ({ id: `c${i}`, label: c.name, sublabel: `Cliente novo · ${fmtDate(c.created_at)}` }))
    detail.show(`Novos leads e clientes — ${m.label}`, [...leadRows, ...clientRows])
  }

  const hoje = new Date().toISOString().slice(0, 10)
  const attention = useMemo(() => {
    const items: Attention[] = []
    const semFollowup = leads.filter(l => l.status !== 'perdido' && l.status !== 'convertido' && !l.client_id && (!l.next_followup || l.next_followup < hoje)).length
    if (semFollowup > 0) items.push({ text: `${semFollowup} lead(s) sem follow-up agendado ou com follow-up atrasado.`, level: 'warn' })
    if (leadsPerdidosPeriodo > 0 && leadsNoPeriodo.length > 0 && leadsPerdidosPeriodo / leadsNoPeriodo.length > 0.4) {
      items.push({ text: `${((leadsPerdidosPeriodo / leadsNoPeriodo.length) * 100).toFixed(0)}% dos leads do período foram marcados como perdidos.`, level: 'danger' })
    }
    return items
  }, [leads, hoje, leadsPerdidosPeriodo, leadsNoPeriodo])

  function openLeadsList(title: string, list: Lead[]) {
    detail.show(title, list.map((l, i) => ({
      id: String(i), label: l.name, sublabel: `${fmtDate(l.created_at)} · ${l.status === 'convertido' || l.client_id ? 'Convertido' : l.status === 'perdido' ? 'Perdido' : 'Em andamento'}`,
      value: l.potential_value ? fmtBRL(Number(l.potential_value)) : undefined,
    })))
  }
  function openLeadsAtivosDetail() { openLeadsList('Leads ativos', leads.filter(l => l.status !== 'perdido' && l.status !== 'convertido' && !l.client_id)) }
  function openLeadsRecebidosDetail() { openLeadsList('Leads recebidos no período', leadsNoPeriodo) }
  function openConversaoDetail() { openLeadsList('Leads convertidos no período', leadsNoPeriodo.filter(l => l.status === 'convertido' || l.client_id)) }
  function openNovosClientesDetail() {
    detail.show('Novos clientes no período', clientesNoPeriodo.map((c, i) => ({ id: String(i), label: c.name, sublabel: fmtDate(c.created_at) })))
  }
  function openTicketMedioDetail() {
    openLeadsList('Contratos considerados no ticket médio', leadsNoPeriodo.filter(l => (l.status === 'convertido' || l.client_id) && l.potential_value))
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <PeriodPicker p={period} />
        <ResponsavelFilter f={respFilter} />
      </div>

      <AttentionPanel items={attention} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard title="Leads ativos" value={leadsAtivos} icon={Target} color="#3B82F6" onClick={openLeadsAtivosDetail} />
        <KpiCard title="Leads recebidos (período)" value={leadsNoPeriodo.length} icon={Target} color="#3B82F6" trend={trendText(leadsNoPeriodo.length, leadsPeriodoAnterior.length)} onClick={openLeadsRecebidosDetail} />
        <KpiCard title="Taxa de conversão" value={`${taxaConversao.toFixed(0)}%`} icon={TrendingUp} color="#22c55e" trend={trendText(taxaConversao, taxaConversaoAnterior)} onClick={openConversaoDetail} />
        <KpiCard title="Novos clientes (período)" value={clientesNoPeriodo.length} icon={Users} color="#8B5CF6" trend={trendText(clientesNoPeriodo.length, clientesPeriodoAnterior.length)} onClick={openNovosClientesDetail} />
        <KpiCard title="Ticket médio contratado" value={fmtBRL(ticketMedio)} icon={TrendingUp} color="#F59E0B" sensitive onClick={openTicketMedioDetail} />
      </div>

      <ChartCard title="Pipeline comercial (visão atual)" icon={TrendingUp}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button onClick={() => openLeadsList('Receita já contratada', leadsContratados)}
            className="text-left rounded-xl border p-3 hover:bg-muted/50 transition-colors">
            <p className="text-[11px] text-muted-foreground">Contratada</p>
            <p className="text-lg font-bold text-green-600">{fmtBRL(receitaContratada)}</p>
          </button>
          <button onClick={() => openLeadsList('Leads em negociação avançada', leadsAvancados)}
            className="text-left rounded-xl border p-3 hover:bg-muted/50 transition-colors">
            <p className="text-[11px] text-muted-foreground">Provável (negociação avançada)</p>
            <p className="text-lg font-bold text-amber-500">{fmtBRL(receitaProvavel)}</p>
          </button>
          <button onClick={() => openLeadsList('Todo o pipeline em aberto', leadsPipelineAberto)}
            className="text-left rounded-xl border p-3 hover:bg-muted/50 transition-colors">
            <p className="text-[11px] text-muted-foreground">Pipeline total em aberto</p>
            <p className="text-lg font-bold text-blue-500">{fmtBRL(receitaPipeline)}</p>
          </button>
        </div>
      </ChartCard>

      <ChartCard title="Funil de leads (acumulado)" icon={Target}>
        <div className="h-64">
          {funil.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-20">Sem leads cadastrados</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funil} layout="vertical" margin={{ left: 24 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="stage" tick={{ fontSize: 10 }} width={150} />
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="total" name="Leads" fill="#3B82F6" radius={[0, 4, 4, 0]} cursor="pointer"
                  onClick={(d: any) => openStageDetail(stagePos.get(d.value) ?? 0, d.stage)} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        {funil.length > 1 && (
          <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-muted-foreground">
            {funil.slice(0, -1).map((s, i) => {
              const next = funil[i + 1]
              const pct = s.total > 0 ? (next.total / s.total) * 100 : 0
              return <span key={s.stage}>{s.stage} → {next.stage}: <strong className="text-foreground">{pct.toFixed(0)}%</strong></span>
            })}
          </div>
        )}
      </ChartCard>

      <ChartCard title="Leads por origem" icon={Users}>
        <div className="h-56">
          {origemData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">Sem dados no período</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={origemData} layout="vertical" margin={{ left: 24 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="origem" tick={{ fontSize: 10 }} width={110} />
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="leads" name="Leads" fill="#93c5fd" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => openOrigemDetail(d.origem)} />
                <Bar dataKey="convertidos" name="Convertidos" fill="#3B82F6" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => openOrigemDetail(d.origem)} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      <ChartCard title="Novos leads e clientes por mês" icon={Target}>
        <TrendChart data={leadsClientesPorMes} series={[
          { key: 'leads', name: 'Leads', color: '#3B82F6' },
          { key: 'clientes', name: 'Clientes', color: '#8B5CF6' },
        ]} onPointClick={i => openMonthDetail(trendMonths[i])} />
      </ChartCard>

      <NotesPanel area="comercial" months={trendMonths} />

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}
