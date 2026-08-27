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
import { ResponsibleAvatars, useProfilesMap } from '@/components/ResponsibleSelect'
import { Send, Receipt, Clock, CheckCircle2, XCircle, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { fmtBRL, fmtDate } from '@/lib/format'

const CATEGORIES_RECEITA = ['Honorários Iniciais', 'Mensalidade', 'Acordo', 'Consultoria', 'Êxito', 'Outros']
const CATEGORIES_DESPESA = ['Operacional', 'Pessoal', 'Pró-labore/Salário', 'Impostos', 'Software', 'Marketing', 'Aluguel', 'Outros']
const PAYMENT_METHODS = ['PIX/Transferência', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro']

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
  reviewed_at: string | null
  created_at: string
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const isReviewer = !profile?.restricted_to_responsible

  const [form, setForm] = useState({
    type: 'receita', category: '', description: '', value: '', client_id: '',
    due_date: '', payment_method: '', notes: '',
  })

  const loadData = async () => {
    setLoading(true)
    const [{ data: c }, { data: r }] = await Promise.all([
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('finance_requests').select('*').order('created_at', { ascending: false }),
    ])
    setClients((c as ClientOption[]) ?? [])
    setRequests((r as FinanceRequest[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const resetForm = () => setForm({
    type: 'receita', category: '', description: '', value: '', client_id: '',
    due_date: '', payment_method: '', notes: '',
  })

  const submit = async () => {
    if (!form.description.trim()) { toast.error('Preencha a descrição'); return }
    const value = parseFloat(form.value.replace(',', '.'))
    if (!value || value <= 0) { toast.error('Preencha um valor válido'); return }
    if (saving) return
    setSaving(true)
    try {
      const { error } = await supabase.from('finance_requests').insert({
        type: form.type, category: form.category || null, description: form.description,
        value, client_id: form.client_id || null, due_date: form.due_date || null,
        payment_method: form.payment_method || null, notes: form.notes || null,
        created_by: profile?.id ?? null,
      })
      if (error) { toast.error('Erro ao enviar: ' + error.message); return }
      toast.success('Solicitação enviada — a Luiza vai revisar e lançar no financeiro')
      resetForm()
      loadData()
    } finally {
      setSaving(false)
    }
  }

  const approve = async (r: FinanceRequest) => {
    if (!confirm(`Aprovar "${r.description}" e lançar no financeiro?`)) return
    const requester = r.created_by ? profilesMap[r.created_by]?.display_name : null
    const { data: financeRow, error: financeError } = await supabase.from('finance').insert({
      type: r.type, category: r.category, description: r.description, value: r.value,
      client_id: r.client_id, due_date: r.due_date, date: new Date().toISOString().slice(0, 10),
      payment_method: r.payment_method, notes: r.notes,
      responsible: requester ? `Solicitado por ${requester}` : null,
      created_by: profile?.id ?? null,
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

  const pending = requests.filter(r => r.status === 'pendente')
  const reviewed = requests.filter(r => r.status !== 'pendente')

  function RequestCard({ r, showActions }: { r: FinanceRequest; showActions: boolean }) {
    const status = STATUS_MAP[r.status] ?? STATUS_MAP.pendente
    const Icon = status.icon
    const client = clients.find(c => c.id === r.client_id)
    return (
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium truncate">{r.description}</p>
              {isReviewer && r.created_by && (
                <ResponsibleAvatars ids={[r.created_by]} profilesMap={profilesMap} size="xs" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {r.type === 'receita' ? 'Receita' : 'Despesa'}{r.category ? ` · ${r.category}` : ''}{client ? ` · ${client.name}` : ''}{r.due_date ? ` · vence ${fmtDate(r.due_date)}` : ''}
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
          {isReviewer
            ? 'Pedidos de lançamento enviados pela equipe — aprova e o lançamento já entra automaticamente no Financeiro.'
            : 'Preenche os dados aqui e a Luiza revisa e lança no financeiro — você não tem acesso direto ao módulo financeiro.'}
        </p>
      </div>

      {!isReviewer && (
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
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Qualquer detalhe que ajude a Luiza a conferir e lançar certo" />
          </div>

          <Button className="w-full" onClick={submit} disabled={saving}>
            <Send className="h-4 w-4 mr-2" />{saving ? 'Enviando...' : 'Enviar solicitação'}
          </Button>
        </Card>
      )}

      {isReviewer && (
        <div>
          <h2 className="font-semibold text-sm mb-3">Aguardando aprovação ({pending.length})</h2>
          <div className="space-y-2">
            {!loading && pending.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma solicitação pendente.</p>
            )}
            {pending.map(r => <RequestCard key={r.id} r={r} showActions />)}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-semibold text-sm mb-3">{isReviewer ? 'Histórico' : 'Suas solicitações'}</h2>
        <div className="space-y-2">
          {!loading && (isReviewer ? reviewed : requests).length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">Nada por aqui ainda.</p>
          )}
          {(isReviewer ? reviewed : requests).map(r => <RequestCard key={r.id} r={r} showActions={false} />)}
        </div>
      </div>
    </div>
  )
}
