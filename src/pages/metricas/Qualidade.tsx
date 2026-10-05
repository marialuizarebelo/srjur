import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ClipboardCheck, CheckCircle2, AlertTriangle, DatabaseZap } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { fmtBRL, fmtDate } from '@/lib/format'
import { DetailDialog, useDetail } from './shared'
import { PAL, fetchAll, fetchAllSafe, useFinanceData, pct, fmtPct, todayISO, daysBetween, isCaixa } from './kit'

/*
 * Painel "Qualidade dos dados": mostra, em tempo real, o que está faltando preencher para os
 * indicadores ficarem corretos — e em qual indicador cada falta pesa. Cada linha abre a lista.
 */

interface Item { label: string; sublabel?: string; value?: string }
interface Check {
  group: string
  label: string
  /** Quais números dependem disso. */
  impact: string
  /** Onde corrigir. */
  where: string
  total: number
  bad: Item[]
  severity: 'alta' | 'media' | 'baixa'
}

type Cli = { id: string; name: string; area: string | null; origin: string | null; city: string | null; state: string | null; type: string | null; status: string; responsible_ids: string[] | null; is_juridico: boolean; is_saas: boolean; is_cortesia: boolean; inactive_reason?: string | null }
type Ld = { name: string; status: string; source: string | null; potential_value: number | null; responsible_ids: string[] | null; next_followup: string | null; signed_at: string | null; first_contact_at: string | null; client_id: string | null; lost_reason?: string | null }
type Pr = { title: string; status: string; area: string | null; filing_date: string | null; cause_value: number | null; court: string | null; instance: string | null; responsible_ids: string[] | null; client_id: string | null; closed_date: string | null }
type Dl = { title: string; status: string; tipo: string | null; process_id: string | null; responsible_ids: string[] | null }
type Tk = { title: string; status: string; responsible_ids: string[] | null; due_date: string | null }

const GRUPOS = ['Financeiro', 'Clientes', 'Comercial', 'Jurídico', 'Equipe'] as const

export function QualidadePanel() {
  const detail = useDetail()
  const { all: fin, loading: loadingFin, missing: finMissing } = useFinanceData()
  const [loading, setLoading] = useState(true)
  const [aberto, setAberto] = useState(false)
  const [clientes, setClientes] = useState<Cli[]>([])
  const [leads, setLeads] = useState<Ld[]>([])
  const [processos, setProcessos] = useState<Pr[]>([])
  const [prazos, setPrazos] = useState<Dl[]>([])
  const [tarefas, setTarefas] = useState<Tk[]>([])
  const [pendencias, setPendencias] = useState<string[]>([])

  useEffect(() => {
    (async () => {
      const [c, l, p, d, t] = await Promise.all([
        fetchAllSafe<Cli>('clients', 'id, name, area, origin, city, state, type, status, responsible_ids, is_juridico, is_saas, is_cortesia', ['inactive_reason']),
        fetchAllSafe<Ld>('leads', 'name, status, source, potential_value, responsible_ids, next_followup, signed_at, first_contact_at, client_id', ['lost_reason']),
        fetchAll<Pr>('processes', 'title, status, area, filing_date, cause_value, court, instance, responsible_ids, client_id, closed_date'),
        fetchAll<Dl>('deadlines', 'title, status, tipo, process_id, responsible_ids'),
        fetchAll<Tk>('tasks', 'title, status, responsible_ids, due_date'),
      ])
      setClientes(c.rows); setLeads(l.rows); setProcessos(p); setPrazos(d); setTarefas(t)
      // Migração pendente? (as colunas novas ainda não existem)
      const faltando: string[] = []
      if (c.missing) faltando.push('motivo/data de encerramento do cliente')
      if (l.missing) faltando.push('motivo da perda e datas do lead')
      if (finMissing) faltando.push('"entre as empresas" e tipo de custo no financeiro')
      const probe = await supabase.from('tasks').select('completed_at, business_unit').limit(1)
      if (probe.error) faltando.push('data de conclusão e unidade das tarefas')
      setPendencias(faltando)
      setLoading(false)
    })()
  }, [finMissing])

  const checks = useMemo<Check[]>(() => {
    const hoje = todayISO()
    const out: Check[] = []
    const add = (c: Omit<Check, 'bad'> & { bad: Item[] }) => out.push(c)

    /* ---- Financeiro ---- */
    const clientById = new Map(clientes.map(c => [c.id, c]))
    const fi = (r: (typeof fin)[number]): Item => ({ label: r.description, sublabel: `${fmtDate(r.date)} · ${r.category ?? 'sem categoria'}`, value: fmtBRL(r.value) })
    const recs = fin.filter(r => r.type === 'receita')
    add({ group: 'Financeiro', label: 'Lançamentos sem categoria', impact: 'DRE, receita/despesa por categoria, ponto de equilíbrio', where: 'Financeiro › editar lançamento', severity: 'alta', total: fin.length, bad: fin.filter(r => !r.category).map(fi) })
    add({ group: 'Financeiro', label: 'Receitas sem cliente vinculado', impact: 'Maiores clientes, concentração, curva ABC, inadimplência por cliente', where: 'Financeiro › Cliente', severity: 'alta', total: recs.length, bad: recs.filter(r => !r.client_id).map(fi) })
    add({ group: 'Financeiro', label: 'Receitas pagas sem forma de pagamento', impact: 'Entradas por forma de pagamento', where: 'Financeiro › Forma de pagamento', severity: 'baixa', total: recs.filter(r => r.pago > 0).length, bad: recs.filter(r => r.pago > 0 && !r.payment_method).map(fi) })
    add({ group: 'Financeiro', label: 'Lançamentos pagos sem data de pagamento', impact: 'Fluxo de caixa por data, prazo médio de recebimento', where: 'Financeiro › Data do pagamento', severity: 'media', total: fin.filter(r => r.paid).length, bad: fin.filter(r => r.paid && !r.payment_date && r.eventos.length <= 1).map(fi) })
    add({ group: 'Financeiro', label: 'Em aberto sem data de vencimento', impact: 'Inadimplência, contas a receber/pagar por idade, projeção de caixa', where: 'Financeiro › Vencimento', severity: 'alta', total: fin.filter(r => r.aberto > 0).length, bad: fin.filter(r => r.aberto > 0 && !r.due_date).map(fi) })
    add({ group: 'Financeiro', label: 'Recorrências sem série (mensalidade solta)', impact: 'MRR, churn e retenção do SaaS (cada série é uma assinatura)', where: 'Recriar a mensalidade pelo formulário (gera a série)', severity: 'media', total: fin.filter(r => r.recurrence).length, bad: fin.filter(r => r.recurrence && !r.series_id).map(fi) })
    add({
      group: 'Financeiro', label: 'Unidade provavelmente errada (cliente de uma empresa, lançamento da outra)', impact: 'Resultado por unidade, MRR, comparativo Advocacia × SaaS', where: 'Financeiro › Unidade', severity: 'alta', total: recs.filter(r => r.client_id).length,
      bad: recs.filter(r => { const c = r.client_id ? clientById.get(r.client_id) : null; if (!c) return false; return (c.is_saas && !c.is_juridico && r.business_unit !== 'saas') || (c.is_juridico && !c.is_saas && r.business_unit === 'saas') }).map(fi),
    })
    add({ group: 'Financeiro', label: 'Cobranças vencidas há mais de 90 dias', impact: 'Inadimplência (valor em risco de não ser recebido)', where: 'Cobrar / renegociar', severity: 'media', total: recs.filter(r => r.aberto > 0 && isCaixa(r)).length, bad: recs.filter(r => r.aberto > 0 && isCaixa(r) && !!r.due_date && daysBetween(r.due_date, hoje) > 90).map(r => ({ ...fi(r), value: fmtBRL(r.aberto) })) })

    /* ---- Clientes ---- */
    const ativos = clientes.filter(c => c.status === 'ativo' && !c.is_cortesia)
    const ci = (c: Cli): Item => ({ label: c.name, sublabel: c.area ?? undefined })
    add({ group: 'Clientes', label: 'Clientes ativos sem área', impact: 'Carteira por área, receita por área jurídica', where: 'Clientes › editar', severity: 'alta', total: ativos.filter(c => c.is_juridico).length, bad: ativos.filter(c => c.is_juridico && !c.area).map(ci) })
    add({ group: 'Clientes', label: 'Clientes ativos sem origem', impact: 'De onde vêm os clientes', where: 'Clientes › Origem', severity: 'media', total: ativos.length, bad: ativos.filter(c => !c.origin).map(ci) })
    add({ group: 'Clientes', label: 'Clientes ativos sem responsável', impact: 'Carteira e receita por responsável', where: 'Clientes › Responsável', severity: 'media', total: ativos.length, bad: ativos.filter(c => !c.responsible_ids?.length).map(ci) })
    add({ group: 'Clientes', label: 'Clientes sem unidade (nem jurídico nem SaaS)', impact: 'Aparecem em nenhuma visão (Advocacia/SaaS) das métricas', where: 'Clientes › Unidades de negócio', severity: 'alta', total: clientes.length, bad: clientes.filter(c => !c.is_juridico && !c.is_saas).map(ci) })
    add({ group: 'Clientes', label: 'Clientes ativos sem cidade/UF', impact: 'Mapa da carteira (UF e cidade)', where: 'Clientes › Endereço', severity: 'baixa', total: ativos.length, bad: ativos.filter(c => !c.state || !c.city).map(ci) })
    add({ group: 'Clientes', label: 'Clientes sem tipo (pessoa física/jurídica)', impact: 'Carteira PF × PJ', where: 'Clientes › Tipo', severity: 'baixa', total: ativos.length, bad: ativos.filter(c => !c.type).map(ci) })
    add({ group: 'Clientes', label: 'Clientes encerrados sem motivo', impact: 'Por que clientes saem (churn)', where: 'Clientes › Motivo do encerramento', severity: 'media', total: clientes.filter(c => c.status === 'inativo').length, bad: clientes.filter(c => c.status === 'inativo' && !c.inactive_reason).map(ci) })
    const recorrentesPorCliente = new Set(fin.filter(r => r.type === 'receita' && r.recurrence && r.client_id).map(r => r.client_id!))
    add({ group: 'Clientes', label: 'Clientes SaaS ativos sem mensalidade lançada', impact: 'MRR (a licença do cliente não está sendo contada)', where: 'Financeiro › lançar mensalidade recorrente', severity: 'alta', total: ativos.filter(c => c.is_saas).length, bad: ativos.filter(c => c.is_saas && !recorrentesPorCliente.has(c.id)).map(ci) })

    /* ---- Comercial ---- */
    const abertos = leads.filter(l => l.status !== 'convertido' && l.status !== 'perdido' && !l.client_id)
    const li = (l: Ld): Item => ({ label: l.name, sublabel: l.source ?? undefined, value: l.potential_value ? fmtBRL(Number(l.potential_value)) : undefined })
    add({ group: 'Comercial', label: 'Leads sem origem', impact: 'Leads e receita por origem, qualidade de cada canal', where: 'Clientes › Leads › Origem', severity: 'alta', total: leads.length, bad: leads.filter(l => !l.source).map(li) })
    add({ group: 'Comercial', label: 'Leads em aberto sem valor potencial', impact: 'Pipeline, previsão ponderada, ticket médio', where: 'Leads › Valor potencial', severity: 'alta', total: abertos.length, bad: abertos.filter(l => !l.potential_value).map(li) })
    add({ group: 'Comercial', label: 'Leads sem responsável', impact: 'Desempenho por responsável', where: 'Leads › Responsável', severity: 'media', total: leads.length, bad: leads.filter(l => !l.responsible_ids?.length).map(li) })
    add({ group: 'Comercial', label: 'Leads em aberto sem follow-up agendado', impact: 'Cadência e leads esquecidos', where: 'Leads › Próximo follow-up', severity: 'media', total: abertos.length, bad: abertos.filter(l => !l.next_followup).map(li) })
    add({ group: 'Comercial', label: 'Leads perdidos sem motivo', impact: 'Por que perdemos leads', where: 'Leads › Motivo da perda', severity: 'media', total: leads.filter(l => l.status === 'perdido').length, bad: leads.filter(l => l.status === 'perdido' && !l.lost_reason).map(li) })
    add({ group: 'Comercial', label: 'Leads convertidos sem data de assinatura', impact: 'Receita contratada por mês, ciclo de venda', where: 'Leads › Data de assinatura', severity: 'alta', total: leads.filter(l => l.status === 'convertido' || l.client_id).length, bad: leads.filter(l => (l.status === 'convertido' || l.client_id) && !l.signed_at).map(li) })
    add({ group: 'Comercial', label: 'Leads sem data do primeiro contato', impact: 'Ciclo de venda', where: 'Leads › Primeiro contato', severity: 'baixa', total: leads.length, bad: leads.filter(l => !l.first_contact_at).map(li) })

    /* ---- Jurídico ---- */
    const ativosP = processos.filter(p => p.status === 'em_andamento')
    const pi = (p: Pr): Item => ({ label: p.title, sublabel: p.area ?? undefined })
    add({ group: 'Jurídico', label: 'Processos sem área', impact: 'Acervo e receita por área jurídica', where: 'Processos › editar', severity: 'alta', total: processos.length, bad: processos.filter(p => !p.area).map(pi) })
    add({ group: 'Jurídico', label: 'Processos sem data de distribuição', impact: 'Entrada de processos, idade do acervo, duração', where: 'Processos › Data de distribuição', severity: 'alta', total: processos.length, bad: processos.filter(p => !p.filing_date).map(pi) })
    add({ group: 'Jurídico', label: 'Processos ativos sem valor da causa', impact: 'Valor das causas ativas', where: 'Processos › Valor da causa', severity: 'media', total: ativosP.length, bad: ativosP.filter(p => !p.cause_value).map(pi) })
    add({ group: 'Jurídico', label: 'Processos ativos sem tribunal ou instância', impact: 'Distribuição por tribunal e instância', where: 'Processos › Tribunal / Instância', severity: 'baixa', total: ativosP.length, bad: ativosP.filter(p => !p.court || !p.instance).map(pi) })
    add({ group: 'Jurídico', label: 'Processos sem responsável', impact: 'Carga por responsável', where: 'Processos › Responsável', severity: 'media', total: processos.length, bad: processos.filter(p => !p.responsible_ids?.length).map(pi) })
    add({ group: 'Jurídico', label: 'Processos sem cliente', impact: 'Receita por processo e por cliente', where: 'Processos › Cliente', severity: 'media', total: processos.length, bad: processos.filter(p => !p.client_id).map(pi) })
    add({ group: 'Jurídico', label: 'Encerrados sem data de encerramento', impact: 'Duração média, processos encerrados no período', where: 'Processos › Encerramento', severity: 'alta', total: processos.filter(p => p.status === 'concluido' || p.status === 'arquivado').length, bad: processos.filter(p => (p.status === 'concluido' || p.status === 'arquivado') && !p.closed_date).map(pi) })
    add({ group: 'Jurídico', label: 'Prazos sem tipo', impact: 'Prazos por tipo', where: 'Prazos › Tipo', severity: 'baixa', total: prazos.length, bad: prazos.filter(d => !d.tipo).map(d => ({ label: d.title })) })
    add({ group: 'Jurídico', label: 'Prazos sem processo vinculado', impact: 'Processos sem prazo futuro, prazos por processo', where: 'Prazos › Processo', severity: 'media', total: prazos.length, bad: prazos.filter(d => !d.process_id).map(d => ({ label: d.title })) })

    /* ---- Equipe ---- */
    add({ group: 'Equipe', label: 'Prazos sem responsável', impact: 'Cumprimento e carga por responsável', where: 'Prazos › Responsável', severity: 'alta', total: prazos.length, bad: prazos.filter(d => !d.responsible_ids?.length).map(d => ({ label: d.title })) })
    add({ group: 'Equipe', label: 'Tarefas pendentes sem responsável', impact: 'Carga da equipe', where: 'Tarefas › Responsável', severity: 'media', total: tarefas.filter(t => t.status === 'pendente').length, bad: tarefas.filter(t => t.status === 'pendente' && !t.responsible_ids?.length).map(t => ({ label: t.title })) })
    add({ group: 'Equipe', label: 'Tarefas pendentes sem data limite', impact: 'Atraso, carga futura, taxa de conclusão', where: 'Tarefas › Data limite', severity: 'media', total: tarefas.filter(t => t.status === 'pendente').length, bad: tarefas.filter(t => t.status === 'pendente' && !t.due_date).map(t => ({ label: t.title })) })
    return out
  }, [fin, clientes, leads, processos, prazos, tarefas])

  if (loading || loadingFin) return null

  const comTotal = checks.filter(c => c.total > 0)
  const nota = comTotal.length ? 100 - (comTotal.reduce((s, c) => s + pct(c.bad.length, c.total), 0) / comTotal.length) : 100
  const comProblema = checks.filter(c => c.bad.length > 0).sort((a, b) => (a.severity === b.severity ? b.bad.length - a.bad.length : a.severity === 'alta' ? -1 : b.severity === 'alta' ? 1 : a.severity === 'media' ? -1 : 1))
  const totalFaltas = comProblema.reduce((s, c) => s + c.bad.length, 0)
  const cor = nota >= 90 ? PAL.green : nota >= 75 ? PAL.amber : PAL.red
  const mostrados = aberto ? comProblema : comProblema.slice(0, 4)
  const sevCor = { alta: PAL.red, media: PAL.amber, baixa: PAL.gray }

  return (
    <Card className="p-4 space-y-3">
      <button className="w-full flex items-center justify-between gap-3 text-left" onClick={() => setAberto(a => !a)}>
        <span className="flex items-center gap-2 min-w-0">
          <ClipboardCheck className="h-4 w-4 shrink-0" style={{ color: cor }} />
          <span className="font-semibold text-sm">Qualidade dos dados</span>
          <span className="text-xs text-muted-foreground truncate">
            {comProblema.length === 0 ? 'tudo preenchido' : `${totalFaltas} campo(s) para completar em ${comProblema.length} ponto(s)`}
          </span>
        </span>
        <span className="flex items-center gap-3 shrink-0">
          <span className="font-display text-xl" style={{ color: cor }}>{fmtPct(nota)}</span>
          {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </span>
      </button>
      <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${nota}%`, backgroundColor: cor }} /></div>

      {pendencias.length > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] px-3 py-2 text-xs">
          <DatabaseZap className="h-4 w-4 mt-0.5 shrink-0" style={{ color: PAL.amber }} />
          <span>Falta rodar a <strong>migration_metricas_dados.sql</strong> no Supabase para liberar: {pendencias.join('; ')}.</span>
        </div>
      )}

      {comProblema.length === 0 ? (
        <p className="text-sm flex items-center gap-2 text-green-700 dark:text-green-300"><CheckCircle2 className="h-4 w-4" />Nenhuma falta de dado encontrada.</p>
      ) : (
        <div className="space-y-1.5">
          {mostrados.map((c, i) => (
            <button key={i} type="button" onClick={() => detail.show(c.label, c.bad.slice(0, 300).map((b, j) => ({ id: String(j), label: b.label, sublabel: b.sublabel, value: b.value })))}
              className="w-full text-left rounded-2xl border border-[var(--glass-border)] px-3 py-2 hover:bg-[var(--glass-surface)] transition-colors">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: sevCor[c.severity] }} />
                  <span className="text-sm font-medium truncate">{c.label}</span>
                </span>
                <span className="text-xs font-semibold shrink-0" style={{ color: sevCor[c.severity] }}>{c.bad.length} de {c.total}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 pl-5">{c.group} · pesa em: {c.impact} · corrigir em: {c.where}</p>
            </button>
          ))}
          {!aberto && comProblema.length > 4 && (
            <button className="text-xs underline decoration-dotted text-muted-foreground hover:text-foreground" onClick={() => setAberto(true)}>ver os outros {comProblema.length - 4} pontos</button>
          )}
        </div>
      )}

      {aberto && (
        <div className="pt-1 text-[11px] text-muted-foreground">
          {GRUPOS.map(g => {
            const cs = checks.filter(c => c.group === g && c.total > 0)
            if (cs.length === 0) return null
            const ok = pct(cs.reduce((s, c) => s + (c.total - c.bad.length), 0), cs.reduce((s, c) => s + c.total, 0))
            return <span key={g} className="mr-4 inline-block">{g}: <strong className="text-foreground">{fmtPct(ok)}</strong> completo</span>
          })}
        </div>
      )}
      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </Card>
  )
}
