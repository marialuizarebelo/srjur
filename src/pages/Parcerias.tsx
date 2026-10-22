import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Search, Handshake, Users, Wallet, CheckCircle2, FileDown, Trash2, ExternalLink, AlertTriangle } from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import { Sensitive } from '@/components/Sensitive'
import { ClientCombobox } from '@/components/ClientCombobox'
import { ProcessCombobox } from '@/components/ProcessCombobox'
import { downloadPartnerReceipt, type PartnerReceipt } from '@/lib/partnerReceipt'
import { PARTNER_KINDS, DEFAULT_PARTNER_CATEGORIES, categoriesLabel, type Partner, type PartnerLink } from '@/lib/partners'
import { CategoryChips } from '@/components/CategoryChips'

interface Commission {
  id: string; partner_id: string; link_id: string | null; client_id: string | null; source_finance_id: string | null
  base_amount: number; pct: number; amount: number; received_at: string; needs_review: boolean
  historical: boolean; paid_at: string | null; notes: string | null; business_unit: 'advocacia' | 'saas'
}
interface PaidReceita { id: string; description: string; value: number; date: string; payment_date: string | null; business_unit: string | null }
interface Expense { id: string; partner_commission_id: string; paid: boolean; payment_date: string | null; due_date: string | null }
interface Receipt extends PartnerReceipt { id: string; commission_id: string | null; partner_id: string }
interface ClientLite { id: string; name: string; is_juridico?: boolean | null; is_saas?: boolean | null }
type Unidade = '' | 'advocacia' | 'saas'
const UNIDADES: { key: Unidade; label: string }[] = [{ key: '', label: 'Empresa toda' }, { key: 'advocacia', label: 'Advocacia' }, { key: 'saas', label: 'Sistema (SaaS)' }]
const unitLabel = (u: string) => (u === 'saas' ? 'SaaS' : 'Advocacia')
// Mesma regra das Métricas: cliente jurídico (padrão) e/ou SaaS.
const clientInUnit = (c: ClientLite | undefined, u: Unidade) => !u || !c ? true : u === 'saas' ? c.is_saas === true : c.is_juridico !== false
interface ProcessLite { id: string; title: string; number: string | null; client_id: string | null }

const emptyPartner = {
  name: '', kind: 'pessoa', document: '', oab: '', email: '', phone: '', pix_key: '', bank_info: '', notes: '',
  status: 'ativo', started_at: '', drive_url: '', client_id: '', default_pct: '', default_categories: DEFAULT_PARTNER_CATEGORIES as string[], payment_days: '5',
  valid_from: '', valid_until: '',
}
type PartnerForm = typeof emptyPartner

type CStatus = 'a_pagar' | 'atrasada' | 'paga' | 'revisar'
const todayISO = () => new Date().toISOString().slice(0, 10)
const pctStr = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))
const parsePct = (s: string) => { const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? null : n }
const vigencia = (from: string | null, until: string | null) =>
  `${from ? fmtDate(from) : '—'} → ${until ? fmtDate(until) : 'indeterminada'}`

function KpiCard({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--glass-border)] bg-card p-4 shadow-[0_12px_28px_-20px_var(--glass-drop),inset_0_1px_0_var(--glass-highlight)]">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <p className="text-xl font-semibold mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

export default function Parcerias() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [links, setLinks] = useState<PartnerLink[]>([])
  const [commissionsAll, setCommissions] = useState<Commission[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [clients, setClients] = useState<ClientLite[]>([])
  const [processes, setProcesses] = useState<ProcessLite[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'parceiros' | 'comissoes'>('parceiros')
  const [unidade, setUnidade] = useState<Unidade>('')
  const [search, setSearch] = useState('')
  const [showEnded, setShowEnded] = useState(false)
  const [openId, setOpenId] = useState<string | 'new' | null>(null)
  const [statusFilter, setStatusFilter] = useState<'todas' | 'a_pagar' | 'atrasada' | 'paga' | 'revisar'>('todas')

  const load = async () => {
    const [p, l, c, e, r, cl, pr] = await Promise.all([
      supabase.from('partners').select('*').order('name'),
      supabase.from('partner_clients').select('*'),
      supabase.from('partner_commissions').select('*').order('received_at', { ascending: false }),
      supabase.from('finance').select('id, partner_commission_id, paid, payment_date, due_date').not('partner_commission_id', 'is', null),
      supabase.from('partner_receipts').select('*').is('voided_at', null).order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name, is_juridico, is_saas').order('name'),
      supabase.from('processes').select('id, title, number, client_id').order('title'),
    ])
    const firstErr = [p, l, c, e, r].find(x => x.error)?.error
    if (firstErr) toast.error('Erro ao carregar parcerias: ' + firstErr.message)
    setPartners((p.data ?? []) as Partner[])
    setLinks((l.data ?? []) as PartnerLink[])
    setCommissions((c.data ?? []) as Commission[])
    setExpenses((e.data ?? []) as Expense[])
    setReceipts((r.data ?? []) as Receipt[])
    setClients((cl.data ?? []) as ClientLite[])
    setProcesses((pr.data ?? []) as ProcessLite[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const commissions = useMemo(() => commissionsAll.filter(c => !unidade || c.business_unit === unidade), [commissionsAll, unidade])
  const expenseOf = useMemo(() => new Map(expenses.map(e => [e.partner_commission_id, e])), [expenses])
  const receiptOf = useMemo(() => new Map(receipts.filter(r => r.commission_id).map(r => [r.commission_id as string, r])), [receipts])
  const clientName = useMemo(() => new Map(clients.map(c => [c.id, c.name])), [clients])
  const partnerName = useMemo(() => new Map(partners.map(p => [p.id, p.name])), [partners])

  const statusOf = (c: Commission): CStatus => {
    const e = expenseOf.get(c.id)
    if (c.historical) return 'paga'
    if (c.needs_review) return 'revisar'
    if (e?.paid) return 'paga'
    return e?.due_date && e.due_date < todayISO() ? 'atrasada' : 'a_pagar'
  }
  const dueOf = (c: Commission) => expenseOf.get(c.id)?.due_date ?? null

  const stats = useMemo(() => {
    const month = todayISO().slice(0, 7)
    const aPagar = commissions.filter(c => (statusOf(c) === 'a_pagar' || statusOf(c) === 'atrasada')).reduce((s, c) => s + Number(c.amount), 0)
    const pagoMes = commissions.filter(c => {
      if (c.historical) return (c.paid_at ?? '').startsWith(month)
      const e = expenseOf.get(c.id)
      return e?.paid && (e.payment_date ?? '').startsWith(month)
    }).reduce((s, c) => s + Number(c.amount), 0)
    const pagoTotal = commissions.filter(c => statusOf(c) === 'paga').reduce((s, c) => s + Number(c.amount), 0)
    const ativos = partners.filter(p => p.status === 'ativo').length
    const clientesIndicados = new Set(links.filter(l => l.active && clientInUnit(clients.find(c => c.id === l.client_id), unidade)).map(l => l.client_id)).size
    return { aPagar, pagoMes, pagoTotal, ativos, clientesIndicados }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commissions, expenses, partners, links, clients, unidade])

  const perPartner = (id: string) => {
    const mine = commissions.filter(c => c.partner_id === id)
    return {
      clientes: links.filter(l => l.partner_id === id && l.active && clientInUnit(clients.find(c => c.id === l.client_id), unidade)).length,
      aPagar: mine.filter(c => (statusOf(c) === 'a_pagar' || statusOf(c) === 'atrasada')).reduce((s, c) => s + Number(c.amount), 0),
      pago: mine.filter(c => statusOf(c) === 'paga').reduce((s, c) => s + Number(c.amount), 0),
    }
  }

  const visiblePartners = partners.filter(p =>
    (showEnded || p.status === 'ativo') && (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())))
  const visibleCommissions = commissions.filter(c => statusFilter === 'todas' || statusOf(c) === statusFilter)

  const statusBadge = (s: CStatus) =>
    s === 'atrasada' ? <Badge className="text-[10px] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-0">Atrasada</Badge>
      : s === 'paga' ? <Badge className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-0">Paga</Badge>
      : s === 'revisar' ? <Badge className="text-[10px] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-0">Revisar</Badge>
        : <Badge className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-0">A pagar</Badge>

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Parcerias</h1>
          <p className="text-sm text-muted-foreground">Parceiros que indicam clientes e a comissão de cada um</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border p-0.5 bg-muted/40">
            {UNIDADES.map(u => (
              <button key={u.key} onClick={() => setUnidade(u.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${unidade === u.key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{u.label}</button>
            ))}
          </div>
          <Button size="sm" onClick={() => setOpenId('new')}><Plus className="h-3 w-3 mr-1" />Novo parceiro</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Handshake} label="Parceiros ativos" value={stats.ativos} />
        <KpiCard icon={Users} label="Clientes indicados" value={stats.clientesIndicados} />
        <KpiCard icon={Wallet} label="Comissões a pagar" value={<Sensitive>{fmtBRL(stats.aPagar)}</Sensitive>} sub="valor líquido já calculado" />
        <KpiCard icon={CheckCircle2} label="Pago neste mês" value={<Sensitive>{fmtBRL(stats.pagoMes)}</Sensitive>} sub={`total pago: ${stats.pagoTotal ? fmtBRL(stats.pagoTotal) : 'R$ 0,00'}`} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {([['parceiros', 'Parceiros'], ['comissoes', 'Comissões']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${tab === k ? 'bg-primary/10 border-primary/30 text-primary' : 'border-transparent text-muted-foreground hover:bg-muted'}`}>
            {label}
          </button>
        ))}
        {tab === 'parceiros' ? (
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={showEnded} onCheckedChange={setShowEnded} />Mostrar encerrados</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar parceiro..." className="h-9 pl-8 w-56" />
            </div>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-1.5">
            {([['todas', 'Todas'], ['a_pagar', 'A pagar'], ['atrasada', 'Atrasadas'], ['paga', 'Pagas'], ['revisar', 'Revisar']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setStatusFilter(k)}
                className={`px-2.5 py-1 rounded-md text-xs border ${statusFilter === k ? 'bg-primary/10 border-primary/30 text-primary' : 'border-transparent text-muted-foreground hover:bg-muted'}`}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
      ) : tab === 'parceiros' ? (
        visiblePartners.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            {partners.length === 0 ? 'Nenhum parceiro cadastrado ainda. Clique em "Novo parceiro" para começar.' : 'Nenhum parceiro encontrado.'}
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parceiro</TableHead><TableHead>Tipo</TableHead><TableHead>Regra padrão</TableHead>
                  <TableHead className="text-right">Clientes</TableHead><TableHead className="text-right">A pagar</TableHead>
                  <TableHead className="text-right">Pago</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePartners.map(p => {
                  const s = perPartner(p.id)
                  return (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => setOpenId(p.id)}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{PARTNER_KINDS.find(k => k.value === p.kind)?.label ?? p.kind}</TableCell>
                      <TableCell className="text-sm"><span className="block max-w-[220px] truncate" title={categoriesLabel(p.default_categories)}>{p.default_pct != null ? `${pctStr(p.default_pct)}% · ${categoriesLabel(p.default_categories)}` : '—'}</span></TableCell>
                      <TableCell className="text-right text-sm">{s.clientes}</TableCell>
                      <TableCell className="text-right text-sm"><Sensitive>{fmtBRL(s.aPagar)}</Sensitive></TableCell>
                      <TableCell className="text-right text-sm"><Sensitive>{fmtBRL(s.pago)}</Sensitive></TableCell>
                      <TableCell>{p.status === 'ativo'
                        ? <Badge className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-0">Ativo</Badge>
                        : <Badge variant="secondary" className="text-[10px]">Encerrado</Badge>}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recebido em</TableHead><TableHead>Parceiro</TableHead><TableHead>Cliente</TableHead><TableHead>Unidade</TableHead>
                <TableHead className="text-right">Base (líquido)</TableHead><TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Comissão</TableHead><TableHead>Pagar até</TableHead><TableHead>Status</TableHead><TableHead>Recibo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleCommissions.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Nenhuma comissão</TableCell></TableRow>
              ) : visibleCommissions.map(c => {
                const rec = receiptOf.get(c.id)
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">{fmtDate(c.received_at)}</TableCell>
                    <TableCell className="text-sm font-medium cursor-pointer hover:underline" onClick={() => setOpenId(c.partner_id)}>{partnerName.get(c.partner_id) ?? '—'}</TableCell>
                    <TableCell className="text-sm">{c.client_id ? clientName.get(c.client_id) ?? '—' : '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{unitLabel(c.business_unit)}</Badge></TableCell>
                    <TableCell className="text-right text-sm"><Sensitive>{fmtBRL(Number(c.base_amount))}</Sensitive></TableCell>
                    <TableCell className="text-right text-sm">{pctStr(c.pct)}%</TableCell>
                    <TableCell className="text-right text-sm font-medium"><Sensitive>{fmtBRL(Number(c.amount))}</Sensitive></TableCell>
                    <TableCell className="text-sm">{statusOf(c) === 'paga' ? '—' : (dueOf(c) ? fmtDate(dueOf(c) as string) : '—')}</TableCell>
                    <TableCell>{statusBadge(statusOf(c))}</TableCell>
                    <TableCell>{rec && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => downloadPartnerReceipt(rec)}><FileDown className="h-3 w-3 mr-1" />{rec.number}</Button>}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        A comissão é calculada quando o pagamento do cliente é marcado como recebido no Financeiro, sobre o valor líquido (já sem taxa de cartão).
        Ela aparece lá como despesa "Comissão de parceria" — ao marcar como paga, o recibo é gerado aqui.
      </p>

      {openId && (
        <PartnerDialog
          key={openId}
          partner={openId === 'new' ? null : partners.find(p => p.id === openId) ?? null}
          links={links.filter(l => l.partner_id === openId)}
          commissions={commissionsAll.filter(c => c.partner_id === openId)}
          receipts={receipts.filter(r => r.partner_id === openId)}
          clients={clients} processes={processes} clientName={clientName}
          statusOf={statusOf} statusBadge={statusBadge} dueOf={dueOf} receiptOf={receiptOf}
          onClose={() => setOpenId(null)}
          onChanged={load}
          onCreated={id => { load(); setOpenId(id) }}
        />
      )}
    </div>
  )
}

// ── Ficha do parceiro ───────────────────────────────────────────────────────
function PartnerDialog({ partner, links, commissions, receipts, clients, processes, clientName, statusOf, statusBadge, dueOf, receiptOf, onClose, onChanged, onCreated }: {
  partner: Partner | null
  links: PartnerLink[]
  commissions: Commission[]
  receipts: Receipt[]
  clients: ClientLite[]
  processes: ProcessLite[]
  clientName: Map<string, string>
  statusOf: (c: Commission) => CStatus
  statusBadge: (s: CStatus) => React.ReactNode
  dueOf: (c: Commission) => string | null
  receiptOf: Map<string, Receipt>
  onClose: () => void
  onChanged: () => void
  onCreated: (id: string) => void
}) {
  const isNew = !partner
  const [tab, setTab] = useState<'dados' | 'clientes' | 'comissoes'>('dados')
  const [form, setForm] = useState<PartnerForm>(() => partner ? {
    name: partner.name, kind: partner.kind, document: partner.document ?? '', oab: partner.oab ?? '', email: partner.email ?? '',
    phone: partner.phone ?? '', pix_key: partner.pix_key ?? '', bank_info: partner.bank_info ?? '', notes: partner.notes ?? '',
    status: partner.status, started_at: partner.started_at ?? '', drive_url: partner.drive_url ?? '', client_id: partner.client_id ?? '',
    default_pct: pctStr(partner.default_pct), default_categories: partner.default_categories ?? DEFAULT_PARTNER_CATEGORIES, payment_days: String(partner.payment_days ?? 5), valid_from: partner.valid_from ?? '', valid_until: partner.valid_until ?? '',
  } : { ...emptyPartner })
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof PartnerForm>(k: K, v: PartnerForm[K]) => setForm(f => ({ ...f, [k]: v }))

  // vincular cliente
  const [histOpen, setHistOpen] = useState(false)
  const [hf, setHf] = useState({ unit: 'advocacia' as 'advocacia' | 'saas', client_id: '', source: '', base: '', pct: '', amount: '', received_at: '', paid_at: '', notes: '', createLink: true })
  const [histPayments, setHistPayments] = useState<PaidReceita[]>([])
  const [linkOpen, setLinkOpen] = useState(false)
  const [lf, setLf] = useState({ unit: '' as '' | 'advocacia' | 'saas', client_id: '', process_id: '', pct: '', categories: DEFAULT_PARTNER_CATEGORIES as string[], valid_from: todayISO(), valid_until: '', indeterminate: true, notes: '' })
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null)

  const save = async () => {
    if (saving) return
    if (!form.name.trim()) { toast.error('Informe o nome do parceiro'); return }
    const pct = form.default_pct.trim() ? parsePct(form.default_pct) : null
    if (form.default_categories.length === 0) { toast.error('Escolha ao menos uma categoria de receita'); return }
    if (form.default_pct.trim() && (pct == null || pct < 0 || pct > 100)) { toast.error('% de comissão inválida'); return }
    const payload = {
      name: form.name.trim(), kind: form.kind, document: form.document || null, oab: form.oab || null, email: form.email || null,
      phone: form.phone || null, pix_key: form.pix_key || null, bank_info: form.bank_info || null, notes: form.notes || null,
      status: form.status, started_at: form.started_at || null, drive_url: form.drive_url || null, client_id: form.client_id || null,
      default_pct: pct, default_categories: form.default_categories, payment_days: Math.max(0, parseInt(form.payment_days) || 0), valid_from: form.valid_from || null, valid_until: form.valid_until || null,
    }
    setSaving(true)
    try {
      if (partner) {
        const { error } = await supabase.from('partners').update(payload).eq('id', partner.id)
        if (error) { toast.error('Erro ao salvar: ' + error.message); return }
        toast.success('Parceiro atualizado'); onChanged()
      } else {
        const { data, error } = await supabase.from('partners').insert(payload).select('id').single()
        if (error || !data) { toast.error('Erro ao salvar: ' + (error?.message ?? '')); return }
        toast.success('Parceiro cadastrado'); onCreated(data.id)
      }
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!partner) return
    if (commissions.length > 0) { toast.error('Este parceiro já tem comissões. Em vez de excluir, marque como Encerrado.'); return }
    if (!confirm(`Excluir o parceiro "${partner.name}" e os vínculos com clientes?`)) return
    const { error } = await supabase.from('partners').delete().eq('id', partner.id)
    if (error) { toast.error('Erro ao excluir: ' + error.message); return }
    toast.success('Parceiro excluído'); onChanged(); onClose()
  }

  const parseMoney = (s: string) => { const n = parseFloat(s.replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n }
  const moneyStr = (n: number) => n.toFixed(2).replace('.', ',')
  const openHist = () => {
    setHf({ unit: 'advocacia', client_id: '', source: '', base: '', pct: pctStr(partner?.default_pct), amount: '', received_at: '', paid_at: '', notes: '', createLink: true })
    setHistPayments([])
    setHistOpen(true)
  }
  const pickHistClient = async (id: string) => {
    const c = clients.find(x => x.id === id)
    setHf(f => ({ ...f, client_id: id, source: '', unit: c?.is_saas && c.is_juridico === false ? 'saas' : f.unit }))
    setHistPayments([])
    if (!id) return
    const { data } = await supabase.from('finance').select('id, description, value, date, payment_date, business_unit')
      .eq('client_id', id).eq('type', 'receita').eq('paid', true).order('date', { ascending: false })
    setHistPayments((data ?? []) as PaidReceita[])
  }
  const recalcHist = (patch: Partial<typeof hf>) => setHf(f => {
    const n = { ...f, ...patch }
    const b = parseMoney(n.base), p = parsePct(n.pct)
    if (('base' in patch || 'pct' in patch) && b != null && p != null) n.amount = moneyStr(Math.round(b * p) / 100)
    return n
  })
  const pickHistSource = (id: string) => {
    const r = histPayments.find(x => x.id === id)
    if (!r) { setHf(f => ({ ...f, source: '' })); return }
    recalcHist({ source: id, unit: ((r as PaidReceita).business_unit === 'saas' ? 'saas' : 'advocacia') as 'advocacia' | 'saas', base: moneyStr(Number(r.value)), received_at: (r.payment_date ?? r.date).slice(0, 10) })
  }
  const saveHist = async () => {
    if (!partner) return
    const base = parseMoney(hf.base), pct = parsePct(hf.pct), amount = parseMoney(hf.amount)
    if (!hf.client_id) { toast.error('Escolha o cliente'); return }
    if (base == null || base <= 0) { toast.error('Informe o valor recebido do cliente (líquido)'); return }
    if (pct == null || pct < 0 || pct > 100) { toast.error('Informe a % de comissão'); return }
    if (amount == null || amount < 0) { toast.error('Informe o valor da comissão'); return }
    if (!hf.received_at) { toast.error('Informe quando o cliente pagou'); return }
    if (!hf.paid_at) { toast.error('Informe quando o parceiro foi pago'); return }
    let linkId = links.find(l => l.client_id === hf.client_id && !l.process_id)?.id ?? null
    if (!linkId && hf.createLink) {
      const { data: nl, error: le } = await supabase.from('partner_clients').insert({
        partner_id: partner.id, client_id: hf.client_id, pct, categories: partner.default_categories, valid_from: todayISO(),
      }).select('id').single()
      if (le) { toast.error('Erro ao vincular o cliente: ' + le.message); return }
      linkId = nl.id
      await supabase.from('clients').update({ origin: 'Indicação', referred_by: partner.name, referral_fee_pct: pct }).eq('id', hf.client_id)
    }
    const { error } = await supabase.from('partner_commissions').insert({
      partner_id: partner.id, link_id: linkId, client_id: hf.client_id, source_finance_id: hf.source || null,
      base_amount: base, pct, amount, received_at: hf.received_at, paid_at: hf.paid_at, historical: true, notes: hf.notes || null, business_unit: hf.unit,
    })
    if (error) { toast.error(/duplicate|unique/i.test(error.message) ? 'Esse pagamento já tem comissão registrada para este parceiro.' : 'Erro ao registrar: ' + error.message); return }
    toast.success('Comissão antiga registrada'); setHistOpen(false); onChanged()
  }
  const removeHist = async (c: Commission) => {
    if (!confirm('Excluir este registro de histórico?')) return
    const { error } = await supabase.from('partner_commissions').delete().eq('id', c.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    onChanged()
  }

  const openNewLink = () => {
    setEditingLinkId(null)
    setLf({ unit: '', client_id: '', process_id: '', pct: pctStr(partner?.default_pct), categories: partner?.default_categories ?? DEFAULT_PARTNER_CATEGORIES, valid_from: todayISO(), valid_until: '', indeterminate: true, notes: '' })
    setLinkOpen(true)
  }
  const openEditLink = (l: PartnerLink) => {
    setEditingLinkId(l.id)
    setLf({ unit: l.business_unit ?? '', client_id: l.client_id, process_id: l.process_id ?? '', pct: pctStr(l.pct), categories: l.categories ?? DEFAULT_PARTNER_CATEGORIES, valid_from: l.valid_from, valid_until: l.valid_until ?? '', indeterminate: !l.valid_until, notes: l.notes ?? '' })
    setLinkOpen(true)
  }
  const saveLink = async () => {
    if (!partner) return
    if (!lf.client_id) { toast.error('Escolha o cliente'); return }
    const pct = parsePct(lf.pct)
    if (pct == null || pct < 0 || pct > 100) { toast.error('Informe a % de comissão'); return }
    if (lf.categories.length === 0) { toast.error('Escolha ao menos uma categoria de receita'); return }
    if (!lf.indeterminate && !lf.valid_until) { toast.error('Informe a data de fim da vigência ou marque indeterminada'); return }
    const row = {
      partner_id: partner.id, client_id: lf.client_id, process_id: lf.process_id || null, business_unit: lf.unit || null, pct, categories: lf.categories,
      valid_from: lf.valid_from || todayISO(), valid_until: lf.indeterminate ? null : lf.valid_until, notes: lf.notes || null, active: true,
    }
    const { error } = editingLinkId
      ? await supabase.from('partner_clients').update(row).eq('id', editingLinkId)
      : await supabase.from('partner_clients').insert(row)
    if (error) { toast.error(/duplicate|unique/i.test(error.message) ? 'Este cliente já está vinculado a este parceiro.' : 'Erro ao vincular: ' + error.message); return }
    // mantém o texto "Indicado por" do cliente coerente com o parceiro
    await supabase.from('clients').update({ origin: 'Indicação', referred_by: partner.name, referral_fee_pct: pct }).eq('id', lf.client_id)
    toast.success(editingLinkId ? 'Vínculo atualizado' : 'Cliente vinculado'); setLinkOpen(false); onChanged()
  }
  const toggleLink = async (l: PartnerLink) => {
    const { error } = await supabase.from('partner_clients').update({ active: !l.active }).eq('id', l.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    onChanged()
  }

  const clientProcesses = processes.filter(p => p.client_id === lf.client_id)
  const tabs: [typeof tab, string][] = isNew ? [['dados', 'Dados']] : [['dados', 'Dados e regra'], ['clientes', `Clientes (${links.length})`], ['comissoes', `Comissões (${commissions.length})`]]

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-[760px] w-[96vw] max-h-[90vh] overflow-y-auto overflow-x-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>{partner ? partner.name : 'Novo parceiro'}</DialogTitle>
          <div className="flex gap-1.5 pt-2">
            {tabs.map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${tab === k ? 'bg-primary/10 border-primary/30 text-primary' : 'border-transparent text-muted-foreground hover:bg-muted'}`}>{label}</button>
            ))}
          </div>
        </DialogHeader>

        <div className="px-6 py-4 space-y-5">
          {tab === 'dados' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2"><Label>Nome</Label><Input value={form.name} onChange={e => set('name', e.target.value)} className="h-10" /></div>
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={form.kind} onValueChange={v => v && set('kind', v)}>
                    <SelectTrigger className="h-10"><SelectValue>{PARTNER_KINDS.find(k => k.value === form.kind)?.label}</SelectValue></SelectTrigger>
                    <SelectContent>{PARTNER_KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => v && set('status', v)}>
                    <SelectTrigger className="h-10"><SelectValue>{form.status === 'ativo' ? 'Ativo' : 'Encerrado'}</SelectValue></SelectTrigger>
                    <SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="encerrado">Encerrado</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>CPF / CNPJ</Label><Input value={form.document} onChange={e => set('document', e.target.value)} className="h-10" /></div>
                {form.kind === 'advogado' && <div className="space-y-1.5"><Label>OAB</Label><Input value={form.oab} onChange={e => set('oab', e.target.value)} placeholder="Ex: OAB/RS 12345" className="h-10" /></div>}
                <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} className="h-10" /></div>
                <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.phone} onChange={e => set('phone', e.target.value)} className="h-10" /></div>
                <div className="space-y-1.5"><Label>Chave PIX</Label><Input value={form.pix_key} onChange={e => set('pix_key', e.target.value)} className="h-10" /></div>
                <div className="space-y-1.5"><Label>Dados bancários</Label><Input value={form.bank_info} onChange={e => set('bank_info', e.target.value)} placeholder="Banco, agência, conta" className="h-10" /></div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Também é cliente?</Label>
                  <ClientCombobox clients={clients} value={form.client_id} onChange={v => set('client_id', v)} placeholder="Não / escolher cliente" />
                </div>
              </div>

              <div className="space-y-3 rounded-xl border p-4 bg-muted/30">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Regra padrão da parceria</p>
                <p className="text-xs text-muted-foreground -mt-1">Vem pré-selecionada ao vincular um cliente; dá para ajustar por cliente quando o acordo for diferente.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>% de comissão</Label>
                    <div className="relative"><Input value={form.default_pct} onChange={e => set('default_pct', e.target.value)} placeholder="Ex: 10" className="h-10 pr-8" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span></div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Prazo para repassar (dias úteis)</Label>
                    <Input value={form.payment_days} onChange={e => set('payment_days', e.target.value.replace(/\D/g, ''))} className="h-10" />
                    <p className="text-[11px] text-muted-foreground">Contado a partir do recebimento do cliente.</p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Comissão sobre (categorias do Financeiro)</Label>
                    <CategoryChips value={form.default_categories} onChange={v => set('default_categories', v)} />
                  </div>
                  <div className="space-y-1.5"><Label>Início da parceria</Label><Input type="date" value={form.valid_from} onChange={e => set('valid_from', e.target.value)} className="h-10" /></div>
                  <div className="space-y-1.5">
                    <Label>Fim da vigência</Label>
                    <div className="flex items-center gap-3 h-10">
                      <Switch checked={!form.valid_until} onCheckedChange={v => set('valid_until', v ? '' : todayISO())} />
                      <span className="text-sm">Indeterminada</span>
                    </div>
                    {form.valid_until && <Input type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} className="h-10" />}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Contrato / pasta (link)</Label><Input value={form.drive_url} onChange={e => set('drive_url', e.target.value)} placeholder="Link do contrato da parceria" className="h-10" /></div>
                <div className="space-y-1.5"><Label>Parceria desde</Label><Input type="date" value={form.started_at} onChange={e => set('started_at', e.target.value)} className="h-10" /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} /></div>
              </div>

              <div className="flex items-center justify-between pt-1">
                {partner ? <Button variant="ghost" size="sm" className="text-destructive" onClick={remove}><Trash2 className="h-3.5 w-3.5 mr-1" />Excluir</Button> : <span />}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose}>Cancelar</Button>
                  <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
                </div>
              </div>
            </>
          )}

          {tab === 'clientes' && partner && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Clientes que vieram por este parceiro</p>
                <Button size="sm" onClick={openNewLink}><Plus className="h-3 w-3 mr-1" />Vincular cliente</Button>
              </div>
              {links.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum cliente vinculado ainda.</p>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Cliente</TableHead><TableHead>Regra</TableHead><TableHead>Vigência</TableHead><TableHead>Status</TableHead><TableHead />
                    </TableRow></TableHeader>
                    <TableBody>
                      {links.map(l => (
                        <TableRow key={l.id} className={l.active ? '' : 'opacity-60'}>
                          <TableCell className="text-sm font-medium">
                            {clientName.get(l.client_id) ?? '—'}
                            {l.process_id && <span className="block text-[11px] text-muted-foreground font-normal">só no processo {processes.find(p => p.id === l.process_id)?.title ?? ''}</span>}
                          </TableCell>
                          <TableCell className="text-sm">{pctStr(l.pct)}% · {categoriesLabel(l.categories)}{l.business_unit && <Badge variant="outline" className="text-[10px] ml-1.5">só {l.business_unit === 'saas' ? 'SaaS' : 'Advocacia'}</Badge>}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{vigencia(l.valid_from, l.valid_until)}</TableCell>
                          <TableCell>{l.active ? <Badge className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-0">Ativo</Badge> : <Badge variant="secondary" className="text-[10px]">Desativado</Badge>}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEditLink(l)}>Editar</Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => toggleLink(l)}>{l.active ? 'Desativar' : 'Reativar'}</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Só gera comissão de pagamentos recebidos a partir da data de início da vigência do vínculo. Pagamentos anteriores (e repasses já lançados à mão) não são recalculados.
              </p>
            </>
          )}

          {tab === 'comissoes' && partner && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Comissões geradas pelo Financeiro e o histórico de parcerias anteriores.</p>
              <Button size="sm" variant="outline" onClick={openHist}><Plus className="h-3 w-3 mr-1" />Registrar comissão antiga</Button>
            </div>
          )}
          {tab === 'comissoes' && partner && (
            commissions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma comissão ainda. Elas aparecem quando um cliente vinculado tem um pagamento marcado como recebido no Financeiro — ou registre as antigas acima.</p>
            ) : (
              <>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Recebido</TableHead><TableHead>Cliente</TableHead><TableHead>Unidade</TableHead><TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">Comissão</TableHead><TableHead>Pagar até</TableHead><TableHead>Status</TableHead><TableHead>Recibo</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {commissions.map(c => {
                        const rec = receiptOf.get(c.id)
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="text-sm">{fmtDate(c.received_at)}</TableCell>
                            <TableCell className="text-sm">{c.client_id ? clientName.get(c.client_id) ?? '—' : '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{unitLabel(c.business_unit)}</Badge></TableCell>
                            <TableCell className="text-right text-sm"><Sensitive>{fmtBRL(Number(c.base_amount))}</Sensitive></TableCell>
                            <TableCell className="text-right text-sm font-medium"><Sensitive>{fmtBRL(Number(c.amount))}</Sensitive> <span className="text-[11px] text-muted-foreground">({pctStr(c.pct)}%)</span></TableCell>
                            <TableCell className="text-sm">{statusOf(c) === 'paga' ? '—' : (dueOf(c) ? fmtDate(dueOf(c) as string) : '—')}</TableCell>
                            <TableCell>{statusBadge(statusOf(c))}{c.historical && <Badge variant="secondary" className="text-[10px] ml-1" title={c.paid_at ? `Pago em ${fmtDate(c.paid_at)}` : undefined}>Histórico</Badge>}{c.needs_review && <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-red-500" />}</TableCell>
                            <TableCell>{rec && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => downloadPartnerReceipt(rec)}><FileDown className="h-3 w-3 mr-1" />{rec.number}</Button>}{c.historical && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => removeHist(c)}><Trash2 className="h-3 w-3" /></Button>}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                {commissions.some(c => c.needs_review) && (
                  <p className="text-xs text-red-600 dark:text-red-400">"Revisar": o pagamento do cliente foi estornado ou apagado depois de a comissão já ter sido paga. Confira com o parceiro.</p>
                )}
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><ExternalLink className="h-3 w-3" />Para marcar uma comissão como paga, use o Financeiro (despesa "Comissão de parceria"). O recibo aparece aqui automaticamente.</p>
              </>
            )
          )}
          {tab === 'comissoes' && receipts.length > 0 && (
            <p className="text-[11px] text-muted-foreground">{receipts.length} recibo(s) emitido(s) para este parceiro.</p>
          )}
        </div>

        {/* comissão antiga (histórico) */}
        <Dialog open={histOpen} onOpenChange={setHistOpen}>
          <DialogContent className="max-w-[560px] w-[96vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Registrar comissão antiga</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Para guardar no histórico o que já veio por esta parceria e já foi pago ao parceiro. Não cria despesa no Financeiro nem mexe no que você já lançou lá.</p>
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <ClientCombobox clients={clients} value={hf.client_id} onChange={pickHistClient} allowNone={false} placeholder="Escolha o cliente" />
              </div>
              {hf.client_id && histPayments.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Pagamento do cliente no Financeiro (opcional)</Label>
                  <Select value={hf.source || '__none__'} onValueChange={v => pickHistSource(v === '__none__' ? '' : (v ?? ''))}>
                    <SelectTrigger className="h-10"><SelectValue>{hf.source ? (() => { const r = histPayments.find(x => x.id === hf.source); return r ? `${fmtDate(r.date)} · ${r.description}` : '' })() : 'Informar valor manualmente'}</SelectValue></SelectTrigger>
                    <SelectContent className="min-w-80">
                      <SelectItem value="__none__">Informar valor manualmente</SelectItem>
                      {histPayments.map(r => <SelectItem key={r.id} value={r.id}>{fmtDate(r.date)} · {r.description} · {fmtBRL(Number(r.value))}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <Label>Empresa</Label>
                  <div className="inline-flex rounded-lg border p-0.5 bg-muted/40">
                    {(['advocacia', 'saas'] as const).map(u => (
                      <button key={u} type="button" onClick={() => setHf(f => ({ ...f, unit: u }))}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${hf.unit === u ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{u === 'saas' ? 'Sistema (SRJUR)' : 'Advocacia (escritório)'}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5"><Label>Valor recebido do cliente (líquido)</Label><Input value={hf.base} onChange={e => recalcHist({ base: e.target.value })} placeholder="0,00" className="h-10" /></div>
                <div className="space-y-1.5">
                  <Label>% de comissão</Label>
                  <div className="relative"><Input value={hf.pct} onChange={e => recalcHist({ pct: e.target.value })} className="h-10 pr-8" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span></div>
                </div>
                <div className="space-y-1.5"><Label>Comissão paga ao parceiro</Label><Input value={hf.amount} onChange={e => setHf(f => ({ ...f, amount: e.target.value }))} placeholder="0,00" className="h-10" /></div>
                <div className="space-y-1.5"><Label>Cliente pagou em</Label><Input type="date" value={hf.received_at} onChange={e => setHf(f => ({ ...f, received_at: e.target.value }))} className="h-10" /></div>
                <div className="space-y-1.5"><Label>Parceiro foi pago em</Label><Input type="date" value={hf.paid_at} onChange={e => setHf(f => ({ ...f, paid_at: e.target.value }))} className="h-10" /></div>
              </div>
              <div className="space-y-1.5"><Label>Observação</Label><Textarea value={hf.notes} onChange={e => setHf(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
              {hf.client_id && !links.some(l => l.client_id === hf.client_id && !l.process_id) && (
                <label className="flex items-start gap-2 text-sm"><Switch checked={hf.createLink} onCheckedChange={v => setHf(f => ({ ...f, createLink: v }))} />
                  <span>Vincular este cliente ao parceiro (vale só para os próximos pagamentos, com a regra do parceiro)</span></label>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setHistOpen(false)}>Cancelar</Button>
                <Button onClick={saveHist}>Registrar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* vincular cliente */}
        <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
          <DialogContent className="max-w-[520px] w-[96vw]">
            <DialogHeader><DialogTitle>{editingLinkId ? 'Editar vínculo' : 'Vincular cliente'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <ClientCombobox clients={clients} value={lf.client_id} onChange={v => setLf(f => ({ ...f, client_id: v, process_id: '' }))} allowNone={false} placeholder="Escolha o cliente" />
              </div>
              {lf.client_id && clientProcesses.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Processo / serviço (opcional)</Label>
                  <ProcessCombobox processes={clientProcesses} value={lf.process_id} onChange={v => setLf(f => ({ ...f, process_id: v }))} placeholder="Todos os pagamentos do cliente" />
                  <p className="text-[11px] text-muted-foreground">Se escolher um processo, só pagamentos ligados a ele geram comissão.</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>% de comissão</Label>
                  <div className="relative"><Input value={lf.pct} onChange={e => setLf(f => ({ ...f, pct: e.target.value }))} className="h-10 pr-8" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span></div>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Vale para</Label>
                  <div className="inline-flex rounded-lg border p-0.5 bg-muted/40">
                    {([['', 'As duas empresas'], ['advocacia', 'Só advocacia'], ['saas', 'Só sistema']] as const).map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setLf(f => ({ ...f, unit: k }))}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${lf.unit === k ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Para cliente das duas empresas com acordos diferentes, crie um vínculo para cada empresa.</p>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Comissão sobre (categorias do Financeiro)</Label>
                  <CategoryChips value={lf.categories} onChange={v => setLf(f => ({ ...f, categories: v }))} />
                </div>
                <div className="space-y-1.5"><Label>Vigência — início</Label><Input type="date" value={lf.valid_from} onChange={e => setLf(f => ({ ...f, valid_from: e.target.value }))} className="h-10" /></div>
                <div className="space-y-1.5">
                  <Label>Vigência — fim</Label>
                  <div className="flex items-center gap-3 h-10">
                    <Switch checked={lf.indeterminate} onCheckedChange={v => setLf(f => ({ ...f, indeterminate: v, valid_until: v ? '' : (f.valid_until || todayISO()) }))} />
                    <span className="text-sm">Indeterminada</span>
                  </div>
                  {!lf.indeterminate && <Input type="date" value={lf.valid_until} onChange={e => setLf(f => ({ ...f, valid_until: e.target.value }))} className="h-10" />}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancelar</Button>
                <Button onClick={saveLink}>Salvar vínculo</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
