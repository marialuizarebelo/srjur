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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Search, Cpu, Wallet, Wrench, Rocket, Eye, EyeOff, Copy, Trash2, ExternalLink, KeyRound, CalendarClock } from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import { Sensitive } from '@/components/Sensitive'
import { ResponsibleSelect } from '@/components/ResponsibleSelect'

interface SaasClient {
  id: string; client_id: string; plan: string | null; status: 'implantacao' | 'ativo' | 'pausado' | 'cancelado'
  implementation_value: number | null; monthly_value: number | null; monthly_since: string | null; billing_day: number | null
  started_at: string | null; system_url: string | null; notes: string | null
}
interface ClientRow { id: string; name: string; status: string }
interface Credential {
  id: string; saas_client_id: string; label: string; kind: string; url: string | null; username: string | null
  vault_secret_id: string | null; notes: string | null; last_revealed_at: string | null
}
interface HistoryRow { id: string; kind: string; body: string; happened_at: string; created_at: string }
interface Check { id: string; title: string; description: string | null; every_n: number; unit: string; next_due: string; last_done: string | null; active: boolean; responsible_ids: string[] | null }
interface TaskRow { id: string; title: string; status: string; priority: string; due_date: string | null; client_id: string | null; saas_kind: string | null; recurring_check_id: string | null; responsible_ids: string[] | null; description: string | null }

const STATUS: { value: SaasClient['status']; label: string; cls: string }[] = [
  { value: 'implantacao', label: 'Em implantação', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
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
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | SaasClient['status']>('')
  const [openId, setOpenId] = useState<string | null>(null) // clients.id

  const load = async () => {
    const [c, s, t] = await Promise.all([
      supabase.from('clients').select('id, name, status').eq('is_saas', true).order('name'),
      supabase.from('saas_clients').select('*'),
      supabase.from('tasks').select('id, title, status, priority, due_date, client_id, saas_kind, recurring_check_id, responsible_ids, description')
        .eq('business_unit', 'saas').not('client_id', 'is', null).neq('status', 'cancelada'),
    ])
    const err = [c, s, t].find(x => x.error)?.error
    if (err) toast.error('Erro ao carregar: ' + err.message)
    setClients((c.data ?? []) as ClientRow[])
    setSaas((s.data ?? []) as SaasClient[])
    setTasks((t.data ?? []) as TaskRow[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const saasOf = useMemo(() => new Map(saas.map(s => [s.client_id, s])), [saas])
  const rows = useMemo(() => clients.map(c => {
    const s = saasOf.get(c.id)
    const mine = tasks.filter(t => t.client_id === c.id && t.status === 'pendente')
    return {
      client: c, saas: s,
      status: (s?.status ?? 'ativo') as SaasClient['status'],
      chamados: mine.filter(t => t.saas_kind !== 'verificacao').length,
      proxVerif: mine.filter(t => t.saas_kind === 'verificacao' && t.due_date).map(t => t.due_date as string).sort()[0] ?? null,
    }
  }), [clients, saasOf, tasks])

  const visible = rows.filter(r => (!statusFilter || r.status === statusFilter) && (!search.trim() || r.client.name.toLowerCase().includes(search.trim().toLowerCase())))
  const stats = useMemo(() => ({
    ativos: rows.filter(r => r.status === 'ativo').length,
    mrr: rows.filter(r => r.status === 'ativo').reduce((s, r) => s + Number(r.saas?.monthly_value ?? 0), 0),
    implantando: rows.filter(r => r.status === 'implantacao').length,
    chamados: rows.reduce((s, r) => s + r.chamados, 0),
    semDados: rows.filter(r => !r.saas).length,
  }), [rows])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clientes do sistema</h1>
        <p className="text-sm text-muted-foreground">Quem usa o SRJUR: plano, valores, acessos, chamados e verificações</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Cpu} title="Clientes ativos" value={stats.ativos} sub={stats.semDados ? `${stats.semDados} sem dados cadastrados` : undefined} />
        <Kpi icon={Wallet} title="Mensalidades (ativos)" value={<Sensitive>{fmtBRL(stats.mrr)}</Sensitive>} sub="soma dos valores cadastrados" />
        <Kpi icon={Rocket} title="Em implantação" value={stats.implantando} />
        <Kpi icon={Wrench} title="Chamados abertos" value={stats.chamados} />
      </div>

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
          <Table>
            <TableHeader><TableRow>
              <TableHead>Cliente</TableHead><TableHead>Plano</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Implantação</TableHead><TableHead className="text-right">Mensalidade</TableHead>
              <TableHead>Desde</TableHead><TableHead className="text-right">Chamados</TableHead><TableHead>Próx. verificação</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {visible.map(r => (
                <TableRow key={r.client.id} className="cursor-pointer" onClick={() => setOpenId(r.client.id)}>
                  <TableCell className="font-medium">{r.client.name}</TableCell>
                  <TableCell className="text-sm">{r.saas?.plan || '—'}</TableCell>
                  <TableCell><Badge className={`text-[10px] border-0 ${statusInfo(r.status).cls}`}>{statusInfo(r.status).label}</Badge></TableCell>
                  <TableCell className="text-right text-sm"><Sensitive>{r.saas?.implementation_value != null ? fmtBRL(Number(r.saas.implementation_value)) : '—'}</Sensitive></TableCell>
                  <TableCell className="text-right text-sm"><Sensitive>{r.saas?.monthly_value != null ? fmtBRL(Number(r.saas.monthly_value)) : '—'}</Sensitive></TableCell>
                  <TableCell className="text-sm">{r.saas?.started_at ? fmtDate(r.saas.started_at) : '—'}</TableCell>
                  <TableCell className="text-right text-sm">{r.chamados || '—'}</TableCell>
                  <TableCell className="text-sm">{r.proxVerif ? fmtDate(r.proxVerif) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {openId && (
        <FichaDialog key={openId} client={clients.find(c => c.id === openId)!} saas={saasOf.get(openId) ?? null} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </div>
  )
}

// ── Ficha ────────────────────────────────────────────────────────────────
function FichaDialog({ client, saas, onClose, onChanged }: { client: ClientRow; saas: SaasClient | null; onClose: () => void; onChanged: () => void }) {
  const { profile } = useAuth()
  const [tab, setTab] = useState<'dados' | 'acessos' | 'chamados' | 'verificacoes' | 'historico'>('dados')
  const [rec, setRec] = useState<SaasClient | null>(saas)

  const tabs: [typeof tab, string][] = [['dados', 'Dados'], ['acessos', 'Acessos'], ['chamados', 'Chamados'], ['verificacoes', 'Verificações'], ['historico', 'Histórico']]
  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-[980px] w-[96vw] max-h-[90vh] overflow-y-auto overflow-x-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>{client.name}</DialogTitle>
          <div className="flex gap-1.5 pt-2 flex-wrap">
            {tabs.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} disabled={k !== 'dados' && !rec}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 ${tab === k ? 'bg-primary/10 border-primary/30 text-primary' : 'border-transparent text-muted-foreground hover:bg-muted'}`}>{l}</button>
            ))}
          </div>
        </DialogHeader>
        <div className="px-6 py-4 space-y-4">
          {tab === 'dados' && <DadosTab client={client} rec={rec} onSaved={r => { setRec(r); onChanged() }} />}
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

function DadosTab({ client, rec, onSaved }: { client: ClientRow; rec: SaasClient | null; onSaved: (r: SaasClient) => void }) {
  const [f, setF] = useState({
    plan: rec?.plan ?? '', status: (rec?.status ?? 'implantacao') as SaasClient['status'],
    implementation_value: moneyStr(rec?.implementation_value), monthly_value: moneyStr(rec?.monthly_value),
    monthly_since: rec?.monthly_since ?? '', billing_day: rec?.billing_day ? String(rec.billing_day) : '',
    started_at: rec?.started_at ?? '', system_url: rec?.system_url ?? '', notes: rec?.notes ?? '',
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
        <div className="space-y-1.5"><Label>Valor da implantação (R$)</Label><Input value={f.implementation_value} onChange={e => set('implementation_value', e.target.value)} placeholder="0,00" className="h-10" /></div>
        <div className="space-y-1.5"><Label>Valor da mensalidade (R$)</Label><Input value={f.monthly_value} onChange={e => set('monthly_value', e.target.value)} placeholder="0,00" className="h-10" /></div>
        <div className="space-y-1.5"><Label>Mensalidade a partir de</Label><Input type="date" value={f.monthly_since} onChange={e => set('monthly_since', e.target.value)} className="h-10" /></div>
        <div className="space-y-1.5"><Label>Dia da cobrança</Label><Input value={f.billing_day} onChange={e => set('billing_day', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Ex: 5" className="h-10" /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Link do sistema do cliente</Label><Input value={f.system_url} onChange={e => set('system_url', e.target.value)} placeholder="https://..." className="h-10" /></div>
        <div className="space-y-1.5 sm:col-span-3"><Label>Observações</Label><Textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={4} /></div>
      </div>
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
          <Table>
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
          </Table>
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
    <div className="flex items-start gap-3 rounded-lg border px-3 py-2">
      <input type="checkbox" className="mt-1" checked={t.status === 'concluida'} onChange={() => toggle(t)} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${t.status === 'concluida' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</p>
        {t.description && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{t.description}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
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
          <Table>
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
          </Table>
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
