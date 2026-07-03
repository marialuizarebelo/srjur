import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Plus, Search, Scale, LayoutGrid, List, Pencil, Trash2,
  FileText, ChevronDown, ChevronUp, ExternalLink, Send,
  Clock, User, Calendar, Copy, ClipboardList, CircleDollarSign,
  Mail, Phone, IdCard, FolderOpen,
} from 'lucide-react'
import { fmtDate, fmtBRL } from '@/lib/format'
import { exportExcel, exportPDF, fmtDateBR } from '@/lib/exportData'
import { ExportMenu } from '@/components/ExportMenu'
import { ClientCombobox } from '@/components/ClientCombobox'
import { ResponsibleSelect, ResponsibleAvatars, useProfilesMap } from '@/components/ResponsibleSelect'
import { searchDjen, stripHtml } from '@/lib/djen'
import { DriveFolderPicker } from '@/components/DriveFolderPicker'
import { DriveFileList } from '@/components/DriveFileList'
import { toast } from 'sonner'
import { KanbanDndContext, DroppableColumn, DraggableCard } from '@/components/DndKanban'
import { usePinnedView } from '@/hooks/usePinnedView'
import { PinViewButton } from '@/components/PinViewButton'

// ── Types ──
interface Process {
  id: string
  client_id: string | null
  number: string | null
  title: string
  type: string
  area: string | null
  status: string
  phase: string
  responsible: string | null
  responsible_ids: string[] | null
  court: string | null
  electronic_system: string | null
  notes: string | null
  portal_visible: boolean
  created_at: string
  updated_at: string
  access_key: string | null
  cause_value: number | null
  court_url: string | null
  drive_url: string | null
  drive_folder_id: string | null
  tags: string | null
  opposing_party: string | null
  opposing_cpf: string | null
  opposing_parties: { name: string; cpf: string; role: string }[] | null
  client_role: string | null
  filing_date: string | null
  citation_date: string | null
  instance: string | null
  confidential: boolean
  closed_date: string | null
}

interface ProcessUpdate {
  id: string
  process_id: string
  text: string
  author: string | null
  portal_visible: boolean
  created_at: string
}

interface ClientOption {
  id: string; name: string; drive_folder_id: string | null
  cpf_cnpj: string | null; email: string | null; phone: string | null
}

interface ProcessTask {
  id: string; title: string; status: string; priority: string; due_date: string | null
}

// ── Constants ──
const PHASES = [
  { value: 'inicial', label: 'Inicial', color: '#8B5CF6' },
  { value: 'citacao', label: 'Citação', color: '#3B82F6' },
  { value: 'instrucao', label: 'Instrução', color: '#F59E0B' },
  { value: 'audiencia', label: 'Audiência', color: '#EC4899' },
  { value: 'recurso', label: 'Recurso', color: '#F97316' },
  { value: 'execucao', label: 'Execução', color: '#14B8A6' },
  { value: 'encerrado', label: 'Encerrado', color: '#6B7280' },
]

const EXTRAJUDICIAL_PHASES = [
  { value: 'notificacao', label: 'Notificação enviada', color: '#8B5CF6' },
  { value: 'aguardando_resposta', label: 'Aguardando resposta', color: '#3B82F6' },
  { value: 'negociacao', label: 'Negociação', color: '#F59E0B' },
  { value: 'acordo', label: 'Acordo fechado', color: '#14B8A6' },
  { value: 'sem_acordo', label: 'Sem acordo / vai a juízo', color: '#F97316' },
  { value: 'encerrado', label: 'Encerrado', color: '#6B7280' },
]

const phasesForType = (type: string) => type === 'extrajudicial' ? EXTRAJUDICIAL_PHASES : PHASES

// coluna única com todas as fases (judiciais + extrajudiciais), sem duplicar "encerrado"
const ALL_PHASES = [...PHASES, ...EXTRAJUDICIAL_PHASES.filter(ep => !PHASES.some(p => p.value === ep.value))]

const AREAS = [
  'Cível', 'Trabalhista', 'Família', 'Sucessões', 'Empresarial',
  'Consumidor', 'Penal', 'Criminal', 'Tributário', 'Imobiliário',
  'Previdenciário', 'Administrativo', 'Outro',
]

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  em_andamento: { label: 'Em Andamento', color: '#3B82F6' },
  concluido: { label: 'Concluído', color: '#10B981' },
  arquivado: { label: 'Arquivado', color: '#6B7280' },
  suspenso: { label: 'Suspenso', color: '#F59E0B' },
}

const ELECTRONIC_SYSTEMS = [
  { value: '', label: 'Nenhum' },
  { value: 'eProc Estadual', label: 'eProc Estadual' },
  { value: 'eProc Federal', label: 'eProc Federal' },
  { value: 'PJe', label: 'PJe' },
  { value: 'ESAJ', label: 'ESAJ' },
  { value: 'Projudi', label: 'Projudi' },
  { value: 'Outro', label: 'Outro' },
]

// ── Campo com botão de copiar (usado no drawer de detalhe do processo) ──
export function FieldWithCopy({ label, value, onCopy, className = '' }: { label: string; value: string; onCopy: () => void; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <p className="font-medium truncate">{value}</p>
        <button onClick={onCopy} className="p-1 hover:bg-muted rounded shrink-0" title={`Copiar ${label}`}>
          <Copy className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}

function formatLabel(value: string): string {
  if (STATUS_MAP[value]) return STATUS_MAP[value].label
  const phase = ALL_PHASES.find(p => p.value === value)
  if (phase) return phase.label
  return value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// ── Main ──
export default function Processos() {
  const profilesMap = useProfilesMap()
  const [processes, setProcesses] = useState<Process[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const pinnedView = usePinnedView('processos_view', 'kanban')
  useEffect(() => { if (pinnedView.loaded && pinnedView.isPinned) setViewMode(pinnedView.pinnedValue as any) }, [pinnedView.loaded])
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const togglePhaseCollapsed = (value: string) => {
    setCollapsedPhases(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }
  const [statusFilter, setStatusFilter] = useState<'todos' | 'em_andamento' | 'concluido' | 'arquivado' | 'suspenso'>('em_andamento')
  const [responsibleFilter, setResponsibleFilter] = useState('todos')
  const [clientFilter, setClientFilter] = useState('todos')

  // Process form
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Process | null>(null)
  const [pf, setPf] = useState({
    title: '', number: '', client_id: '', type: 'consultivo',
    area: '', status: 'em_andamento', phase: 'inicial', responsible_ids: [] as string[],
    court: '', electronic_system: '', notes: '', portal_visible: true,
    access_key: '', cause_value: '', court_url: '', drive_url: '', drive_folder_id: '', tags: '',
    client_role: 'autor',
    opposing_parties: [{ name: '', cpf: '', role: 'reu' }] as { name: string; cpf: string; role: string }[], filing_date: '', citation_date: '',
    instance: '1º Grau', confidential: false, closed_date: '',
  })

  // Detail view (andamentos)
  const [detailProcess, setDetailProcess] = useState<Process | null>(null)
  const [updates, setUpdates] = useState<ProcessUpdate[]>([])
  const [newUpdate, setNewUpdate] = useState('')
  const [newUpdatePortal, setNewUpdatePortal] = useState(false)
  const [loadingUpdates, setLoadingUpdates] = useState(false)
  const [processTasks, setProcessTasks] = useState<ProcessTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [detailTab, setDetailTab] = useState<'dados' | 'tarefas' | 'andamentos'>('dados')

  const resetPf = () => {
    setPf({ title: '', number: '', client_id: '', type: 'consultivo',
      area: '', status: 'em_andamento', phase: 'inicial', responsible_ids: [],
      court: '', electronic_system: '', notes: '', portal_visible: true,
      access_key: '', cause_value: '', court_url: '', drive_url: '', drive_folder_id: '', tags: '',
      client_role: 'autor',
      opposing_parties: [{ name: '', cpf: '', role: 'reu' }], filing_date: '', citation_date: '',
      instance: '1º Grau', confidential: false, closed_date: '' })
    setEditing(null)
  }

  const loadData = async () => {
    setLoading(true)
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('processes').select('*').order('updated_at', { ascending: false }),
      supabase.from('clients').select('id, name, drive_folder_id, cpf_cnpj, email, phone').order('name'),
    ])
    setProcesses((p as Process[]) ?? [])
    setClients((c as ClientOption[]) ?? [])
    setLoading(false)
  }

  const loadUpdates = async (processId: string) => {
    setLoadingUpdates(true)
    const { data } = await supabase
      .from('process_updates')
      .select('*')
      .eq('process_id', processId)
      .order('created_at', { ascending: false })
    setUpdates((data as ProcessUpdate[]) ?? [])
    setLoadingUpdates(false)
  }

  const loadProcessTasks = async (processId: string) => {
    setLoadingTasks(true)
    const { data } = await supabase
      .from('tasks')
      .select('id, title, status, priority, due_date')
      .eq('process_id', processId)
      .order('due_date', { ascending: true })
    setProcessTasks((data as ProcessTask[]) ?? [])
    setLoadingTasks(false)
  }

  function copyToClipboard(value: string, label: string) {
    navigator.clipboard.writeText(value)
    toast.success(`${label} copiado!`)
  }

  useEffect(() => { loadData() }, [])

  // Abre o formulário de novo processo quando vem de um atalho "+ Novo" (ex: Dashboard)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('new') === '1') {
      resetPf()
      setDialogOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // ── Filtered ──
  const filtered = useMemo(() => {
    return processes
      .filter(p => statusFilter === 'todos' || p.status === statusFilter)
      .filter(p => responsibleFilter === 'todos' || (p.responsible_ids ?? []).includes(responsibleFilter))
      .filter(p => clientFilter === 'todos' || p.client_id === clientFilter)
      .filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.number?.toLowerCase().includes(search.toLowerCase()))
  }, [processes, statusFilter, responsibleFilter, clientFilter, search])

  const byPhase = useMemo(() => {
    const map = new Map<string, Process[]>()
    ALL_PHASES.forEach(ph => map.set(ph.value, []))
    filtered.forEach(p => {
      const arr = map.get(p.phase) ?? []
      arr.push(p)
      map.set(p.phase, arr)
    })
    return map
  }, [filtered])

  // ── Stats ──
  const totalAtivos = processes.filter(p => p.status === 'em_andamento').length
  const totalConsultivos = processes.filter(p => p.type === 'consultivo' && p.status === 'em_andamento').length
  const totalContenciosos = processes.filter(p => p.type === 'contencioso' && p.status === 'em_andamento').length

  const getClientName = (id: string | null) => clients.find(c => c.id === id)?.name ?? ''

  // ── CRUD ──
  const openEdit = (p: Process) => {
    setPf({
      title: p.title, number: p.number ?? '', client_id: p.client_id ?? '',
      type: p.type, area: p.area ?? '', status: p.status, phase: p.phase,
      responsible_ids: p.responsible_ids ?? [], court: p.court ?? '',
      electronic_system: p.electronic_system ?? '', notes: p.notes ?? '',
      portal_visible: p.portal_visible,
      access_key: p.access_key ?? '', cause_value: p.cause_value ? String(p.cause_value) : '',
      court_url: p.court_url ?? '', drive_url: p.drive_url ?? '', drive_folder_id: p.drive_folder_id ?? '', tags: p.tags ?? '',
      client_role: p.client_role ?? 'autor',
      opposing_parties: (p.opposing_parties && p.opposing_parties.length > 0)
        ? p.opposing_parties
        : (p.opposing_party || p.opposing_cpf)
          ? [{ name: p.opposing_party ?? '', cpf: p.opposing_cpf ?? '', role: 'reu' }]
          : [{ name: '', cpf: '', role: 'reu' }],
      filing_date: p.filing_date ?? '', citation_date: p.citation_date ?? '',
      instance: p.instance ?? '1º Grau', confidential: p.confidential ?? false,
      closed_date: p.closed_date ?? '',
    })
    setEditing(p)
    setDialogOpen(true)
  }

  const openDetail = (p: Process) => {
    setDetailProcess(p)
    setDetailTab('dados')
    loadUpdates(p.id)
    loadProcessTasks(p.id)
  }

  const saveProcess = async () => {
    if (!pf.title.trim()) { toast.error('Preencha o título do processo'); return }
    const payload = {
      title: pf.title, number: pf.number || null, client_id: pf.client_id || null,
      client_role: pf.client_role || null,
      type: pf.type, area: pf.area || null, status: pf.status, phase: pf.phase,
      responsible_ids: pf.responsible_ids,
      responsible: pf.responsible_ids.length > 1
        ? pf.responsible_ids.map(id => profilesMap[id]?.display_name).filter(Boolean).join(' e ')
        : (profilesMap[pf.responsible_ids[0]]?.display_name ?? null),
      court: pf.court || null,
      electronic_system: pf.electronic_system || null, notes: pf.notes || null,
      portal_visible: pf.portal_visible, updated_at: new Date().toISOString(),
      access_key: pf.access_key || null,
      cause_value: pf.cause_value ? parseFloat(pf.cause_value.replace(',', '.')) : null,
      court_url: pf.court_url || null, drive_url: pf.drive_url || null, drive_folder_id: pf.drive_folder_id || null,
      tags: pf.tags || null,
      opposing_parties: pf.opposing_parties.filter(op => op.name.trim() || op.cpf.trim()),
      opposing_party: pf.opposing_parties[0]?.name || null, opposing_cpf: pf.opposing_parties[0]?.cpf || null,
      filing_date: pf.filing_date || null, citation_date: pf.citation_date || null,
      instance: pf.instance || null, confidential: pf.confidential,
      closed_date: pf.closed_date || null,
    }
    let processId = editing?.id
    try {
      if (editing) {
        const { error } = await supabase.from('processes').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { data: created, error } = await supabase.from('processes').insert(payload).select().single()
        if (error) throw error
        processId = created?.id
      }
      toast.success(editing ? 'Processo atualizado!' : 'Processo criado!')
      setDialogOpen(false)
      resetPf()
      loadData()

      if (processId && pf.number) {
        syncProcessIntimacoes(processId, pf.number)
      }
    } catch (err: any) {
      toast.error('Erro ao salvar processo: ' + (err?.message ?? String(err)))
    }
  }

  // Busca no DJEN (nacional) por movimentações desse número de processo e
  // salva as que ainda não existem no inbox de Sistemas Eletrônicos
  const syncProcessIntimacoes = async (processId: string, numero: string) => {
    const clean = numero.replace(/\D/g, '')
    if (!clean) return
    try {
      const items = await searchDjen({ numeroProcesso: clean, itensPorPagina: 100 })
      if (items.length === 0) {
        toast('Nenhuma movimentação encontrada ainda no DJEN para este número.', { duration: 5000 })
        return
      }
      let novas = 0
      for (const item of items) {
        const { data: exists } = await supabase.from('intimacoes').select('id').eq('djen_id', item.id).maybeSingle()
        if (exists) {
          await supabase.from('intimacoes').update({ process_id: processId, status: 'vinculado' }).eq('id', exists.id)
          continue
        }
        const adv = item.destinatarioadvogados?.[0]
        await supabase.from('intimacoes').insert({
          djen_id: item.id,
          numero_processo: item.numero_processo,
          numero_processo_mascara: item.numeroprocessocommascara,
          tribunal: item.siglaTribunal,
          orgao: item.nomeOrgao,
          tipo_comunicacao: item.tipoComunicacao,
          texto: stripHtml(item.texto),
          data_disponibilizacao: item.data_disponibilizacao,
          link: item.link,
          advogado_nome: adv?.advogado.nome ?? null,
          advogado_oab: adv?.advogado.numero_oab ?? null,
          advogado_uf: adv?.advogado.uf_oab ?? null,
          process_id: processId,
          status: 'vinculado',
          lida: false,
        })
        novas++
      }
      if (novas > 0) toast.success(`${novas} movimentação(ões) encontrada(s) no DJEN para este processo!`)
      else toast(`${items.length} movimentação(ões) já estavam sincronizadas.`, { duration: 4000 })
    } catch (err: any) {
      // Não interrompe o cadastro do processo (que já foi salvo), mas avisa
      // que a busca automática no DJEN falhou, pra não parecer que sumiu no vazio.
      toast.error('Processo salvo, mas a busca automática no DJEN falhou: ' + (err?.message ?? String(err)), { duration: 6000 })
    }
  }

  const deleteProcess = async (id: string) => {
    if (!confirm('Excluir este processo e todos os andamentos?')) return
    await supabase.from('processes').delete().eq('id', id)
    loadData()
    if (detailProcess?.id === id) setDetailProcess(null)
  }

  const addUpdate = async () => {
    if (!newUpdate.trim() || !detailProcess) return
    const { error } = await supabase.from('process_updates').insert({
      process_id: detailProcess.id,
      text: newUpdate,
      portal_visible: newUpdatePortal,
    })
    if (!error) {
      setNewUpdate('')
      setNewUpdatePortal(false)
      loadUpdates(detailProcess.id)
      await supabase.from('processes').update({ updated_at: new Date().toISOString() }).eq('id', detailProcess.id)
    }
  }

  const deleteUpdate = async (id: string) => {
    if (!confirm('Excluir este andamento?')) return
    await supabase.from('process_updates').delete().eq('id', id)
    if (detailProcess) loadUpdates(detailProcess.id)
  }

  const updatePhase = async (processId: string, newPhase: string) => {
    await supabase.from('processes').update({ phase: newPhase, updated_at: new Date().toISOString() }).eq('id', processId)
    loadData()
  }

  return (
    <div className="space-y-6">
      {/* Detail drawer */}
      {detailProcess && (() => {
        const dClient = clients.find(c => c.id === detailProcess.client_id)
        return (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetailProcess(null)} />
          <div className="relative w-full max-w-xl bg-background shadow-xl flex flex-col">
            {/* Header */}
            <div className="sticky top-0 bg-background border-b p-5 z-10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-lg">{detailProcess.title}</h3>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="outline">{detailProcess.type.toUpperCase()}</Badge>
                    <Badge style={{ backgroundColor: STATUS_MAP[detailProcess.status]?.color, color: '#fff' }}>
                      {STATUS_MAP[detailProcess.status]?.label}
                    </Badge>
                    <Badge variant="outline">{phasesForType(detailProcess.type).find(p => p.value === detailProcess.phase)?.label ?? ALL_PHASES.find(p => p.value === detailProcess.phase)?.label}</Badge>
                    {detailProcess.confidential && (
                      <Badge variant="outline" className="border-amber-400 text-amber-600">🔒 Segredo de justiça</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(detailProcess)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailProcess(null)}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Compact info bar */}
              <div className="mt-3 p-3 rounded-lg bg-muted/40 text-xs space-y-1.5">
                {detailProcess.number && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Nº:</span>
                    <span className="font-mono">{detailProcess.number}</span>
                    <button onClick={() => copyToClipboard(detailProcess.number!, 'Número do processo')} className="p-0.5 hover:bg-background rounded">
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    </button>
                    {detailProcess.responsible_ids && detailProcess.responsible_ids.length > 0 && (
                      <span className="text-muted-foreground ml-2 flex items-center gap-1">
                        Resp.: <ResponsibleAvatars ids={detailProcess.responsible_ids} profilesMap={profilesMap} size="xs" />
                      </span>
                    )}
                  </div>
                )}
                {detailProcess.court && (
                  <div className="text-muted-foreground">Vara: <span className="text-foreground">{detailProcess.court}</span></div>
                )}
                {detailProcess.electronic_system && (
                  <div className="text-muted-foreground">Sistema: <span className="text-foreground">{detailProcess.electronic_system}</span></div>
                )}
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 mt-3 bg-muted/40 rounded-lg p-0.5 w-fit">
                {(['dados', 'tarefas', 'andamentos'] as const).map(t => (
                  <button key={t} onClick={() => setDetailTab(t)}
                    className={`px-3 h-8 rounded-md text-xs font-medium transition-all ${detailTab === t ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    {t === 'dados' ? 'Dados' : t === 'tarefas' ? `Tarefas (${processTasks.length})` : `Andamentos (${updates.length})`}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Dados tab ── */}
            {detailTab === 'dados' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {detailProcess.number && (
                    <FieldWithCopy label="Número" value={detailProcess.number} onCopy={() => copyToClipboard(detailProcess.number!, 'Número')} />
                  )}
                  {detailProcess.access_key && (
                    <FieldWithCopy label="Chave de acesso (eProc)" value={detailProcess.access_key} onCopy={() => copyToClipboard(detailProcess.access_key!, 'Chave de acesso')} />
                  )}
                  {dClient && (
                    <FieldWithCopy
                      label={`Cliente${detailProcess.client_role ? ` (${detailProcess.client_role === 'autor' ? 'Autor' : 'Réu'})` : ''}`}
                      value={dClient.name}
                      onCopy={() => copyToClipboard(dClient.name, 'Nome do cliente')}
                    />
                  )}
                  {dClient?.cpf_cnpj && (
                    <FieldWithCopy label="CPF/CNPJ" value={dClient.cpf_cnpj} onCopy={() => copyToClipboard(dClient.cpf_cnpj!, 'CPF/CNPJ')} />
                  )}
                  {dClient?.phone && (
                    <FieldWithCopy label="Telefone" value={dClient.phone} onCopy={() => copyToClipboard(dClient.phone!, 'Telefone')} />
                  )}
                  {dClient?.email && (
                    <FieldWithCopy label="E-mail" value={dClient.email} onCopy={() => copyToClipboard(dClient.email!, 'E-mail')} />
                  )}
                  {detailProcess.responsible_ids && detailProcess.responsible_ids.length > 0 && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">Responsável</p>
                      <div className="mt-1"><ResponsibleAvatars ids={detailProcess.responsible_ids} profilesMap={profilesMap} /></div>
                    </div>
                  )}
                  {detailProcess.court && (
                    <div className="col-span-2"><p className="text-[11px] text-muted-foreground">Vara</p><p className="font-medium">{detailProcess.court}</p></div>
                  )}
                  {((detailProcess.opposing_parties && detailProcess.opposing_parties.length > 0) || detailProcess.opposing_party) && (
                    <div className="col-span-2">
                      <p className="text-[11px] text-muted-foreground">Outras partes do processo</p>
                      <div className="space-y-1 mt-1">
                        {(detailProcess.opposing_parties && detailProcess.opposing_parties.length > 0
                          ? detailProcess.opposing_parties
                          : [{ name: detailProcess.opposing_party ?? '', cpf: detailProcess.opposing_cpf ?? '', role: 'reu' }]
                        ).map((op, i) => (
                          <p key={i} className="font-medium">
                            {op.name}{op.cpf ? ` — ${op.cpf}` : ''}{op.role ? ` (${op.role === 'autor' ? 'Autor' : 'Réu'})` : ''}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  {detailProcess.filing_date && (
                    <div><p className="text-[11px] text-muted-foreground">Data de distribuição</p><p className="font-medium">{fmtDate(detailProcess.filing_date)}</p></div>
                  )}
                  {detailProcess.citation_date && (
                    <div><p className="text-[11px] text-muted-foreground">Data de citação</p><p className="font-medium">{fmtDate(detailProcess.citation_date)}</p></div>
                  )}
                  {detailProcess.instance && (
                    <div><p className="text-[11px] text-muted-foreground">Instância</p><p className="font-medium">{detailProcess.instance}</p></div>
                  )}
                  {detailProcess.closed_date && (
                    <div><p className="text-[11px] text-muted-foreground">Encerramento / trânsito em julgado</p><p className="font-medium">{fmtDate(detailProcess.closed_date)}</p></div>
                  )}
                  {detailProcess.electronic_system && (
                    <div><p className="text-[11px] text-muted-foreground">Sistema eletrônico</p><p className="font-medium">{detailProcess.electronic_system}</p></div>
                  )}
                  {detailProcess.area && (
                    <div><p className="text-[11px] text-muted-foreground">Área</p><p className="font-medium">{detailProcess.area}</p></div>
                  )}
                  {detailProcess.cause_value != null && (
                    <div><p className="text-[11px] text-muted-foreground">Valor da causa</p><p className="font-medium">{fmtBRL(detailProcess.cause_value)}</p></div>
                  )}
                  {detailProcess.tags && (
                    <div className="col-span-2"><p className="text-[11px] text-muted-foreground">Tags</p><p className="font-medium">{detailProcess.tags}</p></div>
                  )}
                  <div><p className="text-[11px] text-muted-foreground">Cadastrado em</p><p className="font-medium">{fmtDateBR(detailProcess.created_at)}</p></div>
                  <div><p className="text-[11px] text-muted-foreground">Atualizado em</p><p className="font-medium">{fmtDateBR(detailProcess.updated_at)}</p></div>
                </div>

                {detailProcess.notes && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">Observações</p>
                    <p className="text-sm whitespace-pre-wrap">{detailProcess.notes}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {detailProcess.court_url && (
                    <Button variant="outline" size="sm" render={<a href={detailProcess.court_url} target="_blank" rel="noreferrer" />}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Abrir no {detailProcess.electronic_system || 'tribunal'}
                    </Button>
                  )}
                  {detailProcess.drive_url && (
                    <Button variant="outline" size="sm" render={<a href={detailProcess.drive_url} target="_blank" rel="noreferrer" />}>
                      <FolderOpen className="h-3.5 w-3.5 mr-1.5" />Pasta
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setDetailTab('andamentos')}>
                    <ClipboardList className="h-3.5 w-3.5 mr-1.5" />Adicionar Andamento
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDetailTab('tarefas')}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />Nova Tarefa
                  </Button>
                  <Button size="sm" onClick={() => openEdit(detailProcess)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />Editar
                  </Button>
                </div>
              </div>
            )}

            {/* ── Tarefas tab ── */}
            {detailTab === 'tarefas' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-2">
                {loadingTasks ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
                ) : processTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa vinculada a este processo</p>
                ) : (
                  processTasks.map(t => (
                    <div key={t.id} className="p-3 rounded-lg border flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${t.status === 'concluida' ? 'line-through opacity-60' : ''}`}>{t.title}</p>
                        {t.due_date && <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(t.due_date)}</p>}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{t.status === 'concluida' ? 'Concluída' : t.status === 'pendente' ? 'Pendente' : t.status}</Badge>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Andamentos tab ── */}
            {detailTab === 'andamentos' && (
              <>
                <div className="p-4 border-b">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Novo andamento..."
                      value={newUpdate}
                      onChange={e => setNewUpdate(e.target.value)}
                      rows={2}
                      className="flex-1 resize-none"
                    />
                    <div className="flex flex-col gap-1">
                      <Button size="sm" onClick={addUpdate} disabled={!newUpdate.trim()} className="h-8">
                        <Send className="h-3 w-3 mr-1" />Adicionar
                      </Button>
                      <div className="flex items-center gap-1">
                        <Switch checked={newUpdatePortal} onCheckedChange={setNewUpdatePortal} />
                        <span className="text-[10px] text-muted-foreground">Portal</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingUpdates ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
                  ) : updates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Nenhum andamento registrado</p>
                  ) : (
                    updates.map(u => (
                      <div key={u.id} className="p-3 rounded-lg border">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm whitespace-pre-wrap flex-1">{u.text}</p>
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive" onClick={() => deleteUpdate(u.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3 inline mr-0.5" />
                            {new Date(u.created_at).toLocaleString('pt-BR')}
                          </span>
                          {u.author && <span className="text-[10px] text-muted-foreground">{u.author}</span>}
                          {u.portal_visible && (
                            <Badge variant="outline" className="text-[9px] text-green-600 border-green-300">Portal</Badge>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        )
      })()}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Processos</h1>
          <p className="text-sm text-muted-foreground">
            {totalAtivos} ativos · {totalConsultivos} consultivos · {totalContenciosos} contenciosos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            onExcelExport={() => {
              const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]))
              const rows = processes.map(p => ({
                'Número': p.number ?? '',
                'Título': p.title,
                'Tipo': p.type,
                'Área': p.area ?? '',
                'Fase': p.phase,
                'Status': p.status,
                'Cliente': p.client_id ? (clientMap[p.client_id] ?? '') : '',
                'Responsável': p.responsible ?? '',
                'Tribunal/Vara': p.court ?? '',
                'Sistema Eletrônico': p.electronic_system ?? '',
                'Portal Visível': p.portal_visible ? 'Sim' : 'Não',
                'Observações': p.notes ?? '',
                'Cadastrado em': fmtDateBR(p.created_at),
                'Atualizado em': fmtDateBR(p.updated_at),
              }))
              exportExcel(rows, `processos_${new Date().toISOString().slice(0,10)}`)
            }}
            onPdfExport={() => {
              const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]))
              exportPDF(
                'Processos',
                `${processes.length} processo${processes.length !== 1 ? 's' : ''}`,
                [
                  { header: 'Número', key: 'Número', width: 38 },
                  { header: 'Título', key: 'Título', width: 55 },
                  { header: 'Tipo', key: 'Tipo', width: 20 },
                  { header: 'Fase', key: 'Fase', width: 20 },
                  { header: 'Status', key: 'Status', width: 20 },
                  { header: 'Cliente', key: 'Cliente', width: 35 },
                  { header: 'Responsável', key: 'Responsável', width: 25 },
                ],
                processes.map(p => ({
                  'Número': p.number ?? '—',
                  'Título': p.title,
                  'Tipo': p.type,
                  'Fase': p.phase,
                  'Status': p.status,
                  'Cliente': p.client_id ? (clientMap[p.client_id] ?? '—') : '—',
                  'Responsável': p.responsible ?? '—',
                })),
                `processos_${new Date().toISOString().slice(0,10)}`
              )
            }}
          />
          <Button size="sm" onClick={() => { resetPf(); setDialogOpen(true) }}>
            <Plus className="h-3 w-3 mr-1" />Novo Processo
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {(['em_andamento', 'concluido', 'arquivado', 'suspenso', 'todos'] as const).map(s => (
            <Button key={s} variant={statusFilter === s ? 'default' : 'ghost'} size="sm" className="h-8"
              onClick={() => setStatusFilter(s)}>
              {s === 'todos' ? 'Todos' : formatLabel(s)}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por título ou número..." value={search}
              onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue>{responsibleFilter === 'todos' ? 'Responsável' : (profilesMap[responsibleFilter]?.display_name ?? 'Responsável')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {Object.values(profilesMap).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue>{clientFilter === 'todos' ? 'Cliente' : (clients.find(c => c.id === clientFilter)?.name ?? 'Cliente')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
            <Button variant={viewMode === 'kanban' ? 'default' : 'ghost'} size="icon" className="h-8 w-8"
              onClick={() => setViewMode('kanban')}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="icon" className="h-8 w-8"
              onClick={() => setViewMode('list')}>
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
          <PinViewButton isPinned={pinnedView.isPinned} currentValue={viewMode} onPin={v => pinnedView.pin(v as any)} onUnpin={pinnedView.unpin} />
        </div>
      </div>

      {/* Kanban */}
      {viewMode === 'kanban' && (
        <KanbanDndContext onDropOnColumn={(processId, phaseValue) => {
          const proc = processes.find(p => p.id === processId)
          if (proc && proc.phase !== phaseValue) updatePhase(processId, phaseValue)
        }}>
          <div className="flex flex-col md:flex-row gap-4 md:overflow-x-auto scrollbar-thin pb-4">
            {ALL_PHASES.filter(ph => ph.value !== 'encerrado' || statusFilter === 'todos').map(phase => {
              const phaseProcesses = byPhase.get(phase.value) ?? []
              const collapsed = collapsedPhases.has(phase.value)
              return (
                <div key={phase.value} className="w-full md:min-w-[220px] md:w-[220px] shrink-0">
                  <button className="flex items-center gap-2 mb-1 w-full md:cursor-default" onClick={() => togglePhaseCollapsed(phase.value)}>
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: phase.color }} />
                    <span className="text-sm font-semibold">{phase.label}</span>
                    <Badge variant="secondary" className="text-[10px] ml-auto">{phaseProcesses.length}</Badge>
                    {collapsed ? <ChevronDown className="h-4 w-4 md:hidden" /> : <ChevronUp className="h-4 w-4 md:hidden" />}
                  </button>
                  <div className="mb-3" />
                  {!collapsed && (
                  <DroppableColumn id={phase.value} className="space-y-2 min-h-[60px] p-1 -m-1">
                    {phaseProcesses.map(proc => (
                      <DraggableCard key={proc.id} id={proc.id}>
                        <div className="p-3 rounded-lg border bg-background hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => openDetail(proc)}>
                          <p className="text-sm font-medium truncate">{proc.title}</p>
                          {proc.number && <p className="text-xs text-muted-foreground font-mono mt-0.5">{proc.number}</p>}
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-muted-foreground truncate">
                              {getClientName(proc.client_id)}
                            </span>
                            <ResponsibleAvatars ids={proc.responsible_ids} profilesMap={profilesMap} size="xs" />
                          </div>
                          {proc.area && <Badge variant="outline" className="text-[10px] mt-1.5">{proc.area}</Badge>}
                        </div>
                      </DraggableCard>
                    ))}
                    {phaseProcesses.length === 0 && (
                      <div className="p-4 rounded-lg border border-dashed text-center">
                        <p className="text-xs text-muted-foreground">Nenhum processo</p>
                      </div>
                    )}
                  </DroppableColumn>
                  )}
                </div>
              )
            })}
          </div>
        </KanbanDndContext>
      )}

      {/* List */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Scale className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nenhum processo encontrado</p>
            </div>
          ) : (
            filtered.map(proc => (
              <div key={proc.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 sm:p-4 rounded-lg border hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => openDetail(proc)}>
                <div className="flex items-start gap-2 sm:contents">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0 mt-1.5 sm:mt-0" style={{ backgroundColor: ALL_PHASES.find(p => p.value === proc.phase)?.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{proc.title}</p>
                      {proc.number && <span className="text-xs text-muted-foreground font-mono shrink-0">{proc.number}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">{getClientName(proc.client_id)}</span>
                      {proc.area && <span className="text-xs text-muted-foreground">· {proc.area}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap pl-[18px] sm:pl-0">
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {ALL_PHASES.find(p => p.value === proc.phase)?.label}
                  </Badge>
                  <Badge style={{ backgroundColor: STATUS_MAP[proc.status]?.color + '20', color: STATUS_MAP[proc.status]?.color }}
                    className="text-[10px] shrink-0">
                    {STATUS_MAP[proc.status]?.label}
                  </Badge>
                  <ResponsibleAvatars ids={proc.responsible_ids} profilesMap={profilesMap} size="xs" />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto sm:ml-0" onClick={e => { e.stopPropagation(); openEdit(proc) }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Process Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) resetPf() }}>
        <DialogContent className="max-w-[800px] w-[96vw] max-h-[92vh] overflow-y-auto p-8">
          <DialogHeader>
            <DialogTitle className="text-lg">{editing ? 'Editar' : 'Novo'} Processo</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <ClientCombobox clients={clients} value={pf.client_id} onChange={id => setPf(f => ({ ...f, client_id: id }))} />
              </div>
              <div className="space-y-2">
                <Label>Papel do cliente</Label>
                <Select value={pf.client_role} onValueChange={v => setPf(f => ({ ...f, client_role: v }))}>
                  <SelectTrigger className="h-10 w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="autor">Autor</SelectItem>
                    <SelectItem value="reu">Réu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Número do processo</Label>
              <Input value={pf.number} onChange={e => setPf(f => ({ ...f, number: e.target.value }))} placeholder="0000000-00.0000.0.00.0000" className="h-10" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={pf.type} onValueChange={v => setPf(f => ({ ...f, type: v, phase: phasesForType(v)[0].value }))}>
                  <SelectTrigger className="h-10"><SelectValue>{formatLabel(pf.type)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultivo">Consultivo</SelectItem>
                    <SelectItem value="contencioso">Contencioso</SelectItem>
                    <SelectItem value="extrajudicial">Extrajudicial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Chave de acesso (eProc)</Label>
                <Input value={pf.access_key} onChange={e => setPf(f => ({ ...f, access_key: e.target.value }))} placeholder="Opcional" className="h-10" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={pf.title} onChange={e => setPf(f => ({ ...f, title: e.target.value }))} className="h-10" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Área do Direito</Label>
                <Select value={pf.area} onValueChange={v => setPf(f => ({ ...f, area: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    {AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fase processual</Label>
                <Select value={pf.phase} onValueChange={v => setPf(f => ({ ...f, phase: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{formatLabel(pf.phase)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {phasesForType(pf.type).map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Responsável</Label>
              <ResponsibleSelect value={pf.responsible_ids} onChange={ids => setPf(f => ({ ...f, responsible_ids: ids }))} />
            </div>

            <div className="space-y-2">
              <Label>Vara</Label>
              <Input value={pf.court} onChange={e => setPf(f => ({ ...f, court: e.target.value }))} placeholder="Ex: 8ª Vara de Família do Foro Central de Porto Alegre" className="h-10" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor da causa (R$)</Label>
                <Input value={pf.cause_value} onChange={e => setPf(f => ({ ...f, cause_value: e.target.value }))} placeholder="0,00" className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Sistema eletrônico</Label>
                <Select value={pf.electronic_system} onValueChange={v => setPf(f => ({ ...f, electronic_system: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    <SelectItem value="eProc Estadual">eProc Estadual</SelectItem>
                    <SelectItem value="eProc Federal">eProc Federal</SelectItem>
                    <SelectItem value="PJe">PJe</SelectItem>
                    <SelectItem value="ESAJ">ESAJ</SelectItem>
                    <SelectItem value="Projudi">Projudi</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Outras partes do processo</Label>
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => setPf(f => ({ ...f, opposing_parties: [...f.opposing_parties, { name: '', cpf: '', role: 'reu' }] }))}
                  className="h-7 px-2 text-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar parte
                </Button>
              </div>
              {pf.opposing_parties.map((op, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_110px_auto] gap-2">
                  <Input
                    value={op.name}
                    onChange={e => setPf(f => ({ ...f, opposing_parties: f.opposing_parties.map((o, idx) => idx === i ? { ...o, name: e.target.value } : o) }))}
                    placeholder="Nome da parte" className="h-10"
                  />
                  <Input
                    value={op.cpf}
                    onChange={e => setPf(f => ({ ...f, opposing_parties: f.opposing_parties.map((o, idx) => idx === i ? { ...o, cpf: e.target.value } : o) }))}
                    placeholder="CPF/CNPJ" className="h-10"
                  />
                  <Select
                    value={op.role}
                    onValueChange={v => setPf(f => ({ ...f, opposing_parties: f.opposing_parties.map((o, idx) => idx === i ? { ...o, role: v } : o) }))}
                  >
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="autor">Autor</SelectItem>
                      <SelectItem value="reu">Réu</SelectItem>
                    </SelectContent>
                  </Select>
                  {pf.opposing_parties.length > 1 && (
                    <Button
                      type="button" variant="ghost" size="icon"
                      onClick={() => setPf(f => ({ ...f, opposing_parties: f.opposing_parties.filter((_, idx) => idx !== i) }))}
                      className="h-10 w-10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Data de distribuição</Label>
                <Input type="date" value={pf.filing_date} onChange={e => setPf(f => ({ ...f, filing_date: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Data de citação</Label>
                <Input type="date" value={pf.citation_date} onChange={e => setPf(f => ({ ...f, citation_date: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Instância</Label>
                <Select value={pf.instance} onValueChange={v => setPf(f => ({ ...f, instance: v }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1º Grau">1º Grau</SelectItem>
                    <SelectItem value="2º Grau">2º Grau</SelectItem>
                    <SelectItem value="Superior (STJ/STF/TST)">Superior (STJ/STF/TST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {pf.status === 'concluido' && (
              <div className="space-y-2">
                <Label>Data de encerramento / trânsito em julgado</Label>
                <Input type="date" value={pf.closed_date} onChange={e => setPf(f => ({ ...f, closed_date: e.target.value }))} className="h-10" />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={pf.confidential} onCheckedChange={v => setPf(f => ({ ...f, confidential: v }))} />
              <Label>Segredo de justiça</Label>
            </div>

            <div className="space-y-2">
              <Label>Link do tribunal</Label>
              <Input value={pf.court_url} onChange={e => setPf(f => ({ ...f, court_url: e.target.value }))} placeholder="https://..." className="h-10" />
            </div>

            <div className="space-y-2">
              <Label>Pasta no Google Drive</Label>
              {(() => {
                const linkedClient = clients.find(c => c.id === pf.client_id)
                return (
                  <>
                    {pf.client_id && !linkedClient?.drive_folder_id && (
                      <p className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-2.5 py-1.5">
                        O cliente vinculado ainda não tem pasta no Drive — vincule a pasta dele primeiro (na tela de Clientes) pra que a pasta do processo nasça dentro dela automaticamente.
                      </p>
                    )}
                    <DriveFolderPicker
                      value={{ folder_id: pf.drive_folder_id, drive_url: pf.drive_url }}
                      onChange={f => setPf(prev => ({ ...prev, drive_folder_id: f.folder_id, drive_url: f.drive_url }))}
                      folderNameSuggestion={pf.title || pf.number}
                      parentFolderId={linkedClient?.drive_folder_id ?? null}
                      autoNumberLabel={[pf.title?.toUpperCase(), pf.number].filter(Boolean).join(' - ')}
                    />
                  </>
                )
              })()}
              {pf.drive_folder_id && (
                <div className="rounded-xl border border-border/60 p-3 mt-2">
                  <DriveFileList folderId={pf.drive_folder_id} />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={pf.tags} onChange={e => setPf(f => ({ ...f, tags: e.target.value }))} placeholder="urgente, família" className="h-10" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={pf.status} onValueChange={v => setPf(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione">{formatLabel(pf.status)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_MAP).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={pf.notes} onChange={e => setPf(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t">
              <Switch checked={pf.portal_visible} onCheckedChange={v => setPf(f => ({ ...f, portal_visible: v }))} />
              <Label>Visível no portal do cliente</Label>
            </div>
          </div>
          <DialogFooter className="pt-4">
            {editing && (
              <Button variant="destructive" className="mr-auto"
                onClick={() => { deleteProcess(editing.id); setDialogOpen(false); resetPf() }}>
                Excluir
              </Button>
            )}
            <DialogClose render={<Button variant="outline" size="lg" />}>Cancelar</DialogClose>
            <Button size="lg" onClick={saveProcess} disabled={!pf.title}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
