import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Plus, Search, Bell, AlertTriangle, Clock, CheckCircle2,
  Circle, Calendar, Scale, LayoutGrid, List, Settings2, SlidersHorizontal,
  GripVertical, Pencil, Trash2, X,
} from 'lucide-react'
import { fmtDate, getDaysDiff } from '@/lib/format'
import { ResponsibleSelect, ResponsibleAvatars, useProfilesMap } from '@/components/ResponsibleSelect'

interface Deadline {
  id: string
  process_id: string | null
  title: string
  due_date: string
  status: string
  responsible: string | null
  responsible_ids: string[] | null
  notes: string | null
  source: string | null
  portal_visible: boolean
  stage_id: string | null
  created_at: string
}

interface DeadlineStage {
  id: string
  name: string
  color: string
  position: number
}

interface ProcessOption { id: string; title: string; number: string | null }

const SOURCES = ['Manual', 'Intimação', 'Despacho', 'Sentença', 'Acordo', 'Outro']

const CARD_FIELDS = [
  { key: 'processo', label: 'Processo vinculado' },
  { key: 'responsavel', label: 'Responsável' },
  { key: 'origem', label: 'Origem' },
  { key: 'data', label: 'Data limite' },
  { key: 'dias', label: 'Dias restantes' },
  { key: 'status', label: 'Status badge' },
  { key: 'notes', label: 'Observações' },
]

const DEFAULT_VISIBLE: Record<string, boolean> = {
  processo: true, responsavel: true, origem: false,
  data: true, dias: true, status: true, notes: false,
}

const STAGE_COLORS = [
  '#6B7280','#3B82F6','#10B981','#F59E0B','#EF4444',
  '#8B5CF6','#EC4899','#14B8A6','#F97316','#6366F1',
]

function getVisibleFields(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem('prazos_card_fields')
    return saved ? { ...DEFAULT_VISIBLE, ...JSON.parse(saved) } : DEFAULT_VISIBLE
  } catch { return DEFAULT_VISIBLE }
}

export default function Prazos() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [stages, setStages] = useState<DeadlineStage[]>([])
  const [processes, setProcesses] = useState<ProcessOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'pendente' | 'cumprido' | 'perdido' | 'todos'>('pendente')
  const [viewMode, setViewMode] = useState<'lista' | 'kanban'>('lista')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Deadline | null>(null)
  const [stagesOpen, setStagesOpen] = useState(false)
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [visibleFields, setVisibleFields] = useState(getVisibleFields)

  // Stage editor state
  const [stageEditing, setStageEditing] = useState<DeadlineStage | null>(null)
  const [stageName, setStageName] = useState('')
  const [stageColor, setStageColor] = useState(STAGE_COLORS[0])
  const [stageFormOpen, setStageFormOpen] = useState(false)

  const profilesMap = useProfilesMap()

  const [df, setDf] = useState({
    title: '', due_date: '', process_id: '', status: 'pendente',
    responsible_ids: [] as string[], notes: '', source: 'Manual', portal_visible: false, stage_id: '',
  })

  const resetDf = () => {
    setDf({ title: '', due_date: '', process_id: '', status: 'pendente',
      responsible_ids: [], notes: '', source: 'Manual', portal_visible: false, stage_id: '' })
    setEditing(null)
  }

  const loadData = async () => {
    setLoading(true)
    const [{ data: d }, { data: p }, { data: s }] = await Promise.all([
      supabase.from('deadlines').select('*').order('due_date', { ascending: true }),
      supabase.from('processes').select('id, title, number').eq('status', 'em_andamento').order('title'),
      supabase.from('deadline_stages').select('*').order('position'),
    ])
    setDeadlines((d as Deadline[]) ?? [])
    setProcesses((p as ProcessOption[]) ?? [])
    setStages((s as DeadlineStage[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const saveVisibleFields = (fields: Record<string, boolean>) => {
    setVisibleFields(fields)
    localStorage.setItem('prazos_card_fields', JSON.stringify(fields))
  }

  const filtered = useMemo(() => {
    return deadlines
      .filter(d => statusFilter === 'todos' || d.status === statusFilter)
      .filter(d => !search || d.title.toLowerCase().includes(search.toLowerCase()))
  }, [deadlines, statusFilter, search])

  const totalPendentes = deadlines.filter(d => d.status === 'pendente').length
  const totalVencidos = deadlines.filter(d => d.status === 'pendente' && getDaysDiff(d.due_date) < 0).length
  const totalHoje = deadlines.filter(d => d.status === 'pendente' && getDaysDiff(d.due_date) === 0).length
  const total7dias = deadlines.filter(d => d.status === 'pendente' && getDaysDiff(d.due_date) > 0 && getDaysDiff(d.due_date) <= 7).length

  const getProcessLabel = (id: string | null) => {
    if (!id) return ''
    const p = processes.find(pr => pr.id === id)
    return p ? (p.number ? `${p.number} — ${p.title}` : p.title) : ''
  }

  const getStage = (id: string | null) => stages.find(s => s.id === id) ?? null

  const toggleStatus = async (d: Deadline) => {
    const newStatus = d.status === 'pendente' ? 'cumprido' : 'pendente'
    await supabase.from('deadlines').update({ status: newStatus }).eq('id', d.id)
    loadData()
  }

  const moveToStage = async (deadlineId: string, stageId: string | null) => {
    await supabase.from('deadlines').update({ stage_id: stageId }).eq('id', deadlineId)
    loadData()
  }

  const openEdit = (d: Deadline) => {
    setDf({
      title: d.title, due_date: d.due_date, process_id: d.process_id ?? '',
      status: d.status, responsible_ids: d.responsible_ids ?? [], notes: d.notes ?? '',
      source: d.source ?? 'Manual', portal_visible: d.portal_visible, stage_id: d.stage_id ?? '',
    })
    setEditing(d)
    setDialogOpen(true)
  }

  const saveDeadline = async () => {
    const payload = {
      title: df.title, due_date: df.due_date, process_id: df.process_id || null,
      status: df.status, notes: df.notes || null,
      responsible_ids: df.responsible_ids,
      responsible: df.responsible_ids.length > 1 ? 'Ambas' : (profilesMap[df.responsible_ids[0]]?.display_name ?? null),
      source: df.source || null, portal_visible: df.portal_visible, stage_id: df.stage_id || null,
    }
    if (editing) {
      await supabase.from('deadlines').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('deadlines').insert(payload)
    }
    setDialogOpen(false)
    resetDf()
    loadData()
  }

  const deleteDeadline = async (id: string) => {
    if (!confirm('Excluir este prazo?')) return
    await supabase.from('deadlines').delete().eq('id', id)
    loadData()
  }

  // Stage management
  const openNewStage = () => {
    setStageEditing(null)
    setStageName('')
    setStageColor(STAGE_COLORS[0])
    setStageFormOpen(true)
  }

  const openEditStage = (s: DeadlineStage) => {
    setStageEditing(s)
    setStageName(s.name)
    setStageColor(s.color)
    setStageFormOpen(true)
  }

  const saveStage = async () => {
    if (!stageName.trim()) return
    if (stageEditing) {
      await supabase.from('deadline_stages').update({ name: stageName, color: stageColor }).eq('id', stageEditing.id)
    } else {
      const maxPos = stages.length > 0 ? Math.max(...stages.map(s => s.position)) + 1 : 0
      await supabase.from('deadline_stages').insert({ name: stageName, color: stageColor, position: maxPos })
    }
    setStageFormOpen(false)
    loadData()
  }

  const deleteStage = async (id: string) => {
    if (!confirm('Excluir esta etapa? Os prazos vinculados perderão a etapa.')) return
    await supabase.from('deadline_stages').delete().eq('id', id)
    loadData()
  }

  // Grouping
  const vencidos = filtered.filter(d => d.status === 'pendente' && getDaysDiff(d.due_date) < 0)
  const hoje = filtered.filter(d => d.status === 'pendente' && getDaysDiff(d.due_date) === 0)
  const proximos7 = filtered.filter(d => d.status === 'pendente' && getDaysDiff(d.due_date) > 0 && getDaysDiff(d.due_date) <= 7)
  const proximos30 = filtered.filter(d => d.status === 'pendente' && getDaysDiff(d.due_date) > 7 && getDaysDiff(d.due_date) <= 30)
  const depois = filtered.filter(d => d.status === 'pendente' && getDaysDiff(d.due_date) > 30)
  const cumpridos = filtered.filter(d => d.status === 'cumprido')
  const perdidos = filtered.filter(d => d.status === 'perdido')

  // ── Kanban Card ──
  function KanbanCard({ deadline }: { deadline: Deadline }) {
    const days = getDaysDiff(deadline.due_date)
    const isOverdue = days < 0 && deadline.status === 'pendente'
    const isToday = days === 0 && deadline.status === 'pendente'
    const stage = getStage(deadline.stage_id)

    return (
      <div
        className={`rounded-xl border bg-card p-3 space-y-2 cursor-pointer hover:shadow-md transition-shadow ${
          isOverdue ? 'border-red-300 dark:border-red-800' :
          isToday ? 'border-blue-300 dark:border-blue-800' : ''
        }`}
        onClick={() => openEdit(deadline)}
      >
        <div className="flex items-start gap-2">
          <button
            onClick={e => { e.stopPropagation(); toggleStatus(deadline) }}
            className="shrink-0 mt-0.5"
          >
            {deadline.status === 'cumprido'
              ? <CheckCircle2 className="h-4 w-4 text-green-500" />
              : deadline.status === 'perdido'
              ? <AlertTriangle className="h-4 w-4 text-red-500" />
              : <Circle className="h-4 w-4 text-muted-foreground hover:text-primary" />
            }
          </button>
          <p className={`text-sm font-medium leading-snug flex-1 ${deadline.status === 'cumprido' ? 'line-through opacity-50' : ''}`}>
            {deadline.title}
          </p>
        </div>

        {visibleFields.processo && getProcessLabel(deadline.process_id) && (
          <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
            <Scale className="h-3 w-3 shrink-0" />
            {getProcessLabel(deadline.process_id)}
          </p>
        )}

        {visibleFields.notes && deadline.notes && (
          <p className="text-[10px] text-muted-foreground line-clamp-2">{deadline.notes}</p>
        )}

        <div className="flex items-center justify-between flex-wrap gap-1 pt-1">
          <div className="flex items-center gap-1">
            {visibleFields.status && deadline.status !== 'pendente' && (
              <Badge variant={deadline.status === 'cumprido' ? 'default' : 'destructive'} className="text-[9px] h-4">
                {deadline.status === 'cumprido' ? 'Cumprido' : 'Perdido'}
              </Badge>
            )}
            {visibleFields.origem && deadline.source && deadline.source !== 'Manual' && (
              <Badge variant="outline" className="text-[9px] h-4">{deadline.source}</Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            {visibleFields.responsavel && (
              <ResponsibleAvatars ids={deadline.responsible_ids} profilesMap={profilesMap} size="xs" />
            )}
            {visibleFields.data && (
              <span className={`text-[10px] font-medium ${
                isOverdue ? 'text-red-500' : isToday ? 'text-blue-600' : 'text-muted-foreground'
              }`}>
                {fmtDate(deadline.due_date)}
              </span>
            )}
            {visibleFields.dias && (
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                isOverdue ? 'bg-red-100 text-red-600 dark:bg-red-900/40' :
                isToday ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40' :
                days <= 7 ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40' :
                'bg-muted text-muted-foreground'
              }`}>
                {isOverdue ? `-${Math.abs(days)}d` : isToday ? 'HOJE' : `+${days}d`}
              </span>
            )}
          </div>
        </div>

        {stage && (
          <div className="flex items-center gap-1 pt-0.5 border-t">
            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
            <span className="text-[9px] text-muted-foreground">{stage.name}</span>
          </div>
        )}
      </div>
    )
  }

  // ── List Row ──
  function DeadlineRow({ deadline }: { deadline: Deadline }) {
    const days = getDaysDiff(deadline.due_date)
    const isOverdue = days < 0 && deadline.status === 'pendente'
    const isToday = days === 0 && deadline.status === 'pendente'

    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover:shadow-sm ${
        deadline.status !== 'pendente' ? 'opacity-50' : ''
      } ${isOverdue ? 'border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30' :
        isToday ? 'border-blue-300 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/30' : ''}`}>

        <button onClick={() => toggleStatus(deadline)} className="shrink-0">
          {deadline.status === 'cumprido'
            ? <CheckCircle2 className="h-5 w-5 text-green-500" />
            : deadline.status === 'perdido'
            ? <AlertTriangle className="h-5 w-5 text-red-500" />
            : <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />
          }
        </button>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(deadline)}>
          <div className="flex items-center gap-2">
            <p className={`text-sm font-medium truncate ${deadline.status === 'cumprido' ? 'line-through' : ''}`}>
              {deadline.title}
            </p>
            {deadline.source && deadline.source !== 'Manual' && (
              <Badge variant="outline" className="text-[9px]">{deadline.source}</Badge>
            )}
            {deadline.stage_id && (
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getStage(deadline.stage_id)?.color }} />
                <span className="text-[9px] text-muted-foreground">{getStage(deadline.stage_id)?.name}</span>
              </div>
            )}
          </div>
          {getProcessLabel(deadline.process_id) && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              <Scale className="h-3 w-3 inline mr-0.5" />
              {getProcessLabel(deadline.process_id)}
            </p>
          )}
        </div>

        <ResponsibleAvatars ids={deadline.responsible_ids} profilesMap={profilesMap} />

        <div className="text-right shrink-0">
          <p className={`text-xs font-medium whitespace-nowrap ${
            isOverdue ? 'text-red-600' : isToday ? 'text-blue-600' : 'text-muted-foreground'
          }`}>
            {fmtDate(deadline.due_date)}
          </p>
          <p className={`text-[10px] ${
            isOverdue ? 'text-red-500 font-semibold' :
            isToday ? 'text-blue-600 font-medium' :
            days === 1 ? 'text-amber-500' :
            'text-muted-foreground'
          }`}>
            {isOverdue ? `${Math.abs(days)}d atrás` :
             isToday ? 'HOJE' :
             days === 1 ? 'AMANHÃ' :
             `${days}d restantes`}
          </p>
        </div>
      </div>
    )
  }

  function Section({ title, icon: Icon, items, color, defaultOpen = true }: {
    title: string; icon: React.ElementType; items: Deadline[]; color: string; defaultOpen?: boolean
  }) {
    const [open, setOpen] = useState(defaultOpen)
    if (items.length === 0) return null
    return (
      <div>
        <button className="flex items-center gap-2 mb-2 w-full text-left" onClick={() => setOpen(!open)}>
          <Icon className="h-4 w-4" style={{ color }} />
          <span className="text-sm font-semibold">{title}</span>
          <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
        </button>
        {open && (
          <div className="space-y-1.5 ml-6">
            {items.map(d => <DeadlineRow key={d.id} deadline={d} />)}
          </div>
        )}
      </div>
    )
  }

  // ── Kanban View ──
  function KanbanView() {
    const unassigned = filtered.filter(d => !d.stage_id)
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {/* Sem etapa column */}
        {unassigned.length > 0 && (
          <div className="flex-shrink-0 w-72">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
              <span className="text-sm font-semibold">Sem etapa</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">{unassigned.length}</Badge>
            </div>
            <div className="space-y-2">
              {unassigned.map(d => <KanbanCard key={d.id} deadline={d} />)}
            </div>
          </div>
        )}

        {/* Stage columns */}
        {stages.map(stage => {
          const items = filtered.filter(d => d.stage_id === stage.id)
          return (
            <div key={stage.id} className="flex-shrink-0 w-72">
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="text-sm font-semibold">{stage.name}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">{items.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[60px] rounded-xl bg-muted/30 p-2">
                {items.map(d => <KanbanCard key={d.id} deadline={d} />)}
                {items.length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-4">Nenhum prazo</p>
                )}
              </div>
            </div>
          )
        })}

        {/* Add stage shortcut */}
        <div className="flex-shrink-0 w-56 flex items-start pt-1">
          <button
            onClick={() => { setStagesOpen(true); openNewStage() }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-muted"
          >
            <Plus className="h-4 w-4" /> Nova etapa
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Prazos Processuais</h1>
          <p className="text-sm text-muted-foreground">
            {totalPendentes} pendentes
            {totalVencidos > 0 && <span className="text-red-500 font-medium"> · {totalVencidos} vencidos!</span>}
            {totalHoje > 0 && <span className="text-blue-600"> · {totalHoje} para hoje</span>}
            {total7dias > 0 && <span> · {total7dias} nos próximos 7 dias</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setStagesOpen(true)}>
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />Etapas
          </Button>
          {viewMode === 'kanban' && (
            <Button variant="outline" size="sm" onClick={() => setFieldsOpen(true)}>
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />Campos
            </Button>
          )}
          <div className="flex items-center rounded-lg border p-0.5 bg-muted/30">
            <button
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'lista' ? 'bg-background shadow-sm' : 'hover:bg-muted'}`}
              onClick={() => setViewMode('lista')} title="Vista Lista"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-background shadow-sm' : 'hover:bg-muted'}`}
              onClick={() => setViewMode('kanban')} title="Vista Kanban"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <Button size="sm" onClick={() => { resetDf(); setDialogOpen(true) }}>
            <Plus className="h-3 w-3 mr-1" />Novo Prazo
          </Button>
        </div>
      </div>

      {/* Alert */}
      {totalVencidos > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-900">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              {totalVencidos} prazo{totalVencidos > 1 ? 's' : ''} vencido{totalVencidos > 1 ? 's' : ''}!
            </p>
            <p className="text-xs text-red-600/70 dark:text-red-400/70">
              Verifique e tome as providências necessárias imediatamente.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {(['pendente', 'cumprido', 'perdido', 'todos'] as const).map(s => (
            <Button key={s} variant={statusFilter === s ? 'default' : 'ghost'} size="sm" className="h-8"
              onClick={() => setStatusFilter(s)}>
              {s === 'pendente' ? 'Pendentes' : s === 'cumprido' ? 'Cumpridos' : s === 'perdido' ? 'Perdidos' : 'Todos'}
            </Button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar prazo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8" />
        </div>
      </div>

      {/* Content */}
      {viewMode === 'lista' ? (
        <div className="space-y-5">
          <Section title="Vencidos" icon={AlertTriangle} items={vencidos} color="#EF4444" />
          <Section title="Hoje" icon={Clock} items={hoje} color="#3B82F6" />
          <Section title="Próximos 7 dias" icon={Calendar} items={proximos7} color="#8B5CF6" />
          <Section title="Próximos 30 dias" icon={Calendar} items={proximos30} color="#F59E0B" />
          <Section title="Depois de 30 dias" icon={Calendar} items={depois} color="#6B7280" defaultOpen={false} />
          {statusFilter === 'cumprido' && <Section title="Cumpridos" icon={CheckCircle2} items={cumpridos} color="#10B981" />}
          {statusFilter === 'perdido' && <Section title="Perdidos" icon={AlertTriangle} items={perdidos} color="#EF4444" />}
          {statusFilter === 'todos' && cumpridos.length > 0 && <Section title="Cumpridos" icon={CheckCircle2} items={cumpridos} color="#10B981" defaultOpen={false} />}
          {statusFilter === 'todos' && perdidos.length > 0 && <Section title="Perdidos" icon={AlertTriangle} items={perdidos} color="#EF4444" defaultOpen={false} />}
          {filtered.length === 0 && !loading && (
            <div className="py-12 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nenhum prazo encontrado</p>
            </div>
          )}
        </div>
      ) : (
        <KanbanView />
      )}

      {/* ── Prazo Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) resetDf() }}>
        <DialogContent className="max-w-[700px] w-[96vw] max-h-[90vh] overflow-y-auto p-8">
          <DialogHeader>
            <DialogTitle className="text-lg">{editing ? 'Editar' : 'Novo'} Prazo</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label>Título do prazo</Label>
              <Input value={df.title} onChange={e => setDf(f => ({ ...f, title: e.target.value }))} className="h-10" placeholder="Ex: Contestação, Recurso, Juntada de docs..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data limite</Label>
                <Input type="date" value={df.due_date} onChange={e => setDf(f => ({ ...f, due_date: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Origem</Label>
                <Select value={df.source} onValueChange={v => setDf(f => ({ ...f, source: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{df.source}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Processo vinculado</Label>
                <Select value={df.process_id} onValueChange={v => setDf(f => ({ ...f, process_id: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    {processes.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.number ? `${p.number} — ${p.title}` : p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <ResponsibleSelect value={df.responsible_ids} onChange={ids => setDf(f => ({ ...f, responsible_ids: ids }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={df.status} onValueChange={v => setDf(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-10">
                    <SelectValue>{df.status === 'pendente' ? 'Pendente' : df.status === 'cumprido' ? 'Cumprido' : 'Perdido'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="cumprido">Cumprido</SelectItem>
                    <SelectItem value="perdido">Perdido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Etapa (Kanban)</Label>
                <Select value={df.stage_id} onValueChange={v => setDf(f => ({ ...f, stage_id: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Sem etapa" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sem etapa</SelectItem>
                    {stages.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={df.notes} onChange={e => setDf(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>

            <div className="flex items-center gap-2 pt-2 border-t">
              <Switch checked={df.portal_visible} onCheckedChange={v => setDf(f => ({ ...f, portal_visible: v }))} />
              <Label>Visível no portal do cliente</Label>
            </div>
          </div>
          <DialogFooter className="pt-4">
            {editing && (
              <Button variant="destructive" className="mr-auto"
                onClick={() => { deleteDeadline(editing.id); setDialogOpen(false); resetDf() }}>
                Excluir
              </Button>
            )}
            <DialogClose render={<Button variant="outline" size="lg" />}>Cancelar</DialogClose>
            <Button size="lg" onClick={saveDeadline} disabled={!df.title || !df.due_date}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Stages Dialog ── */}
      <Dialog open={stagesOpen} onOpenChange={setStagesOpen}>
        <DialogContent className="max-w-[500px] w-[96vw] max-h-[80vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Gerenciar Etapas</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            {stages.map(s => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-sm flex-1">{s.name}</span>
                <button onClick={() => openEditStage(s)} className="p-1 hover:bg-muted rounded">
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button onClick={() => deleteStage(s.id)} className="p-1 hover:bg-muted rounded">
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                </button>
              </div>
            ))}
            {stages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma etapa criada</p>
            )}
          </div>

          {stageFormOpen ? (
            <div className="border rounded-xl p-4 space-y-3 mt-2 bg-muted/20">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{stageEditing ? 'Editar etapa' : 'Nova etapa'}</p>
                <button onClick={() => setStageFormOpen(false)}><X className="h-4 w-4" /></button>
              </div>
              <Input placeholder="Nome da etapa" value={stageName} onChange={e => setStageName(e.target.value)} className="h-9" />
              <div className="space-y-1.5">
                <Label className="text-xs">Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {STAGE_COLORS.map(c => (
                    <button key={c} onClick={() => setStageColor(c)}
                      className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${stageColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setStageFormOpen(false)}>Cancelar</Button>
                <Button size="sm" className="flex-1" onClick={saveStage} disabled={!stageName.trim()}>Salvar</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="w-full mt-2" size="sm" onClick={openNewStage}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Nova etapa
            </Button>
          )}

          <DialogFooter className="pt-2">
            <DialogClose render={<Button variant="outline" />}>Fechar</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Fields Dialog ── */}
      <Dialog open={fieldsOpen} onOpenChange={setFieldsOpen}>
        <DialogContent className="max-w-[380px] w-[96vw] p-6">
          <DialogHeader>
            <DialogTitle>Campos visíveis no card</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {CARD_FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <Checkbox
                  id={f.key}
                  checked={!!visibleFields[f.key]}
                  onCheckedChange={v => saveVisibleFields({ ...visibleFields, [f.key]: !!v })}
                />
                <Label htmlFor={f.key} className="cursor-pointer">{f.label}</Label>
              </div>
            ))}
          </div>
          <DialogFooter className="pt-4">
            <Button variant="outline" size="sm" onClick={() => saveVisibleFields(DEFAULT_VISIBLE)}>Restaurar padrão</Button>
            <DialogClose render={<Button size="sm" />}>OK</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
