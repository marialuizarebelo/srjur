import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Plus, Search, Users, TrendingUp, UserCheck, UserX, Pencil, Trash2,
  Phone, Mail, GripVertical, LayoutGrid, List, Eye, Settings2,
  ChevronUp, ChevronDown, X, ExternalLink, Scale, ClipboardList, FileText,
} from 'lucide-react'
import { fmtBRL } from '@/lib/format'
import { ClientFormDialog, emptyClientForm, type ClientFormData } from '@/components/ClientForm'
import { findDocsByName, isZapSignConfigured, type ZapSignDoc } from '@/lib/zapsign'
import { DriveFolderPicker } from '@/components/DriveFolderPicker'
import { DriveFileList } from '@/components/DriveFileList'
import { updateDriveFolder, DRIVE_COLOR_RED, DRIVE_COLOR_GREEN } from '@/lib/googleDrive'
import { toast } from 'sonner'

// ── Types ──
interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
  cpf_cnpj: string | null
  type: string
  area: string | null
  status: string
  responsible: string | null
  notes: string | null
  birth_date: string | null
  address: string | null
  portal_visible: boolean
  created_at: string
}

interface Lead {
  id: string
  name: string
  email: string | null
  phone: string | null
  cpf_cnpj: string | null
  source: string | null
  status: string
  potential_value: number | null
  notes: string | null
  responsible: string | null
  next_followup: string | null
  drive_folder_id: string | null
  drive_url: string | null
  client_id: string | null
  created_at: string
}

// ── Types ──
interface PipelineStage {
  id: string
  label: string
  value: string
  color: string
  position: number
  show_in_kanban: boolean
}

// ── Constants ──
const AREAS = ['Família', 'Cível', 'Trabalhista', 'Empresarial', 'Consumidor', 'Sucessões', 'Criminal', 'Outro']
const LEAD_SOURCES = ['Indicação', 'Google', 'Instagram', 'WhatsApp', 'Site', 'Evento', 'Outro']

const RESPONSIBLE_COLORS: Record<string, string> = {
  'Maria Luiza': '#EC4899',
  'Juliana': '#3B82F6',
  'Ambas': '#8B5CF6',
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function getAvatarColor(name: string) {
  const colors = ['#EC4899', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#14B8A6']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

// ── Lead Card (Kanban) ──
function LeadCard({ lead, onClick, onStatusChange, stages }: {
  lead: Lead; onClick: () => void; onStatusChange: (id: string, status: string) => void
  stages: PipelineStage[]
}) {
  const kanbanStages = stages.filter(s => s.show_in_kanban)
  const currentIdx = kanbanStages.findIndex(s => s.value === lead.status)
  const nextStage = currentIdx >= 0 && currentIdx < kanbanStages.length - 1
    ? kanbanStages[currentIdx + 1]
    : null

  const [zapStatus, setZapStatus] = useState<'checking' | 'pending' | 'signed' | 'not_found' | null>(null)

  useEffect(() => {
    if (lead.status !== 'contrato_enviado' || !isZapSignConfigured()) return
    setZapStatus('checking')
    findDocsByName(lead.name).then(docs => {
      if (docs.length === 0) setZapStatus('not_found')
      else if (docs.some(d => d.status === 'signed')) setZapStatus('signed')
      else setZapStatus('pending')
    })
  }, [lead.status, lead.name])

  return (
    <div className="p-3 rounded-lg border bg-background hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium truncate flex-1">{lead.name}</p>
        {lead.client_id && (
          <Badge className="text-[9px] h-4 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 shrink-0">✓ Cliente</Badge>
        )}
        {lead.responsible && (
          <div className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] text-white font-medium shrink-0"
            style={{ backgroundColor: RESPONSIBLE_COLORS[lead.responsible] ?? '#6B7280' }}>
            {lead.responsible.charAt(0)}
          </div>
        )}
      </div>
      {lead.source && <p className="text-xs text-muted-foreground mt-0.5">{lead.source}</p>}
      {lead.potential_value ? (
        <p className="text-xs font-medium text-green-600 mt-1">{fmtBRL(lead.potential_value)}</p>
      ) : null}
      {lead.next_followup && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Follow-up: {new Date(lead.next_followup + 'T00:00').toLocaleDateString('pt-BR')}
        </p>
      )}
      {/* ZapSign status */}
      {zapStatus && lead.status === 'contrato_enviado' && (
        <div className={`mt-2 text-[10px] font-medium flex items-center gap-1 px-2 py-1 rounded-md ${
          zapStatus === 'signed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
          zapStatus === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
          zapStatus === 'checking' ? 'bg-muted text-muted-foreground' :
          'bg-muted text-muted-foreground'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${
            zapStatus === 'signed' ? 'bg-green-500' :
            zapStatus === 'pending' ? 'bg-amber-500 animate-pulse' :
            'bg-gray-400'
          }`} />
          {zapStatus === 'checking' && 'Verificando ZapSign...'}
          {zapStatus === 'signed' && '✓ Assinado no ZapSign'}
          {zapStatus === 'pending' && 'Aguardando assinatura'}
          {zapStatus === 'not_found' && 'Documento não encontrado'}
        </div>
      )}
      {nextStage && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 h-7 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={e => { e.stopPropagation(); onStatusChange(lead.id, nextStage.value) }}
        >
          Avançar → {nextStage.label}
        </Button>
      )}
    </div>
  )
}

// ── Client View Dialog ────────────────────────────────────────────────────────
interface ClientDetail extends Client {
  processes?: { id: string; title: string; number: string | null; type: string | null; status: string }[]
  tasks?: { id: string; title: string; priority: string | null; status: string }[]
  finance?: { paid: number; pending: number; overdue: number }
}

const STATUS_COLORS: Record<string, string> = {
  ativo: 'bg-emerald-100 text-emerald-700',
  inativo: 'bg-gray-100 text-gray-600',
  prospecto: 'bg-blue-100 text-blue-700',
}
const PRIORITY_COLORS: Record<string, string> = {
  alta: 'bg-red-100 text-red-700',
  media: 'bg-amber-100 text-amber-700',
  baixa: 'bg-gray-100 text-gray-600',
}
const TASK_STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-700',
  em_andamento: 'bg-blue-100 text-blue-700',
  concluida: 'bg-emerald-100 text-emerald-700',
  concluído: 'bg-emerald-100 text-emerald-700',
}

function fmtAddr(c: Client) {
  const parts = [c.street, c.address_number, c.complement, c.neighborhood, c.city && c.state ? `${c.city}/${c.state}` : c.city ?? c.state, c.cep ? `CEP ${c.cep}` : null]
  return parts.filter(Boolean).join(', ') || null
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex gap-1 text-sm">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function ClientViewDialog({ client, open, onClose, onEdit, onDelete, onNewTask, onNewProcess }: {
  client: Client | null
  open: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onNewTask: () => void
  onNewProcess: () => void
}) {
  const [detail, setDetail] = useState<ClientDetail | null>(null)

  useEffect(() => {
    if (!client || !open) return
    setDetail(null)
    Promise.all([
      supabase.from('processes').select('id, title, number, type, status').eq('client_id', client.id).order('created_at', { ascending: false }),
      supabase.from('tasks').select('id, title, priority, status').eq('client_id', client.id).order('created_at', { ascending: false }),
      supabase.from('finance').select('amount, paid, due_date').eq('client_id', client.id),
    ]).then(([procs, tasks, fin]) => {
      const now = new Date().toISOString().slice(0, 10)
      const paid = (fin.data ?? []).filter(f => f.paid).reduce((s, f) => s + f.amount, 0)
      const pending = (fin.data ?? []).filter(f => !f.paid && f.due_date >= now).reduce((s, f) => s + f.amount, 0)
      const overdue = (fin.data ?? []).filter(f => !f.paid && f.due_date < now).reduce((s, f) => s + f.amount, 0)
      setDetail({ ...client, processes: procs.data ?? [], tasks: tasks.data ?? [], finance: { paid, pending, overdue } })
    })
  }, [client, open])

  if (!client) return null
  const c = detail ?? client
  const addr = fmtAddr(client)
  const financeiro = detail?.finance

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent
        className="max-w-[680px] w-[96vw] max-h-[90vh] overflow-y-auto p-0"
        onInteractOutside={e => e.preventDefault()}
        onPointerDownOutside={e => e.preventDefault()}
        onFocusOutside={e => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full flex items-center justify-center text-white text-base font-bold shrink-0"
              style={{ backgroundColor: getAvatarColor(client.name) }}>
              {getInitials(client.name)}
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-tight">{client.name}</h2>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[client.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {client.status.toUpperCase()}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {client.type === 'pessoa_fisica' ? 'PF' : 'PJ'}
                </span>
                {client.responsible && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{client.responsible}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Cards financeiros */}
          {financeiro && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border p-3 text-center">
                <p className="text-[10px] text-muted-foreground mb-1">Pago</p>
                <p className="text-base font-bold text-emerald-600">{fmtBRL(financeiro.paid)}</p>
              </div>
              <div className="rounded-xl border p-3 text-center">
                <p className="text-[10px] text-muted-foreground mb-1">A vencer</p>
                <p className="text-base font-bold text-amber-600">{fmtBRL(financeiro.pending)}</p>
              </div>
              <div className="rounded-xl border p-3 text-center">
                <p className="text-[10px] text-muted-foreground mb-1">Atrasado</p>
                <p className={`text-base font-bold ${financeiro.overdue > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{fmtBRL(financeiro.overdue)}</p>
              </div>
            </div>
          )}

          {/* Dados */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
            <InfoRow label="CPF/CNPJ" value={client.cpf_cnpj} />
            <InfoRow label="E-mail" value={client.email} />
            <InfoRow label="Telefone" value={client.phone} />
            <InfoRow label="Origem" value={client.origin} />
            <InfoRow label="Área" value={client.area} />
            <InfoRow label="Responsável" value={client.responsible} />
            <InfoRow label="Nacionalidade" value={(client as any).nationality} />
            <InfoRow label="Estado Civil" value={(client as any).marital_status} />
            <InfoRow label="Profissão" value={(client as any).profession} />
            <InfoRow label="Data de nascimento" value={client.birth_date ? new Date(client.birth_date + 'T00:00').toLocaleDateString('pt-BR') : null} />
            {((client as any).rg_number) && (
              <InfoRow label="RG" value={`${(client as any).rg_number}${(client as any).rg_issuer ? ` / ${(client as any).rg_issuer}` : ''}`} />
            )}
            <InfoRow label="Entrada" value={new Date(client.created_at).toLocaleDateString('pt-BR')} />
            {client.potential_value && <InfoRow label="Potencial" value={fmtBRL(Number(client.potential_value))} />}
          </div>

          {addr && (
            <div className="text-sm">
              <span className="text-muted-foreground">Endereço: </span>
              <span className="font-medium">{addr}</span>
            </div>
          )}

          {client.notes && (
            <div className="rounded-lg bg-muted/40 border px-4 py-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Observações</p>
              <p className="text-sm whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}

          {/* Processos vinculados */}
          {(detail?.processes?.length ?? 0) > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Processos Vinculados ({detail!.processes!.length})
              </p>
              <div className="space-y-1.5">
                {detail!.processes!.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <p className="text-sm truncate flex-1">
                      {p.title}{p.number ? ` (${p.number})` : ''}
                    </p>
                    <div className="flex gap-1 shrink-0">
                      {p.type && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">{p.type.toUpperCase()}</span>}
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{p.status.toUpperCase().replace('_', ' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tarefas vinculadas */}
          {(detail?.tasks?.length ?? 0) > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Tarefas Vinculadas ({detail!.tasks!.length})
              </p>
              <div className="space-y-1.5">
                {detail!.tasks!.map(t => (
                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <p className="text-sm truncate flex-1">{t.title}</p>
                    <div className="flex gap-1 shrink-0">
                      {t.priority && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_COLORS[t.priority] ?? 'bg-gray-100 text-gray-600'}`}>{t.priority.toUpperCase()}</span>}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TASK_STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600'}`}>{t.status.toUpperCase().replace('_', ' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ações rápidas */}
          <div className="flex flex-wrap gap-2 pt-1">
            {client.drive_url && (
              <Button variant="outline" size="sm" onClick={() => window.open(client.drive_url!, '_blank')}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Pasta
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => { onClose(); onNewProcess() }}>
              <Scale className="h-3.5 w-3.5 mr-1.5" />Criar Processo
            </Button>
            <Button variant="outline" size="sm" onClick={() => { onClose(); onNewTask() }}>
              <ClipboardList className="h-3.5 w-3.5 mr-1.5" />Nova Tarefa
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t bg-muted/20">
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
            <Button size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />Editar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Client Card ──
function ClientCard({ client, onEdit }: { client: Client; onEdit: () => void }) {
  const color = getAvatarColor(client.name)
  return (
    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={onEdit}>
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
          style={{ backgroundColor: color }}
        >
          {getInitials(client.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{client.name}</p>
          <p className="text-xs text-muted-foreground truncate">{client.area ?? client.type}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {client.responsible && (
              <Badge variant="outline" className="text-[10px]"
                style={{ borderColor: RESPONSIBLE_COLORS[client.responsible] ?? '#6B7280', color: RESPONSIBLE_COLORS[client.responsible] ?? '#6B7280' }}
              >
                {client.responsible}
              </Badge>
            )}
            <Badge variant={client.status === 'ativo' ? 'default' : 'secondary'} className="text-[10px]">
              {client.status.toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── Main ──
export default function Clientes() {
  const [clients, setClients] = useState<Client[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'crm' | 'ativos' | 'encerrados'>('ativos')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [viewClient, setViewClient] = useState<Client | null>(null)
  const [dialogOpen, setDialogOpen] = useState(() => sessionStorage.getItem('srjur_client_dialog') === '1')
  const [leadDialogOpen, setLeadDialogOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [stagesDialogOpen, setStagesDialogOpen] = useState(false)
  const [quickLeadOpen, setQuickLeadOpen] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickPhone, setQuickPhone] = useState('')
  const [quickSaving, setQuickSaving] = useState(false)
  const [newStageLabel, setNewStageLabel] = useState('')
  const [newStageColor, setNewStageColor] = useState('#8B5CF6')

  // Client form — persiste no sessionStorage para sobreviver reload do PWA
  const [cf, setCf] = useState<ClientFormData>(() => {
    try {
      const saved = sessionStorage.getItem('srjur_client_form')
      return saved ? { ...emptyClientForm, ...JSON.parse(saved) } : { ...emptyClientForm }
    } catch { return { ...emptyClientForm } }
  })

  // Lead form
  const [lf, setLf] = useState({
    name: '', email: '', phone: '', cpf_cnpj: '', source: '',
    status: 'novo', potential_value: '', notes: '', responsible: '',
    next_followup: '', drive_folder_id: '', drive_url: '',
  })

  const resetCf = () => {
    setCf({ ...emptyClientForm })
    setEditingClient(null)
  }

  const resetLf = () => {
    setLf({ name: '', email: '', phone: '', cpf_cnpj: '', source: '',
      status: 'novo', potential_value: '', notes: '', responsible: '', next_followup: '',
      drive_folder_id: '', drive_url: '' })
    setEditingLead(null)
  }

  const loadData = async () => {
    setLoading(true)
    const [{ data: c }, { data: l }, { data: s }] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('pipeline_stages').select('*').order('position'),
    ])
    setClients((c as Client[]) ?? [])
    setLeads((l as Lead[]) ?? [])
    setStages((s as PipelineStage[]) ?? [])
    setLoading(false)
  }

  const [driveRootFolderId, setDriveRootFolderId] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    supabase.from('office_settings').select('drive_root_folder_id').limit(1).maybeSingle().then(({ data }) => {
      setDriveRootFolderId(data?.drive_root_folder_id ?? null)
    })
  }, [])

  // Persiste form e estado do dialog no sessionStorage
  useEffect(() => {
    if (dialogOpen) {
      sessionStorage.setItem('srjur_client_dialog', '1')
      sessionStorage.setItem('srjur_client_form', JSON.stringify(cf))
    } else {
      sessionStorage.removeItem('srjur_client_dialog')
      sessionStorage.removeItem('srjur_client_form')
    }
  }, [dialogOpen, cf])

  // ZapSign: check for signed contracts and auto-advance leads
  useEffect(() => {
    if (!isZapSignConfigured() || leads.length === 0) return

    const checkZapSign = async () => {
      const contractLeads = leads.filter(l => l.status === 'contrato_enviado')
      if (contractLeads.length === 0) return

      for (const lead of contractLeads) {
        const docs = await findDocsByName(lead.name)
        const signedDoc = docs.find(d => d.status === 'signed')
        if (signedDoc) {
          await autoConvertLead(lead)
          loadData()
        }
      }
    }

    const timer = setTimeout(checkZapSign, 2000)
    return () => clearTimeout(timer)
  }, [leads])

  // ── Filtered data ──
  const filteredClients = useMemo(() => {
    const statusFilter = tab === 'ativos' ? 'ativo' : 'inativo'
    return clients
      .filter(c => c.status === statusFilter)
      .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))
  }, [clients, tab, search])

  const filteredLeads = useMemo(() => {
    return leads
      .filter(l => l.status !== 'convertido' && l.status !== 'perdido')
      .filter(l => !search || l.name.toLowerCase().includes(search.toLowerCase()))
  }, [leads, search])

  const leadsByStage = useMemo(() => {
    const map = new Map<string, Lead[]>()
    stages.forEach(s => map.set(s.value, []))
    filteredLeads.forEach(l => {
      const arr = map.get(l.status) ?? []
      arr.push(l)
      map.set(l.status, arr)
    })
    return map
  }, [filteredLeads, stages])

  // ── Stats ──
  const totalAtivos = clients.filter(c => c.status === 'ativo').length
  const totalLeads = leads.filter(l => l.status !== 'perdido' && l.status !== 'convertido' && !l.client_id).length
  const pipelineValue = leads
    .filter(l => l.status !== 'perdido' && !l.client_id)
    .reduce((s, l) => s + (l.potential_value ?? 0), 0)

  // ── Client CRUD ──
  const openEditClient = (c: any) => {
    setCf({
      name: c.name ?? '', type: c.type ?? 'pessoa_fisica', cpf_cnpj: c.cpf_cnpj ?? '',
      email: c.email ?? '', phone: c.phone ?? '', gender: c.gender ?? 'Não informado',
      nationality: c.nationality ?? 'brasileira', marital_status: c.marital_status ?? 'Não informado',
      profession: c.profession ?? '', rg_number: c.rg_number ?? '', rg_issuer: c.rg_issuer ?? '',
      cep: c.cep ?? '', street: c.street ?? '', address_number: c.address_number ?? '',
      complement: c.complement ?? '', neighborhood: c.neighborhood ?? '',
      city: c.city ?? '', state: c.state ?? '',
      responsible: c.responsible ?? '', origin: c.origin ?? '',
      area: c.area ?? '', areas_selected: c.area ? c.area.split(', ') : [],
      potential_value: c.potential_value ? String(c.potential_value) : '',
      drive_url: c.drive_url ?? '', drive_folder_id: c.drive_folder_id ?? '', tags: c.tags ?? '', notes: c.notes ?? '',
      status: c.status ?? 'ativo', portal_visible: c.portal_visible ?? false,
      birth_date: c.birth_date ?? '',
    })
    setEditingClient(c)
    setDialogOpen(true)
  }

  const saveClient = async () => {
    const payload = {
      name: cf.name, email: cf.email || null, phone: cf.phone || null,
      cpf_cnpj: cf.cpf_cnpj || null, type: cf.type,
      area: cf.areas_selected.length > 0 ? cf.areas_selected.join(', ') : null,
      status: cf.status, responsible: cf.responsible || null, notes: cf.notes || null,
      birth_date: cf.birth_date || null, portal_visible: cf.portal_visible,
      gender: cf.gender || null, nationality: cf.nationality || null,
      marital_status: cf.marital_status || null, profession: cf.profession || null,
      rg_number: cf.rg_number || null, rg_issuer: cf.rg_issuer || null,
      cep: cf.cep || null, street: cf.street || null,
      address_number: cf.address_number || null, complement: cf.complement || null,
      neighborhood: cf.neighborhood || null, city: cf.city || null, state: cf.state || null,
      origin: cf.origin || null,
      potential_value: cf.potential_value ? parseFloat(cf.potential_value.replace(',', '.')) : null,
      drive_url: cf.drive_url || null, drive_folder_id: cf.drive_folder_id || null, tags: cf.tags || null,
    }
    if (editingClient) {
      await supabase.from('clients').update(payload).eq('id', editingClient.id)
    } else {
      const { data: newClient } = await supabase.from('clients').insert(payload).select('id').single()
      // If new client, create task to complete registration
      if (newClient) {
        await supabase.from('tasks').insert({
          title: `Completar cadastro — ${cf.name}`,
          description: 'Verificar e completar todos os dados do cliente: documentos, endereço, pasta no Drive',
          type: 'tarefa', status: 'pendente', priority: 'alta',
          due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
          responsible: cf.responsible || null, client_id: newClient.id,
        })
      }
    }
    setDialogOpen(false)
    resetCf()
    loadData()
  }

  const deleteClient = async (id: string) => {
    if (!confirm('Excluir este cliente?')) return
    await supabase.from('clients').delete().eq('id', id)
    loadData()
  }

  // ── Lead CRUD ──
  const openEditLead = (l: Lead) => {
    setLf({
      name: l.name, email: l.email ?? '', phone: l.phone ?? '', cpf_cnpj: l.cpf_cnpj ?? '',
      source: l.source ?? '', status: l.status, potential_value: l.potential_value ? String(l.potential_value) : '',
      notes: l.notes ?? '', responsible: l.responsible ?? '', next_followup: l.next_followup ?? '',
      drive_folder_id: l.drive_folder_id ?? '', drive_url: l.drive_url ?? '',
    })
    setEditingLead(l)
    setLeadDialogOpen(true)
  }

  const saveLead = async () => {
    const payload = {
      name: lf.name, email: lf.email || null, phone: lf.phone || null,
      cpf_cnpj: lf.cpf_cnpj || null, source: lf.source || null, status: lf.status,
      potential_value: lf.potential_value ? parseFloat(lf.potential_value.replace(',', '.')) : null,
      notes: lf.notes || null, responsible: lf.responsible || null,
      next_followup: lf.next_followup || null,
      drive_folder_id: lf.drive_folder_id || null, drive_url: lf.drive_url || null,
    }
    if (editingLead) {
      await supabase.from('leads').update(payload).eq('id', editingLead.id)
    } else {
      await supabase.from('leads').insert(payload)
    }
    setLeadDialogOpen(false)
    resetLf()
    loadData()
  }

  const convertLead = async (lead: Lead) => {
    if (lead.client_id) { toast.error('Esse lead já foi convertido em cliente'); return }
    if (!confirm(`Converter "${lead.name}" em cliente ativo? Isso criará tarefas de onboarding automaticamente.`)) return
    await autoConvertLead(lead)
    loadData()
  }

  const deleteLead = async (id: string) => {
    if (!confirm('Excluir este lead?')) return
    await supabase.from('leads').delete().eq('id', id)
    loadData()
  }

  const updateLeadStatus = async (leadId: string, newStatus: string) => {
    await supabase.from('leads').update({ status: newStatus }).eq('id', leadId)

    if (newStatus === 'contrato_assinado') {
      const lead = leads.find(l => l.id === leadId)
      // só converte se ainda não tiver virado cliente (evita duplicar tarefas/pasta)
      if (lead && !lead.client_id) await autoConvertLead(lead)
    }

    loadData()
  }

  const autoConvertLead = async (lead: Lead) => {
    // Se o lead já tem pasta no Drive, renomeia (tira "- LEAD") e pinta de verde
    let finalFolderId = lead.drive_folder_id
    let finalDriveUrl = lead.drive_url
    if (lead.drive_folder_id) {
      try {
        const cleanName = lead.name // nome sem o sufixo "- LEAD"
        await updateDriveFolder(lead.drive_folder_id, { name: cleanName, color: DRIVE_COLOR_GREEN })
        toast.success('Pasta do Drive atualizada (verde, sem "LEAD")')
      } catch (e: any) {
        toast.error('Pasta do Drive NÃO foi atualizada: ' + (e.message ?? 'erro desconhecido'))
        // não trava a conversão do lead mesmo se isso falhar
      }
    }

    // Create client
    const { data: newClient } = await supabase.from('clients').insert({
      name: lead.name, email: lead.email, phone: lead.phone,
      cpf_cnpj: lead.cpf_cnpj, status: 'ativo', responsible: lead.responsible,
      notes: lead.notes, drive_folder_id: finalFolderId, drive_url: finalDriveUrl,
    }).select('id').single()

    // Vincula o lead ao cliente criado, mas mantém o status/etapa do kanban
    // intacto (o card continua aparecendo em "Contrato Assinado" pro histórico)
    if (newClient) {
      await supabase.from('leads').update({ client_id: newClient.id }).eq('id', lead.id)
    }

    // Create onboarding tasks
    if (newClient) {
      const today = new Date().toISOString().slice(0, 10)
      const in3days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
      const in7days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
      const in15days = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)

      await supabase.from('tasks').insert([
        {
          title: `Boas-vindas — ${lead.name}`,
          description: 'Enviar mensagem de boas-vindas e orientações iniciais ao cliente',
          type: 'tarefa', status: 'pendente', priority: 'alta',
          due_date: today, responsible: lead.responsible, client_id: newClient.id,
        },
        {
          title: `Coletar documentos — ${lead.name}`,
          description: 'Solicitar documentos necessários para abertura do caso',
          type: 'tarefa', status: 'pendente', priority: 'alta',
          due_date: in3days, responsible: lead.responsible, client_id: newClient.id,
        },
        {
          title: `Criar caso/processo — ${lead.name}`,
          description: 'Cadastrar o processo ou caso no sistema',
          type: 'tarefa', status: 'pendente', priority: 'media',
          due_date: in7days, responsible: lead.responsible, client_id: newClient.id,
        },
        {
          title: `Configurar portal do cliente — ${lead.name}`,
          description: 'Ativar acesso ao portal e compartilhar credenciais',
          type: 'tarefa', status: 'pendente', priority: 'media',
          due_date: in7days, responsible: lead.responsible, client_id: newClient.id,
        },
        {
          title: `Lançar honorários — ${lead.name}`,
          description: 'Cadastrar os lançamentos financeiros do contrato',
          type: 'tarefa', status: 'pendente', priority: 'media',
          due_date: in7days, responsible: lead.responsible, client_id: newClient.id,
        },
        {
          title: `Acompanhamento inicial — ${lead.name}`,
          description: 'Fazer contato de acompanhamento 15 dias após contratação',
          type: 'compromisso', status: 'pendente', priority: 'media',
          due_date: in15days, responsible: lead.responsible, client_id: newClient.id,
        },
      ])
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {totalAtivos} ativos · {totalLeads} leads no pipeline
            {pipelineValue > 0 && ` · ${fmtBRL(pipelineValue)} potencial`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'crm' ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStagesDialogOpen(true)}>
                <Settings2 className="h-3 w-3 mr-1" />Etapas
              </Button>
              <Button variant="outline" size="sm" className="text-green-600 border-green-300 hover:bg-green-50"
                onClick={() => { setQuickName(''); setQuickPhone(''); setQuickLeadOpen(true) }}>
                <Phone className="h-3 w-3 mr-1" />WhatsApp
              </Button>
              <Button size="sm" onClick={() => { resetLf(); setLeadDialogOpen(true) }}>
                <Plus className="h-3 w-3 mr-1" />Novo Lead
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => { resetCf(); setDialogOpen(true) }}>
              <Plus className="h-3 w-3 mr-1" />Novo Cliente
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          <Button variant={tab === 'crm' ? 'default' : 'ghost'} size="sm" className="h-8"
            onClick={() => setTab('crm')}>
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />CRM
            <Badge variant="secondary" className="ml-1.5 text-[10px]">{totalLeads}</Badge>
          </Button>
          <Button variant={tab === 'ativos' ? 'default' : 'ghost'} size="sm" className="h-8"
            onClick={() => setTab('ativos')}>
            <UserCheck className="h-3.5 w-3.5 mr-1.5" />Ativos
            <Badge variant="secondary" className="ml-1.5 text-[10px]">{totalAtivos}</Badge>
          </Button>
          <Button variant={tab === 'encerrados' ? 'default' : 'ghost'} size="sm" className="h-8"
            onClick={() => setTab('encerrados')}>
            <UserX className="h-3.5 w-3.5 mr-1.5" />Encerrados
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          {tab !== 'crm' && (
            <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
              <Button variant={viewMode === 'cards' ? 'default' : 'ghost'} size="icon" className="h-8 w-8"
                onClick={() => setViewMode('cards')}>
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button variant={viewMode === 'table' ? 'default' : 'ghost'} size="icon" className="h-8 w-8"
                onClick={() => setViewMode('table')}>
                <List className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* CRM Kanban */}
      {tab === 'crm' && (
        <div className="flex items-center gap-6 p-4 rounded-xl bg-muted/50 mb-4">
          <div>
            <p className="text-xs text-muted-foreground">Leads ativos</p>
            <p className="text-lg font-bold">{totalLeads}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Potencial total</p>
            <p className="text-lg font-bold text-green-600">{fmtBRL(pipelineValue)}</p>
          </div>
          {stages.filter(s => s.show_in_kanban).map(stage => {
            const sLeads = leadsByStage.get(stage.value) ?? []
            if (sLeads.length === 0) return null
            const val = sLeads.reduce((s, l) => s + (l.potential_value ?? 0), 0)
            return (
              <div key={stage.value} className="hidden lg:block">
                <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">{stage.label}</p>
                <p className="text-sm font-semibold" style={{ color: stage.color }}>{fmtBRL(val)}</p>
              </div>
            )
          })}
        </div>
      )}
      {tab === 'crm' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.filter(s => s.show_in_kanban).map(stage => {
            const stageLeads = leadsByStage.get(stage.value) ?? []
            return (
              <div key={stage.value} className="min-w-[260px] w-[260px] shrink-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-semibold">{stage.label}</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto">{stageLeads.length}</Badge>
                </div>
                <p className="text-xs text-green-600 font-medium mb-3 pl-[18px]">
                  {fmtBRL(stageLeads.reduce((s, l) => s + (l.potential_value ?? 0), 0))}
                </p>
                <div className="space-y-2">
                  {stageLeads.map(lead => (
                    <LeadCard key={lead.id} lead={lead} onClick={() => openEditLead(lead)} onStatusChange={updateLeadStatus} stages={stages} />
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="p-4 rounded-lg border border-dashed text-center">
                      <p className="text-xs text-muted-foreground">Nenhum lead</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Clients Grid */}
      {tab !== 'crm' && viewMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredClients.length === 0 ? (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nenhum cliente {tab === 'ativos' ? 'ativo' : 'encerrado'}</p>
            </div>
          ) : (
            filteredClients.map(c => (
              <ClientCard key={c.id} client={c} onEdit={() => setViewClient(c)} />
            ))
          )}
        </div>
      )}

      {/* Clients Table */}
      {tab !== 'crm' && viewMode === 'table' && (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhum cliente encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filteredClients.map(c => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setViewClient(c)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
                          style={{ backgroundColor: getAvatarColor(c.name) }}>
                          {getInitials(c.name)}
                        </div>
                        <span className="text-sm font-medium">{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{c.type === 'pessoa_fisica' ? 'PF' : 'PJ'}</TableCell>
                    <TableCell className="text-sm">{c.area ?? '—'}</TableCell>
                    <TableCell className="text-sm">{c.phone ?? '—'}</TableCell>
                    <TableCell className="text-sm">{c.email ?? '—'}</TableCell>
                    <TableCell className="text-sm">{c.responsible ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'ativo' ? 'default' : 'secondary'} className="text-[10px]">
                        {c.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditClient(c)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteClient(c.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Client View Dialog ── */}
      <ClientViewDialog
        client={viewClient}
        open={!!viewClient}
        onClose={() => setViewClient(null)}
        onEdit={() => { const c = viewClient; setViewClient(null); if (c) openEditClient(c) }}
        onDelete={() => { if (viewClient) { deleteClient(viewClient.id); setViewClient(null) } }}
        onNewTask={() => { /* TODO: abrir tarefas com cliente pré-selecionado */ }}
        onNewProcess={() => { /* TODO: abrir processos com cliente pré-selecionado */ }}
      />

      {/* ── Client Dialog ── */}
      <ClientFormDialog
        open={dialogOpen}
        onOpenChange={o => { setDialogOpen(o); if (!o) resetCf() }}
        form={cf}
        setForm={setCf}
        onSave={saveClient}
        onDelete={editingClient ? () => { deleteClient(editingClient.id); setDialogOpen(false); resetCf() } : undefined}
        isEditing={!!editingClient}
        clientId={editingClient?.id}
      />

      {/* ── Lead Dialog ── */}
      <Dialog open={leadDialogOpen} onOpenChange={o => { setLeadDialogOpen(o); if (!o) resetLf() }}>
        <DialogContent className="max-w-[700px] w-[96vw] max-h-[90vh] overflow-y-auto p-8">
          <DialogHeader>
            <DialogTitle className="text-lg">{editingLead ? 'Editar' : 'Novo'} Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={lf.name} onChange={e => setLf(f => ({ ...f, name: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>CPF / CNPJ</Label>
                <Input value={lf.cpf_cnpj} onChange={e => setLf(f => ({ ...f, cpf_cnpj: e.target.value }))} className="h-10" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={lf.email} onChange={e => setLf(f => ({ ...f, email: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={lf.phone} onChange={e => setLf(f => ({ ...f, phone: e.target.value }))} className="h-10" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Origem</Label>
                <Select value={lf.source} onValueChange={v => setLf(f => ({ ...f, source: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor potencial (R$)</Label>
                <Input value={lf.potential_value} onChange={e => setLf(f => ({ ...f, potential_value: e.target.value }))} placeholder="0,00" className="h-10" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Etapa</Label>
                <Select value={lf.status} onValueChange={v => setLf(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {stages.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Select value={lf.responsible} onValueChange={v => setLf(f => ({ ...f, responsible: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Maria Luiza">Maria Luiza</SelectItem>
                    <SelectItem value="Juliana">Juliana</SelectItem>
                    <SelectItem value="Ambas">Ambas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Próximo follow-up</Label>
              <Input type="date" value={lf.next_followup} onChange={e => setLf(f => ({ ...f, next_followup: e.target.value }))} className="h-10" />
            </div>

            <div className="space-y-2">
              <Label>Pasta no Google Drive</Label>
              <DriveFolderPicker
                value={{ folder_id: lf.drive_folder_id, drive_url: lf.drive_url }}
                onChange={f => setLf(prev => ({ ...prev, drive_folder_id: f.folder_id, drive_url: f.drive_url }))}
                folderNameSuggestion={lf.name ? `${lf.name} - LEAD` : ''}
                parentFolderId={driveRootFolderId}
                createColor={DRIVE_COLOR_RED}
              />
              {lf.drive_folder_id && (
                <div className="rounded-xl border border-border/60 p-3 mt-2">
                  <DriveFileList folderId={lf.drive_folder_id} />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={lf.notes} onChange={e => setLf(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter className="pt-4">
            {editingLead && (
              <div className="flex gap-2 mr-auto">
                <Button variant="destructive" onClick={() => { deleteLead(editingLead.id); setLeadDialogOpen(false); resetLf() }}>
                  Excluir
                </Button>
                {!editingLead.client_id ? (
                  <Button variant="outline" className="text-green-600 border-green-300" onClick={() => { convertLead(editingLead); setLeadDialogOpen(false); resetLf() }}>
                    <UserCheck className="h-3.5 w-3.5 mr-1" />Converter em cliente
                  </Button>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    <UserCheck className="h-3 w-3 mr-1" />Já é cliente ativo
                  </Badge>
                )}
              </div>
            )}
            <DialogClose render={<Button variant="outline" size="lg" />}>Cancelar</DialogClose>
            <Button size="lg" onClick={saveLead} disabled={!lf.name}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Quick Lead (WhatsApp) ── */}
      <Dialog open={quickLeadOpen} onOpenChange={setQuickLeadOpen}>
        <DialogContent className="max-w-[380px] w-[92vw] p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="h-8 w-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Phone className="h-4 w-4 text-green-600" />
              </div>
              Lead rápido
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Input
              placeholder="Nome"
              value={quickName}
              onChange={e => setQuickName(e.target.value)}
              className="h-11 text-base"
              autoFocus
            />
            <Input
              placeholder="(00) 00000-0000"
              value={quickPhone}
              onChange={e => {
                const d = e.target.value.replace(/\D/g, '')
                if (d.length <= 10) setQuickPhone(d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2'))
                else setQuickPhone(d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 15))
              }}
              className="h-11 text-base"
            />
            <Button
              className="w-full h-11 bg-green-600 hover:bg-green-700 text-base"
              disabled={!quickName || quickSaving}
              onClick={async () => {
                setQuickSaving(true)
                await supabase.from('leads').insert({
                  name: quickName,
                  phone: quickPhone || null,
                  source: 'WhatsApp',
                  status: 'novo',
                })
                setQuickSaving(false)
                setQuickLeadOpen(false)
                setQuickName('')
                setQuickPhone('')
                loadData()
              }}
            >
              {quickSaving ? 'Salvando...' : 'Salvar lead'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Stages Editor Dialog ── */}
      <Dialog open={stagesDialogOpen} onOpenChange={setStagesDialogOpen}>
        <DialogContent className="max-w-[600px] w-[96vw] max-h-[85vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="text-lg">Gerenciar Etapas do Pipeline</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Arraste para reordenar. Etapas com "Kanban" ativo aparecem no quadro.
            </p>

            <div className="space-y-2">
              {stages.sort((a, b) => a.position - b.position).map((stage, idx) => (
                <div key={stage.id} className="flex items-center gap-3 p-3 rounded-lg border">
                  <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-medium flex-1">{stage.label}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      disabled={idx === 0}
                      onClick={async () => {
                        const prev = stages.sort((a, b) => a.position - b.position)[idx - 1]
                        if (!prev) return
                        await supabase.from('pipeline_stages').update({ position: prev.position }).eq('id', stage.id)
                        await supabase.from('pipeline_stages').update({ position: stage.position }).eq('id', prev.id)
                        loadData()
                      }}>
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      disabled={idx === stages.length - 1}
                      onClick={async () => {
                        const next = stages.sort((a, b) => a.position - b.position)[idx + 1]
                        if (!next) return
                        await supabase.from('pipeline_stages').update({ position: next.position }).eq('id', stage.id)
                        await supabase.from('pipeline_stages').update({ position: stage.position }).eq('id', next.id)
                        loadData()
                      }}>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={stage.show_in_kanban}
                      onCheckedChange={async (v) => {
                        await supabase.from('pipeline_stages').update({ show_in_kanban: v }).eq('id', stage.id)
                        loadData()
                      }}
                    />
                    <span className="text-xs text-muted-foreground w-12">Kanban</span>
                  </div>
                  {!['novo', 'convertido', 'perdido'].includes(stage.value) && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      onClick={async () => {
                        if (!confirm(`Excluir etapa "${stage.label}"?`)) return
                        await supabase.from('pipeline_stages').delete().eq('id', stage.id)
                        loadData()
                      }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Add new stage */}
            <div className="flex items-center gap-3 pt-2 border-t">
              <input
                type="color"
                value={newStageColor}
                onChange={e => setNewStageColor(e.target.value)}
                className="h-8 w-8 rounded cursor-pointer border-0 p-0"
              />
              <Input
                placeholder="Nome da nova etapa"
                value={newStageLabel}
                onChange={e => setNewStageLabel(e.target.value)}
                className="h-9 flex-1"
              />
              <Button size="sm" disabled={!newStageLabel} onClick={async () => {
                const maxPos = Math.max(...stages.map(s => s.position), 0)
                const value = newStageLabel.toLowerCase()
                  .normalize('NFD').replace(/[̀-ͯ]/g, '')
                  .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
                await supabase.from('pipeline_stages').insert({
                  label: newStageLabel,
                  value,
                  color: newStageColor,
                  position: maxPos + 1,
                  show_in_kanban: true,
                })
                setNewStageLabel('')
                setNewStageColor('#8B5CF6')
                loadData()
              }}>
                <Plus className="h-3 w-3 mr-1" />Adicionar
              </Button>
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button onClick={() => setStagesDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
