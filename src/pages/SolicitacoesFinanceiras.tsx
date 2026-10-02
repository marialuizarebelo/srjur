import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { ClientCombobox } from '@/components/ClientCombobox'
import { useProfilesMap, getAdminProfiles } from '@/components/ResponsibleSelect'
import { Send, Receipt, Clock, CheckCircle2, XCircle, Check, X, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { fmtBRL, fmtDate } from '@/lib/format'

const CATEGORIES_RECEITA = ['Honorários Iniciais', 'Mensalidade', 'Acordo', 'Consultoria', 'Êxito', 'Outros']
const CATEGORIES_DESPESA = ['Operacional', 'Pessoal', 'Pró-labore/Salário', 'Impostos', 'Software', 'Marketing', 'Aluguel', 'Outros']
const PAYMENT_METHODS = ['PIX/Transferência', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro']
const PARTNERSHIP_CATEGORY = 'Parceria'
const RECURRENCE_OPTIONS = ['Única', 'Semanal', 'Quinzenal', 'Mensal', 'Trimestral', 'Semestral', 'Anual']

// Soma meses mantendo o mesmo dia do mês (ex: todo dia 5) — mesmo helper usado no Financeiro.
function addMonthsFixedDay(dateStr: string, monthsToAdd: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const totalMonths = (m - 1) + monthsToAdd
  const targetYear = y + Math.floor(totalMonths / 12)
  const targetMonth = ((totalMonths % 12) + 12) % 12
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate()
  const clampedDay = Math.min(d, lastDayOfTargetMonth)
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

interface ClientOption { id: string; name: string }

interface FinanceRequest {
  id: string
  type: string
  category: string | null
  description: string
  value: number
  client_id: string | null
  due_date: string | null
  payment_method: string | null
  notes: string | null
  status: string
  created_by: string | null
  tenant_id: string
  reviewed_at: string | null
  created_at: string
  giovanna_pct: number | null
  reviewed_by: string | null
  finance_id: string | null
  installments: number | null
  recurrence: string | null
  card_fee_percent: number | null
}

interface FinanceRow {
  id: string
  type: string
  value: number
  paid: boolean
  due_date: string | null
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  pendente: { label: 'Aguardando aprovação', color: '#F59E0B', icon: Clock },
  aprovado: { label: 'Aprovado — já lançado', color: '#10B981', icon: CheckCircle2 },
  rejeitado: { label: 'Rejeitado', color: '#EF4444', icon: XCircle },
}

export default function SolicitacoesFinanceiras() {
  const { profile } = useAuth()
  const profilesMap = useProfilesMap()
  const [clients, setClients] = useState<ClientOption[]>([])
  const [requests, setRequests] = useState<FinanceRequest[]>([])
  const [partnershipFinance, setPartnershipFinance] = useState<FinanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState<FinanceRequest | null>(null)
  const [detailRows, setDetailRows] = useState<{ id: string; description: string; value: number; due_date: string | null; paid: boolean; current_installment: number | null }[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  async function openDetail(r: FinanceRequest) {
    setDetail(r)
    setDetailRows([])
    if (r.status !== 'aprovado' || !r.finance_id) return
    setDetailLoading(true)
    const { data: first } = await supabase.from('finance').select('id, series_id').eq('id', r.finance_id).maybeSingle()
    if (first) {
      const q = supabase.from('finance').select('id, description, value, due_date, paid, current_installment')
      const { data } = first.series_id
        ? await q.eq('series_id', first.series_id).order('current_installment')
        : await q.eq('id', first.id)
      setDetailRows((data as typeof detailRows) ?? [])
    }
    setDetailLoading(false)
  }

  // "Meu nome" e "nome da outra parte" — resolvidos dinamicamente pelo tenant_id
  // (que é o profile.id de quem é dona daquele tenant), então funciona pros
  // dois lados sem hardcode de quem é quem.
  const myName = (profile && profilesMap[profile.tenant_id ?? '']?.display_name) || 'você'

  const [form, setForm] = useState({
    type: 'receita', category: '', description: '', value: '', client_id: '',
    due_date: '', payment_method: '', notes: '', my_pct: '50',
    recurrence: 'Única', installments: '1', card_fee_percent: '',
  })

  const loadData = async () => {
    setLoading(true)
    const [{ data: c }, { data: r }, { data: pf }] = await Promise.all([
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('finance_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('finance').select('id, type, value, paid, due_date').eq('category', PARTNERSHIP_CATEGORY),
    ])
    setClients((c as ClientOption[]) ?? [])
    setRequests((r as FinanceRequest[]) ?? [])
    setPartnershipFinance((pf as FinanceRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const resetForm = () => setForm({
    type: 'receita', category: '', description: '', value: '', client_id: '',
    due_date: '', payment_method: '', notes: '', my_pct: '50',
    recurrence: 'Única', installments: '1', card_fee_percent: '',
  })

  const submit = async () => {
    if (!form.description.trim()) { toast.error('Preencha a descrição'); return }
    const value = parseFloat(form.value.replace(',', '.'))
    if (!value || value <= 0) { toast.error('Preencha um valor válido'); return }
    const myPct = parseFloat(form.my_pct.replace(',', '.'))
    if (isNaN(myPct) || myPct < 0 || myPct > 100) { toast.error('Sua % precisa estar entre 0 e 100'); return }
    if (saving) return
    const numInstallments = parseInt(form.installments) || 1
    setSaving(true)
    try {
      const { error } = await supabase.from('finance_requests').insert({
        type: form.type, category: form.category || null, description: form.description,
        value, client_id: form.client_id || null, due_date: form.due_date || null,
        payment_method: form.payment_method || null, notes: form.notes || null,
        giovanna_pct: myPct, created_by: profile?.id ?? null, tenant_id: profile?.tenant_id ?? null,
        recurrence: form.recurrence === 'Única' ? null : form.recurrence,
        installments: numInstallments > 1 ? numInstallments : null,
        card_fee_percent: form.payment_method === 'Cartão de Crédito' && numInstallments > 1 && form.recurrence === 'Única'
          ? (parseFloat((form.card_fee_percent || '').replace(',', '.')) || 0) : null,
      })
      if (error) { toast.error('Erro ao enviar: ' + error.message); return }
      toast.success('Solicitação enviada — a outra parte vai revisar e lançar no financeiro dela')
      resetForm()
      loadData()
    } finally {
      setSaving(false)
    }
  }

  const approve = async (r: FinanceRequest) => {
    // O valor de "requesterPct" é a fatia de quem PEDIU (guardado em giovanna_pct
    // por motivo histórico) — quem está aprovando lança no financeiro dela só a
    // fatia que sobra, já que a fatia de quem pediu fica só registrada aqui.
    const requesterName = profilesMap[r.tenant_id]?.display_name ?? 'quem pediu'
    const requesterPct = r.giovanna_pct ?? 50
    const numInstallments = r.installments ?? 1
    // Mesma distinção do Financeiro: cartão parcelado é 1 lançamento único e líquido
    // (a operadora repassa tudo de uma vez, menos a taxa) — diferente de mensalidade
    // (valor cheio se repete a cada ciclo) e de parcelamento normal (valor total dividido).
    const isCardLumpSum = r.payment_method === 'Cartão de Crédito' && numInstallments > 1 && !r.recurrence
    const isRecurring = !!r.recurrence && numInstallments > 1
    const feePercent = r.card_fee_percent || 0
    const grossTotal = isCardLumpSum ? r.value * (1 - feePercent / 100) : r.value
    const occurrenceTotal = isCardLumpSum ? grossTotal : (isRecurring ? r.value : r.value / numInstallments)
    const myShare = occurrenceTotal * (100 - requesterPct) / 100
    const requesterShare = occurrenceTotal * requesterPct / 100
    const recurrenceInfo = isCardLumpSum
      ? `\n\nCartão parcelado ${numInstallments}x: operadora repassa ${fmtBRL(grossTotal)} líquido de uma vez (taxa ${feePercent}%)`
      : numInstallments > 1
        ? `\n\n${isRecurring ? `Recorrência: ${r.recurrence}, ${numInstallments} ciclo(s)` : `Parcelamento: ${numInstallments}x`}, cada ciclo de ${fmtBRL(occurrenceTotal)} total`
        : ''
    if (!confirm(`Aprovar "${r.description}"?\n\nValor total: ${fmtBRL(r.value)}\nParte de ${requesterName} (${requesterPct}%): ${fmtBRL(requesterShare)}\nSua parte (${100 - requesterPct}%): ${fmtBRL(myShare)}${recurrenceInfo}\n\nSerá lançado no seu Financeiro só a sua parte, na categoria "Parceria".`)) return
    const splitNote = `Solicitação de ${requesterName} — valor total ${fmtBRL(r.value)}, dividido ${requesterPct}% ${requesterName} / ${100 - requesterPct}% ${myName}. Este lançamento reflete só a sua parte.`
    const todayStr = new Date().toISOString().slice(0, 10)
    const baseDate = r.due_date || todayStr
    const effectiveInstallments = isCardLumpSum ? 1 : numInstallments
    const seriesId = effectiveInstallments > 1 ? crypto.randomUUID() : undefined

    const rows = Array.from({ length: effectiveInstallments }, (_, i) => {
      const occurrenceDate = effectiveInstallments > 1 ? addMonthsFixedDay(baseDate, i) : baseDate
      return {
        type: r.type, category: PARTNERSHIP_CATEGORY,
        description: isCardLumpSum
          ? `${r.description} (${numInstallments}x no cartão)`
          : (effectiveInstallments > 1 ? `${r.description} (${i + 1}/${effectiveInstallments})` : r.description),
        value: myShare,
        client_id: r.client_id, due_date: occurrenceDate, date: occurrenceDate,
        payment_method: r.payment_method, notes: [r.notes, splitNote].filter(Boolean).join('\n\n'),
        responsible: `Solicitado por ${requesterName}`,
        tenant_id: profile?.tenant_id ?? null,
        // Cliente precisa ver o serviço como valor único (a divisão é interna entre as
        // partes) — então, quando há cliente vinculado, esta fatia entra visível no
        // portal dele, junto com a fatia da outra parte, somando o valor total pago.
        portal_visible: !!r.client_id,
        recurrence: isCardLumpSum ? null : r.recurrence,
        installments: effectiveInstallments > 1 ? effectiveInstallments : null,
        current_installment: effectiveInstallments > 1 ? i + 1 : null,
        series_id: seriesId,
        card_fee_percent: isCardLumpSum && feePercent > 0 ? feePercent : null,
        nature: occurrenceDate <= todayStr ? 'real' : 'previsto',
      }
    })

    const { data: financeRows, error: financeError } = await supabase.from('finance').insert(rows).select('id')
    if (financeError) { toast.error('Erro ao lançar no financeiro: ' + financeError.message); return }
    const { error: updateError } = await supabase.from('finance_requests').update({
      status: 'aprovado', reviewed_by: profile?.id ?? null, reviewed_at: new Date().toISOString(),
      finance_id: financeRows?.[0]?.id ?? null,
    }).eq('id', r.id)
    if (updateError) { toast.error('Lançado, mas erro ao atualizar a solicitação: ' + updateError.message); return }

    // Mensalidade com prazo definido: cria uma tarefa pra verificar a renovação perto
    // do último ciclo previsto, igual ao Financeiro.
    if (isRecurring && r.category === 'Mensalidade') {
      const lastDueDate = addMonthsFixedDay(baseDate, numInstallments - 1)
      const checkDate = addDaysToDate(lastDueDate, -7)
      const admins = await getAdminProfiles()
      await supabase.from('tasks').insert({
        title: `Verificar renovação de mensalidade (parceria) — ${r.description}`,
        description: `A mensalidade "${r.description}" prevista até ${fmtDate(lastDueDate)} está terminando. Confirmar com o cliente se vai renovar.`,
        type: 'cliente', status: 'pendente', priority: 'media', due_date: checkDate,
        client_id: r.client_id, responsible_ids: admins.map(a => a.id),
        created_by: profile?.id ?? null, tenant_id: profile?.tenant_id ?? null,
      })
    }

    toast.success('Aprovado e lançado no financeiro!')
    loadData()
  }

  const reject = async (r: FinanceRequest) => {
    if (!confirm(`Rejeitar "${r.description}"?`)) return
    const { error } = await supabase.from('finance_requests').update({
      status: 'rejeitado', reviewed_by: profile?.id ?? null, reviewed_at: new Date().toISOString(),
    }).eq('id', r.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Solicitação rejeitada')
    loadData()
  }

  // Enviadas por mim (do meu tenant) vs. recebidas da outra parte (esperando eu revisar).
  const sentByMe = requests.filter(r => r.tenant_id === profile?.tenant_id)
  const receivedFromOther = requests.filter(r => r.tenant_id !== profile?.tenant_id)
  const pendingToReview = receivedFromOther.filter(r => r.status === 'pendente')

  function RequestCard({ r, showActions }: { r: FinanceRequest; showActions: boolean }) {
    const status = STATUS_MAP[r.status] ?? STATUS_MAP.pendente
    const Icon = status.icon
    const client = clients.find(c => c.id === r.client_id)
    const fromName = profilesMap[r.tenant_id]?.display_name
    return (
      <Card className="p-4 cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--foreground)_5%,var(--card))]" onClick={() => openDetail(r)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium truncate">{r.description}</p>
              {fromName && (
                <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-purple-300 text-purple-600 dark:text-purple-400">
                  De {fromName}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {r.type === 'receita' ? 'Receita' : 'Despesa'}{r.category ? ` · ${r.category}` : ''}{client ? ` · ${client.name}` : ''}{r.due_date ? ` · vence ${fmtDate(r.due_date)}` : ''}
              {r.giovanna_pct != null && ` · ${fromName ?? 'quem pediu'} ${r.giovanna_pct}% / ${myName} ${100 - r.giovanna_pct}%`}
              {r.installments && r.installments > 1 && ` · ${r.recurrence ? `${r.recurrence}, ${r.installments}x` : `${r.installments}x parcelado`}`}
            </p>
            {r.notes && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-2">{r.notes}</p>}
            <p className="text-[11px] text-primary mt-1.5">Ver detalhes</p>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-sm font-semibold ${r.type === 'receita' ? 'text-green-600' : 'text-red-500'}`}>{fmtBRL(r.value)}</p>
            <Badge className="text-[10px] mt-1 gap-1" style={{ backgroundColor: `${status.color}22`, color: status.color }}>
              <Icon className="h-3 w-3" />{status.label}
            </Badge>
          </div>
        </div>
        {showActions && (
          <div className="flex gap-2 mt-3 pt-3 border-t" onClick={e => e.stopPropagation()}>
            <Button size="sm" variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => reject(r)}>
              <X className="h-3.5 w-3.5 mr-1.5" />Rejeitar
            </Button>
            <Button size="sm" className="flex-1" onClick={() => approve(r)}>
              <Check className="h-3.5 w-3.5 mr-1.5" />Aprovar e lançar
            </Button>
          </div>
        )}
      </Card>
    )
  }

  function DetailDialog() {
    const r = detail
    if (!r) return null
    const status = STATUS_MAP[r.status] ?? STATUS_MAP.pendente
    const Icon = status.icon
    const client = clients.find(c => c.id === r.client_id)
    const fromName = profilesMap[r.tenant_id]?.display_name ?? 'Quem pediu'
    const otherName = r.tenant_id === profile?.tenant_id ? 'Outra parte' : myName
    const n = r.installments ?? 1
    const pct = r.giovanna_pct ?? 50
    const isCardLumpSum = r.payment_method === 'Cartão de Crédito' && n > 1 && !r.recurrence
    const isRecurring = !!r.recurrence && n > 1
    const fee = r.card_fee_percent || 0
    const perCycle = isCardLumpSum ? r.value * (1 - fee / 100) : isRecurring ? r.value : r.value / n
    const reqShare = perCycle * pct / 100
    const otherShare = perCycle - reqShare
    const reviewer = r.reviewed_by ? profilesMap[r.reviewed_by]?.display_name : null
    const modo = isCardLumpSum
      ? `Cartão em ${n}x — a operadora repassa ${fmtBRL(perCycle)} líquido de uma vez (taxa ${fee}%)`
      : isRecurring
        ? `Mensalidade (${r.recurrence}) — ${n} lançamentos de ${fmtBRL(perCycle)}; o valor cheio se repete`
        : n > 1
          ? `Parcelado em ${n}x de ${fmtBRL(perCycle)} (total dividido)`
          : 'À vista — pagamento único'
    const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
      <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--glass-border)] last:border-0">
        <span className="text-xs text-muted-foreground shrink-0">{label}</span>
        <span className="text-sm text-right">{children}</span>
      </div>
    )
    return (
      <Dialog open onOpenChange={v => { if (!v) setDetail(null) }}>
        <DialogContent className="max-w-[560px] w-[96vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-6">{r.description}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <p className={`text-2xl font-bold ${r.type === 'receita' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>{fmtBRL(r.value)}</p>
            <Badge className="gap-1" style={{ backgroundColor: `${status.color}22`, color: status.color }}>
              <Icon className="h-3 w-3" />{status.label}
            </Badge>
          </div>
          <div>
            <Row label="Tipo">{r.type === 'receita' ? 'Receita' : 'Despesa'}{r.category ? ` · ${r.category}` : ''}</Row>
            <Row label="Enviada por">{fromName}</Row>
            <Row label="Cliente">{client?.name ?? '—'}</Row>
            <Row label="1º vencimento">{r.due_date ? fmtDate(r.due_date) : '—'}</Row>
            <Row label="Forma de pagamento">{r.payment_method ?? '—'}</Row>
            <Row label="Como será cobrado">{modo}</Row>
            <Row label={`Divisão (${fromName} ${pct}% / ${otherName} ${100 - pct}%)`}>
              {n > 1 ? 'por parcela: ' : ''}{fromName} {fmtBRL(reqShare)} · {otherName} {fmtBRL(otherShare)}
            </Row>
            <Row label="Enviada em">{fmtDate(r.created_at.slice(0, 10))}</Row>
            {r.reviewed_at && <Row label={r.status === 'aprovado' ? 'Aprovada em' : 'Revisada em'}>{fmtDate(r.reviewed_at.slice(0, 10))}{reviewer ? ` por ${reviewer}` : ''}</Row>}
          </div>
          {r.notes && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Observações</p>
              <p className="text-sm whitespace-pre-wrap rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] p-3">{r.notes}</p>
            </div>
          )}
          {r.status === 'aprovado' && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Lançamentos gerados</p>
              {detailLoading ? (
                <p className="text-xs text-muted-foreground">Carregando...</p>
              ) : detailRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum lançamento encontrado — pode ter sido excluído do financeiro.</p>
              ) : (
                <div className="space-y-1.5">
                  {detailRows.map(d => (
                    <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--glass-border)] px-3 py-2 text-xs">
                      <span className="truncate">{d.current_installment ? `Parcela ${d.current_installment} · ` : ''}{d.due_date ? `venc. ${fmtDate(d.due_date)}` : 'sem vencimento'}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="font-semibold">{fmtBRL(Number(d.value))}</span>
                        <Badge className={d.paid ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}>{d.paid ? 'Pago' : 'Pendente'}</Badge>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <DetailDialog />
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Receipt className="h-6 w-6" />Solicitações Financeiras</h1>
        <p className="text-sm text-muted-foreground">
          Pra despesas/receitas da parceria que precisam ser divididas por porcentagem com aprovação da outra parte antes de virar lançamento oficial.
          Se é só um valor único compartilhado (sem dividir), cadastre direto no Financeiro e marque a outra pessoa em "Compartilhar com".
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold text-sm">Nova solicitação</h2>
        <div className="flex gap-2">
          <Button variant={form.type === 'receita' ? 'default' : 'outline'} className="flex-1" onClick={() => setForm(f => ({ ...f, type: 'receita', category: '' }))}>Receita (entrada)</Button>
          <Button variant={form.type === 'despesa' ? 'default' : 'outline'} className="flex-1" onClick={() => setForm(f => ({ ...f, type: 'despesa', category: '' }))}>Despesa (saída)</Button>
        </div>

        <div className="space-y-2">
          <Label>Descrição *</Label>
          <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Honorários Iniciais — Fulana da Silva" className="h-10" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>
              {form.recurrence !== 'Única'
                ? 'Valor de cada ciclo da mensalidade — o que o cliente paga (R$) *'
                : (parseInt(form.installments) || 1) > 1
                  ? 'Valor total do serviço, a dividir nas parcelas (R$) *'
                  : 'Valor total do serviço — o que o cliente paga (R$) *'}
            </Label>
            <Input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0,00" className="h-10" />
            <p className="text-[11px] text-muted-foreground">Informe o valor integral contratado com o cliente, não a sua parte. A divisão percentual abaixo calcula automaticamente a fatia de cada uma.</p>
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({
              ...f,
              category: v,
              // Mensalidade é sempre recorrente — assume mensal e projeta os próximos
              // 12 ciclos como previsto, igual ao Financeiro.
              recurrence: v === 'Mensalidade' ? 'Mensal' : f.recurrence,
              installments: v === 'Mensalidade' && f.installments === '1' ? '12' : f.installments,
            }))}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(form.type === 'receita' ? CATEGORIES_RECEITA : CATEGORIES_DESPESA).map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {form.recurrence === 'Mensal' && (
          <div className="p-3 rounded-xl bg-muted/30 space-y-2">
            <Label className="text-xs">Como {form.type === 'receita' ? 'a mensalidade é cobrada' : 'essa despesa é paga'}?</Label>
            <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v }))}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Boleto">Boleto — {form.type === 'receita' ? 'a pessoa precisa pagar' : 'vocês precisam pagar'} todo mês</SelectItem>
                <SelectItem value="PIX/Transferência">PIX/Transferência — {form.type === 'receita' ? 'a pessoa precisa mandar' : 'vocês precisam mandar'} todo mês</SelectItem>
                <SelectItem value="Cartão de Crédito">Cartão de Crédito recorrente (assinatura) — debita automático todo mês</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Isso vai lançar {form.installments || 12} meses como previsto, um por mês, no mesmo dia do vencimento (o valor se repete inteiro em cada mês, não é dividido) — cada mês precisa ser confirmado como pago conforme for entrando.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{(parseInt(form.installments) || 1) > 1 ? 'Primeiro vencimento' : 'Vencimento'}</Label>
            <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="h-10" />
            {(parseInt(form.installments) || 1) > 1 && (
              <p className="text-[11px] text-muted-foreground">As demais datas caem automaticamente nesse mesmo dia, um mês depois da outra.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Cliente</Label>
            <ClientCombobox clients={clients} value={form.client_id} onChange={id => setForm(f => ({ ...f, client_id: id }))} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v }))}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {(() => {
          const mode = form.recurrence !== 'Única' ? 'mensalidade' : (parseInt(form.installments) || 1) > 1 ? 'parcelado' : 'avista'
          const options = [
            { key: 'avista', title: 'À vista', desc: 'Um único pagamento.' },
            { key: 'parcelado', title: 'Parcelado', desc: 'O valor total é DIVIDIDO nas parcelas.' },
            { key: 'mensalidade', title: 'Mensalidade', desc: 'O valor cheio se REPETE todo mês. Só para contrato recorrente.' },
          ] as const
          const choose = (k: typeof options[number]['key']) => setForm(f => ({
            ...f,
            recurrence: k === 'mensalidade' ? (f.recurrence === 'Única' ? 'Mensal' : f.recurrence) : 'Única',
            installments: k === 'avista' ? '1' : (parseInt(f.installments) || 1) > 1 ? f.installments : (k === 'mensalidade' ? '12' : '2'),
          }))
          return (
            <div className="space-y-3">
              <Label>Como o cliente vai pagar?</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {options.map(o => (
                  <button key={o.key} type="button" onClick={() => choose(o.key)}
                    className={`text-left rounded-2xl border p-3 transition-colors ${mode === o.key ? 'border-primary bg-primary/10' : 'border-[var(--glass-border)] hover:bg-[var(--glass-surface)]'}`}>
                    <p className="text-sm font-bold">{o.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{o.desc}</p>
                  </button>
                ))}
              </div>
              {mode !== 'avista' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{mode === 'mensalidade' ? 'Quantos meses prever' : form.payment_method === 'Cartão de Crédito' ? 'Parcelas no cartão' : 'Número de parcelas'}</Label>
                    <Input type="number" min="2" max="48" value={form.installments} onChange={e => setForm(f => ({ ...f, installments: e.target.value }))} className="h-10 w-full sm:w-40" />
                  </div>
                  {mode === 'mensalidade' && (
                    <div className="space-y-2">
                      <Label>Ciclo</Label>
                      <Select value={form.recurrence} onValueChange={v => v && setForm(f => ({ ...f, recurrence: v }))}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RECURRENCE_OPTIONS.filter(r => r !== 'Única').map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {(() => {
          const numInst = parseInt(form.installments) || 1
          if (numInst <= 1) return null
          const isCard = form.payment_method === 'Cartão de Crédito'
          const isCardLumpSumPreview = isCard && form.recurrence === 'Única'
          const gross = parseFloat(form.value.replace(',', '.')) || 0

          if (isCardLumpSumPreview) {
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-xl bg-muted/30">
                <div className="space-y-2">
                  <Label>Taxa da maquininha (%)</Label>
                  <Input value={form.card_fee_percent} onChange={e => setForm(f => ({ ...f, card_fee_percent: e.target.value }))} placeholder="Ex: 4,5" className="h-10" />
                </div>
                <div className="flex flex-col justify-center text-xs text-muted-foreground">
                  {form.value && (() => {
                    const fee = parseFloat((form.card_fee_percent || '0').replace(',', '.')) || 0
                    const net = gross * (1 - fee / 100)
                    return (
                      <>
                        <p>Valor bruto: {fmtBRL(gross)}</p>
                        <p>Taxa ({fee || 0}%): -{fmtBRL(gross - net)}</p>
                        <p className="font-semibold text-foreground">Valor líquido: {fmtBRL(net)} de uma vez (1 lançamento), dividido pela %</p>
                      </>
                    )
                  })()}
                </div>
              </div>
            )
          }
          const isRecurring = form.recurrence !== 'Única'
          const perCycle = isRecurring ? gross : gross / numInst
          const pct = Math.min(100, Math.max(0, parseFloat((form.my_pct || '0').replace(',', '.')) || 0))
          const mine = perCycle * pct / 100
          return (
            <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] p-3 text-xs space-y-1">
              <p className="font-bold text-foreground">
                {isRecurring
                  ? `Mensalidade: ${numInst} lançamentos de ${fmtBRL(perCycle)} (o valor cheio se repete, não divide).`
                  : `Parcelado: ${numInst} parcelas de ${fmtBRL(perCycle)} (total ${fmtBRL(gross)} dividido por ${numInst}).`}
              </p>
              <p className="text-muted-foreground">
                Em cada parcela: {myName} {fmtBRL(mine)} · outra parte {fmtBRL(perCycle - mine)}
              </p>
              {isRecurring && <p className="text-muted-foreground">Quer dividir o valor em parcelas? Escolha "Parcelado" acima.</p>}
            </div>
          )
        })()}

        <div className="space-y-2">
          <Label>Observações</Label>
          <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Qualquer detalhe que ajude a outra parte a conferir e lançar certo" />
        </div>

        <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
          <Label>Divisão da parceria — % que fica com {myName}</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number" min="0" max="100" value={form.my_pct}
              onChange={e => setForm(f => ({ ...f, my_pct: e.target.value }))}
              className="h-10 w-24"
            />
            <span className="text-xs text-muted-foreground">
              {myName} {form.my_pct || 0}% · outra parte {100 - (parseFloat(form.my_pct) || 0)}%
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">Isso vai pra categoria "Parceria" no financeiro de quem aprovar, já com o valor calculado só na parte dela.</p>
        </div>

        <Button className="w-full" onClick={submit} disabled={saving}>
          <Send className="h-4 w-4 mr-2" />{saving ? 'Enviando...' : 'Enviar solicitação'}
        </Button>
      </Card>

      <div>
        <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><Wallet className="h-4 w-4" />Resumo da parceria</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(() => {
            const receitas = partnershipFinance.filter(f => f.type === 'receita')
            const despesas = partnershipFinance.filter(f => f.type === 'despesa')
            const recebido = receitas.filter(f => f.paid).reduce((s, f) => s + f.value, 0)
            const aReceber = receitas.filter(f => !f.paid).reduce((s, f) => s + f.value, 0)
            const pago = despesas.filter(f => f.paid).reduce((s, f) => s + f.value, 0)
            const saldo = recebido - pago
            const cards = [
              { label: 'Recebido', value: recebido, color: '#10B981' },
              { label: 'A receber', value: aReceber, color: '#F59E0B' },
              { label: 'Pago', value: pago, color: '#EF4444' },
              { label: 'Saldo', value: saldo, color: saldo >= 0 ? '#10B981' : '#EF4444' },
            ]
            return cards.map(c => (
              <Card key={c.label} className="p-3">
                <p className="text-[11px] text-muted-foreground">{c.label}</p>
                <p className="text-base font-semibold" style={{ color: c.color }}>{fmtBRL(c.value)}</p>
              </Card>
            ))
          })()}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Considera tudo que já entrou pela categoria "Parceria" no seu financeiro — vindo de solicitações aprovadas ou cadastrado direto nessa categoria.
        </p>
      </div>

      <div>
        <h2 className="font-semibold text-sm mb-3">Aguardando sua aprovação ({pendingToReview.length})</h2>
        <div className="space-y-2">
          {!loading && pendingToReview.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma solicitação pendente.</p>
          )}
          {pendingToReview.map(r => <RequestCard key={r.id} r={r} showActions />)}
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-sm mb-3">Suas solicitações enviadas</h2>
        <div className="space-y-2">
          {!loading && sentByMe.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">Nada por aqui ainda.</p>
          )}
          {sentByMe.map(r => <RequestCard key={r.id} r={r} showActions={false} />)}
        </div>
      </div>
    </div>
  )
}
