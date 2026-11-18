import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, CheckCircle2, RotateCcw } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ClientCombobox } from '@/components/ClientCombobox'
import { QuickClientDialog } from '@/components/QuickClientDialog'
import { StackTable } from '@/components/StackTable'
import { fmtBRL, fmtDate, parseBRL } from '@/lib/format'
import type { Partner } from '@/lib/partners'

interface Receivable {
  id: string
  partner_id: string
  client_id: string | null
  client_name: string | null
  description: string | null
  base_amount: number | null
  pct: number | null
  amount: number
  expected_at: string | null
  received_at: string | null
  finance_id: string | null
  business_unit: 'advocacia' | 'saas'
  notes: string | null
}
interface ClientLite { id: string; name: string; type?: string | null; email?: string | null; phone?: string | null; cpf_cnpj?: string | null; is_juridico?: boolean | null; is_saas?: boolean | null }

const todayISO = () => new Date().toISOString().slice(0, 10)
const money = (n: number) => n.toFixed(2).replace('.', ',')
const CATEGORIA = 'Comissão de parceria (indicação nossa)'

const emptyForm = (pct: string) => ({ client_id: '', client_name: '', description: '', base: '', pct, amount: '', expected_at: '', unit: 'advocacia' as 'advocacia' | 'saas', notes: '' })

// Parceiro para quem NÓS indicamos clientes: aqui ficam as comissões que vamos RECEBER dele.
// Ao marcar como recebida, entra uma receita no Financeiro; desfazer remove essa receita.
export function PartnerReferrals({ partner, clients, onClientsChanged }: {
  partner: Partner
  clients: ClientLite[]
  onClientsChanged: () => void
}) {
  const [items, setItems] = useState<Receivable[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [f, setF] = useState(() => emptyForm(partner.receive_pct != null ? String(partner.receive_pct).replace('.', ',') : ''))
  const [quickOpen, setQuickOpen] = useState(false)
  const [receiveFor, setReceiveFor] = useState<Receivable | null>(null)
  const [receiveDate, setReceiveDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)

  const clientName = useMemo(() => new Map(clients.map(c => [c.id, c.name])), [clients])

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('partner_receivables').select('*').eq('partner_id', partner.id).order('created_at', { ascending: false })
    if (error) toast.error('Erro ao carregar as indicações: ' + error.message)
    setItems((data ?? []) as Receivable[])
    setLoading(false)
  }, [partner.id])
  useEffect(() => { void load() }, [load])

  const aReceber = items.filter(i => !i.received_at).reduce((s, i) => s + Number(i.amount), 0)
  const recebido = items.filter(i => i.received_at).reduce((s, i) => s + Number(i.amount), 0)
  const nomeDe = (i: Receivable) => (i.client_id ? clientName.get(i.client_id) : null) ?? i.client_name ?? '—'

  // comissão = honorários × % (editável depois)
  const recalc = (base: string, pct: string) => {
    const b = parseBRL(base), p = parseBRL(pct)
    return b != null && p != null ? money(Math.round(b * p) / 100) : ''
  }

  function openNew() {
    setEditingId(null)
    setF(emptyForm(partner.receive_pct != null ? String(partner.receive_pct).replace('.', ',') : ''))
    setOpen(true)
  }
  function openEdit(i: Receivable) {
    setEditingId(i.id)
    setF({
      client_id: i.client_id ?? '', client_name: i.client_name ?? '', description: i.description ?? '',
      base: i.base_amount != null ? money(Number(i.base_amount)) : '', pct: i.pct != null ? String(i.pct).replace('.', ',') : '',
      amount: money(Number(i.amount)), expected_at: i.expected_at ?? '', unit: i.business_unit, notes: i.notes ?? '',
    })
    setOpen(true)
  }

  async function save() {
    if (saving) return
    const amount = parseBRL(f.amount)
    if (!f.client_id && !f.client_name.trim()) { toast.error('Escolha o cliente indicado (ou escreva o nome)'); return }
    if (amount == null || amount <= 0) { toast.error('Informe o valor da comissão'); return }
    if (f.base.trim() && parseBRL(f.base) === null) { toast.error('Valor dos honorários inválido'); return }
    if (f.pct.trim() && parseBRL(f.pct) === null) { toast.error('% inválida'); return }
    const row = {
      partner_id: partner.id, client_id: f.client_id || null, client_name: f.client_id ? null : f.client_name.trim() || null,
      description: f.description.trim() || null, base_amount: parseBRL(f.base), pct: parseBRL(f.pct), amount,
      expected_at: f.expected_at || null, business_unit: f.unit, notes: f.notes.trim() || null,
    }
    setSaving(true)
    const { error } = editingId
      ? await supabase.from('partner_receivables').update(row).eq('id', editingId)
      : await supabase.from('partner_receivables').insert(row)
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success(editingId ? 'Indicação atualizada' : 'Indicação registrada')
    setOpen(false)
    void load()
  }

  async function markReceived() {
    if (!receiveFor || saving) return
    const i = receiveFor
    setSaving(true)
    const { data: fin, error: fe } = await supabase.from('finance').insert({
      type: 'receita', category: CATEGORIA,
      description: `Comissão de indicação — ${partner.name} — ${nomeDe(i)}${i.description ? ` (${i.description})` : ''}`,
      value: i.amount, date: receiveDate, due_date: i.expected_at, paid: true, payment_date: receiveDate,
      nature: 'real', impacts_cash: true, origin: 'operacional', business_unit: i.business_unit, refletir_metricas: true, intragrupo: false,
    }).select('id').single()
    if (fe || !fin) { setSaving(false); toast.error('Não foi possível lançar no Financeiro: ' + (fe?.message ?? '')); return }
    const { error } = await supabase.from('partner_receivables').update({ received_at: receiveDate, finance_id: fin.id }).eq('id', i.id)
    setSaving(false)
    if (error) { await supabase.from('finance').delete().eq('id', fin.id); toast.error('Erro ao marcar como recebida: ' + error.message); return }
    toast.success('Comissão recebida e lançada no Financeiro')
    setReceiveFor(null)
    void load()
  }

  async function undoReceived(i: Receivable) {
    if (!confirm('Desfazer o recebimento? A receita lançada no Financeiro será removida.')) return
    if (i.finance_id) await supabase.from('finance').delete().eq('id', i.finance_id)
    const { error } = await supabase.from('partner_receivables').update({ received_at: null, finance_id: null }).eq('id', i.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Recebimento desfeito')
    void load()
  }

  async function remove(i: Receivable) {
    if (!confirm('Excluir esta indicação?' + (i.finance_id ? ' A receita lançada no Financeiro também será removida.' : ''))) return
    if (i.finance_id) await supabase.from('finance').delete().eq('id', i.finance_id)
    const { error } = await supabase.from('partner_receivables').delete().eq('id', i.id)
    if (error) { toast.error('Erro ao excluir: ' + error.message); return }
    void load()
  }

  const atrasada = (i: Receivable) => !i.received_at && !!i.expected_at && i.expected_at < todayISO()

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">Indicações enviadas a este parceiro</p>
          <p className="text-xs text-muted-foreground">Comissão devida a nós sobre os honorários dos clientes indicados. Ao ser recebida, entra como receita no Financeiro.</p>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="h-3 w-3 mr-1" />Registrar indicação</Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-3"><p className="text-[11px] text-muted-foreground">A receber</p><p className="text-lg font-semibold text-amber-600">{fmtBRL(aReceber)}</p></div>
        <div className="rounded-xl border p-3"><p className="text-[11px] text-muted-foreground">Já recebido</p><p className="text-lg font-semibold text-emerald-600">{fmtBRL(recebido)}</p></div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma indicação registrada.</p>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <StackTable>
            <TableHeader><TableRow>
              <TableHead>Cliente indicado</TableHead><TableHead className="text-right">Honorários</TableHead><TableHead className="text-right">Comissão</TableHead>
              <TableHead>Previsto</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {items.map(i => (
                <TableRow key={i.id}>
                  <TableCell className="text-sm font-medium">
                    {nomeDe(i)}
                    {i.description && <span className="block text-[11px] text-muted-foreground font-normal">{i.description}</span>}
                  </TableCell>
                  <TableCell className="text-sm text-right">{i.base_amount != null ? fmtBRL(Number(i.base_amount)) : '—'}{i.pct != null && <span className="block text-[11px] text-muted-foreground">{String(i.pct).replace('.', ',')}%</span>}</TableCell>
                  <TableCell className="text-sm text-right font-semibold">{fmtBRL(Number(i.amount))}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{i.expected_at ? fmtDate(i.expected_at) : '—'}</TableCell>
                  <TableCell>
                    {i.received_at
                      ? <Badge className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-0">Recebida em {fmtDate(i.received_at)}</Badge>
                      : atrasada(i)
                        ? <Badge className="text-[10px] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-0">Atrasada</Badge>
                        : <Badge className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-0">A receber</Badge>}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {i.received_at
                      ? <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => undoReceived(i)}><RotateCcw className="h-3 w-3 mr-1" />Desfazer</Button>
                      : <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setReceiveFor(i); setReceiveDate(todayISO()) }}><CheckCircle2 className="h-3 w-3 mr-1" />Recebida</Button>}
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(i)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => remove(i)}><Trash2 className="h-3 w-3" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </StackTable>
        </div>
      )}

      {/* registrar / editar indicação */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[520px] w-[96vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar indicação' : 'Registrar indicação'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Cliente indicado</Label>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setQuickOpen(true)}>+ Novo cliente</button>
              </div>
              <ClientCombobox clients={clients} value={f.client_id} onChange={v => setF(x => ({ ...x, client_id: v }))} placeholder="Escolha o cliente" />
              {!f.client_id && (
                <Input value={f.client_name} onChange={e => setF(x => ({ ...x, client_name: e.target.value }))} placeholder="Ou informe o nome (não cadastrado)" className="h-10" />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Serviço ou processo (opcional)</Label>
              <Input value={f.description} onChange={e => setF(x => ({ ...x, description: e.target.value }))} className="h-10" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Honorários do parceiro (R$)</Label>
                <Input value={f.base} onChange={e => { const base = e.target.value; setF(x => ({ ...x, base, amount: recalc(base, x.pct) || x.amount })) }} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>% da comissão</Label>
                <Input value={f.pct} onChange={e => { const pct = e.target.value; setF(x => ({ ...x, pct, amount: recalc(x.base, pct) || x.amount })) }} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Comissão (R$) *</Label>
                <Input value={f.amount} onChange={e => setF(x => ({ ...x, amount: e.target.value }))} className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Previsão de recebimento</Label><Input type="date" value={f.expected_at} onChange={e => setF(x => ({ ...x, expected_at: e.target.value }))} className="h-10" /></div>
              <div className="space-y-1.5">
                <Label>Empresa</Label>
                <div className="inline-flex rounded-lg border p-0.5 bg-muted/40">
                  {([['advocacia', 'Advocacia'], ['saas', 'Sistema']] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setF(x => ({ ...x, unit: k }))}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${f.unit === k ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Observações</Label><Textarea value={f.notes} onChange={e => setF(x => ({ ...x, notes: e.target.value }))} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* marcar como recebida */}
      <Dialog open={!!receiveFor} onOpenChange={o => { if (!o) setReceiveFor(null) }}>
        <DialogContent className="max-w-[400px] w-[96vw]">
          <DialogHeader><DialogTitle>Comissão recebida</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {receiveFor ? `${fmtBRL(Number(receiveFor.amount))} (${partner.name} — ${nomeDe(receiveFor)}) será lançada como receita no Financeiro.` : ''}
            </p>
            <div className="space-y-1.5"><Label>Data do recebimento</Label><Input type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)} className="h-10" /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReceiveFor(null)}>Cancelar</Button>
              <Button onClick={markReceived} disabled={saving || !receiveDate}>{saving ? 'Lançando...' : 'Confirmar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <QuickClientDialog open={quickOpen} onClose={() => setQuickOpen(false)} onCreated={id => { setQuickOpen(false); onClientsChanged(); setF(x => ({ ...x, client_id: id, client_name: '' })) }} />
    </>
  )
}
