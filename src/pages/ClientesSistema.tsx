import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Search, Cpu, Wallet, Wrench, Rocket, Eye, EyeOff, Copy, Trash2, ExternalLink, KeyRound, CalendarClock } from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import { Sensitive } from '@/components/Sensitive'
import { ResponsibleSelect } from '@/components/ResponsibleSelect'
import { StackTable } from '@/components/StackTable'
import { ClientCombobox } from '@/components/ClientCombobox'

interface SaasClient {
  id: string; client_id: string; plan: string | null; status: 'implantacao' | 'ativo' | 'pausado' | 'cancelado'
  implementation_value: number | null; monthly_value: number | null; monthly_since: string | null; billing_day: number | null
  started_at: string | null; system_url: string | null; notes: string | null
}
interface ClientRow { id: string; name: string; status: string; email?: string | null; phone?: string | null; cpf_cnpj?: string | null }
interface Credential {
  id: string; saas_client_id: string; label: string; kind: string; url: string | null; username: string | null
  vault_secret_id: string | null; notes: string | null; last_revealed_at: string | null
}
interface HistoryRow { id: string; kind: string; body: string; happened_at: string; created_at: string }
interface Check { id: string; title: string; description: string | null; every_n: number; unit: string; next_due: string; last_done: string | null; active: boolean; responsible_ids: string[] | null }
interface TaskRow { id: string; title: string; status: string; priority: string; due_date: string | null; client_id: string | null; saas_kind: string | null; recurring_check_id: string | null; responsible_ids: string[] | null; description: string | null }

const STATUS: { value: SaasClient['status']; label: string; cls: string }[] = [
  { value: 'implantacao', label: 'Em implementação', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  { value: 'ativo', label: 'Ativo', cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  { value: 'pausado', label: 'Pausado', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
  { value: 'cancelado', label: 'Cancelado', cls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
]
const statusInfo = (s: string) => STATUS.find(x => x.value === s) ?? STATUS[1]
const CRED_KINDS = [['login', 'Login'], ['token', 'Token'], ['api', 'Chave de API'], ['link', 'Link'], ['conta', 'Conta'], ['outro', 'Outro']] as const
const TICKET_KINDS = [['bug', 'Bug'], ['ajuste', 'Ajuste'], ['duvida', 'Dúvida'], ['outro', 'Outro']] as const
const HIST_KINDS = [['nota', 'Anotação'], ['plano', 'Plano'], ['reajuste', 'Reajuste'], ['problema', 'Problema'], ['ajuste', 'Ajuste'], ['contato', 'Contato'], ['outro', 'Outro']] as const
const PRIORITIES = [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta'], ['urgente', 'Urgente']] as const
const UNITS = [['dias', 'dias'], ['semanas', 'semanas'], ['meses', 'meses']] as const

interface FinLite { client_id: string | null; category: string | null; value: number; date: string; due_date?: string | null; paid?: boolean; payment_date?: string | null; impacts_cash?: boolean | null }
interface Phase { id: string; saas_client_id: string; position: number; name: string; status: 'pendente' | 'andamento' | 'concluida'; due_date: string | null; done_at: string | null; notes: string | null }
interface Derived { implementation: number | null; monthly: number | null; monthlySince: string | null; startedAt: string | null }

// Sugestão a partir dos lançamentos de receita do SISTEMA no Financeiro:
//  - implementação = soma do que não é mensalidade;  - mensalidade = valor mais comum entre as mensalidades (empate: o mais recente);
//  - a partir de = data da primeira mensalidade;  - cliente desde = data do primeiro lançamento.
function deriveFromFinance(rows: FinLite[]): Derived {
  const isMens = (r: FinLite) => (r.category ?? '').trim().toLowerCase() === 'mensalidade'
  const impl = rows.filter(r => !isMens(r)), mens = rows.filter(isMens)
  const counts = new Map<number, { n: number; last: string }>()
  mens.forEach(r => { const v = Math.round(Number(r.value) * 100) / 100; const c = counts.get(v) ?? { n: 0, last: '' }; counts.set(v, { n: c.n + 1, last: r.date > c.last ? r.date : c.last }) })
  const best = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || (b[1].last > a[1].last ? 1 : -1))[0]
  const dates = rows.map(r => r.date.slice(0, 10)).sort()
  return {
    implementation: impl.length ? impl.reduce((s, r) => s + Number(r.value), 0) : null,
    monthly: best ? best[0] : null,
    monthlySince: mens.length ? mens.map(r => r.date.slice(0, 10)).sort()[0] : null,
    startedAt: dates[0] ?? null,
  }
}

const todayISO = () => new Date().toISOString().slice(0, 10)
const parseMoney = (s: string) => { if (!s.trim()) return null; const n = parseFloat(s.replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n }
const moneyStr = (n: number | null | undefined) => (n == null ? '' : Number(n).toFixed(2).replace('.', ','))
const label = <T extends readonly (readonly [string, string])[]>(list: T, v: string | null | undefined) => list.find(x => x[0] === v)?.[1] ?? v ?? ''

function Kpi({ icon: Icon, title, value, sub }: { icon: typeof Cpu; title: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--glass-border)] bg-card p-4 shadow-[0_12px_28px_-20px_var(--glass-drop),inset_0_1px_0_var(--glass-highlight)]">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{title}</div>
      <p className="text-xl font-semibold mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

export default function ClientesSistema() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [saas, setSaas] = useState<SaasClient[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [finRows, setFinRows] = useState<FinLite[]>([])
  const [importing, setImporting] = useState(false)
  const [phases, setPhases] = useState<Phase[]>([])
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | SaasClient['status']>('')
  const [openId, setOpenId] = useState<string | null>(null) // clients.id
  const [addOpen, setAddOpen] = useState(false)
  const [allClients, setAllClients] = useState<ClientRow[]>([])
  const [addId, setAddId] = useState('')
  const [addMode, setAddMode] = useState<'existente' | 'novo'>('existente')
  const [nf, setNf] = useState({ name: '', type: 'pessoa_fisica', cpf_cnpj: '', email: '', phone: '' })

  const load = async () => {
    const [c, s, t] = await Promise.all([
      supabase.from('clients').select('id, name, status, email, phone, cpf_cnpj').eq('is_saas', true).order('name'),
      supabase.from('saas_clients').select('*'),
      supabase.from('tasks').select('id, title, status, priority, due_date, client_id, saas_kind, recurring_check_id, responsible_ids, description')
        .eq('business_unit', 'saas').not('client_id', 'is', null).neq('status', 'cancelada'),
    ])
    const err = [c, s, t].find(x => x.error)?.error
    if (err) toast.error('Erro ao carregar: ' + err.message)
    setClients((c.data ?? []) as ClientRow[])
    setSaas((s.data ?? []) as SaasClient[])
    setTasks((t.data ?? []) as TaskRow[])
    const [f, ph] = await Promise.all([
      supabase.from('finance').select('client_id, category, value, date, due_date, paid, payment_date, impacts_cash').eq('type', 'receita').eq('business_unit', 'saas'),
      supabase.from('saas_impl_phases').select('id, saas_client_id, position, name, status, due_date, done_at, notes'),
    ])
    setPhases((ph.data ?? []) as Phase[])
    if (f.error) toast.error('Erro ao ler o Financeiro: ' + f.error.message)
    setFinRows(((f.data ?? []) as FinLite[]).map(r => ({ ...r, value: Number(r.value) })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const saasOf = useMemo(() => new Map(saas.map(s => [s.client_id, s])), [saas])
  const derivedOf = useMemo(() => {
    const by = new Map<string, FinLite[]>()
    finRows.forEach(r => { if (r.client_id) by.set(r.client_id, [...(by.get(r.client_id) ?? []), r]) })
    return new Map([...by.entries()].map(([id, rs]) => [id, deriveFromFinance(rs)]))
  }, [finRows])
  const rows = useMemo(() => clients.map(c => {
    const s = saasOf.get(c.id)
    const mine = tasks.filter(t => t.client_id === c.id && t.status === 'pendente')
    const d = derivedOf.get(c.id)
    const ph = s ? phases.filter(p => p.saas_client_id === s.id) : []
    return {
      client: c, saas: s,
      fasesDone: ph.filter(p => p.status === 'concluida').length, fasesTotal: ph.length,
      impl: s?.implementation_value ?? d?.implementation ?? null, implFromFin: s?.implementation_value == null && d?.implementation != null,
      monthly: s?.monthly_value ?? d?.monthly ?? null, monthlyFromFin: s?.monthly_value == null && d?.monthly != null,
      since: s?.started_at ?? d?.startedAt ?? null,
      status: (s?.status ?? 'ativo') as SaasClient['status'],
      chamados: mine.filter(t => t.saas_kind !== 'verificacao').length,
      proxVerif: mine.filter(t => t.saas_kind === 'verificacao' && t.due_date).map(t => t.due_date as string).sort()[0] ?? null,
    }
  }), [clients, saasOf, tasks, derivedOf, phases])

  // Grava no cadastro só o que está vazio; nunca sobrescreve o que já foi preenchido.
  const importAll = async () => {
    if (importing) return
    if (!confirm('Gravar no cadastro os valores calculados a partir do Financeiro? Só os campos vazios são preenchidos.')) return
    setImporting(true)
    try {
      let n = 0
      for (const r of rows) {
        const d = derivedOf.get(r.client.id)
        if (!d) continue
        const s = r.saas
        const patch: Record<string, unknown> = {}
        if (!s || (s.implementation_value == null && d.implementation != null)) patch.implementation_value = d.implementation
        if (!s || (s.monthly_value == null && d.monthly != null)) patch.monthly_value = d.monthly
        if (!s || (!s.monthly_since && d.monthlySince)) patch.monthly_since = d.monthlySince
        if (!s || (!s.started_at && d.startedAt)) patch.started_at = d.startedAt
        const real = Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null))
        if (Object.keys(real).length === 0) continue
        const { data, error } = s
          ? await supabase.from('saas_clients').update(real).eq('id', s.id).select('id').single()
          : await supabase.from('saas_clients').insert({ ...real, client_id: r.client.id, status: d.monthly != null ? 'ativo' : 'implantacao' }).select('id').single()
        if (error || !data) { toast.error(`${r.client.name}: ${error?.message ?? 'erro'}`); continue }
        await supabase.from('saas_history').insert({ saas_client_id: data.id, kind: 'nota', body: 'Valores preenchidos a partir dos lançamentos do Financeiro' })
        n++
      }
      toast.success(`${n} cliente(s) atualizado(s)`)
      await load()
    } finally { setImporting(false) }
  }

  const openAdd = async () => {
    const { data } = await supabase.from('clients').select('id, name, status, email, phone, cpf_cnpj').neq('is_saas', true).order('name')
    setAllClients((data ?? []) as ClientRow[]); setAddId(''); setAddMode('existente'); setNf({ name: '', type: 'pessoa_fisica', cpf_cnpj: '', email: '', phone: '' }); setAddOpen(true)
  }
  const confirmAdd = async () => {
    if (addMode === 'novo') {
      if (!nf.name.trim()) { toast.error('Informe o nome do cliente'); return }
      const { data, error } = await supabase.from('clients').insert({
        name: nf.name.trim(), type: nf.type, cpf_cnpj: nf.cpf_cnpj.trim() || null, email: nf.email.trim().toLowerCase() || null, phone: nf.phone.trim() || null,
        status: 'ativo', is_saas: true, is_juridico: false, created_by: profile?.id ?? null,
      }).select('id').single()
      if (error || !data) { toast.error('Erro ao cadastrar: ' + (error?.message ?? '')); return }
      toast.success('Cliente cadastrado — ele também aparece em Clientes')
      setAddOpen(false); await load(); setOpenId(data.id); return
    }
    if (!addId) { toast.error('Escolha o cliente'); return }
    const { error } = await supabase.from('clients').update({ is_saas: true }).eq('id', addId)
    if (error) { toast.error('Erro: ' + error.message); return }
    setAddOpen(false); await load(); setOpenId(addId)
  }

  const visible = rows.filter(r => (!statusFilter || r.status === statusFilter) && (!search.trim() || r.client.name.toLowerCase().includes(search.trim().toLowerCase())))
  const stats = useMemo(() => ({
    ativos: rows.filter(r => r.status === 'ativo').length,
    mrr: rows.filter(r => r.status === 'ativo').reduce((s, r) => s + Number(r.monthly ?? 0), 0),
    implantando: rows.filter(r => r.status === 'implantacao').length,
    chamados: rows.reduce((s, r) => s + r.chamados, 0),
    implValor: rows.filter(r => r.status === 'implantacao').reduce((s, r) => s + Number(r.impl ?? 0), 0),
    fasesAbertas: rows.filter(r => r.status === 'implantacao').reduce((s, r) => s + (r.fasesTotal - r.fasesDone), 0),
    ...(() => {
      const mes = new Date().toISOString().slice(0, 7)
      const caixa = finRows.filter(r => r.impacts_cash !== false)
      const sum = (xs: FinLite[]) => xs.reduce((s, r) => s + Number(r.value), 0)
      return {
        recebidoMes: sum(caixa.filter(r => r.paid && (r.payment_date ?? r.date).slice(0, 7) === mes)),
        aReceberMes: sum(caixa.filter(r => !r.paid && (r.due_date ?? r.date).slice(0, 7) === mes)),
        totalRecebido: sum(caixa.filter(r => r.paid)),
      }
    })(),
    semDados: rows.filter(r => !r.saas).length,
    precisaImportar: rows.filter(r => { const d = derivedOf.get(r.client.id); return !!d && (!r.saas || (r.saas.monthly_value == null && d.monthly != null) || (r.saas.implementation_value == null && d.implementation != null)) }).length,
  }), [rows, finRows, derivedOf])

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
       <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clientes do sistema</h1>
        <p className="text-sm text-muted-foreground">Quem usa o SRJUR: plano, valores, acessos, chamados e verificações</p>
       </div>
        <Button size="sm" onClick={openAdd}><Plus className="h-3 w-3 mr-1" />Adicionar cliente</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Wallet} title="Recebido no mês" value={<Sensitive>{fmtBRL(stats.recebidoMes)}</Sensitive>} sub="receitas do sistema já pagas" />
        <Kpi icon={CalendarClock} title="A receber no mês" value={<Sensitive>{fmtBRL(stats.aReceberMes)}</Sensitive>} sub="vence neste mês e ainda não foi pago" />
        <Kpi icon={Wallet} title="Total recebido" value={<Sensitive>{fmtBRL(stats.totalRecebido)}</Sensitive>} sub="tudo que o sistema já recebeu" />
        <Kpi icon={Wallet} title="Mensalidades (ativos)" value={<Sensitive>{fmtBRL(stats.mrr)}</Sensitive>} sub="por mês, dos clientes ativos" />
        <Kpi icon={Cpu} title="Clientes ativos" value={stats.ativos} sub={stats.semDados ? `${stats.semDados} sem dados cadastrados` : undefined} />
        <Kpi icon={Rocket} title="Em implementação" value={stats.implantando} sub={stats.implantando ? `${stats.fasesAbertas} fase(s) em aberto` : undefined} />
        <Kpi icon={Rocket} title="Implementações (valor)" value={<Sensitive>{fmtBRL(stats.implValor)}</Sensitive>} sub="clientes em implementação" />
        <Kpi icon={Wrench} title="Chamados abertos" value={stats.chamados} />
      </div>

      {stats.precisaImportar > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-sm">Os valores em itálico vêm do Financeiro (lançamentos de receita do sistema) e ainda não estão gravados no cadastro de {stats.precisaImportar} cliente(s).</p>
          <Button size="sm" disabled={importing} onClick={importAll}>{importing ? 'Gravando...' : 'Gravar a partir do Financeiro'}</Button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {([['', 'Todos'], ...STATUS.map(s => [s.value, s.label])] as [string, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setStatusFilter(k as '' | SaasClient['status'])}
            className={`px-2.5 py-1 rounded-md text-xs border ${statusFilter === k ? 'bg-primary/10 border-primary/30 text-primary' : 'border-transparent text-muted-foreground hover:bg-muted'}`}>{l}</button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="h-9 pl-8 w-56" />
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p> : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhum cliente de sistema. Marque "Sistema (SaaS)" no cadastro do cliente para ele aparecer aqui.
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <StackTable>
            <TableHeader><TableRow>
              <TableHead>Cliente</TableHead><TableHead>Plano</TableHead><TableHead>Status</TableHead><TableHead>Fases</TableHead>
              <TableHead className="text-right">Implementação</TableHead><TableHead className="text-right">Mensalidade</TableHead>
              <TableHead>Desde</TableHead><TableHead className="text-right">Chamados</TableHead><TableHead>Próx. verificação</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {visible.map(r => (
                <TableRow key={r.client.id} className="cursor-pointer" onClick={() => setOpenId(r.client.id)}>
                  <TableCell className="font-medium">{r.client.name}</TableCell>
                  <TableCell className="text-sm">{r.saas?.plan || '—'}</TableCell>
                  <TableCell><Badge className={`text-[10px] border-0 ${statusInfo(r.status).cls}`}>{statusInfo(r.status).label}</Badge></TableCell>
                  <TableCell className="text-sm">{r.fasesTotal ? `${r.fasesDone}/${r.fasesTotal}` : '—'}</TableCell>
                  <TableCell className="text-right text-sm"><Sensitive><span title={r.implFromFin ? 'Calculado a partir do Financeiro' : undefined} className={r.implFromFin ? 'text-muted-foreground italic' : ''}>{r.impl != null ? fmtBRL(Number(r.impl)) : '—'}</span></Sensitive></TableCell>
                  <TableCell className="text-right text-sm"><Sensitive><span title={r.monthlyFromFin ? 'Calculado a partir do Financeiro' : undefined} className={r.monthlyFromFin ? 'text-muted-foreground italic' : ''}>{r.monthly != null ? fmtBRL(Number(r.monthly)) : '—'}</span></Sensitive></TableCell>
                  <TableCell className="text-sm">{r.since ? fmtDate(r.since) : '—'}</TableCell>
                  <TableCell className="text-right text-sm">{r.chamados || '—'}</TableCell>
                  <TableCell className="text-sm">{r.proxVerif ? fmtDate(r.proxVerif) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </StackTable>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-[480px] w-[96vw]">
          <DialogHeader><DialogTitle>Adicionar cliente ao sistema</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="inline-flex rounded-lg border p-0.5 bg-muted/40">
              {([['existente', 'Já cadastrado'], ['novo', 'Cliente novo']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setAddMode(k)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${addMode === k ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
              ))}
            </div>
            {addMode === 'existente' ? (
              <>
                <p className="text-xs text-muted-foreground">Escolha um cliente já cadastrado. Ele passa a ser cliente do sistema (continua sendo da advocacia, se for) e os dados dele e os valores do Financeiro já vêm preenchidos.</p>
                <ClientCombobox clients={allClients} value={addId} onChange={setAddId} allowNone={false} placeholder="Escolha o cliente" />
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">O cliente é criado como cliente do sistema e também aparece na tela Clientes (marcado como Sistema).</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5 sm:col-span-2"><Label>Nome</Label><Input value={nf.name} onChange={e => setNf(f => ({ ...f, name: e.target.value }))} className="h-10" /></div>
                  <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Select value={nf.type} onValueChange={v => v && setNf(f => ({ ...f, type: v }))}>
                      <SelectTrigger className="h-10"><SelectValue>{nf.type === 'pessoa_juridica' ? 'Pessoa jurídica' : 'Pessoa física'}</SelectValue></SelectTrigger>
                      <SelectContent><SelectItem value="pessoa_fisica">Pessoa física</SelectItem><SelectItem value="pessoa_juridica">Pessoa jurídica</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>CPF / CNPJ</Label><Input value={nf.cpf_cnpj} onChange={e => setNf(f => ({ ...f, cpf_cnpj: e.target.value }))} className="h-10" /></div>
                  <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={nf.email} onChange={e => setNf(f => ({ ...f, email: e.target.value }))} className="h-10" /></div>
                  <div className="space-y-1.5"><Label>Telefone</Label><Input value={nf.phone} onChange={e => setNf(f => ({ ...f, phone: e.target.value }))} className="h-10" /></div>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button><Button onClick={confirmAdd}>{addMode === 'novo' ? 'Cadastrar' : 'Adicionar'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {openId && (
        <FichaDialog key={openId} client={clients.find(c => c.id === openId)!} saas={saasOf.get(openId) ?? null} derived={derivedOf.get(openId) ?? null} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </div>
  )
}

// ── Ficha ────────────────────────────────────────────────────────────────
function FichaDialog({ client, saas, derived, onClose, onChanged }: { client: ClientRow; saas: SaasClient | null; derived: Derived | null; onClose: () => void; onChanged: () => void }) {
  const { profile } = useAuth()
  const [tab, setTab] = useState<'dados' | 'implementacao' | 'acessos' | 'chamados' | 'verificacoes' | 'historico'>('dados')
  const [rec, setRec] = useState<SaasClient | null>(saas)

  const tabs: [typeof tab, string][] = [['dados', 'Dados'], ['implementacao', 'Implementação'], ['acessos', 'Acessos'], ['chamados', 'Chamados'], ['verificacoes', 'Verificações'], ['historico', 'Histórico']]
  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-[980px] w-[96vw] max-h-[90vh] overflow-y-auto overflow-x-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>{client.name}</DialogTitle>
          {(client.email || client.phone || client.cpf_cnpj) && (
            <p className="text-xs text-muted-foreground break-words">{[client.cpf_cnpj, client.email, client.phone].filter(Boolean).join(' · ')}</p>
          )}
          <div className="flex gap-1.5 pt-2 flex-wrap">
            {tabs.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} disabled={k !== 'dados' && !rec}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 ${tab === k ? 'bg-primary/10 border-primary/30 text-primary' : 'border-transparent text-muted-foreground hover:bg-muted'}`}>{l}</button>
            ))}
          </div>
        </DialogHeader>
        <div className="px-6 py-4 space-y-4">
          {tab === 'dados' && <DadosTab client={client} rec={rec} derived={derived} onSaved={r => { setRec(r); onChanged() }} />}
          {rec && tab === 'implementacao' && <ImplementacaoTab saasId={rec.id} status={rec.status} onChanged={onChanged} />}
          {rec && tab === 'acessos' && <AcessosTab saasId={rec.id} />}
          {rec && tab === 'chamados' && <ChamadosTab client={client} onChanged={onChanged} userId={profile?.id ?? null} />}
          {rec && tab === 'verificacoes' && <VerificacoesTab saasId={rec.id} onChanged={onChanged} />}
          {rec && tab === 'historico' && <HistoricoTab saasId={rec.id} />}
          {!rec && tab === 'dados' && <p className="text-xs text-muted-foreground">Salve os dados do cliente para liberar acessos, chamados, verificações e histórico.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DadosTab({ client, rec, derived, onSaved }: { client: ClientRow; rec: SaasClient | null; derived: Derived | null; onSaved: (r: SaasClient) => void }) {
  const [f, setF] = useState({
    plan: rec?.plan ?? '', status: (rec?.status ?? (derived?.monthly != null ? 'ativo' : 'implantacao')) as SaasClient['status'],
    implementation_value: moneyStr(rec?.implementation_value ?? derived?.implementation), monthly_value: moneyStr(rec?.monthly_value ?? derived?.monthly),
    monthly_since: rec?.monthly_since ?? derived?.monthlySince ?? '', billing_day: rec?.billing_day ? String(rec.billing_day) : '',
    started_at: rec?.started_at ?? derived?.startedAt ?? '', system_url: rec?.system_url ?? '', notes: rec?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }))

  const save = async () => {
    if (saving) return
    const day = f.billing_day.trim() ? parseInt(f.billing_day) : null
    if (day != null && (isNaN(day) || day < 1 || day > 31)) { toast.error('Dia de cobrança deve ser de 1 a 31'); return }
    const payload = {
      plan: f.plan.trim() || null, status: f.status, implementation_value: parseMoney(f.implementation_value), monthly_value: parseMoney(f.monthly_value),
      monthly_since: f.monthly_since || null, billing_day: day, started_at: f.started_at || null, system_url: f.system_url.trim() || null, notes: f.notes.trim() || null,
    }
    setSaving(true)
    try {
      const { data, error } = rec
        ? await supabase.from('saas_clients').update(payload).eq('id', rec.id).select('*').single()
        : await supabase.from('saas_clients').insert({ ...payload, client_id: client.id }).select('*').single()
      if (error || !data) { toast.error('Erro ao salvar: ' + (error?.message ?? '')); return }
      // registra no histórico o que mudou de importante
      if (rec) {
        const notes: { kind: string; body: string }[] = []
        if ((rec.plan ?? '') !== (payload.plan ?? '')) notes.push({ kind: 'plano', body: `Plano: ${rec.plan || '—'} → ${payload.plan || '—'}` })
        if (Number(rec.monthly_value ?? 0) !== Number(payload.monthly_value ?? 0)) notes.push({ kind: 'reajuste', body: `Mensalidade: ${fmtBRL(Number(rec.monthly_value ?? 0))} → ${fmtBRL(Number(payload.monthly_value ?? 0))}` })
        if (rec.status !== payload.status) notes.push({ kind: 'nota', body: `Status: ${statusInfo(rec.status).label} → ${statusInfo(payload.status).label}` })
        if (notes.length) await supabase.from('saas_history').insert(notes.map(n => ({ ...n, saas_client_id: rec.id })))
      } else {
        await supabase.from('saas_history').insert({ saas_client_id: data.id, kind: 'nota', body: 'Cliente cadastrado no módulo de sistemas' })
      }
      toast.success('Dados salvos'); onSaved(data as SaasClient)
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5"><Label>Plano</Label><Input value={f.plan} onChange={e => set('plan', e.target.value)} placeholder="Ex: Basic, Pro" className="h-10" /></div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={f.status} onValueChange={v => v && set('status', v as SaasClient['status'])}>
            <SelectTrigger className="h-10"><SelectValue>{statusInfo(f.status).label}</SelectValue></SelectTrigger>
            <SelectContent>{STATUS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Cliente desde</Label><Input type="date" value={f.started_at} onChange={e => set('started_at', e.target.value)} className="h-10" /></div>
        <div className="space-y-1.5"><Label>Valor da implementação (R$)</Label><Input value={f.implementation_value} onChange={e => set('implementation_value', e.target.value)} placeholder="0,00" className="h-10" /></div>
        <div className="space-y-1.5"><Label>Valor da mensalidade (R$)</Label><Input value={f.monthly_value} onChange={e => set('monthly_value', e.target.value)} placeholder="0,00" className="h-10" /></div>
        <div className="space-y-1.5"><Label>Mensalidade a partir de</Label><Input type="date" value={f.monthly_since} onChange={e => set('monthly_since', e.target.value)} className="h-10" /></div>
        <div className="space-y-1.5"><Label>Dia da cobrança</Label><Input value={f.billing_day} onChange={e => set('billing_day', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Ex: 5" className="h-10" /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Link do sistema do cliente</Label><Input value={f.system_url} onChange={e => set('system_url', e.target.value)} placeholder="https://..." className="h-10" /></div>
        <div className="space-y-1.5 sm:col-span-3"><Label>Observações</Label><Textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={4} /></div>
      </div>
      {derived && (!rec || rec.implementation_value == null || rec.monthly_value == null) && (
        <p className="text-xs rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">Campos vazios foram preenchidos com o que está lançado no Financeiro (receitas do sistema). Confira e clique em Salvar para gravar.</p>
      )}
      <p className="text-[11px] text-muted-foreground">Estes valores são o cadastro do contrato. O que entra no caixa continua vindo dos lançamentos do Financeiro.</p>
      <div className="flex justify-end"><Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button></div>
    </div>
  )
}

function AcessosTab({ saasId }: { saasId: string }) {
  const [list, setList] = useState<Credential[]>([])
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [edit, setEdit] = useState<Credential | 'new' | null>(null)
  const [cf, setCf] = useState({ label: '', kind: 'login', url: '', username: '', secret: '', notes: '' })

  const load = async () => {
    const { data, error } = await supabase.from('saas_credentials').select('id, saas_client_id, label, kind, url, username, vault_secret_id, notes, last_revealed_at').eq('saas_client_id', saasId).order('label')
    if (error) toast.error('Erro: ' + error.message)
    setList((data ?? []) as Credential[])
  }
  useEffect(() => { load() }, [saasId])

  const reveal = async (c: Credential) => {
    const { data, error } = await supabase.rpc('saas_reveal_secret', { p_credential: c.id })
    if (error) { toast.error('Erro: ' + error.message); return }
    setRevealed(r => ({ ...r, [c.id]: (data as string) ?? '' }))
    setTimeout(() => setRevealed(r => { const n = { ...r }; delete n[c.id]; return n }), 30000)
    load()
  }
  const copy = (txt: string, what: string) => { navigator.clipboard.writeText(txt); toast.success(what + ' copiado') }
  const openEdit = (c: Credential | 'new') => {
    setEdit(c)
    setCf(c === 'new' ? { label: '', kind: 'login', url: '', username: '', secret: '', notes: '' } : { label: c.label, kind: c.kind, url: c.url ?? '', username: c.username ?? '', secret: '', notes: c.notes ?? '' })
  }
  const save = async () => {
    if (!cf.label.trim()) { toast.error('Dê um nome ao acesso'); return }
    const row = { saas_client_id: saasId, label: cf.label.trim(), kind: cf.kind, url: cf.url.trim() || null, username: cf.username.trim() || null, notes: cf.notes.trim() || null }
    let id = edit !== 'new' && edit ? edit.id : ''
    if (id) {
      const { error } = await supabase.from('saas_credentials').update(row).eq('id', id)
      if (error) { toast.error('Erro: ' + error.message); return }
    } else {
      const { data, error } = await supabase.from('saas_credentials').insert(row).select('id').single()
      if (error || !data) { toast.error('Erro: ' + (error?.message ?? '')); return }
      id = data.id
    }
    if (cf.secret) {
      const { error } = await supabase.rpc('saas_set_secret', { p_credential: id, p_secret: cf.secret })
      if (error) { toast.error('O acesso foi salvo, mas a senha/token não: ' + error.message); load(); return }
    }
    toast.success('Acesso salvo'); setEdit(null); load()
  }
  const remove = async (c: Credential) => {
    if (!confirm(`Excluir o acesso "${c.label}"? A senha guardada também é apagada.`)) return
    const { error } = await supabase.from('saas_credentials').delete().eq('id', c.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    load()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" />Senhas e tokens ficam criptografados; só administradores abrem, e cada abertura é registrada.</p>
        <Button size="sm" onClick={() => openEdit('new')}><Plus className="h-3 w-3 mr-1" />Novo acesso</Button>
      </div>
      {list.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Nenhum acesso cadastrado.</p> : (
        <div className="rounded-lg border overflow-x-auto">
          <StackTable>
            <TableHeader><TableRow><TableHead>Acesso</TableHead><TableHead>Link</TableHead><TableHead>Usuário</TableHead><TableHead>Senha / token</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {list.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm font-medium">{c.label}<Badge variant="outline" className="text-[10px] ml-1.5">{label(CRED_KINDS, c.kind)}</Badge>
                    {c.notes && <span className="block text-[11px] text-muted-foreground font-normal">{c.notes}</span>}</TableCell>
                  <TableCell className="text-sm">{c.url ? <a href={c.url.startsWith('http') ? c.url : 'https://' + c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="h-3 w-3" />abrir</a> : '—'}</TableCell>
                  <TableCell className="text-sm">{c.username ? <button className="inline-flex items-center gap-1 hover:underline" onClick={() => copy(c.username as string, 'Usuário')}>{c.username}<Copy className="h-3 w-3 text-muted-foreground" /></button> : '—'}</TableCell>
                  <TableCell className="text-sm">
                    {!c.vault_secret_id ? <span className="text-muted-foreground">—</span> : revealed[c.id] !== undefined ? (
                      <span className="inline-flex items-center gap-1.5">
                        <code className="px-1.5 py-0.5 rounded bg-muted text-xs break-all">{revealed[c.id]}</code>
                        <button onClick={() => copy(revealed[c.id], 'Senha')}><Copy className="h-3 w-3" /></button>
                        <button onClick={() => setRevealed(r => { const n = { ...r }; delete n[c.id]; return n })}><EyeOff className="h-3 w-3" /></button>
                      </span>
                    ) : (
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => reveal(c)}><Eye className="h-3 w-3 mr-1" />Mostrar</Button>
                    )}
                    {c.last_revealed_at && <span className="block text-[10px] text-muted-foreground">visto em {fmtDate(c.last_revealed_at)}</span>}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(c)}>Editar</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => remove(c)}><Trash2 className="h-3 w-3" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </StackTable>
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={v => { if (!v) setEdit(null) }}>
        <DialogContent className="max-w-[520px] w-[96vw]">
          <DialogHeader><DialogTitle>{edit === 'new' ? 'Novo acesso' : 'Editar acesso'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label>Nome</Label><Input value={cf.label} onChange={e => setCf(f => ({ ...f, label: e.target.value }))} placeholder="Ex: Supabase, Vercel, Domínio" className="h-10" /></div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={cf.kind} onValueChange={v => v && setCf(f => ({ ...f, kind: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{label(CRED_KINDS, cf.kind)}</SelectValue></SelectTrigger>
                  <SelectContent>{CRED_KINDS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Usuário / e-mail</Label><Input value={cf.username} onChange={e => setCf(f => ({ ...f, username: e.target.value }))} className="h-10" /></div>
              <div className="space-y-1.5 col-span-2"><Label>Link</Label><Input value={cf.url} onChange={e => setCf(f => ({ ...f, url: e.target.value }))} placeholder="https://..." className="h-10" /></div>
              <div className="space-y-1.5 col-span-2">
                <Label>Senha / token / chave</Label>
                <Input type="password" autoComplete="new-password" value={cf.secret} onChange={e => setCf(f => ({ ...f, secret: e.target.value }))} placeholder={edit !== 'new' && edit?.vault_secret_id ? 'Deixe em branco para manter a atual' : ''} className="h-10" />
              </div>
              <div className="space-y-1.5 col-span-2"><Label>Observações</Label><Textarea value={cf.notes} onChange={e => setCf(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            </div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={save}>Salvar</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ChamadosTab({ client, onChanged, userId }: { client: ClientRow; onChanged: () => void; userId: string | null }) {
  const [list, setList] = useState<TaskRow[]>([])
  const [open, setOpen] = useState(false)
  const [tf, setTf] = useState({ title: '', kind: 'bug', priority: 'media', due_date: todayISO(), description: '', responsible_ids: [] as string[] })

  const load = async () => {
    const { data, error } = await supabase.from('tasks').select('id, title, status, priority, due_date, client_id, saas_kind, recurring_check_id, responsible_ids, description')
      .eq('client_id', client.id).eq('business_unit', 'saas').neq('saas_kind', 'verificacao').neq('status', 'cancelada').order('due_date', { ascending: true })
    if (error) toast.error('Erro: ' + error.message)
    setList((data ?? []) as TaskRow[])
  }
  useEffect(() => { load() }, [client.id])

  const create = async () => {
    if (!tf.title.trim()) { toast.error('Descreva o chamado'); return }
    const { error } = await supabase.from('tasks').insert({
      title: tf.title.trim(), description: tf.description.trim() || null, type: 'tarefa', status: 'pendente', priority: tf.priority,
      due_date: tf.due_date || null, client_id: client.id, business_unit: 'saas', saas_kind: tf.kind, responsible_ids: tf.responsible_ids,
      workflow_stage: 'a_fazer', created_by: userId,
    })
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Chamado criado — já aparece no Calendário'); setOpen(false)
    setTf({ title: '', kind: 'bug', priority: 'media', due_date: todayISO(), description: '', responsible_ids: [] })
    load(); onChanged()
  }
  const toggle = async (t: TaskRow) => {
    const done = t.status !== 'concluida'
    const { error } = await supabase.from('tasks').update({ status: done ? 'concluida' : 'pendente', workflow_stage: done ? 'concluido' : 'a_fazer' }).eq('id', t.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    load(); onChanged()
  }

  const abertos = list.filter(t => t.status === 'pendente'), feitos = list.filter(t => t.status === 'concluida')
  const Row = ({ t }: { t: TaskRow }) => (
    <div className="flex items-start gap-3 rounded-lg border px-3 py-2 flex-wrap sm:flex-nowrap">
      <input type="checkbox" className="mt-1" checked={t.status === 'concluida'} onChange={() => toggle(t)} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${t.status === 'concluida' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</p>
        {t.description && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{t.description}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end max-sm:basis-full max-sm:justify-start">
        <Badge variant="outline" className="text-[10px]">{label(TICKET_KINDS, t.saas_kind)}</Badge>
        <Badge variant="secondary" className="text-[10px]">{label(PRIORITIES, t.priority)}</Badge>
        {t.due_date && <span className="text-xs text-muted-foreground">{fmtDate(t.due_date)}</span>}
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">Bugs e pedidos de ajuste deste cliente. Cada um vira uma tarefa e aparece no Calendário.</p>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3 w-3 mr-1" />Novo chamado</Button>
      </div>
      {abertos.length === 0 && feitos.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum chamado.</p>}
      <div className="space-y-2">{abertos.map(t => <Row key={t.id} t={t} />)}</div>
      {feitos.length > 0 && <><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-2">Concluídos</p><div className="space-y-2">{feitos.map(t => <Row key={t.id} t={t} />)}</div></>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[520px] w-[96vw]">
          <DialogHeader><DialogTitle>Novo chamado — {client.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>O que aconteceu / foi pedido</Label><Input value={tf.title} onChange={e => setTf(f => ({ ...f, title: e.target.value }))} className="h-10" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tf.kind} onValueChange={v => v && setTf(f => ({ ...f, kind: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{label(TICKET_KINDS, tf.kind)}</SelectValue></SelectTrigger>
                  <SelectContent>{TICKET_KINDS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={tf.priority} onValueChange={v => v && setTf(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{label(PRIORITIES, tf.priority)}</SelectValue></SelectTrigger>
                  <SelectContent>{PRIORITIES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Prazo</Label><Input type="date" value={tf.due_date} onChange={e => setTf(f => ({ ...f, due_date: e.target.value }))} className="h-10" /></div>
            </div>
            <div className="space-y-1.5"><Label>Responsável</Label><ResponsibleSelect value={tf.responsible_ids} onChange={v => setTf(f => ({ ...f, responsible_ids: v }))} /></div>
            <div className="space-y-1.5"><Label>Detalhes</Label><Textarea value={tf.description} onChange={e => setTf(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={create}>Criar chamado</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function VerificacoesTab({ saasId, onChanged }: { saasId: string; onChanged: () => void }) {
  const [list, setList] = useState<Check[]>([])
  const [open, setOpen] = useState(false)
  const [cf, setCf] = useState({ title: '', description: '', every_n: '1', unit: 'meses', next_due: todayISO(), responsible_ids: [] as string[] })

  const load = async () => {
    const { data, error } = await supabase.from('saas_recurring_checks').select('*').eq('saas_client_id', saasId).order('next_due')
    if (error) toast.error('Erro: ' + error.message)
    setList((data ?? []) as Check[])
  }
  useEffect(() => { load() }, [saasId])

  const create = async () => {
    const n = parseInt(cf.every_n)
    if (!cf.title.trim()) { toast.error('Diga o que verificar'); return }
    if (isNaN(n) || n < 1) { toast.error('Informe de quanto em quanto tempo'); return }
    const { error } = await supabase.from('saas_recurring_checks').insert({
      saas_client_id: saasId, title: cf.title.trim(), description: cf.description.trim() || null, every_n: n, unit: cf.unit, next_due: cf.next_due, responsible_ids: cf.responsible_ids,
    })
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Verificação criada — a primeira tarefa já está no Calendário'); setOpen(false)
    setCf({ title: '', description: '', every_n: '1', unit: 'meses', next_due: todayISO(), responsible_ids: [] }); load(); onChanged()
  }
  const toggle = async (c: Check) => {
    const { error } = await supabase.from('saas_recurring_checks').update({ active: !c.active }).eq('id', c.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    load(); onChanged()
  }
  const remove = async (c: Check) => {
    if (!confirm(`Excluir a verificação "${c.title}"? A tarefa pendente dela também é cancelada.`)) return
    await supabase.from('tasks').update({ status: 'cancelada' }).eq('recurring_check_id', c.id).eq('status', 'pendente')
    const { error } = await supabase.from('saas_recurring_checks').delete().eq('id', c.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    load(); onChanged()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />Ao concluir a tarefa no Calendário, a próxima é criada contando da data da conclusão.</p>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3 w-3 mr-1" />Nova verificação</Button>
      </div>
      {list.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Nenhuma verificação recorrente.</p> : (
        <div className="rounded-lg border overflow-x-auto">
          <StackTable>
            <TableHeader><TableRow><TableHead>Verificar</TableHead><TableHead>Frequência</TableHead><TableHead>Próxima</TableHead><TableHead>Última vez</TableHead><TableHead>Ativa</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {list.map(c => (
                <TableRow key={c.id} className={c.active ? '' : 'opacity-60'}>
                  <TableCell className="text-sm font-medium">{c.title}{c.description && <span className="block text-[11px] text-muted-foreground font-normal">{c.description}</span>}</TableCell>
                  <TableCell className="text-sm">a cada {c.every_n} {c.unit}</TableCell>
                  <TableCell className="text-sm">{c.active ? fmtDate(c.next_due) : '—'}</TableCell>
                  <TableCell className="text-sm">{c.last_done ? fmtDate(c.last_done) : '—'}</TableCell>
                  <TableCell><Switch checked={c.active} onCheckedChange={() => toggle(c)} /></TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => remove(c)}><Trash2 className="h-3 w-3" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </StackTable>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[520px] w-[96vw]">
          <DialogHeader><DialogTitle>Nova verificação recorrente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>O que verificar</Label><Input value={cf.title} onChange={e => setCf(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Conferir backup, renovar domínio" className="h-10" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>A cada</Label><Input value={cf.every_n} onChange={e => setCf(f => ({ ...f, every_n: e.target.value.replace(/\D/g, '') }))} className="h-10" /></div>
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Select value={cf.unit} onValueChange={v => v && setCf(f => ({ ...f, unit: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{label(UNITS, cf.unit)}</SelectValue></SelectTrigger>
                  <SelectContent>{UNITS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Primeira vez em</Label><Input type="date" value={cf.next_due} onChange={e => setCf(f => ({ ...f, next_due: e.target.value }))} className="h-10" /></div>
            </div>
            <div className="space-y-1.5"><Label>Responsável</Label><ResponsibleSelect value={cf.responsible_ids} onChange={v => setCf(f => ({ ...f, responsible_ids: v }))} /></div>
            <div className="space-y-1.5"><Label>Detalhes</Label><Textarea value={cf.description} onChange={e => setCf(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={create}>Criar</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function HistoricoTab({ saasId }: { saasId: string }) {
  const [list, setList] = useState<HistoryRow[]>([])
  const [hf, setHf] = useState({ kind: 'nota', body: '', happened_at: todayISO() })

  const load = async () => {
    const { data, error } = await supabase.from('saas_history').select('id, kind, body, happened_at, created_at').eq('saas_client_id', saasId).order('happened_at', { ascending: false }).order('created_at', { ascending: false })
    if (error) toast.error('Erro: ' + error.message)
    setList((data ?? []) as HistoryRow[])
  }
  useEffect(() => { load() }, [saasId])
  const add = async () => {
    if (!hf.body.trim()) { toast.error('Escreva o que aconteceu'); return }
    const { error } = await supabase.from('saas_history').insert({ saas_client_id: saasId, kind: hf.kind, body: hf.body.trim(), happened_at: hf.happened_at || todayISO() })
    if (error) { toast.error('Erro: ' + error.message); return }
    setHf(f => ({ ...f, body: '' })); load()
  }
  const remove = async (h: HistoryRow) => {
    if (!confirm('Excluir esta anotação?')) return
    await supabase.from('saas_history').delete().eq('id', h.id); load()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-3 space-y-2 bg-muted/30">
        <div className="grid grid-cols-1 sm:grid-cols-[160px_160px_1fr] gap-2">
          <Select value={hf.kind} onValueChange={v => v && setHf(f => ({ ...f, kind: v }))}>
            <SelectTrigger className="h-9"><SelectValue>{label(HIST_KINDS, hf.kind)}</SelectValue></SelectTrigger>
            <SelectContent>{HIST_KINDS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={hf.happened_at} onChange={e => setHf(f => ({ ...f, happened_at: e.target.value }))} className="h-9" />
          <Button onClick={add} className="h-9 justify-self-end"><Plus className="h-3 w-3 mr-1" />Adicionar</Button>
        </div>
        <Textarea value={hf.body} onChange={e => setHf(f => ({ ...f, body: e.target.value }))} rows={2} placeholder="O que aconteceu, o que foi combinado, o que foi feito..." />
      </div>
      {list.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Nada registrado ainda.</p> : (
        <div className="space-y-2">
          {list.map(h => (
            <div key={h.id} className="flex items-start gap-3 rounded-lg border px-3 py-2">
              <div className="text-xs text-muted-foreground w-20 shrink-0 pt-0.5">{fmtDate(h.happened_at)}</div>
              <div className="flex-1 min-w-0"><Badge variant="outline" className="text-[10px] mb-1">{label(HIST_KINDS, h.kind)}</Badge><p className="text-sm whitespace-pre-wrap">{h.body}</p></div>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => remove(h)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const PHASE_STATUS = [['pendente', 'Pendente'], ['andamento', 'Em andamento'], ['concluida', 'Concluída']] as const
const DEFAULT_PHASES = ['Contrato e levantamento', 'Configuração do sistema', 'Migração dos dados', 'Treinamento da equipe', 'Entrada em produção']

function ImplementacaoTab({ saasId, status, onChanged }: { saasId: string; status: SaasClient['status']; onChanged: () => void }) {
  const [list, setList] = useState<Phase[]>([])
  const [newName, setNewName] = useState('')
  const load = async () => {
    const { data, error } = await supabase.from('saas_impl_phases').select('id, saas_client_id, position, name, status, due_date, done_at, notes').eq('saas_client_id', saasId).order('position')
    if (error) toast.error('Erro: ' + error.message)
    setList((data ?? []) as Phase[])
  }
  useEffect(() => { load() }, [saasId])

  const done = list.filter(p => p.status === 'concluida').length
  const patch = async (p: Phase, fields: Partial<Phase>) => {
    const { error } = await supabase.from('saas_impl_phases').update(fields).eq('id', p.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    await load(); onChanged()
  }
  const addPhase = async (name: string) => {
    if (!name.trim()) return
    const pos = list.reduce((m, p) => Math.max(m, p.position), 0) + 1
    const { error } = await supabase.from('saas_impl_phases').insert({ saas_client_id: saasId, name: name.trim(), position: pos })
    if (error) { toast.error('Erro: ' + error.message); return }
    setNewName(''); await load(); onChanged()
  }
  const useDefaults = async () => {
    const { error } = await supabase.from('saas_impl_phases').insert(DEFAULT_PHASES.map((name, i) => ({ saas_client_id: saasId, name, position: i + 1 })))
    if (error) { toast.error('Erro: ' + error.message); return }
    await load(); onChanged()
  }
  const move = async (p: Phase, dir: -1 | 1) => {
    const i = list.findIndex(x => x.id === p.id), other = list[i + dir]
    if (!other) return
    await supabase.from('saas_impl_phases').update({ position: other.position }).eq('id', p.id)
    await supabase.from('saas_impl_phases').update({ position: p.position }).eq('id', other.id)
    await load()
  }
  const remove = async (p: Phase) => {
    if (!confirm(`Excluir a fase "${p.name}"? A tarefa dela no Calendário também é cancelada.`)) return
    const { error } = await supabase.from('saas_impl_phases').delete().eq('id', p.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    await load(); onChanged()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">Etapas da implementação deste cliente. Fase com prazo vira tarefa no Calendário e conclui junto.</p>
        {list.length === 0 && <Button size="sm" variant="outline" onClick={useDefaults}>Usar fases padrão</Button>}
      </div>
      {list.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{done} de {list.length} fases concluídas</span><span>{Math.round((done / list.length) * 100)}%</span></div>
          <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${(done / list.length) * 100}%` }} /></div>
          {done === list.length && status === 'implantacao' && <p className="text-xs text-emerald-700 dark:text-emerald-300 pt-1">Todas as fases concluídas — se o cliente já está em produção, mude o status para Ativo na aba Dados.</p>}
        </div>
      )}
      <div className="space-y-2">
        {list.map((p, i) => (
          <div key={p.id} className="rounded-lg border px-3 py-2 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
              <Input defaultValue={p.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== p.name) patch(p, { name: v }) }} className={`h-9 flex-1 min-w-[160px] ${p.status === 'concluida' ? 'line-through text-muted-foreground' : ''}`} />
              <Select value={p.status} onValueChange={v => v && patch(p, { status: v as Phase['status'] })}>
                <SelectTrigger className="h-9 w-[150px]"><SelectValue>{label(PHASE_STATUS, p.status)}</SelectValue></SelectTrigger>
                <SelectContent>{PHASE_STATUS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="date" value={p.due_date ?? ''} onChange={e => patch(p, { due_date: e.target.value || null })} className="h-9 w-[150px]" title="Prazo" />
              <div className="flex items-center">
                <Button variant="ghost" size="sm" className="h-8 px-2" disabled={i === 0} onClick={() => move(p, -1)}>↑</Button>
                <Button variant="ghost" size="sm" className="h-8 px-2" disabled={i === list.length - 1} onClick={() => move(p, 1)}>↓</Button>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive" onClick={() => remove(p)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
            <Input defaultValue={p.notes ?? ''} placeholder="Observações da fase" onBlur={e => { const v = e.target.value.trim(); if (v !== (p.notes ?? '')) patch(p, { notes: v || null }) }} className="h-8 text-xs" />
            {p.done_at && <p className="text-[11px] text-muted-foreground">Concluída em {fmtDate(p.done_at)}</p>}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPhase(newName) }} placeholder="Nova fase (ex: Integração com o Asaas)" className="h-9" />
        <Button size="sm" className="h-9" onClick={() => addPhase(newName)}><Plus className="h-3 w-3 mr-1" />Adicionar</Button>
      </div>
    </div>
  )
}
