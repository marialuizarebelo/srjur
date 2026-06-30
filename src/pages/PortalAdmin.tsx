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
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { toast } from 'sonner'
import { fmtBRL, fmtDate } from '@/lib/format'
import {
  Users, Scale, FileText, MessageSquare, DollarSign,
  Plus, ExternalLink, Trash2, Eye, ChevronDown, Check,
} from 'lucide-react'

interface Client { id: string; name: string; email: string | null }
interface Process { id: string; title: string; number: string | null; phase: string; status: string }
interface Message { id: string; title: string; body: string; sent_by: string | null; created_at: string; read_at: string | null }
interface Doc { id: string; title: string; drive_url: string; type: string | null; created_at: string }
interface Finance { id: string; description: string; value: number; paid: boolean; due_date: string | null }

type Tab = 'processos' | 'comunicados' | 'documentos' | 'financeiro'

export default function PortalAdmin() {
  const { profile } = useAuth()

  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientOpen, setClientOpen] = useState(false)

  const [tab, setTab] = useState<Tab>('processos')
  const [processes, setProcesses] = useState<Process[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [finances, setFinances] = useState<Finance[]>([])

  // Modals
  const [msgModal, setMsgModal] = useState(false)
  const [docModal, setDocModal] = useState(false)
  const [msgForm, setMsgForm] = useState({ title: '', body: '' })
  const [docForm, setDocForm] = useState({ title: '', drive_url: '', type: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('clients').select('id, name, email').eq('status', 'ativo').order('name').then(({ data }) => {
      setClients((data ?? []) as Client[])
    })
  }, [])

  useEffect(() => {
    if (!selectedClient) return
    loadAll()
  }, [selectedClient])

  async function loadAll() {
    if (!selectedClient) return
    const cid = selectedClient.id

    const [prRes, msgRes, docRes, finRes] = await Promise.all([
      supabase.from('processes').select('id,title,number,phase,status').eq('client_id', cid).order('updated_at', { ascending: false }),
      supabase.from('portal_messages').select('*').eq('client_id', cid).order('created_at', { ascending: false }),
      supabase.from('documents').select('*').eq('client_id', cid).order('created_at', { ascending: false }),
      supabase.from('finance').select('id,description,value,paid,due_date').eq('type', 'receita').eq('client_id', cid).order('due_date'),
    ])

    setProcesses((prRes.data ?? []) as Process[])
    setMessages((msgRes.data ?? []) as Message[])
    setDocs((docRes.data ?? []) as Doc[])
    setFinances((finRes.data ?? []) as Finance[])
  }

  async function saveMsg() {
    if (!selectedClient || !msgForm.title.trim() || !msgForm.body.trim()) return
    setSaving(true)
    const { error } = await supabase.from('portal_messages').insert({
      client_id: selectedClient.id,
      title: msgForm.title.trim(),
      body: msgForm.body.trim(),
      sent_by: profile?.display_name ?? 'Escritório',
    })
    setSaving(false)
    if (error) { toast.error('Erro ao salvar comunicado'); return }
    toast.success('Comunicado enviado')
    setMsgModal(false)
    setMsgForm({ title: '', body: '' })
    loadAll()
  }

  async function saveDoc() {
    if (!selectedClient || !docForm.title.trim() || !docForm.drive_url.trim()) return
    setSaving(true)
    const { error } = await supabase.from('documents').insert({
      client_id: selectedClient.id,
      title: docForm.title.trim(),
      drive_url: docForm.drive_url.trim(),
      type: docForm.type.trim() || null,
    })
    setSaving(false)
    if (error) { toast.error('Erro ao salvar documento'); return }
    toast.success('Documento adicionado')
    setDocModal(false)
    setDocForm({ title: '', drive_url: '', type: '' })
    loadAll()
  }

  async function deleteMsg(id: string) {
    await supabase.from('portal_messages').delete().eq('id', id)
    setMessages(m => m.filter(x => x.id !== id))
    toast.success('Comunicado removido')
  }

  async function deleteDoc(id: string) {
    await supabase.from('documents').delete().eq('id', id)
    setDocs(d => d.filter(x => x.id !== id))
    toast.success('Documento removido')
  }

  const TABS: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'processos', label: 'Processos', icon: Scale, count: processes.length },
    { key: 'comunicados', label: 'Comunicados', icon: MessageSquare, count: messages.length },
    { key: 'documentos', label: 'Documentos', icon: FileText, count: docs.length },
    { key: 'financeiro', label: 'Financeiro', icon: DollarSign, count: finances.length },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Portal do Cliente</h1>
          <p className="text-sm text-muted-foreground">Visualize e gerencie o que cada cliente vê no portal</p>
        </div>
        {selectedClient && (
          <a
            href="/portal"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Eye className="h-3.5 w-3.5" />
            Prévia do portal
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Seletor de cliente */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Cliente selecionado</span>
        </div>
        <Popover open={clientOpen} onOpenChange={setClientOpen}>
          <PopoverTrigger asChild>
            <button className="w-full flex items-center justify-between gap-2 border rounded-xl px-3 py-2.5 hover:border-primary/50 transition-colors bg-background text-left">
              <span className={selectedClient ? 'text-sm font-medium' : 'text-sm text-muted-foreground'}>
                {selectedClient ? selectedClient.name : 'Selecione um cliente...'}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar cliente..." />
              <CommandList>
                <CommandEmpty>Nenhum cliente encontrado</CommandEmpty>
                <CommandGroup>
                  {clients.map(c => (
                    <CommandItem
                      key={c.id}
                      value={c.name}
                      onSelect={() => {
                        setSelectedClient(c)
                        setClientOpen(false)
                        setTab('processos')
                      }}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{c.name}</p>
                          {c.email && <p className="text-[11px] text-muted-foreground">{c.email}</p>}
                        </div>
                        {selectedClient?.id === c.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </Card>

      {selectedClient && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 bg-muted/40 rounded-xl p-1 flex-wrap">
            {TABS.map(t => {
              const Icon = t.icon
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-1 sm:flex-none justify-center sm:justify-start ${
                    tab === t.key
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
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

          {/* Processos */}
          {tab === 'processos' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Processos vinculados a <strong>{selectedClient.name}</strong> — visíveis no portal do cliente.
              </p>
              {processes.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <Scale className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum processo vinculado a este cliente</p>
                  <p className="text-xs mt-1">Vá em Processos e associe ao cliente para aparecer aqui</p>
                </Card>
              ) : (
                processes.map(p => (
                  <Card key={p.id} className="p-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                      <Scale className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <p className="text-[11px] text-muted-foreground">{p.number ?? 'Sem número'} · {p.phase}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{p.status}</Badge>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* Comunicados */}
          {tab === 'comunicados' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Mensagens enviadas para <strong>{selectedClient.name}</strong>
                </p>
                <Button size="sm" onClick={() => setMsgModal(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Novo comunicado
                </Button>
              </div>
              {messages.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum comunicado enviado ainda</p>
                </Card>
              ) : (
                messages.map(m => (
                  <Card key={m.id} className={`p-4 ${!m.read_at ? 'border-primary/30' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold">{m.title}</p>
                          {!m.read_at && <Badge className="text-[9px] h-4">Não lido</Badge>}
                        </div>
                        <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{m.body}</p>
                        <p className="text-[10px] text-muted-foreground mt-2">{fmtDate(m.created_at)} · {m.sent_by}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => deleteMsg(m.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* Documentos */}
          {tab === 'documentos' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Documentos compartilhados com <strong>{selectedClient.name}</strong>
                </p>
                <Button size="sm" onClick={() => setDocModal(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Adicionar documento
                </Button>
              </div>
              {docs.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum documento compartilhado</p>
                </Card>
              ) : (
                docs.map(d => (
                  <Card key={d.id} className="p-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.title}</p>
                      <p className="text-[11px] text-muted-foreground">{d.type ?? 'Documento'} · {fmtDate(d.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a href={d.drive_url} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteDoc(d.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* Financeiro */}
          {tab === 'financeiro' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Lançamentos de receita vinculados a <strong>{selectedClient.name}</strong> — visíveis no portal.
              </p>
              {finances.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum lançamento financeiro para este cliente</p>
                  <p className="text-xs mt-1">Cadastre no Financeiro com o cliente associado</p>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-4 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 uppercase font-semibold">A receber</p>
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-400 mt-1">
                        {fmtBRL(finances.filter(f => !f.paid).reduce((s, f) => s + Number(f.value), 0))}
                      </p>
                    </Card>
                    <Card className="p-4 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 uppercase font-semibold">Recebido</p>
                      <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                        {fmtBRL(finances.filter(f => f.paid).reduce((s, f) => s + Number(f.value), 0))}
                      </p>
                    </Card>
                  </div>
                  {finances.map(f => (
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
                        <Badge variant={f.paid ? 'secondary' : 'outline'} className="text-[9px] h-4 mt-0.5">
                          {f.paid ? 'Pago' : 'Pendente'}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}

      {!selectedClient && (
        <Card className="p-12 text-center text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Selecione um cliente para ver o portal</p>
          <p className="text-xs mt-1">Você poderá visualizar e incluir conteúdo manualmente</p>
        </Card>
      )}

      {/* Modal: Novo comunicado */}
      <Dialog open={msgModal} onOpenChange={setMsgModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo comunicado para {selectedClient?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Título</label>
              <Input
                placeholder="Ex: Atualização do processo"
                value={msgForm.title}
                onChange={e => setMsgForm(f => ({ ...f, title: e.target.value }))}
              />
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

      {/* Modal: Adicionar documento */}
      <Dialog open={docModal} onOpenChange={setDocModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar documento para {selectedClient?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Título do documento</label>
              <Input
                placeholder="Ex: Contrato de honorários"
                value={docForm.title}
                onChange={e => setDocForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Link do Google Drive</label>
              <Input
                placeholder="https://drive.google.com/..."
                value={docForm.drive_url}
                onChange={e => setDocForm(f => ({ ...f, drive_url: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo (opcional)</label>
              <Input
                placeholder="Ex: Contrato, Petição, Procuração..."
                value={docForm.type}
                onChange={e => setDocForm(f => ({ ...f, type: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setDocModal(false)}>Cancelar</Button>
              <Button onClick={saveDoc} disabled={saving || !docForm.title.trim() || !docForm.drive_url.trim()}>
                {saving ? 'Salvando...' : 'Adicionar documento'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
