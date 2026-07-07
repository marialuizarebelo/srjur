import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { exportExcel, exportPDF, fmtDateBR } from '@/lib/exportData'
import { ExportMenu } from '@/components/ExportMenu'
import { fmtBRL, fmtDate } from '@/lib/format'
import {
  Users, Scale, FileText, MessageSquare, DollarSign, CalendarDays,
  Plus, ExternalLink, Trash2, Eye, ChevronDown, Search, ArrowLeft,
  KeyRound, Send,
} from 'lucide-react'

interface ClientLite { id: string; name: string; email: string | null; status: string }
interface Process { id: string; title: string; number: string | null; phase: string; status: string }
interface ProcessUpdate { id: string; process_id: string; text: string; author: string | null; created_at: string; portal_visible: boolean }
interface Message { id: string; title: string; body: string; sent_by: string | null; created_at: string; read_at: string | null }
interface Doc { id: string; title: string; drive_url: string; type: string | null; created_at: string }
interface Finance { id: string; description: string; value: number; paid: boolean; due_date: string | null; payment_link: string | null }
interface AgendaItem { id: string; title: string; due_date: string | null; kind: 'tarefa' | 'prazo' }
interface CommTemplate { id: string; name: string; subject: string | null; body: string }

function applyBasicVars(text: string, client: ClientLite) {
  const firstName = client.name.trim().split(' ')[0] ?? ''
  return text
    .replaceAll('{{nome}}', client.name)
    .replaceAll('{{primeiro_nome}}', firstName)
    .replaceAll('{{email_cliente}}', client.email ?? '')
}

const DOC_TYPES = ['Documento', 'Pasta', 'Contrato', 'Petição', 'Procuração', 'Comprovante']

// ── Client list (index) ──
function ClientList({ onSelect }: { onSelect: (c: ClientLite) => void }) {
  const [clients, setClients] = useState<ClientLite[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('clients').select('id, name, email, status').order('name').then(({ data }) => {
      setClients((data ?? []) as ClientLite[])
      setLoading(false)
    })
  }, [])

  const filtered = clients.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Portal do Cliente</h1>
        <p className="text-sm text-muted-foreground">Selecione um cliente para gerenciar o acesso e o conteúdo do portal dele</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-10" />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Nenhum cliente encontrado</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(c => (
            <Card key={c.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => onSelect(c)}>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{c.email ?? 'Sem e-mail cadastrado'}</p>
                </div>
                <Badge variant={c.status === 'ativo' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                  {c.status.toUpperCase()}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Gerenciar acesso dialog ──
function ManageAccessDialog({ client, open, onClose }: { client: ClientLite; open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState(client.email ?? '')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setEmail(client.email ?? '') }, [client])

  async function handleCreate() {
    if (!email.trim() || !password.trim()) { toast.error('Preencha e-mail e senha'); return }
    setSaving(true)
    try {
      // Garante que o e-mail do cadastro do cliente está sincronizado —
      // é por esse e-mail que o acesso do portal é vinculado ao cliente.
      if (email.trim() !== client.email) {
        await supabase.from('clients').update({ email: email.trim() }).eq('id', client.id)
      }
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('create-client-user', {
        body: { email: email.trim(), password, display_name: client.name, client_id: client.id },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      })
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Falha ao criar acesso')
      toast.success('Acesso ao portal criado/atualizado com sucesso!')
      setPassword('')
      onClose()
    } catch (err: any) {
      toast.error('Erro: ' + (err?.message ?? String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar acesso — {client.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Cria (ou redefine a senha de) o login do cliente no portal. O e-mail aqui precisa ser o mesmo do cadastro do cliente.
          </p>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">E-mail de acesso</label>
            <Input type="email" placeholder="cliente@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Senha provisória</label>
            <Input type="text" placeholder="Defina uma senha" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              <KeyRound className="h-3.5 w-3.5 mr-1.5" />
              {saving ? 'Salvando...' : 'Criar/Atualizar acesso'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type Tab = 'visao_geral' | 'processos' | 'financeiro' | 'documentos' | 'agenda'

// ── Client detail (portal management) ──
function ClientDetail({ client, onBack }: { client: ClientLite; onBack: () => void }) {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('visao_geral')
  const [processes, setProcesses] = useState<Process[]>([])
  const [updatesByProcess, setUpdatesByProcess] = useState<Record<string, ProcessUpdate[]>>({})
  const [expandedProcess, setExpandedProcess] = useState<string | null>(null)
  const [newUpdateText, setNewUpdateText] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [finances, setFinances] = useState<Finance[]>([])
  const [agenda, setAgenda] = useState<AgendaItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [accessOpen, setAccessOpen] = useState(false)
  const [msgModal, setMsgModal] = useState(false)
  const [msgForm, setMsgForm] = useState({ title: '', body: '' })
  const [templates, setTemplates] = useState<CommTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [docForm, setDocForm] = useState({ title: '', drive_url: '', type: 'Documento' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadAll() }, [client.id])

  useEffect(() => {
    supabase.from('communications').select('id, name, subject, body').order('name').then(({ data }) => {
      setTemplates((data ?? []) as CommTemplate[])
    })
  }, [])

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId)
    const tpl = templates.find(t => t.id === templateId)
    if (!tpl) return
    setMsgForm({
      title: applyBasicVars(tpl.subject || tpl.name, client),
      body: applyBasicVars(tpl.body, client),
    })
  }

  async function loadAll() {
    const cid = client.id
    const [prRes, msgRes, docRes, finRes, taskRes, deadlineRes] = await Promise.all([
      supabase.from('processes').select('id,title,number,phase,status').eq('client_id', cid).order('updated_at', { ascending: false }),
      supabase.from('portal_messages').select('*').eq('client_id', cid).order('created_at', { ascending: false }),
      supabase.from('documents').select('*').eq('client_id', cid).order('created_at', { ascending: false }),
      supabase.from('finance').select('id,description,value,paid,due_date,payment_link').eq('type', 'receita').eq('client_id', cid).order('due_date'),
      supabase.from('tasks').select('id,title,due_date').eq('client_id', cid).eq('status', 'pendente').order('due_date'),
      supabase.from('deadlines').select('id,title,due_date,process_id').in('process_id',
        (await supabase.from('processes').select('id').eq('client_id', cid)).data?.map(p => p.id) ?? ['00000000-0000-0000-0000-000000000000']
      ).eq('status', 'pendente').order('due_date'),
    ])

    setProcesses((prRes.data ?? []) as Process[])
    setMessages((msgRes.data ?? []) as Message[])
    setDocs((docRes.data ?? []) as Doc[])
    setFinances((finRes.data ?? []) as Finance[])
    setAgenda([
      ...((taskRes.data ?? []).map((t: any) => ({ id: t.id, title: t.title, due_date: t.due_date, kind: 'tarefa' as const }))),
      ...((deadlineRes.data ?? []).map((d: any) => ({ id: d.id, title: d.title, due_date: d.due_date, kind: 'prazo' as const }))),
    ].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')))

    // Atualizações de todos os processos do cliente
    const processIds = (prRes.data ?? []).map((p: any) => p.id)
    if (processIds.length > 0) {
      const { data: upd } = await supabase.from('process_updates').select('*').in('process_id', processIds).order('created_at', { ascending: false })
      const grouped: Record<string, ProcessUpdate[]> = {}
      for (const u of (upd ?? []) as ProcessUpdate[]) {
        grouped[u.process_id] = grouped[u.process_id] ?? []
        grouped[u.process_id].push(u)
      }
      setUpdatesByProcess(grouped)
    }
  }

  async function publishUpdate(processId: string) {
    if (!newUpdateText.trim()) return
    const { error } = await supabase.from('process_updates').insert({
      process_id: processId,
      text: newUpdateText.trim(),
      author: profile?.display_name ?? 'Escritório',
      portal_visible: true,
    })
    if (error) { toast.error('Erro ao publicar atualização'); return }
    setNewUpdateText('')
    loadAll()
  }

  async function deleteUpdate(id: string) {
    await supabase.from('process_updates').delete().eq('id', id)
    loadAll()
  }

  async function saveMsg() {
    if (!msgForm.title.trim() || !msgForm.body.trim()) return
    setSaving(true)
    const { error } = await supabase.from('portal_messages').insert({
      client_id: client.id, title: msgForm.title.trim(), body: msgForm.body.trim(),
      sent_by: profile?.display_name ?? 'Escritório',
    })
    setSaving(false)
    if (error) { toast.error('Erro ao salvar comunicado'); return }
    toast.success('Comunicado enviado')
    setMsgModal(false)
    setMsgForm({ title: '', body: '' })
    loadAll()
  }

  async function deleteMsg(id: string) {
    await supabase.from('portal_messages').delete().eq('id', id)
    loadAll()
  }

  async function saveDoc() {
    if (!docForm.title.trim() || !docForm.drive_url.trim()) { toast.error('Preencha rótulo e URL'); return }
    setSaving(true)
    const { error } = await supabase.from('documents').insert({
      client_id: client.id, title: docForm.title.trim(), drive_url: docForm.drive_url.trim(),
      type: docForm.type || null, portal_visible: true,
    })
    setSaving(false)
    if (error) { toast.error('Erro ao salvar documento'); return }
    toast.success('Documento adicionado')
    setDocForm({ title: '', drive_url: '', type: 'Documento' })
    loadAll()
  }

  async function deleteDoc(id: string) {
    await supabase.from('documents').delete().eq('id', id)
    loadAll()
  }

  async function savePaymentLink(financeId: string, link: string) {
    const { error } = await supabase.from('finance').update({ payment_link: link || null }).eq('id', financeId)
    if (error) { toast.error('Erro ao salvar link de pagamento'); return }
    toast.success('Link de pagamento salvo')
    loadAll()
  }

  const activeProcesses = processes.filter(p => p.status === 'em_andamento').length
  const pendingFinance = finances.filter(f => !f.paid)
  const overdueFinance = pendingFinance.filter(f => f.due_date && f.due_date < new Date().toISOString().slice(0, 10))
  const financeStatusLabel = overdueFinance.length > 0 ? 'Atrasado' : (pendingFinance.length > 0 ? 'Em aberto' : 'Em dia')
  const paidTotal = finances.filter(f => f.paid).reduce((s, f) => s + Number(f.value), 0)
  const pendingTotal = pendingFinance.reduce((s, f) => s + Number(f.value), 0)
  const overdueTotal = overdueFinance.reduce((s, f) => s + Number(f.value), 0)

  const allUpdates = Object.values(updatesByProcess).flat().sort((a, b) => b.created_at.localeCompare(a.created_at))

  const TABS: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'visao_geral', label: 'Visão Geral', icon: Eye },
    { key: 'processos', label: 'Processos', icon: Scale, count: processes.length },
    { key: 'financeiro', label: 'Financeiro', icon: DollarSign },
    { key: 'documentos', label: 'Documentos', icon: FileText, count: docs.length },
    { key: 'agenda', label: 'Agenda', icon: CalendarDays, count: agenda.length },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0"><ArrowLeft className="h-4 w-4" /></Button>
          <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
            {client.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold leading-tight">{client.name}</h2>
              <Badge variant={client.status === 'ativo' ? 'default' : 'secondary'} className="text-[10px]">{client.status.toUpperCase()}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setAccessOpen(true)}>
            <KeyRound className="h-3.5 w-3.5 mr-1.5" />Gerenciar acesso
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setSelectedTemplateId(''); setMsgForm({ title: '', body: '' }); setMsgModal(true) }}>
            <Send className="h-3.5 w-3.5 mr-1.5" />Comunicar
          </Button>
          <ExportMenu
            label="Exportar"
            onExcelExport={() => exportExcel(
              processes.map(p => ({ Processo: p.title, Número: p.number ?? '', Status: p.status, Fase: p.phase })),
              `processos-${client.name}`
            )}
            onPdfExport={() => exportPDF(
              `Processos — ${client.name}`,
              'Relatório de processos',
              [
                { header: 'Processo', key: 'Processo', width: 60 },
                { header: 'Número', key: 'Número', width: 40 },
                { header: 'Status', key: 'Status', width: 30 },
                { header: 'Fase', key: 'Fase', width: 30 },
              ],
              processes.map(p => ({ Processo: p.title, Número: p.number ?? '', Status: p.status, Fase: p.phase })),
              `processos-${client.name}`
            )}
          />
        </div>
      </div>

      {/* Histórico de comunicados */}
      <Card className="overflow-hidden">
        <button
          onClick={() => setShowHistory(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors"
        >
          <span>Histórico de comunicados ({messages.length})</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
        </button>
        {showHistory && (
          <div className="border-t p-4 space-y-2">
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Nenhum comunicado enviado ainda</p>
            ) : messages.map(m => (
              <div key={m.id} className={`p-3 rounded-lg border ${!m.read_at ? 'border-primary/30' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{m.title}</p>
                      {!m.read_at && <Badge className="text-[9px] h-4">Não lido</Badge>}
                    </div>
                    <p className="text-xs text-foreground/80 whitespace-pre-wrap mt-1">{m.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5">{fmtDate(m.created_at)} · {m.sent_by}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => deleteMsg(m.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 flex-wrap">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-1 sm:flex-none justify-center sm:justify-start ${
                tab === t.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{t.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Visão Geral */}
      {tab === 'visao_geral' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="text-[11px] text-muted-foreground">Processos ativos</p>
              <p className="text-xl font-bold mt-1">{activeProcesses}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] text-muted-foreground">A pagar</p>
              <p className={`text-xl font-bold mt-1 ${financeStatusLabel === 'Atrasado' ? 'text-red-600' : 'text-green-600'}`}>{financeStatusLabel}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] text-muted-foreground">Próximo agendamento</p>
              <p className="text-xl font-bold mt-1">{agenda[0]?.due_date ? fmtDate(agenda[0].due_date) : '—'}</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <p className="text-sm font-semibold mb-3">Últimas atualizações</p>
              <div className="space-y-2">
                {allUpdates.slice(0, 5).map(u => (
                  <div key={u.id} className="text-xs">
                    <p className="text-[10px] text-muted-foreground">{fmtDate(u.created_at)}</p>
                    <p className="line-clamp-2">{u.text}</p>
                  </div>
                ))}
                {allUpdates.length === 0 && <p className="text-xs text-muted-foreground py-2">Nenhuma atualização ainda</p>}
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-sm font-semibold mb-3">Próximos compromissos</p>
              <div className="space-y-2">
                {agenda.slice(0, 5).map(a => (
                  <div key={a.id} className="flex items-center justify-between text-xs">
                    <span>{a.title}</span>
                    <span className="text-muted-foreground">{a.due_date ? fmtDate(a.due_date) : '—'}</span>
                  </div>
                ))}
                {agenda.length === 0 && <p className="text-xs text-muted-foreground py-2">Nenhum.</p>}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Processos */}
      {tab === 'processos' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Processos vinculados a <strong>{client.name}</strong> — visíveis no portal do cliente.</p>
          {processes.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <Scale className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum processo vinculado a este cliente</p>
            </Card>
          ) : processes.map(p => {
            const isOpen = expandedProcess === p.id
            const updates = updatesByProcess[p.id] ?? []
            return (
              <Card key={p.id} className="overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedProcess(isOpen ? null : p.id)}
                >
                  <div className="h-9 w-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                    <Scale className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.title}</p>
                    <p className="text-[11px] text-muted-foreground">{p.number ?? 'Sem número'} · {p.phase}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{p.status}</Badge>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="border-t p-4 space-y-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nova atualização para o cliente..."
                        value={newUpdateText}
                        onChange={e => setNewUpdateText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && publishUpdate(p.id)}
                      />
                      <Button onClick={() => publishUpdate(p.id)}>Publicar</Button>
                    </div>
                    <div className="space-y-2">
                      {updates.map(u => (
                        <div key={u.id} className="text-sm p-2.5 rounded-lg bg-muted/30 group">
                          <div className="flex items-start justify-between gap-2">
                            <p className="whitespace-pre-wrap flex-1">{u.text}</p>
                            <button onClick={() => deleteUpdate(u.id)} className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">{fmtDate(u.created_at)} · {u.author}</p>
                        </div>
                      ))}
                      {updates.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Nenhuma atualização publicada ainda</p>}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Financeiro */}
      {tab === 'financeiro' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="text-[11px] text-muted-foreground">Pago</p>
              <p className="text-lg font-bold mt-1">{fmtBRL(paidTotal)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] text-muted-foreground">A pagar</p>
              <p className={`text-lg font-bold mt-1 ${financeStatusLabel === 'Atrasado' ? 'text-red-600' : 'text-green-600'}`}>{financeStatusLabel}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] text-muted-foreground">Atrasado</p>
              <p className="text-lg font-bold mt-1 text-red-600">{fmtBRL(overdueTotal)}</p>
            </Card>
          </div>

          {pendingFinance.length > 0 && (
            <Card className="p-4 space-y-2">
              <p className="text-sm font-semibold">Configurações exibidas ao cliente</p>
              {pendingFinance.slice(0, 1).map(f => (
                <div key={f.id} className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Link de pagamento — {f.description}</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://..."
                      defaultValue={f.payment_link ?? ''}
                      id={`link-${f.id}`}
                    />
                    <Button size="sm" onClick={() => {
                      const el = document.getElementById(`link-${f.id}`) as HTMLInputElement
                      savePaymentLink(f.id, el?.value ?? '')
                    }}>Salvar</Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Status calculado automaticamente: <strong>{financeStatusLabel}</strong></p>
                </div>
              ))}
            </Card>
          )}

          {finances.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum lançamento financeiro para este cliente</p>
              <p className="text-xs mt-1">Cadastre no Financeiro com o cliente associado</p>
            </Card>
          ) : finances.map(f => (
            <Card key={f.id} className="p-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${f.paid ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                <DollarSign className={`h-4 w-4 ${f.paid ? 'text-emerald-500' : 'text-amber-500'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.description}</p>
                {f.due_date && <p className="text-[11px] text-muted-foreground">Vencimento: {fmtDate(f.due_date)}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold">{fmtBRL(f.value)}</p>
                <Badge variant={f.paid ? 'secondary' : 'outline'} className="text-[9px] h-4 mt-0.5">{f.paid ? 'Pago' : 'Pendente'}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Documentos */}
      {tab === 'documentos' && (
        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input placeholder="Rótulo" value={docForm.title} onChange={e => setDocForm(f => ({ ...f, title: e.target.value }))} className="flex-1" />
              <Input placeholder="URL" value={docForm.drive_url} onChange={e => setDocForm(f => ({ ...f, drive_url: e.target.value }))} className="flex-1" />
              <Select value={docForm.type} onValueChange={v => setDocForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={saveDoc} disabled={saving}><Plus className="h-3.5 w-3.5 mr-1" />Adicionar</Button>
            </div>
          </Card>

          {docs.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum documento compartilhado</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {docs.map(d => (
                <Card key={d.id} className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-[11px] text-muted-foreground">{d.type ?? 'Documento'}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a href={d.drive_url} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5 mr-1" />Abrir</Button>
                    </a>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteDoc(d.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Agenda */}
      {tab === 'agenda' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Tarefas e prazos vinculados a <strong>{client.name}</strong>.</p>
          {agenda.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum compromisso agendado</p>
            </Card>
          ) : agenda.map(a => (
            <Card key={a.id} className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center shrink-0">
                <CalendarDays className="h-4 w-4 text-purple-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{a.title}</p>
                <p className="text-[11px] text-muted-foreground">{a.kind === 'tarefa' ? 'Tarefa' : 'Prazo'}</p>
              </div>
              <p className="text-xs text-muted-foreground shrink-0">{a.due_date ? fmtDateBR(a.due_date) : 'Sem data'}</p>
            </Card>
          ))}
        </div>
      )}

      <ManageAccessDialog client={client} open={accessOpen} onClose={() => setAccessOpen(false)} />

      <Dialog open={msgModal} onOpenChange={setMsgModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo comunicado para {client.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            {templates.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Template (opcional)</label>
                <Select value={selectedTemplateId} onValueChange={applyTemplate}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Começar do zero..." /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Título</label>
              <Input placeholder="Ex: Atualização do processo" value={msgForm.title} onChange={e => setMsgForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Mensagem</label>
              <textarea
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm min-h-[120px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Escreva a mensagem para o cliente..."
                value={msgForm.body}
                onChange={e => setMsgForm(f => ({ ...f, body: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setMsgModal(false)}>Cancelar</Button>
              <Button onClick={saveMsg} disabled={saving || !msgForm.title.trim() || !msgForm.body.trim()}>
                {saving ? 'Enviando...' : 'Enviar comunicado'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Main ──
export default function PortalAdmin() {
  const [selectedClient, setSelectedClient] = useState<ClientLite | null>(null)

  return selectedClient
    ? <ClientDetail client={selectedClient} onBack={() => setSelectedClient(null)} />
    : <ClientList onSelect={setSelectedClient} />
}
