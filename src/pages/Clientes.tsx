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
  ArrowUp, ArrowDown, ArrowUpDown, Copy,
} from 'lucide-react'
import { fmtBRL } from '@/lib/format'
import { exportExcel, exportPDF, fmtDateBR, fmtBRLStr } from '@/lib/exportData'
import { ExportMenu } from '@/components/ExportMenu'
import { ClientFormDialog, emptyClientForm, type ClientFormData } from '@/components/ClientForm'
import { findDocsByName, isZapSignConfigured, type ZapSignDoc } from '@/lib/zapsign'
import { DriveFolderPicker } from '@/components/DriveFolderPicker'
import { DriveFileList } from '@/components/DriveFileList'
import { updateDriveFolder, DRIVE_COLOR_RED, DRIVE_COLOR_GREEN } from '@/lib/googleDrive'
import { toast } from 'sonner'
import { Sensitive } from '@/components/Sensitive'
import { KanbanDndContext, DroppableColumn, DraggableCard } from '@/components/DndKanban'
import { KanbanScrollRow } from '@/components/KanbanScrollRow'
import { usePinnedView } from '@/hooks/usePinnedView'
import { PinViewButton } from '@/components/PinViewButton'
import { ResponsibleSelect, ResponsibleAvatars, useProfilesMap } from '@/components/ResponsibleSelect'

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
  responsible_ids: string[] | null
  notes: string | null
  birth_date: string | null
  address: string | null
  portal_visible: boolean
  created_at: string
  // extra
  referred_by: string | null
  referral_fee_pct: number | null
  signed_at: string | null
  first_contact_at: string | null
  origin: string | null
  potential_value: number | null
  drive_url: string | null
  drive_folder_id: string | null
  nationality: string | null
  marital_status: string | null
  profession: string | null
  rg_number: string | null
  rg_issuer: string | null
  mother_name: string | null
  father_name: string | null
  gender: string | null
  cep: string | null
  street: string | null
  address_number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  tags: string | null
  is_incarcerated: boolean | null
  incarceration_facility: string | null
  incarceration_city: string | null
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
  responsible_ids: string[] | null
  next_followup: string | null
  drive_folder_id: string | null
  drive_url: string | null
  client_id: string | null
  referred_by: string | null
  referral_fee_pct: number | null
  first_contact_at: string | null
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


function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function getAvatarColor(name: string) {
  const colors = ['#EC4899', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#14B8A6']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

// ── Cabeçalho de tabela clicável para ordenar (estilo Google Drive) ──
function SortableHead({ label, active, dir, onClick }: {
  label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void
}) {
  return (
    <TableHead className="select-none cursor-pointer hover:text-foreground transition-colors" onClick={onClick}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </span>
    </TableHead>
  )
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
  const profilesMap = useProfilesMap()

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
        <p className="text-sm font-medium truncate flex-1"><Sensitive>{lead.name}</Sensitive></p>
        {lead.client_id && (
          <Badge className="text-[9px] h-4 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 shrink-0">✓ Cliente</Badge>
        )}
        <ResponsibleAvatars ids={lead.responsible_ids} profilesMap={profilesMap} size="xs" />
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
  tasks?: { id: string; title: string; priority: string | null; status: string; due_date: string | null }[]
  finance?: { paid: number; pending: number; overdue: number }
  zapDocs?: { name: string; status: string; created_at: string }[]
  leadCreatedAt?: string | null
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

// Gera o texto de qualificação jurídica padrão (pessoa física) a partir dos
// dados já cadastrados do cliente. Concordância de gênero (nacionalidade,
// estado civil, "residente e domiciliado(a)") segue o campo Gênero — quando
// não informado, assume masculino (convenção mais comum nos modelos usados).
function generateQualification(c: Client): string | null {
  if (c.type !== 'pessoa_fisica') return null
  const feminino = c.gender === 'Feminino'

  // Normaliza pra raiz (remove -o/-a final) antes de aplicar o gênero certo,
  // já que o cadastro guarda "brasileira" como padrão mesmo pra clientes
  // homens até alguém editar o campo manualmente.
  const nationalityRoot = (c.nationality || 'brasileiro').trim().toLowerCase().replace(/[oa]$/, '')
  const nationality = nationalityRoot + (feminino ? 'a' : 'o')

  const maritalBase = (c.marital_status || '').replace(/\s*\(a\)\s*$/i, '').trim()
  const marital = maritalBase
    ? (feminino ? maritalBase.replace(/o$/, 'a') : maritalBase).toLowerCase()
    : null

  const profession = c.profession?.trim() || null
  const cpf = c.cpf_cnpj?.trim() || null
  const addrParts = [
    c.street,
    c.address_number ? `nº ${c.address_number}` : null,
    c.complement,
    c.neighborhood ? `Bairro ${c.neighborhood}` : null,
    c.city && c.state ? `${c.city}/${c.state}` : c.city ?? c.state,
    c.cep ? `CEP ${c.cep}` : null,
  ]
  const addr = addrParts.filter(Boolean).join(', ') || null
  const email = c.email?.trim() || null

  const bits: string[] = [c.name.toUpperCase()]
  bits.push(nationality)
  if (marital) bits.push(marital)
  if (profession) bits.push(profession)
  const mother = c.mother_name?.trim() || null
  const father = c.father_name?.trim() || null
  if (mother && father) bits.push(`filho${feminino ? 'a' : ''} de ${mother} e ${father}`)
  else if (mother) bits.push(`filho${feminino ? 'a' : ''} de ${mother}`)
  else if (father) bits.push(`filho${feminino ? 'a' : ''} de ${father}`)
  if (cpf) bits.push(`inscrito${feminino ? 'a' : ''} no CPF sob o nº ${cpf}`)
  if (addr) bits.push(`residente e domiciliado${feminino ? 'a' : ''} na ${addr}`)
  if (email) bits.push(`endereço eletrônico ${email}`)

  if (bits.length <= 1) return null
  return bits.join(', ') + '.'
}

function InfoRow({ label, value, copyable }: { label: string; value?: string | null; copyable?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium">{value}</span>
      {copyable && (
        <button
          onClick={() => { navigator.clipboard.writeText(value); toast.success(`${label} copiado!`) }}
          className="p-0.5 hover:bg-muted rounded shrink-0" title={`Copiar ${label}`}
        >
          <Copy className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
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
  const [qualification, setQualification] = useState<string | null>(null)
  const profilesMap = useProfilesMap()

  useEffect(() => {
    if (!client || !open) return
    setDetail(null)
    setQualification(null)
    Promise.all([
      supabase.from('processes').select('id, title, number, type, status').eq('client_id', client.id).order('created_at', { ascending: false }),
      supabase.from('tasks').select('id, title, priority, status, due_date').eq('client_id', client.id).order('due_date', { ascending: true }),
      supabase.from('finance').select('amount, paid, due_date').eq('client_id', client.id),
      supabase.from('leads').select('created_at').eq('client_id', client.id).limit(1).maybeSingle(),
      isZapSignConfigured() ? findDocsByName(client.name) : Promise.resolve([]),
    ]).then(([procs, tasks, fin, lead, zapDocs]) => {
      const now = new Date().toISOString().slice(0, 10)
      const paid = (fin.data ?? []).filter(f => f.paid).reduce((s, f) => s + f.amount, 0)
      const pending = (fin.data ?? []).filter(f => !f.paid && f.due_date >= now).reduce((s, f) => s + f.amount, 0)
      const overdue = (fin.data ?? []).filter(f => !f.paid && f.due_date < now).reduce((s, f) => s + f.amount, 0)
      setDetail({
        ...client,
        processes: procs.data ?? [],
        tasks: tasks.data ?? [],
        finance: { paid, pending, overdue },
        leadCreatedAt: lead.data?.created_at ?? null,
        zapDocs: Array.isArray(zapDocs) ? (zapDocs as any[]).map(d => ({ name: d.name ?? d.original_file ?? '—', status: d.status, created_at: d.created_at ?? '' })) : [],
      })
    })
  }, [client, open])

  if (!client) return null
  const c = detail ?? client
  const addr = fmtAddr(client)
  const financeiro = detail?.finance

  // Tempo como cliente
  const tempoCliente = (() => {
    const dias = Math.floor((Date.now() - new Date(client.created_at).getTime()) / 86400000)
    if (dias < 30) return `${dias} dias`
    if (dias < 365) return `${Math.floor(dias / 30)} meses`
    const anos = Math.floor(dias / 365)
    const meses = Math.floor((dias % 365) / 30)
    return meses > 0 ? `${anos} ano${anos > 1 ? 's' : ''} e ${meses} meses` : `${anos} ano${anos > 1 ? 's' : ''}`
  })()

  // Próxima tarefa pendente
  const proximaTarefa = detail?.tasks?.find(t => t.status === 'pendente' || t.status === 'em_andamento')

  // Data de primeiro contato (lead ou campo manual ou created_at)
  const primeiroContato = client.first_contact_at ?? detail?.leadCreatedAt ?? null

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
              <h2 className="text-lg font-semibold leading-tight flex items-center gap-1.5">
                <Sensitive>{client.name}</Sensitive>
                <button onClick={() => { navigator.clipboard.writeText(client.name); toast.success('Nome copiado!') }} className="p-0.5 hover:bg-muted rounded shrink-0" title="Copiar nome">
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </h2>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[client.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {client.status.toUpperCase()}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {client.type === 'pessoa_fisica' ? 'PF' : 'PJ'}
                </span>
                <ResponsibleAvatars ids={client.responsible_ids} profilesMap={profilesMap} size="xs" />
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

          {/* Linha de tempo rápida */}
          <div className="flex flex-wrap gap-3">
            {primeiroContato && (
              <div className="flex-1 min-w-[120px] rounded-lg bg-muted/40 border px-3 py-2 text-center">
                <p className="text-[10px] text-muted-foreground">1º contato</p>
                <p className="text-sm font-semibold">{new Date(primeiroContato).toLocaleDateString('pt-BR')}</p>
              </div>
            )}
            {client.signed_at && (
              <div className="flex-1 min-w-[120px] rounded-lg bg-muted/40 border px-3 py-2 text-center">
                <p className="text-[10px] text-muted-foreground">Assinatura</p>
                <p className="text-sm font-semibold">{new Date(client.signed_at + 'T00:00').toLocaleDateString('pt-BR')}</p>
              </div>
            )}
            {client.portal_visible && (
              <div className="flex-1 min-w-[120px] rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 px-3 py-2 text-center">
                <p className="text-[10px] text-emerald-600">Portal</p>
                <p className="text-sm font-semibold text-emerald-700">Ativo</p>
              </div>
            )}
          </div>

          {/* Próxima tarefa */}
          {proximaTarefa && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
              <ClipboardList className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-amber-600 font-semibold">Próxima tarefa</p>
                <p className="text-sm truncate">{proximaTarefa.title}</p>
              </div>
              {proximaTarefa.due_date && (
                <span className="text-[10px] text-amber-600 shrink-0">{new Date(proximaTarefa.due_date + 'T00:00').toLocaleDateString('pt-BR')}</span>
              )}
            </div>
          )}

          {/* Dados */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
            <InfoRow label="CPF/CNPJ" value={client.cpf_cnpj} copyable />
            <InfoRow label="E-mail" value={client.email} copyable />
            <InfoRow label="Telefone" value={client.phone} copyable />
            <InfoRow label="Origem" value={client.origin === 'Indicação' && client.referred_by ? `Indicação (${client.referred_by})` : client.origin} />
            <InfoRow label="Área" value={client.area} />
            <InfoRow label="Responsável" value={(client.responsible_ids ?? []).map(id => profilesMap[id]?.display_name).filter(Boolean).join(', ') || null} />
            <InfoRow label="Nacionalidade" value={client.nationality} />
            <InfoRow label="Estado Civil" value={client.marital_status} />
            <InfoRow label="Profissão" value={client.profession} />
            <InfoRow label="Nascimento" value={client.birth_date ? new Date(client.birth_date + 'T00:00').toLocaleDateString('pt-BR') : null} />
            {client.rg_number && (
              <InfoRow label="RG" value={`${client.rg_number}${client.rg_issuer ? ` / ${client.rg_issuer}` : ''}`} />
            )}
            <InfoRow label="Filiação (mãe)" value={client.mother_name} />
            <InfoRow label="Filiação (pai)" value={client.father_name} />
            {client.potential_value && <InfoRow label="Potencial" value={fmtBRL(Number(client.potential_value))} />}
            {client.tags && <InfoRow label="Tags" value={client.tags} />}
          </div>

          {client.is_incarcerated && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wide">Preso</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
                <InfoRow label="Penitenciária" value={client.incarceration_facility} />
                <InfoRow label="Cidade" value={client.incarceration_city} />
              </div>
            </div>
          )}

          {addr && (
            <div className="text-sm">
              <span className="text-muted-foreground">Endereço: </span>
              <span className="font-medium">{addr}</span>
            </div>
          )}

          {client.type === 'pessoa_fisica' && (
            <div className="rounded-lg border px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Qualificação</p>
                <Button
                  variant="outline" size="sm" className="h-7 text-xs"
                  onClick={() => {
                    const q = generateQualification(client)
                    if (!q) { toast.error('Preencha CPF, nacionalidade, estado civil ou endereço para gerar a qualificação.'); return }
                    setQualification(q)
                  }}
                >
                  Gerar qualificação
                </Button>
              </div>
              {qualification && (
                <div className="flex items-start gap-2">
                  <p className="text-sm flex-1 whitespace-pre-wrap">{qualification}</p>
                  <button
                    onClick={() => { navigator.clipboard.writeText(qualification); toast.success('Qualificação copiada!') }}
                    className="p-1 hover:bg-muted rounded shrink-0" title="Copiar qualificação"
                  >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              )}
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

          {/* Documentos ZapSign */}
          {(detail?.zapDocs?.length ?? 0) > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Documentos ZapSign ({detail!.zapDocs!.length})
              </p>
              <div className="space-y-1.5">
                {detail!.zapDocs!.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <p className="text-sm truncate flex-1">{doc.name}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                      doc.status === 'signed' ? 'bg-emerald-100 text-emerald-700' :
                      doc.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {doc.status === 'signed' ? '✓ ASSINADO' : doc.status === 'pending' ? 'AGUARDANDO' : doc.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pasta no Drive */}
          {client.drive_folder_id && (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Arquivos da Pasta</p>
                {client.drive_url && (
                  <button onClick={() => window.open(client.drive_url!, '_blank')} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" />Abrir no Drive
                  </button>
                )}
              </div>
              <div className="p-3">
                <DriveFileList folderId={client.drive_folder_id} />
              </div>
            </div>
          )}

          {/* Ações rápidas */}
          <div className="flex flex-wrap gap-2 pt-1">
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
  const profilesMap = useProfilesMap()
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
          <p className="font-medium text-sm truncate"><Sensitive>{client.name}</Sensitive></p>
          <p className="text-xs text-muted-foreground truncate">{client.area ?? client.type}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <ResponsibleAvatars ids={client.responsible_ids} profilesMap={profilesMap} size="xs" />
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
// ── Lead View Dialog ──
function LeadViewDialog({ lead, open, onClose, onEdit, onDelete, onConvert, onMoveStage, stages }: {
  lead: Lead | null
  open: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onConvert: () => void
  onMoveStage: (status: string) => void
  stages: PipelineStage[]
}) {
  const profilesMap = useProfilesMap()
  if (!lead) return null
  const stageInfo = stages.find(s => s.value === lead.status)
  const kanbanStages = stages.filter(s => s.show_in_kanban)
  const currentIdx = kanbanStages.findIndex(s => s.value === lead.status)
  const nextStage = currentIdx >= 0 && currentIdx < kanbanStages.length - 1 ? kanbanStages[currentIdx + 1] : null

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-[560px] w-[96vw] max-h-[90vh] overflow-y-auto p-0">
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {stageInfo && (
                <Badge className="text-[10px]" style={{ backgroundColor: stageInfo.color, color: '#fff' }}>{stageInfo.label}</Badge>
              )}
              {lead.client_id && <Badge className="text-[10px] bg-emerald-100 text-emerald-700">✓ Cliente</Badge>}
              {lead.source && <Badge variant="outline" className="text-[10px]">{lead.source}</Badge>}
            </div>
            <h2 className="text-lg font-semibold leading-tight"><Sensitive>{lead.name}</Sensitive></h2>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {lead.email && (
              <div><p className="text-[11px] text-muted-foreground">E-mail</p><p className="font-medium">{lead.email}</p></div>
            )}
            {lead.phone && (
              <div><p className="text-[11px] text-muted-foreground">Telefone</p><p className="font-medium">{lead.phone}</p></div>
            )}
            {lead.potential_value ? (
              <div><p className="text-[11px] text-muted-foreground">Valor potencial</p><p className="font-medium text-green-600">{fmtBRL(lead.potential_value)}</p></div>
            ) : null}
            {lead.responsible_ids && lead.responsible_ids.length > 0 && (
              <div>
                <p className="text-[11px] text-muted-foreground">Responsável</p>
                <div className="mt-1"><ResponsibleAvatars ids={lead.responsible_ids} profilesMap={profilesMap} size="xs" /></div>
              </div>
            )}
            {lead.next_followup && (
              <div><p className="text-[11px] text-muted-foreground">Próximo follow-up</p><p className="font-medium">{new Date(lead.next_followup + 'T00:00').toLocaleDateString('pt-BR')}</p></div>
            )}
            {lead.referred_by && (
              <div><p className="text-[11px] text-muted-foreground">Indicado por</p><p className="font-medium">{lead.referred_by}</p></div>
            )}
            {lead.referral_fee_pct != null && (
              <div><p className="text-[11px] text-muted-foreground">% repasse</p><p className="font-medium">{lead.referral_fee_pct}%</p></div>
            )}
          </div>

          {lead.notes && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Observações</p>
              <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}

          {lead.drive_url && (
            <a href={lead.drive_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary inline-flex items-center gap-1">
              Ver pasta de documentos
            </a>
          )}
        </div>

        <DialogFooter className="px-6 pb-6 pt-2 flex-wrap gap-2 mx-0 mb-0 rounded-none border-t-0">
          <Button variant="destructive" className="mr-auto" onClick={onDelete}>Excluir</Button>
          {!lead.client_id && (
            <Button variant="outline" onClick={onConvert}>Converter em cliente</Button>
          )}
          {nextStage && (
            <Button variant="outline" onClick={() => onMoveStage(nextStage.value)}>Avançar → {nextStage.label}</Button>
          )}
          <Button onClick={onEdit}>Editar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Clientes() {
  const profilesMap = useProfilesMap()
  const [clients, setClients] = useState<Client[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'crm' | 'ativos' | 'encerrados'>('ativos')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [tableSortColumn, setTableSortColumn] = useState<'name' | 'type' | 'area' | 'phone' | 'email' | 'responsible' | 'status' | null>(null)
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('asc')
  const toggleTableSort = (col: typeof tableSortColumn) => {
    if (tableSortColumn === col) setTableSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setTableSortColumn(col); setTableSortDir('asc') }
  }
  const pinnedView = usePinnedView('clientes_view', 'cards')
  useEffect(() => { if (pinnedView.loaded && pinnedView.isPinned) setViewMode(pinnedView.pinnedValue as any) }, [pinnedView.loaded])
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set())
  const toggleStageCollapsed = (stageValue: string) => {
    setCollapsedStages(prev => {
      const next = new Set(prev)
      if (next.has(stageValue)) next.delete(stageValue)
      else next.add(stageValue)
      return next
    })
  }
  const [viewClient, setViewClient] = useState<Client | null>(null)
  const [dialogOpen, setDialogOpen] = useState(() => sessionStorage.getItem('srjur_client_dialog') === '1')
  const [leadDialogOpen, setLeadDialogOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [viewLead, setViewLead] = useState<Lead | null>(null)
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
    status: 'novo', potential_value: '', notes: '', responsible: '', responsible_ids: [] as string[],
    next_followup: '', drive_folder_id: '', drive_url: '',
    referred_by: '', referral_fee_pct: '', first_contact_at: '',
  })

  const resetCf = () => {
    setCf({ ...emptyClientForm })
    setEditingClient(null)
  }

  const resetLf = () => {
    setLf({ name: '', email: '', phone: '', cpf_cnpj: '', source: '',
      status: 'novo', potential_value: '', notes: '', responsible: '', responsible_ids: [], next_followup: '',
      drive_folder_id: '', drive_url: '', referred_by: '', referral_fee_pct: '', first_contact_at: '' })
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

  // Abre o formulário certo quando vem de um atalho "+ Novo" (ex: Dashboard)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const kind = params.get('new')
    if (kind === 'lead') {
      setTab('crm')
      resetLf()
      setLeadDialogOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
    } else if (kind === 'cliente') {
      resetCf()
      setDialogOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Persiste form e estado do dialog no sessionStorage
  useEffect(() => {
    if (dialogOpen) {
      sessionStorage.setItem('srjur_client_dialog', '1')
      sessionStorage.setItem('srjur_client_form', JSON.stringify(cf))
      if (editingClient) sessionStorage.setItem('srjur_client_editing_id', editingClient.id)
      else sessionStorage.removeItem('srjur_client_editing_id')
    } else {
      sessionStorage.removeItem('srjur_client_dialog')
      sessionStorage.removeItem('srjur_client_form')
      sessionStorage.removeItem('srjur_client_editing_id')
    }
  }, [dialogOpen, cf, editingClient])

  // Restaura editingClient após reload (quando sessionStorage indicar edição em andamento)
  useEffect(() => {
    const savedId = sessionStorage.getItem('srjur_client_editing_id')
    if (savedId && clients.length > 0 && !editingClient) {
      const found = clients.find(c => c.id === savedId)
      if (found) setEditingClient(found)
    }
  }, [clients])

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
    let list = clients
      .filter(c => c.status === statusFilter)
      .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))
    if (tableSortColumn) {
      const dir = tableSortDir === 'asc' ? 1 : -1
      list = [...list].sort((a, b) => {
        switch (tableSortColumn) {
          case 'name': return a.name.localeCompare(b.name) * dir
          case 'type': return (a.type ?? '').localeCompare(b.type ?? '') * dir
          case 'area': return (a.area ?? '').localeCompare(b.area ?? '') * dir
          case 'phone': return (a.phone ?? '').localeCompare(b.phone ?? '') * dir
          case 'email': return (a.email ?? '').localeCompare(b.email ?? '') * dir
          case 'responsible': return (a.responsible ?? '').localeCompare(b.responsible ?? '') * dir
          case 'status': return (a.status ?? '').localeCompare(b.status ?? '') * dir
          default: return 0
        }
      })
    }
    return list
  }, [clients, tab, search, tableSortColumn, tableSortDir])

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
      mother_name: c.mother_name ?? '', father_name: c.father_name ?? '',
      cep: c.cep ?? '', street: c.street ?? '', address_number: c.address_number ?? '',
      complement: c.complement ?? '', neighborhood: c.neighborhood ?? '',
      city: c.city ?? '', state: c.state ?? '',
      responsible: c.responsible ?? '', responsible_ids: c.responsible_ids ?? [], origin: c.origin ?? '', referred_by: c.referred_by ?? '',
      referral_fee_pct: c.referral_fee_pct ? String(c.referral_fee_pct) : '',
      area: c.area ?? '', areas_selected: c.area ? c.area.split(', ') : [],
      potential_value: c.potential_value ? String(c.potential_value) : '',
      drive_url: c.drive_url ?? '', drive_folder_id: c.drive_folder_id ?? '', tags: c.tags ?? '', notes: c.notes ?? '',
      status: c.status ?? 'ativo', portal_visible: c.portal_visible ?? false,
      birth_date: c.birth_date ?? '', signed_at: c.signed_at ?? '', first_contact_at: c.first_contact_at ?? '',
      is_incarcerated: c.is_incarcerated ?? false,
      incarceration_facility: c.incarceration_facility ?? '', incarceration_city: c.incarceration_city ?? '',
    })
    setEditingClient(c)
    setDialogOpen(true)
  }

  const saveClient = async () => {
    if (saving) return
    setSaving(true)
    try {
    const payload = {
      name: cf.name, email: cf.email || null, phone: cf.phone || null,
      cpf_cnpj: cf.cpf_cnpj || null, type: cf.type,
      area: cf.areas_selected.length > 0 ? cf.areas_selected.join(', ') : null,
      status: cf.status,
      responsible_ids: cf.responsible_ids,
      responsible: cf.responsible_ids.length > 1
        ? cf.responsible_ids.map(id => profilesMap[id]?.display_name).filter(Boolean).join(' e ')
        : (profilesMap[cf.responsible_ids[0]]?.display_name ?? null),
      notes: cf.notes || null,
      birth_date: cf.birth_date || null, portal_visible: cf.portal_visible,
      gender: cf.gender || null, nationality: cf.nationality || null,
      marital_status: cf.marital_status || null, profession: cf.profession || null,
      rg_number: cf.rg_number || null, rg_issuer: cf.rg_issuer || null,
      mother_name: cf.mother_name || null, father_name: cf.father_name || null,
      cep: cf.cep || null, street: cf.street || null,
      address_number: cf.address_number || null, complement: cf.complement || null,
      neighborhood: cf.neighborhood || null, city: cf.city || null, state: cf.state || null,
      origin: cf.origin || null, referred_by: cf.referred_by || null,
      referral_fee_pct: cf.referral_fee_pct ? parseFloat(cf.referral_fee_pct) : null,
      signed_at: cf.signed_at || null, first_contact_at: cf.first_contact_at || null,
      potential_value: cf.potential_value ? parseFloat(cf.potential_value.replace(',', '.')) : null,
      drive_url: cf.drive_url || null, drive_folder_id: cf.drive_folder_id || null, tags: cf.tags || null,
      is_incarcerated: cf.is_incarcerated,
      incarceration_facility: cf.is_incarcerated ? (cf.incarceration_facility || null) : null,
      incarceration_city: cf.is_incarcerated ? (cf.incarceration_city || null) : null,
    }
    if (editingClient) {
      const { error } = await supabase.from('clients').update(payload).eq('id', editingClient.id)
      if (error) { toast.error('Erro ao salvar cliente: ' + error.message); return }
    } else {
      const { data: newClient, error } = await supabase.from('clients').insert(payload).select('id').single()
      if (error) { toast.error('Erro ao criar cliente: ' + error.message); return }
      // If new client, create task to complete registration
      if (newClient) {
        await supabase.from('tasks').insert({
          title: `Completar cadastro — ${cf.name}`,
          description: 'Verificar e completar todos os dados do cliente: documentos, endereço, pasta no Drive',
          type: 'tarefa', status: 'pendente', priority: 'alta',
          due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
          responsible_ids: cf.responsible_ids, client_id: newClient.id,
        })
      }
    }
    toast.success(editingClient ? 'Cliente atualizado!' : 'Cliente criado!')
    setDialogOpen(false)
    resetCf()
    loadData()
    } finally {
      setSaving(false)
    }
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
      notes: l.notes ?? '', responsible: l.responsible ?? '', responsible_ids: l.responsible_ids ?? [], next_followup: l.next_followup ?? '',
      drive_folder_id: l.drive_folder_id ?? '', drive_url: l.drive_url ?? '',
      referred_by: l.referred_by ?? '', referral_fee_pct: l.referral_fee_pct ? String(l.referral_fee_pct) : '', first_contact_at: l.first_contact_at ?? '',
    })
    setEditingLead(l)
    setLeadDialogOpen(true)
  }

  const saveLead = async () => {
    if (saving) return
    setSaving(true)
    try {
      const payload = {
        name: lf.name, email: lf.email || null, phone: lf.phone || null,
        cpf_cnpj: lf.cpf_cnpj || null, source: lf.source || null, status: lf.status,
        potential_value: lf.potential_value ? parseFloat(lf.potential_value.replace(',', '.')) : null,
        notes: lf.notes || null,
        responsible_ids: lf.responsible_ids,
        responsible: lf.responsible_ids.length > 1
          ? lf.responsible_ids.map(id => profilesMap[id]?.display_name).filter(Boolean).join(' e ')
          : (profilesMap[lf.responsible_ids[0]]?.display_name ?? null),
        next_followup: lf.next_followup || null,
        drive_folder_id: lf.drive_folder_id || null, drive_url: lf.drive_url || null,
        referred_by: lf.referred_by || null, referral_fee_pct: lf.referral_fee_pct ? parseFloat(lf.referral_fee_pct) : null, first_contact_at: lf.first_contact_at || null,
      }
      if (editingLead) {
        await supabase.from('leads').update(payload).eq('id', editingLead.id)
      } else {
        await supabase.from('leads').insert(payload)
      }
      setLeadDialogOpen(false)
      resetLf()
      loadData()
    } finally {
      setSaving(false)
    }
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
      responsible_ids: lead.responsible_ids,
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
          due_date: today, responsible_ids: lead.responsible_ids, client_id: newClient.id,
        },
        {
          title: `Coletar documentos — ${lead.name}`,
          description: 'Solicitar documentos necessários para abertura do caso',
          type: 'tarefa', status: 'pendente', priority: 'alta',
          due_date: in3days, responsible_ids: lead.responsible_ids, client_id: newClient.id,
        },
        {
          title: `Criar caso/processo — ${lead.name}`,
          description: 'Cadastrar o processo ou caso no sistema',
          type: 'tarefa', status: 'pendente', priority: 'media',
          due_date: in7days, responsible_ids: lead.responsible_ids, client_id: newClient.id,
        },
        {
          title: `Configurar portal do cliente — ${lead.name}`,
          description: 'Ativar acesso ao portal e compartilhar credenciais',
          type: 'tarefa', status: 'pendente', priority: 'media',
          due_date: in7days, responsible_ids: lead.responsible_ids, client_id: newClient.id,
        },
        {
          title: `Lançar honorários — ${lead.name}`,
          description: 'Cadastrar os lançamentos financeiros do contrato',
          type: 'tarefa', status: 'pendente', priority: 'media',
          due_date: in7days, responsible_ids: lead.responsible_ids, client_id: newClient.id,
        },
        {
          title: `Acompanhamento inicial — ${lead.name}`,
          description: 'Fazer contato de acompanhamento 15 dias após contratação',
          type: 'compromisso', status: 'pendente', priority: 'media',
          due_date: in15days, responsible_ids: lead.responsible_ids, client_id: newClient.id,
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
        <div className="flex items-center gap-2 flex-wrap">
          <ExportMenu
            onExcelExport={() => {
              if (tab === 'crm') {
                const leadRows = leads.map(l => ({
                  'Nome': l.name,
                  'Status': l.status,
                  'Origem': l.source ?? '',
                  'Valor potencial (R$)': l.potential_value ?? '',
                  'Telefone': l.phone ?? '',
                  'E-mail': l.email ?? '',
                  'CPF/CNPJ': l.cpf_cnpj ?? '',
                  'Responsável': l.responsible ?? '',
                  'Próximo follow-up': fmtDateBR(l.next_followup),
                  'Indicado por': l.referred_by ?? '',
                  'Convertido em cliente': l.client_id ? 'Sim' : 'Não',
                  'Cadastrado em': fmtDateBR(l.created_at),
                }))
                exportExcel(leadRows, `leads_${new Date().toISOString().slice(0,10)}`)
                return
              }
              const rows = clients.map(c => ({
                'Nome': c.name,
                'Tipo': c.type === 'pessoa_fisica' ? 'Pessoa Física' : 'Pessoa Jurídica',
                'Status': c.status,
                'CPF/CNPJ': c.cpf_cnpj ?? '',
                'E-mail': c.email ?? '',
                'Telefone': c.phone ?? '',
                'Área': c.area ?? '',
                'Responsável': c.responsible ?? '',
                'Origem': c.origin ?? '',
                'Indicado por': c.referred_by ?? '',
                'Nascimento': fmtDateBR(c.birth_date),
                'Gênero': c.gender ?? '',
                'Estado Civil': c.marital_status ?? '',
                'Nacionalidade': c.nationality ?? '',
                'Profissão': c.profession ?? '',
                'RG': c.rg_number ?? '',
                'Filiação (mãe)': c.mother_name ?? '',
                'Filiação (pai)': c.father_name ?? '',
                'Órgão RG': c.rg_issuer ?? '',
                'CEP': c.cep ?? '',
                'Rua': c.street ?? '',
                'Nº': c.address_number ?? '',
                'Complemento': c.complement ?? '',
                'Bairro': c.neighborhood ?? '',
                'Cidade': c.city ?? '',
                'UF': c.state ?? '',
                'Potencial (R$)': c.potential_value ?? '',
                'Primeiro Contato': fmtDateBR(c.first_contact_at),
                'Assinatura': fmtDateBR(c.signed_at),
                'Portal Ativo': c.portal_visible ? 'Sim' : 'Não',
                'Drive': c.drive_url ?? '',
                'Tags': c.tags ?? '',
                'Observações': c.notes ?? '',
                'Cadastrado em': fmtDateBR(c.created_at),
              }))
              exportExcel(rows, `clientes_${new Date().toISOString().slice(0,10)}`)
            }}
            onPdfExport={() => {
              if (tab === 'crm') {
                exportPDF(
                  'Leads (CRM)',
                  `${leads.length} leads no pipeline`,
                  [
                    { header: 'Nome', key: 'Nome', width: 50 },
                    { header: 'Status', key: 'Status', width: 25 },
                    { header: 'Origem', key: 'Origem', width: 22 },
                    { header: 'Valor potencial', key: 'Valor potencial', width: 25 },
                    { header: 'Telefone', key: 'Telefone', width: 28 },
                    { header: 'Responsável', key: 'Responsável', width: 25 },
                  ],
                  leads.map(l => ({
                    'Nome': l.name,
                    'Status': l.status,
                    'Origem': l.source ?? '—',
                    'Valor potencial': l.potential_value ? fmtBRL(l.potential_value) : '—',
                    'Telefone': l.phone ?? '—',
                    'Responsável': l.responsible ?? '—',
                  })),
                  `leads_${new Date().toISOString().slice(0,10)}`
                )
                return
              }
              exportPDF(
                'Clientes',
                `${clients.filter(c=>c.status==='ativo').length} ativos`,
                [
                  { header: 'Nome', key: 'Nome', width: 50 },
                  { header: 'Tipo', key: 'Tipo', width: 18 },
                  { header: 'Status', key: 'Status', width: 18 },
                  { header: 'Área', key: 'Área', width: 30 },
                  { header: 'Telefone', key: 'Telefone', width: 28 },
                  { header: 'E-mail', key: 'E-mail', width: 50 },
                  { header: 'Responsável', key: 'Responsável', width: 25 },
                  { header: 'Origem', key: 'Origem', width: 22 },
                ],
                clients.map(c => ({
                  'Nome': c.name,
                  'Tipo': c.type === 'pessoa_fisica' ? 'PF' : 'PJ',
                  'Status': c.status,
                  'Área': c.area ?? '—',
                  'Telefone': c.phone ?? '—',
                  'E-mail': c.email ?? '—',
                  'Responsável': c.responsible ?? '—',
                  'Origem': c.origin ?? '—',
                })),
                `clientes_${new Date().toISOString().slice(0,10)}`
              )
            }}
          />
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
              <PinViewButton isPinned={pinnedView.isPinned} currentValue={viewMode} onPin={v => pinnedView.pin(v as any)} onUnpin={pinnedView.unpin} />
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
        <KanbanDndContext onDropOnColumn={(leadId, stageValue) => {
          const lead = leads.find(l => l.id === leadId)
          if (lead && lead.status !== stageValue) updateLeadStatus(leadId, stageValue)
        }}>
          <KanbanScrollRow className="gap-3 md:gap-4 pb-4">
            {stages.filter(s => s.show_in_kanban).map(stage => {
              const stageLeads = leadsByStage.get(stage.value) ?? []
              const collapsed = collapsedStages.has(stage.value)
              return (
                <div key={stage.value} className="md:min-w-[260px] md:w-[260px] md:shrink-0 rounded-lg border md:border-none p-2 md:p-0">
                  <button
                    className="flex items-center gap-2 mb-1 w-full md:cursor-default"
                    onClick={() => toggleStageCollapsed(stage.value)}
                  >
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                    <span className="text-sm font-semibold">{stage.label}</span>
                    <Badge variant="secondary" className="text-[10px] ml-auto">{stageLeads.length}</Badge>
                    {collapsed ? <ChevronDown className="h-4 w-4 md:hidden" /> : <ChevronUp className="h-4 w-4 md:hidden" />}
                  </button>
                  <p className="text-xs text-green-600 font-medium mb-3 pl-[18px]">
                    {fmtBRL(stageLeads.reduce((s, l) => s + (l.potential_value ?? 0), 0))}
                  </p>
                  {!collapsed && (
                    <DroppableColumn id={stage.value} className="space-y-2 min-h-[60px] p-1 -m-1">
                      {stageLeads.map(lead => (
                        <DraggableCard key={lead.id} id={lead.id}>
                          <LeadCard lead={lead} onClick={() => setViewLead(lead)} onStatusChange={updateLeadStatus} stages={stages} />
                        </DraggableCard>
                      ))}
                      {stageLeads.length === 0 && (
                        <div className="p-4 rounded-lg border border-dashed text-center">
                          <p className="text-xs text-muted-foreground">Nenhum lead</p>
                        </div>
                      )}
                    </DroppableColumn>
                  )}
                </div>
              )
            })}
          </KanbanScrollRow>
        </KanbanDndContext>
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
                <SortableHead label="Nome" active={tableSortColumn === 'name'} dir={tableSortDir} onClick={() => toggleTableSort('name')} />
                <SortableHead label="Tipo" active={tableSortColumn === 'type'} dir={tableSortDir} onClick={() => toggleTableSort('type')} />
                <SortableHead label="Área" active={tableSortColumn === 'area'} dir={tableSortDir} onClick={() => toggleTableSort('area')} />
                <SortableHead label="Telefone" active={tableSortColumn === 'phone'} dir={tableSortDir} onClick={() => toggleTableSort('phone')} />
                <SortableHead label="E-mail" active={tableSortColumn === 'email'} dir={tableSortDir} onClick={() => toggleTableSort('email')} />
                <SortableHead label="Responsável" active={tableSortColumn === 'responsible'} dir={tableSortDir} onClick={() => toggleTableSort('responsible')} />
                <SortableHead label="Status" active={tableSortColumn === 'status'} dir={tableSortDir} onClick={() => toggleTableSort('status')} />
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
                        <span className="text-sm font-medium"><Sensitive>{c.name}</Sensitive></span>
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

      {/* ── Lead View Dialog ── */}
      <LeadViewDialog
        lead={viewLead}
        open={!!viewLead}
        onClose={() => setViewLead(null)}
        onEdit={() => { const l = viewLead; setViewLead(null); if (l) openEditLead(l) }}
        onDelete={() => { if (viewLead) { deleteLead(viewLead.id); setViewLead(null) } }}
        onConvert={() => { if (viewLead) { convertLead(viewLead); setViewLead(null) } }}
        onMoveStage={status => { if (viewLead) { updateLeadStatus(viewLead.id, status); setViewLead(null) } }}
        stages={stages}
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
        saving={saving}
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

            {lf.source === 'Indicação' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Indicado por</Label>
                  <Input value={lf.referred_by} onChange={e => setLf(f => ({ ...f, referred_by: e.target.value }))} placeholder="Nome de quem indicou" className="h-10" />
                </div>
                <div className="space-y-2">
                  <Label>% de repasse acordado</Label>
                  <div className="relative">
                    <Input value={lf.referral_fee_pct} onChange={e => setLf(f => ({ ...f, referral_fee_pct: e.target.value }))} placeholder="Ex: 10" className="h-10 pr-8" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Data do primeiro contato</Label>
              <Input type="date" value={lf.first_contact_at} onChange={e => setLf(f => ({ ...f, first_contact_at: e.target.value }))} className="h-10" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Etapa</Label>
                <Select value={lf.status} onValueChange={v => setLf(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{stages.find(s => s.value === lf.status)?.label ?? lf.status}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {stages.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <ResponsibleSelect value={lf.responsible_ids} onChange={ids => setLf(f => ({ ...f, responsible_ids: ids }))} />
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
            <Button size="lg" onClick={saveLead} disabled={!lf.name || saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
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
