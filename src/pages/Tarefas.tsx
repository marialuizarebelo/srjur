import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
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
  Plus, Search, ClipboardList, LayoutGrid, List, Pencil, Trash2,
  CheckCircle2, Circle, Clock, AlertTriangle, Calendar, Filter,
  Columns3, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
} from 'lucide-react'
import { fmtDate, getDaysDiff, humanize } from '@/lib/format'
import { ResponsibleSelect, ResponsibleAvatars, useProfilesMap } from '@/components/ResponsibleSelect'
import { ClientCombobox } from '@/components/ClientCombobox'
import { KanbanDndContext, DroppableColumn, DraggableCard } from '@/components/DndKanban'
import { usePinnedView } from '@/hooks/usePinnedView'
import { PinViewButton } from '@/components/PinViewButton'

// ── Types ──
interface Task {
  id: string
  title: string
  description: string | null
  type: string
  status: string
  priority: string
  due_date: string | null
  due_time: string | null
  responsible: string | null
  responsible_ids: string[] | null
  client_id: string | null
  process_id: string | null
  recurrence: string | null
  portal_visible: boolean
  workflow_stage: string | null
  created_at: string
}

interface ClientOption { id: string; name: string }
interface ProcessOption { id: string; title: string }

const WORKFLOW_STAGES = [
  { value: 'backlog', label: 'Backlog', color: '#6B7280' },
  { value: 'a_fazer', label: 'A Fazer', color: '#3B82F6' },
  { value: 'fazendo', label: 'Fazendo', color: '#F59E0B' },
  { value: 'aguardando', label: 'Aguardando', color: '#8B5CF6' },
  { value: 'concluido', label: 'Concluído', color: '#10B981' },
]

// ── Constants ──
const TYPES = [
  { value: 'tarefa', label: 'Tarefa', color: '#3B82F6' },
  { value: 'compromisso', label: 'Compromisso', color: '#8B5CF6' },
  { value: 'reuniao', label: 'Reunião', color: '#10B981' },
  { value: 'audiencia', label: 'Audiência', color: '#EC4899' },
  { value: 'diligencia', label: 'Diligência', color: '#F97316' },
  { value: 'interno', label: 'Interno', color: '#6B7280' },
  { value: 'cliente', label: 'Cliente', color: '#14B8A6' },
]

const PRIORITIES = [
  { value: 'baixa', label: 'Baixa', color: '#6B7280' },
  { value: 'media', label: 'Média', color: '#3B82F6' },
  { value: 'alta', label: 'Alta', color: '#F59E0B' },
  { value: 'urgente', label: 'Urgente', color: '#EF4444' },
]

const RECURRENCES = ['Única', 'Diária', 'Semanal', 'Quinzenal', 'Mensal', 'Trimestral']

// ── View Dialog ──
function TaskViewDialog({ task, open, onClose, onEdit, onDelete, onToggleComplete, onMoveStage, clients, processes, profilesMap }: {
  task: Task | null
  open: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleComplete: () => void
  onMoveStage: (stage: string) => void
  clients: ClientOption[]
  processes: ProcessOption[]
  profilesMap: Record<string, { display_name: string | null; color: string | null }>
}) {
  if (!task) return null
  const typeInfo = TYPES.find(t => t.value === task.type) ?? TYPES[0]
  const priorityInfo = PRIORITIES.find(p => p.value === task.priority) ?? PRIORITIES[1]
  const clientName = clients.find(c => c.id === task.client_id)?.name
  const processTitle = processes.find(p => p.id === task.process_id)?.title
  const days = task.due_date ? getDaysDiff(task.due_date) : null
  const isOverdue = days !== null && days < 0 && task.status === 'pendente'
  const stageInfo = WORKFLOW_STAGES.find(s => s.value === (task.workflow_stage ?? 'a_fazer')) ?? WORKFLOW_STAGES[1]
  const stageIdx = WORKFLOW_STAGES.findIndex(s => s.value === stageInfo.value)
  const nextStage = stageIdx < WORKFLOW_STAGES.length - 1 ? WORKFLOW_STAGES[stageIdx + 1] : null

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-[560px] w-[96vw] max-h-[90vh] overflow-y-auto p-0">
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <Badge variant="outline" className="text-[10px]" style={{ borderColor: typeInfo.color, color: typeInfo.color }}>
                {typeInfo.label}
              </Badge>
              <Badge className="text-[10px]" style={{ backgroundColor: priorityInfo.color, color: '#fff' }}>
                {priorityInfo.label}
              </Badge>
              <Badge className="text-[10px]" style={{ backgroundColor: stageInfo.color, color: '#fff' }}>
                {stageInfo.label}
              </Badge>
              {task.status === 'concluida' && <Badge className="text-[10px] bg-green-600 text-white">Concluída</Badge>}
              {isOverdue && <Badge className="text-[10px] bg-red-500 text-white">Atrasada</Badge>}
            </div>
            <h2 className={`text-lg font-semibold leading-tight ${task.status === 'concluida' ? 'line-through opacity-60' : ''}`}>
              {task.title}
            </h2>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          {task.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            {task.due_date && (
              <div>
                <p className="text-[11px] text-muted-foreground">Data</p>
                <p className="font-medium">{fmtDate(task.due_date)}{task.due_time ? ` às ${task.due_time}` : ''}</p>
              </div>
            )}
            {task.recurrence && (
              <div>
                <p className="text-[11px] text-muted-foreground">Recorrência</p>
                <p className="font-medium">{task.recurrence}</p>
              </div>
            )}
            {clientName && (
              <div>
                <p className="text-[11px] text-muted-foreground">Cliente</p>
                <p className="font-medium">{clientName}</p>
              </div>
            )}
            {processTitle && (
              <div>
                <p className="text-[11px] text-muted-foreground">Processo</p>
                <p className="font-medium">{processTitle}</p>
              </div>
            )}
          </div>

          {task.responsible_ids && task.responsible_ids.length > 0 && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-1.5">Responsáveis</p>
              <div className="flex items-center gap-2 flex-wrap">
                {task.responsible_ids.map(id => (
                  <Badge key={id} variant="outline" className="text-[11px]" style={{ borderColor: profilesMap[id]?.color ?? undefined }}>
                    {profilesMap[id]?.display_name ?? '—'}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {task.portal_visible && (
            <p className="text-[11px] text-muted-foreground">Visível no portal do cliente</p>
          )}
        </div>

        <DialogFooter className="px-6 pb-6 pt-2 flex-wrap gap-2 mx-0 mb-0 rounded-none border-t-0">
          <Button variant="destructive" className="mr-auto" onClick={onDelete}>Excluir</Button>
          {nextStage && (
            <Button variant="outline" onClick={() => onMoveStage(nextStage.value)}>
              Avançar → {nextStage.label}
            </Button>
          )}
          <Button variant="outline" onClick={onToggleComplete}>
            {task.status === 'concluida' ? 'Reabrir' : 'Concluir'}
          </Button>
          <Button onClick={onEdit}>Editar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main ──
export default function Tarefas() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [processes, setProcesses] = useState<ProcessOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'board' | 'list' | 'execucao'>('list')
  const pinnedView = usePinnedView('tarefas_view', 'list')
  useEffect(() => { if (pinnedView.loaded && pinnedView.isPinned) setViewMode(pinnedView.pinnedValue as any) }, [pinnedView.loaded])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [viewTask, setViewTask] = useState<Task | null>(null)
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set())
  const toggleStageCollapsed = (value: string) => {
    setCollapsedStages(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  // Filters
  const [statusFilter, setStatusFilter] = useState<'pendente' | 'concluida' | 'todas'>('pendente')
  const [typeFilter, setTypeFilter] = useState('todos')
  const [responsibleFilter, setResponsibleFilter] = useState('todos')
  const [clientFilter, setClientFilter] = useState('todos')

  const profilesMap = useProfilesMap()

  // Form
  const [tf, setTf] = useState({
    title: '', description: '', type: 'tarefa', status: 'pendente',
    priority: 'media', due_date: '', due_time: '', responsible_ids: [] as string[],
    client_id: '', process_id: '', recurrence: 'Única', portal_visible: false,
    workflow_stage: 'a_fazer',
  })

  const resetTf = () => {
    setTf({ title: '', description: '', type: 'tarefa', status: 'pendente',
      priority: 'media', due_date: '', due_time: '', responsible_ids: [],
      client_id: '', process_id: '', recurrence: 'Única', portal_visible: false,
      workflow_stage: 'a_fazer' })
    setEditing(null)
  }

  const loadData = async () => {
    setLoading(true)
    const [{ data: t }, { data: c }, { data: p }] = await Promise.all([
      supabase.from('tasks').select('*').order('due_date', { ascending: true }),
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('processes').select('id, title').eq('status', 'em_andamento').order('title'),
    ])
    setTasks((t as Task[]) ?? [])
    setClients((c as ClientOption[]) ?? [])
    setProcesses((p as ProcessOption[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // Abre o formulário de nova tarefa quando vem de um atalho "+ Novo" (ex: Dashboard)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('new') === '1') {
      resetTf()
      setDialogOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // ── Filtered ──
  const filtered = useMemo(() => {
    return tasks
      .filter(t => statusFilter === 'todas' || t.status === statusFilter)
      .filter(t => typeFilter === 'todos' || t.type === typeFilter)
      .filter(t => responsibleFilter === 'todos' || (t.responsible_ids ?? []).includes(responsibleFilter))
      .filter(t => clientFilter === 'todos' || t.client_id === clientFilter)
      .filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()))
  }, [tasks, statusFilter, typeFilter, responsibleFilter, clientFilter, search])

  // ── Groups for board view ──
  const overdue = filtered.filter(t => t.status === 'pendente' && t.due_date && getDaysDiff(t.due_date) < 0)
  const today = filtered.filter(t => t.status === 'pendente' && t.due_date && getDaysDiff(t.due_date) === 0)
  const thisWeek = filtered.filter(t => t.status === 'pendente' && t.due_date && getDaysDiff(t.due_date) > 0 && getDaysDiff(t.due_date) <= 7)
  const later = filtered.filter(t => t.status === 'pendente' && t.due_date && getDaysDiff(t.due_date) > 7)
  const noDate = filtered.filter(t => t.status === 'pendente' && !t.due_date)

  // ── Stats ──
  const totalPendentes = tasks.filter(t => t.status === 'pendente').length
  const totalAtrasadas = tasks.filter(t => t.status === 'pendente' && t.due_date && getDaysDiff(t.due_date) < 0).length
  const totalHoje = tasks.filter(t => t.status === 'pendente' && t.due_date && getDaysDiff(t.due_date) === 0).length

  const getClientName = (id: string | null) => clients.find(c => c.id === id)?.name ?? ''
  const getProcessTitle = (id: string | null) => processes.find(p => p.id === id)?.title ?? ''
  const getTypeInfo = (type: string) => TYPES.find(t => t.value === type) ?? TYPES[0]
  const getPriorityInfo = (p: string) => PRIORITIES.find(pr => pr.value === p) ?? PRIORITIES[1]

  // ── CRUD ──
  const toggleComplete = async (task: Task) => {
    const newStatus = task.status === 'pendente' ? 'concluida' : 'pendente'
    const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
    if (error) { toast.error('Erro ao atualizar tarefa: ' + error.message); return }
    loadData()
  }

  const moveWorkflowStage = async (task: Task, stage: string) => {
    const payload: { workflow_stage: string; status?: string } = { workflow_stage: stage }
    if (stage === 'concluido') payload.status = 'concluida'
    else if (task.status === 'concluida') payload.status = 'pendente'
    const { error } = await supabase.from('tasks').update(payload).eq('id', task.id)
    if (error) { toast.error('Erro ao mover tarefa: ' + error.message); return }
    loadData()
  }

  const openEdit = (t: Task) => {
    setTf({
      title: t.title, description: t.description ?? '', type: t.type,
      status: t.status, priority: t.priority, due_date: t.due_date ?? '',
      due_time: t.due_time ?? '', responsible_ids: t.responsible_ids ?? [],
      client_id: t.client_id ?? '', process_id: t.process_id ?? '',
      recurrence: t.recurrence ?? 'Única', portal_visible: t.portal_visible,
      workflow_stage: t.workflow_stage ?? 'a_fazer',
    })
    setEditing(t)
    setDialogOpen(true)
  }

  const saveTask = async () => {
    const names = tf.responsible_ids.map(id => profilesMap[id]?.display_name).filter(Boolean)
    const payload = {
      title: tf.title, description: tf.description || null, type: tf.type,
      status: tf.status, priority: tf.priority, due_date: tf.due_date || null,
      due_time: tf.due_time || null,
      responsible_ids: tf.responsible_ids,
      responsible: names.length > 1 ? 'Ambas' : (names[0] ?? null), // legado, mantido para telas antigas
      client_id: tf.client_id || null, process_id: tf.process_id || null,
      recurrence: tf.recurrence === 'Única' ? null : tf.recurrence,
      portal_visible: tf.portal_visible,
      workflow_stage: tf.workflow_stage,
    }
    if (editing) {
      await supabase.from('tasks').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('tasks').insert(payload)
    }
    setDialogOpen(false)
    resetTf()
    loadData()
  }

  const deleteTask = async (id: string) => {
    if (!confirm('Excluir esta tarefa?')) return
    await supabase.from('tasks').delete().eq('id', id)
    loadData()
  }

  // ── Task row component ──
  function TaskRow({ task }: { task: Task }) {
    const typeInfo = getTypeInfo(task.type)
    const priorityInfo = getPriorityInfo(task.priority)
    const days = task.due_date ? getDaysDiff(task.due_date) : null
    const isOverdue = days !== null && days < 0 && task.status === 'pendente'

    return (
      <div className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-lg border transition-colors hover:shadow-sm ${
        task.status === 'concluida' ? 'opacity-50' : ''
      } ${isOverdue ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20' : ''}`}>
        <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
          <button onClick={() => toggleComplete(task)} className="shrink-0 mt-0.5 sm:mt-0">
            {task.status === 'concluida'
              ? <CheckCircle2 className="h-5 w-5 text-green-500" />
              : <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />
            }
          </button>

          <div className="h-2 w-2 rounded-full shrink-0 mt-2 sm:mt-0" style={{ backgroundColor: typeInfo.color }} />

          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setViewTask(task)}>
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-medium truncate ${task.status === 'concluida' ? 'line-through' : ''}`}>
                {task.title}
              </p>
              {task.priority === 'alta' || task.priority === 'urgente' ? (
                <Badge className="text-[9px] shrink-0" style={{ backgroundColor: priorityInfo.color, color: '#fff' }}>
                  {priorityInfo.label}
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge variant="outline" className="text-[9px]" style={{ borderColor: typeInfo.color, color: typeInfo.color }}>
                {typeInfo.label}
              </Badge>
              {getClientName(task.client_id) && (
                <span className="text-[10px] text-muted-foreground">{getClientName(task.client_id)}</span>
              )}
              {getProcessTitle(task.process_id) && (
                <span className="text-[10px] text-muted-foreground">· {getProcessTitle(task.process_id)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pl-8 sm:pl-0 shrink-0">
          <ResponsibleAvatars ids={task.responsible_ids} profilesMap={profilesMap} />

          {task.due_date && (
            <span className={`text-xs shrink-0 whitespace-nowrap ${
              isOverdue ? 'text-red-500 font-semibold' :
              days === 0 ? 'text-blue-600 font-medium' :
              'text-muted-foreground'
            }`}>
              {isOverdue ? `${Math.abs(days!)}d atrás` :
               days === 0 ? 'Hoje' :
               days === 1 ? 'Amanhã' :
               fmtDate(task.due_date)}
            </span>
          )}

          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto sm:ml-0" onClick={() => openEdit(task)}>
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )
  }

  // ── Board column ──
  function BoardColumn({ title, icon: Icon, tasks, color }: {
    title: string; icon: React.ElementType; tasks: Task[]; color: string
  }) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Icon className="h-4 w-4" style={{ color }} />
          <span className="text-sm font-semibold">{title}</span>
          <Badge variant="secondary" className="text-[10px] ml-1">{tasks.length}</Badge>
        </div>
        <div className="space-y-1.5">
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Nenhum item</p>
          ) : (
            tasks.map(t => <TaskRow key={t.id} task={t} />)
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Compromissos & Tarefas</h1>
          <p className="text-sm text-muted-foreground">
            {totalPendentes} pendentes
            {totalAtrasadas > 0 && <span className="text-red-500"> · {totalAtrasadas} atrasadas</span>}
            {totalHoje > 0 && <span className="text-blue-600"> · {totalHoje} para hoje</span>}
          </p>
        </div>
        <Button size="sm" onClick={() => { resetTf(); setDialogOpen(true) }}>
          <Plus className="h-3 w-3 mr-1" />Nova Tarefa
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {(['pendente', 'concluida', 'todas'] as const).map(s => (
            <Button key={s} variant={statusFilter === s ? 'default' : 'ghost'} size="sm" className="h-8"
              onClick={() => setStatusFilter(s)}>
              {s === 'pendente' ? 'Pendentes' : s === 'concluida' ? 'Concluídas' : 'Todas'}
            </Button>
          ))}
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-32 h-8">
            <SelectValue>{typeFilter === 'todos' ? 'Tipo' : getTypeInfo(typeFilter).label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
          <SelectTrigger className="w-36 h-8">
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
          <SelectTrigger className="w-36 h-8">
            <SelectValue>{clientFilter === 'todos' ? 'Cliente' : (clients.find(c => c.id === clientFilter)?.name ?? 'Cliente')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8" />
          </div>
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
            <Button variant={viewMode === 'board' ? 'default' : 'ghost'} size="icon" className="h-8 w-8"
              onClick={() => setViewMode('board')}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="icon" className="h-8 w-8"
              onClick={() => setViewMode('list')}>
              <List className="h-3.5 w-3.5" />
            </Button>
            <Button variant={viewMode === 'execucao' ? 'default' : 'ghost'} size="icon" className="h-8 w-8"
              onClick={() => setViewMode('execucao')} title="Kanban de execução">
              <Columns3 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <PinViewButton isPinned={pinnedView.isPinned} currentValue={viewMode} onPin={v => pinnedView.pin(v as any)} onUnpin={pinnedView.unpin} />
        </div>
      </div>

      {/* Board view */}
      {viewMode === 'board' && statusFilter !== 'concluida' && (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <BoardColumn title="Atrasados" icon={AlertTriangle} tasks={overdue} color="#EF4444" />
          )}
          <BoardColumn title="Hoje" icon={Clock} tasks={today} color="#3B82F6" />
          <BoardColumn title="Próximos 7 dias" icon={Calendar} tasks={thisWeek} color="#8B5CF6" />
          {later.length > 0 && (
            <BoardColumn title="Depois" icon={ClipboardList} tasks={later} color="#6B7280" />
          )}
          {noDate.length > 0 && (
            <BoardColumn title="Sem data" icon={Circle} tasks={noDate} color="#9CA3AF" />
          )}
        </div>
      )}

      {/* List view */}
      {(viewMode === 'list' || statusFilter === 'concluida') && (
        <div className="space-y-1.5">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nenhuma tarefa encontrada</p>
            </div>
          ) : (
            filtered.map(t => <TaskRow key={t.id} task={t} />)
          )}
        </div>
      )}

      {/* Execução (kanban Scrum) view */}
      {viewMode === 'execucao' && (
        <KanbanDndContext onDropOnColumn={(taskId, stageValue) => {
          const task = tasks.find(t => t.id === taskId)
          if (task && (task.workflow_stage ?? 'a_fazer') !== stageValue) moveWorkflowStage(task, stageValue)
        }}>
          <div className="flex flex-col md:flex-row gap-3 md:gap-4 md:overflow-x-auto scrollbar-thin pb-4">
            {WORKFLOW_STAGES.map(stage => {
              const stageTasks = filtered.filter(t => (t.workflow_stage ?? 'a_fazer') === stage.value)
              const collapsed = collapsedStages.has(stage.value)
              const stageIdx = WORKFLOW_STAGES.findIndex(s => s.value === stage.value)
              const prevStage = stageIdx > 0 ? WORKFLOW_STAGES[stageIdx - 1] : null
              const nextStage = stageIdx < WORKFLOW_STAGES.length - 1 ? WORKFLOW_STAGES[stageIdx + 1] : null
              return (
                <div key={stage.value} className="w-full md:min-w-[260px] md:w-[260px] md:shrink-0">
                  <button className="flex items-center gap-2 mb-2 w-full md:cursor-default" onClick={() => toggleStageCollapsed(stage.value)}>
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                    <span className="text-sm font-semibold">{stage.label}</span>
                    <Badge variant="secondary" className="text-[10px] ml-auto">{stageTasks.length}</Badge>
                    {collapsed ? <ChevronDown className="h-4 w-4 md:hidden" /> : <ChevronUp className="h-4 w-4 md:hidden" />}
                  </button>
                  {!collapsed && (
                    <DroppableColumn id={stage.value} className="space-y-2 min-h-[60px] p-1 -m-1">
                      {stageTasks.map(task => (
                        <DraggableCard key={task.id} id={task.id}>
                          <div className="p-3 rounded-lg border bg-background hover:shadow-md transition-shadow cursor-pointer"
                            onClick={() => setViewTask(task)}>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-sm font-medium truncate flex-1">{task.title}</p>
                              <ResponsibleAvatars ids={task.responsible_ids} profilesMap={profilesMap} size="xs" />
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              <Badge variant="outline" className="text-[9px]" style={{ borderColor: getTypeInfo(task.type).color, color: getTypeInfo(task.type).color }}>
                                {getTypeInfo(task.type).label}
                              </Badge>
                              {task.priority === 'alta' || task.priority === 'urgente' ? (
                                <Badge className="text-[9px]" style={{ backgroundColor: getPriorityInfo(task.priority).color, color: '#fff' }}>
                                  {getPriorityInfo(task.priority).label}
                                </Badge>
                              ) : null}
                            </div>
                            {task.due_date && (
                              <p className="text-[10px] text-muted-foreground">{fmtDate(task.due_date)}</p>
                            )}
                            <div className="flex items-center gap-1 mt-2">
                              {prevStage && (
                                <Button variant="ghost" size="sm" className="flex-1 h-6 text-[10px] text-muted-foreground hover:text-foreground"
                                  onClick={e => { e.stopPropagation(); moveWorkflowStage(task, prevStage.value) }}>
                                  ← {prevStage.label}
                                </Button>
                              )}
                              {nextStage && (
                                <Button variant="ghost" size="sm" className="flex-1 h-6 text-[10px] text-muted-foreground hover:text-foreground"
                                  onClick={e => { e.stopPropagation(); moveWorkflowStage(task, nextStage.value) }}>
                                  {nextStage.label} →
                                </Button>
                              )}
                            </div>
                          </div>
                        </DraggableCard>
                      ))}
                      {stageTasks.length === 0 && (
                        <div className="p-4 rounded-lg border border-dashed text-center">
                          <p className="text-xs text-muted-foreground">Nada aqui</p>
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

      {/* ── View Dialog ── */}
      <TaskViewDialog
        task={viewTask}
        open={!!viewTask}
        onClose={() => setViewTask(null)}
        onEdit={() => { const t = viewTask; setViewTask(null); if (t) openEdit(t) }}
        onDelete={() => { if (viewTask) { deleteTask(viewTask.id); setViewTask(null) } }}
        onToggleComplete={() => { if (viewTask) { toggleComplete(viewTask); setViewTask(null) } }}
        onMoveStage={stage => { if (viewTask) { moveWorkflowStage(viewTask, stage); setViewTask(null) } }}
        clients={clients}
        processes={processes}
        profilesMap={profilesMap}
      />

      {/* ── Task Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) resetTf() }}>
        <DialogContent className="max-w-[700px] w-[96vw] max-h-[90vh] overflow-y-auto p-8">
          <DialogHeader>
            <DialogTitle className="text-lg">{editing ? 'Editar' : 'Nova'} Tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={tf.title} onChange={e => setTf(f => ({ ...f, title: e.target.value }))} className="h-10" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={tf.type} onValueChange={v => setTf(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{getTypeInfo(tf.type).label}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={tf.priority} onValueChange={v => setTf(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{getPriorityInfo(tf.priority).label}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fase (kanban)</Label>
                <Select value={tf.workflow_stage} onValueChange={v => setTf(f => ({ ...f, workflow_stage: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{WORKFLOW_STAGES.find(s => s.value === tf.workflow_stage)?.label}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {WORKFLOW_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={tf.due_date} onChange={e => setTf(f => ({ ...f, due_date: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Horário</Label>
                <Input type="time" value={tf.due_time} onChange={e => setTf(f => ({ ...f, due_time: e.target.value }))} className="h-10" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Responsável (pode selecionar mais de um)</Label>
              <ResponsibleSelect value={tf.responsible_ids} onChange={ids => setTf(f => ({ ...f, responsible_ids: ids }))} />
              <p className="text-[11px] text-muted-foreground">
                Selecionar mais de uma pessoa envia o evento para a agenda do escritório; uma só envia para a agenda pessoal dela.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Recorrência</Label>
                <Select value={tf.recurrence} onValueChange={v => setTf(f => ({ ...f, recurrence: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{tf.recurrence}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {RECURRENCES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cliente</Label>
                <ClientCombobox clients={clients} value={tf.client_id} onChange={id => setTf(f => ({ ...f, client_id: id }))} />
              </div>
              <div className="space-y-2">
                <Label>Processo</Label>
                <Select value={tf.process_id} onValueChange={v => setTf(f => ({ ...f, process_id: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    {processes.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={tf.description} onChange={e => setTf(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>

            <div className="flex items-center gap-2 pt-2 border-t">
              <Switch checked={tf.portal_visible} onCheckedChange={v => setTf(f => ({ ...f, portal_visible: v }))} />
              <Label>Visível no portal do cliente</Label>
            </div>
          </div>
          <DialogFooter className="pt-4">
            {editing && (
              <Button variant="destructive" className="mr-auto"
                onClick={() => { deleteTask(editing.id); setDialogOpen(false); resetTf() }}>
                Excluir
              </Button>
            )}
            <DialogClose render={<Button variant="outline" size="lg" />}>Cancelar</DialogClose>
            <Button size="lg" onClick={saveTask} disabled={!tf.title}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
