import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { ClientCombobox } from '@/components/ClientCombobox'
import { useProfilesMap } from '@/components/ResponsibleSelect'
import { Send, Receipt, Clock, CheckCircle2, XCircle, Check, X, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { fmtBRL, fmtDate } from '@/lib/format'

const CATEGORIES_RECEITA = ['Honorários Iniciais', 'Mensalidade', 'Acordo', 'Consultoria', 'Êxito', 'Outros']
const CATEGORIES_DESPESA = ['Operacional', 'Pessoal', 'Pró-labore/Salário', 'Impostos', 'Software', 'Marketing', 'Aluguel', 'Outros']
const PAYMENT_METHODS = ['PIX/Transferência', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro']
const PARTNERSHIP_CATEGORY = 'Parceria'

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

  // "Meu nome" e "nome da outra parte" — resolvidos dinamicamente pelo tenant_id
  // (que é o profile.id de quem é dona daquele tenant), então funciona pros
  // dois lados sem hardcode de quem é quem.
  const myName = (profile && profilesMap[profile.tenant_id ?? '']?.display_name) || 'você'

  const [form, setForm] = useState({
    type: 'receita', category: '', description: '', value: '', client_id: '',
    due_date: '', payment_method: '', notes: '', my_pct: '50',
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
  })

  const submit = async () => {
    if (!form.description.trim()) { toast.error('Preencha a descrição'); return }
    const value = parseFloat(form.value.replace(',', '.'))
    if (!value || value <= 0) { toast.error('Preencha um valor válido'); return }
    const myPct = parseFloat(form.my_pct.replace(',', '.'))
    if (isNaN(myPct) || myPct < 0 || myPct > 100) { toast.error('Sua % precisa estar entre 0 e 100'); return }
    if (saving) return
    setSaving(true)
    try {
      const { error } = await supabase.from('finance_requests').insert({
        type: form.type, category: form.category || null, description: form.description,
        value, client_id: form.client_id || null, due_date: form.due_date || null,
        payment_method: form.payment_method || null, notes: form.notes || null,
        giovanna_pct: myPct, created_by: profile?.id ?? null, tenant_id: profile?.tenant_id ?? null,
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
    const myShare = r.value * (100 - requesterPct) / 100
    const requesterShare = r.value * requesterPct / 100
    if (!confirm(`Aprovar "${r.description}"?\n\nValor total: ${fmtBRL(r.value)}\nParte de ${requesterName} (${requesterPct}%): ${fmtBRL(requesterShare)}\nSua parte (${100 - requesterPct}%): ${fmtBRL(myShare)}\n\nSerá lançado no seu Financeiro só a sua parte, na categoria "Parceria".`)) return
    const splitNote = `Solicitação de ${requesterName} — valor total ${fmtBRL(r.value)}, dividido ${requesterPct}% ${requesterName} / ${100 - requesterPct}% ${myName}. Este lançamento reflete só a sua parte (${fmtBRL(myShare)}).`
    const { data: financeRow, error: financeError } = await supabase.from('finance').insert({
      type: r.type, category: PARTNERSHIP_CATEGORY, description: r.description, value: myShare,
      client_id: r.client_id, due_date: r.due_date, date: new Date().toISOString().slice(0, 10),
      payment_method: r.payment_method, notes: [r.notes, splitNote].filter(Boolean).join('\n\n'),
      responsible: `Solicitado por ${requesterName}`,
      tenant_id: profile?.tenant_id ?? null,
    }).select('id').single()
    if (financeError) { toast.error('Erro ao lançar no financeiro: ' + financeError.message); return }
    const { error: updateError } = await supabase.from('finance_requests').update({
      status: 'aprovado', reviewed_by: profile?.id ?? null, reviewed_at: new Date().toISOString(),
      finance_id: financeRow.id,
    }).eq('id', r.id)
    if (updateError) { toast.error('Lançado, mas erro ao atualizar a solicitação: ' + updateError.message); return }
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
      <Card className="p-4">
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
            </p>
            {r.notes && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{r.notes}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className={`text-sm font-semibold ${r.type === 'receita' ? 'text-green-600' : 'text-red-500'}`}>{fmtBRL(r.value)}</p>
            <Badge className="text-[10px] mt-1 gap-1" style={{ backgroundColor: `${status.color}22`, color: status.color }}>
              <Icon className="h-3 w-3" />{status.label}
            </Badge>
          </div>
        </div>
        {showActions && (
          <div className="flex gap-2 mt-3 pt-3 border-t">
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
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
            <Label>Valor (R$) *</Label>
            <Input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0,00" className="h-10" />
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(form.type === 'receita' ? CATEGORIES_RECEITA : CATEGORIES_DESPESA).map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <ClientCombobox clients={clients} value={form.client_id} onChange={id => setForm(f => ({ ...f, client_id: id }))} />
          </div>
          <div className="space-y-2">
            <Label>Vencimento</Label>
            <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="h-10" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Forma de pagamento</Label>
          <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

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
