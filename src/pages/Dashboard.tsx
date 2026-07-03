import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Sensitive } from '@/components/Sensitive'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { ResponsibleSelect, useProfilesMap } from '@/components/ResponsibleSelect'
import { toast } from 'sonner'
import { fmtBRL, fmtDate, fmtDateLong, getDaysDiff } from '@/lib/format'
import { ClientCombobox } from '@/components/ClientCombobox'
import {
  Users, Scale, ClipboardList, AlertTriangle, ChevronRight,
  Calendar, DollarSign, Bell,
  ChevronLeft, Clock, Plus, ArrowRight, Loader2,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from 'recharts'

/* ---------- QuickView Modal ---------- */

interface QuickItem {
  id: string
  label: string
  sublabel?: string
  badge?: string
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline'
  extra?: string
  extraColor?: string
}

interface QuickViewState {
  open: boolean
  title: string
  items: QuickItem[]
  loading: boolean
  link: string
  linkLabel: string
}

const CLOSED_MODAL: QuickViewState = {
  open: false, title: '', items: [], loading: false, link: '', linkLabel: '',
}

function QuickViewModal({ state, onClose }: { state: QuickViewState; onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <Dialog open={state.open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {state.loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : state.items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum item encontrado</p>
          ) : (
            state.items.map(item => (
              <div key={item.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.label}</p>
                  {item.sublabel && <p className="text-xs text-muted-foreground mt-0.5">{item.sublabel}</p>}
                  {item.extra && (
                    <p className="text-xs font-medium mt-0.5" style={{ color: item.extraColor }}>{item.extra}</p>
                  )}
                </div>
                {item.badge && (
                  <Badge variant={item.badgeVariant ?? 'secondary'} className="text-[10px] shrink-0 mt-0.5">
                    {item.badge}
                  </Badge>
                )}
              </div>
            ))
          )}
        </div>
        <div className="pt-3 border-t">
          <Button className="w-full" onClick={() => { onClose(); navigate(state.link) }}>
            Ir para {state.linkLabel}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- StatCard ---------- */

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  lightColor: string
  darkColor: string
  bgColor: string
  onClick?: () => void
}

function StatCard({ title, value, subtitle, icon: Icon, lightColor, darkColor, bgColor, onClick }: StatCardProps) {
  const isDark = document.documentElement.classList.contains('dark')
  const color = isDark ? darkColor : lightColor
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-5 shadow-sm transition-transform duration-150 ${onClick ? 'cursor-pointer hover:scale-[1.02] hover:shadow-md active:scale-[0.99]' : ''}`}
      style={{ backgroundColor: bgColor }}
      onClick={onClick}
    >
      <div className="absolute -right-3 -top-3 opacity-10">
        <Icon className="h-16 w-16" style={{ color }} />
      </div>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-white/20">
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{title}</p>
      </div>
      <p className="text-4xl font-bold" style={{ color }}><Sensitive>{value}</Sensitive></p>
      {subtitle && <p className="text-xs mt-1.5 font-medium" style={{ color: color + 'cc' }}>{subtitle}</p>}
      {onClick && (
        <div className="absolute bottom-2 right-3 opacity-50">
          <ChevronRight className="h-3.5 w-3.5" style={{ color }} />
        </div>
      )}
    </div>
  )
}

/* ---------- AttentionColumn ---------- */

interface AttentionItem {
  id: string
  title: string
  subtitle?: string
  days?: number
  priority?: string
}

function AttentionColumn({
  title,
  icon: Icon,
  items,
  color,
  bgColor,
  count,
  onItemClick,
}: {
  title: string
  icon: React.ElementType
  items: AttentionItem[]
  color: string
  bgColor: string
  count: number
  onItemClick?: (item: AttentionItem) => void
}) {
  return (
    <div className="rounded-2xl p-4 min-h-[200px] border border-white/5 dark:border-white/5" style={{ backgroundColor: bgColor }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" style={{ color }} />
          <span className="font-semibold text-sm" style={{ color }}>{title}</span>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: color + '22', color }}>{count}</span>
      </div>
      <div className="space-y-1.5">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground pt-2">Sem itens</p>
        ) : (
          items.map(item => (
            <div
              key={item.id}
              className={`bg-background/60 dark:bg-white/5 backdrop-blur-sm rounded-xl p-2.5 border border-white/5 transition-colors ${onItemClick ? 'cursor-pointer hover:bg-background/80 dark:hover:bg-white/10' : ''}`}
              onClick={() => onItemClick?.(item)}
            >
              <p className="text-sm font-medium truncate leading-snug">{item.title}</p>
              {item.subtitle && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{item.subtitle}</p>
              )}
              {item.days !== undefined && item.days < 0 && (
                <span className="text-[11px] text-destructive font-medium">
                  {Math.abs(item.days)}d atrás
                </span>
              )}
              {onItemClick && (
                <span className="text-[10px] mt-0.5 block" style={{ color: color + '99' }}>Ver detalhes →</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* ---------- MiniWeekCalendar ---------- */

function MiniWeekCalendar() {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7))

  const days = ['SEG', 'TER', 'QUA', 'QUI', 'SEX']
  const dates = days.map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Semana</span>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6"><ChevronLeft className="h-3 w-3" /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6"><ChevronRight className="h-3 w-3" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1 text-center">
        {days.map((day, i) => {
          const isToday = dates[i].toDateString() === today.toDateString()
          return (
            <div key={day} className="flex flex-col items-center">
              <span className="text-[10px] text-muted-foreground uppercase">{day}</span>
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium mt-1 ${
                  isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                }`}
              >
                {dates[i].getDate()}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/* ---------- PortalActivityCard ---------- */

interface PortalActivity {
  id: string
  created_at: string
  details: Record<string, { de: string; para: string }>
  clientName: string
}

function PortalActivityCard() {
  const [items, setItems] = useState<PortalActivity[]>([])

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('audit_log')
        .select('id, created_at, details, record_id')
        .eq('action', 'cliente_atualizou_dados')
        .order('created_at', { ascending: false })
        .limit(5)
      if (!data || data.length === 0) { setItems([]); return }
      const clientIds = [...new Set(data.map(d => d.record_id))]
      const { data: clients } = await supabase.from('clients').select('id, name').in('id', clientIds)
      const nameMap = Object.fromEntries((clients ?? []).map(c => [c.id, c.name]))
      setItems(data.map(d => ({ ...d, clientName: nameMap[d.record_id] ?? 'Cliente' })) as PortalActivity[])
    })()
  }, [])

  if (items.length === 0) return null

  const FIELD_LABELS: Record<string, string> = {
    phone: 'Telefone', cep: 'CEP', street: 'Rua', address_number: 'Número', complement: 'Complemento',
    neighborhood: 'Bairro', city: 'Cidade', state: 'Estado', profession: 'Profissão',
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">Atividade do Portal</span>
      </div>
      <div className="space-y-3">
        {items.map(item => {
          const fields = Object.keys(item.details)
          return (
            <div key={item.id} className="text-xs">
              <p className="font-medium">{item.clientName} atualizou dados</p>
              <p className="text-muted-foreground mt-0.5">
                {fields.map(f => FIELD_LABELS[f] ?? f).join(', ')}
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{fmtDate(item.created_at)}</p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/* ---------- Dashboard ---------- */

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ clients: 0, processes: 0, tasks: 0, overdueDeadlines: 0 })
  const [finance, setFinance] = useState({ receitas: 0, despesas: 0, inadimplencia: 0 })
  const [recentProcesses, setRecentProcesses] = useState<{ id: string; title: string; responsible?: string; status: string }[]>([])
  const [overdueTasks, setOverdueTasks] = useState<AttentionItem[]>([])
  const [todayTasks, setTodayTasks] = useState<AttentionItem[]>([])
  const [upcomingTasks, setUpcomingTasks] = useState<AttentionItem[]>([])
  const [chartData, setChartData] = useState<{ month: string; receitas: number; despesas: number }[]>([])
  const [nextTasks, setNextTasks] = useState<{ id: string; title: string; responsible?: string; due_date?: string; priority?: string }[]>([])
  const [modal, setModal] = useState<QuickViewState>(CLOSED_MODAL)
  const [clientOptions, setClientOptions] = useState<{ id: string; name: string }[]>([])
  const profilesMap = useProfilesMap()

  const [quickLeadOpen, setQuickLeadOpen] = useState(false)
  const [quickLead, setQuickLead] = useState({ name: '', phone: '', source: '' })
  const [quickClientOpen, setQuickClientOpen] = useState(false)
  const [quickClient, setQuickClient] = useState({ name: '', email: '', phone: '', type: 'pessoa_fisica' })
  const [quickProcessOpen, setQuickProcessOpen] = useState(false)
  const [quickProcess, setQuickProcess] = useState({ title: '', client_id: '', area: '' })
  const [quickTaskOpen, setQuickTaskOpen] = useState(false)
  const [quickTask, setQuickTask] = useState({ title: '', due_date: '', responsible_ids: [] as string[] })
  const [saving, setSaving] = useState(false)

  async function saveQuickLead() {
    if (!quickLead.name.trim() || saving) return
    setSaving(true)
    try {
      const { error } = await supabase.from('leads').insert({ name: quickLead.name, phone: quickLead.phone || null, source: quickLead.source || null, status: 'novo' })
      if (error) { toast.error('Erro ao criar lead: ' + error.message); return }
      toast.success('Lead criado!')
      setQuickLeadOpen(false)
      setQuickLead({ name: '', phone: '', source: '' })
    } finally {
      setSaving(false)
    }
  }

  async function saveQuickClient() {
    if (!quickClient.name.trim() || saving) return
    setSaving(true)
    try {
      const { error } = await supabase.from('clients').insert({ name: quickClient.name, email: quickClient.email || null, phone: quickClient.phone || null, type: quickClient.type, status: 'ativo' })
      if (error) { toast.error('Erro ao criar cliente: ' + error.message); return }
      toast.success('Cliente criado!')
      setQuickClientOpen(false)
      setQuickClient({ name: '', email: '', phone: '', type: 'pessoa_fisica' })
    } finally {
      setSaving(false)
    }
  }

  async function saveQuickProcess() {
    if (!quickProcess.title.trim() || saving) return
    setSaving(true)
    try {
      const { error } = await supabase.from('processes').insert({ title: quickProcess.title, client_id: quickProcess.client_id || null, area: quickProcess.area || null, status: 'em_andamento', phase: 'inicial' })
      if (error) { toast.error('Erro ao criar processo: ' + error.message); return }
      toast.success('Processo criado!')
      setQuickProcessOpen(false)
      setQuickProcess({ title: '', client_id: '', area: '' })
    } finally {
      setSaving(false)
    }
  }

  async function saveQuickTask() {
    if (!quickTask.title.trim() || saving) return
    setSaving(true)
    try {
      const { error } = await supabase.from('tasks').insert({
        title: quickTask.title, due_date: quickTask.due_date || null, status: 'pendente',
        responsible_ids: quickTask.responsible_ids, type: 'tarefa',
      })
      if (error) { toast.error('Erro ao criar tarefa: ' + error.message); return }
      toast.success('Tarefa criada!')
      setQuickTaskOpen(false)
      setQuickTask({ title: '', due_date: '', responsible_ids: [] })
    } finally {
      setSaving(false)
    }
  }

  const firstName = profile?.nickname || profile?.display_name?.split(' ')[0] || 'Usuária'
  const todayStr = fmtDateLong(new Date())

  useEffect(() => {
    supabase.from('clients').select('id, name').eq('status', 'ativo').order('name').then(({ data }) => {
      setClientOptions((data as { id: string; name: string }[]) ?? [])
    })
  }, [])

  useEffect(() => {
    const load = async () => {
      // Data local em texto (YYYY-MM-DD), nunca via toISOString() — evita o mesmo
      // problema de fuso horário "vazando" pro dia seguinte/anterior.
      const todayD = new Date()
      const today = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, '0')}-${String(todayD.getDate()).padStart(2, '0')}`

      const [clientsRes, processesRes, tasksRes, deadlinesRes] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'ativo'),
        supabase.from('processes').select('id', { count: 'exact', head: true }).eq('status', 'em_andamento'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
        supabase.from('deadlines').select('id', { count: 'exact', head: true }).eq('status', 'pendente').lt('due_date', today),
      ])

      setStats({
        clients: clientsRes.count ?? 0,
        processes: processesRes.count ?? 0,
        tasks: tasksRes.count ?? 0,
        overdueDeadlines: deadlinesRes.count ?? 0,
      })

      // Monta a string do mês (YYYY-MM) manualmente, com data local — nunca via
      // toISOString(), que converte pra UTC e pode "vazar" pro dia seguinte/anterior
      // dependendo da hora e do fuso do navegador. Mesma lógica usada no Financeiro,
      // pra garantir que os dois mostrem exatamente o mesmo valor.
      const nowLocal = new Date()
      const currentMonthStr = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}`

      const { data: finData } = await supabase
        .from('finance')
        .select('type, value, paid, due_date, date')

      const finDataThisMonth = (finData ?? []).filter(f => f.date.slice(0, 7) === currentMonthStr)

      if (finData) {
        const receitas = finDataThisMonth.filter(f => f.type === 'receita').reduce((s, f) => s + Number(f.value), 0)
        const despesas = finDataThisMonth.filter(f => f.type === 'despesa').reduce((s, f) => s + Number(f.value), 0)
        const inadimplencia = finDataThisMonth
          .filter(f => f.type === 'receita' && !f.paid && f.due_date && f.due_date < today)
          .reduce((s, f) => s + Number(f.value), 0)
        setFinance({ receitas, despesas, inadimplencia })
      }

      const { data: procs } = await supabase
        .from('processes')
        .select('id, title, status, responsible')
        .eq('status', 'em_andamento')
        .order('updated_at', { ascending: false })
        .limit(5)
      if (procs) setRecentProcesses(procs)

      const { data: allTasks } = await supabase
        .from('tasks')
        .select('id, title, responsible, due_date, priority')
        .eq('status', 'pendente')
        .order('due_date', { ascending: true })
        .limit(50)

      if (allTasks) {
        const overdue: AttentionItem[] = []
        const todayItems: AttentionItem[] = []
        const upcoming: AttentionItem[] = []

        allTasks.forEach(t => {
          if (!t.due_date) return
          const diff = getDaysDiff(t.due_date)
          const item: AttentionItem = {
            id: t.id,
            title: t.title,
            subtitle: t.responsible ?? undefined,
            days: diff,
            priority: t.priority ?? undefined,
          }
          if (diff < 0) overdue.push(item)
          else if (diff === 0) todayItems.push(item)
          else if (diff <= 7) upcoming.push(item)
        })

        setOverdueTasks(overdue)
        setTodayTasks(todayItems)
        setUpcomingTasks(upcoming)
        setNextTasks(allTasks.filter(t => t.due_date).slice(0, 5))
      }

      const months: { month: string; receitas: number; despesas: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
        const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')

        const { data: mData } = await supabase
          .from('finance')
          .select('type, value')
          .gte('date', start)
          .lte('date', end)

        const rec = mData?.filter(f => f.type === 'receita').reduce((s, f) => s + Number(f.value), 0) ?? 0
        const desp = mData?.filter(f => f.type === 'despesa').reduce((s, f) => s + Number(f.value), 0) ?? 0
        months.push({ month: label, receitas: rec, despesas: desp })
      }
      setChartData(months)
    }

    load()
  }, [])

  /* ---------- Modal openers ---------- */

  const openClients = useCallback(async () => {
    setModal({ open: true, title: 'Clientes Ativos', items: [], loading: true, link: '/clientes', linkLabel: 'Clientes' })
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, email')
      .eq('status', 'ativo')
      .order('name')
      .limit(30)
    setModal(m => ({
      ...m,
      loading: false,
      items: (data ?? []).map(c => ({
        id: c.id,
        label: c.name,
        sublabel: c.email ?? c.phone ?? undefined,
      })),
    }))
  }, [])

  const openProcesses = useCallback(async () => {
    setModal({ open: true, title: 'Processos Ativos', items: [], loading: true, link: '/processos', linkLabel: 'Processos' })
    const { data } = await supabase
      .from('processes')
      .select('id, title, responsible, status')
      .eq('status', 'em_andamento')
      .order('updated_at', { ascending: false })
      .limit(30)
    setModal(m => ({
      ...m,
      loading: false,
      items: (data ?? []).map(p => ({
        id: p.id,
        label: p.title,
        sublabel: p.responsible ?? undefined,
        badge: 'Em andamento',
        badgeVariant: 'secondary' as const,
      })),
    }))
  }, [])

  const openTasks = useCallback(async () => {
    setModal({ open: true, title: 'Tarefas Pendentes', items: [], loading: true, link: '/tarefas', linkLabel: 'Tarefas' })
    const { data } = await supabase
      .from('tasks')
      .select('id, title, responsible, due_date, priority')
      .eq('status', 'pendente')
      .order('due_date', { ascending: true })
      .limit(30)
    setModal(m => ({
      ...m,
      loading: false,
      items: (data ?? []).map(t => {
        const diff = t.due_date ? getDaysDiff(t.due_date) : null
        const overdue = diff !== null && diff < 0
        return {
          id: t.id,
          label: t.title,
          sublabel: t.responsible ?? undefined,
          badge: t.priority === 'alta' || t.priority === 'urgente' ? t.priority.toUpperCase() : undefined,
          badgeVariant: 'destructive' as const,
          extra: t.due_date
            ? overdue
              ? `${Math.abs(diff!)}d atrasada`
              : `Vence ${fmtDate(t.due_date)}`
            : undefined,
          extraColor: overdue ? '#f87171' : undefined,
        }
      }),
    }))
  }, [])

  const openDeadlines = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10)
    setModal({ open: true, title: 'Prazos Atrasados', items: [], loading: true, link: '/prazos', linkLabel: 'Prazos' })
    const { data } = await supabase
      .from('deadlines')
      .select('id, title, due_date, responsible')
      .eq('status', 'pendente')
      .lt('due_date', today)
      .order('due_date', { ascending: true })
      .limit(30)
    setModal(m => ({
      ...m,
      loading: false,
      items: (data ?? []).map(d => {
        const diff = getDaysDiff(d.due_date)
        return {
          id: d.id,
          label: d.title,
          sublabel: d.responsible ?? undefined,
          extra: `${Math.abs(diff)}d atrasado`,
          extraColor: '#f87171',
          badge: 'ATRASADO',
          badgeVariant: 'destructive' as const,
        }
      }),
    }))
  }, [])

  const openAttentionItem = useCallback((item: AttentionItem, section: string) => {
    const diff = item.days
    const extraLabel = diff !== undefined
      ? diff < 0
        ? `${Math.abs(diff)}d atrasada`
        : diff === 0
        ? 'Vence hoje'
        : `Vence em ${diff}d`
      : undefined
    setModal({
      open: true,
      title: section,
      loading: false,
      link: '/tarefas',
      linkLabel: 'Tarefas',
      items: [{
        id: item.id,
        label: item.title,
        sublabel: item.subtitle,
        extra: extraLabel,
        extraColor: diff !== undefined && diff < 0 ? '#f87171' : '#60a5fa',
        badge: item.priority === 'alta' || item.priority === 'urgente' ? item.priority.toUpperCase() : undefined,
        badgeVariant: 'destructive',
      }],
    })
  }, [])

  const statusLabel: Record<string, string> = {
    em_andamento: 'EM ANDAMENTO',
    concluido: 'CONCLUÍDO',
    arquivado: 'ARQUIVADO',
    suspenso: 'SUSPENSO',
  }

  return (
    <div className="space-y-6">
      <QuickViewModal state={modal} onClose={() => setModal(CLOSED_MODAL)} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Olá, {firstName}</h1>
          <p className="text-sm text-muted-foreground">{todayStr} · Sua central de operação</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setQuickLeadOpen(true)}>
            <Plus className="h-3 w-3 mr-1" />Lead
          </Button>
          <Button variant="outline" size="sm" onClick={() => setQuickClientOpen(true)}>
            <Plus className="h-3 w-3 mr-1" />Cliente
          </Button>
          <Button variant="outline" size="sm" onClick={() => setQuickProcessOpen(true)}>
            <Plus className="h-3 w-3 mr-1" />Processo
          </Button>
          <Button size="sm" onClick={() => setQuickTaskOpen(true)}>
            <Plus className="h-3 w-3 mr-1" />Tarefa
          </Button>
        </div>

        {/* ── Quick Lead ── */}
        <Dialog open={quickLeadOpen} onOpenChange={setQuickLeadOpen}>
          <DialogContent className="max-w-[420px] w-[92vw] p-6">
            <DialogHeader><DialogTitle>Novo Lead</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={quickLead.name} onChange={e => setQuickLead(f => ({ ...f, name: e.target.value }))} className="h-10" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={quickLead.phone} onChange={e => setQuickLead(f => ({ ...f, phone: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Origem</Label>
                <Input value={quickLead.source} onChange={e => setQuickLead(f => ({ ...f, source: e.target.value }))} placeholder="Ex: Indicação, Instagram..." className="h-10" />
              </div>
            </div>
            <DialogFooter className="pt-4 mx-0 mb-0 px-0 pb-0 border-t-0 bg-transparent">
              <Button variant="outline" onClick={() => setQuickLeadOpen(false)}>Cancelar</Button>
              <Button onClick={saveQuickLead} disabled={saving || !quickLead.name.trim()}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Quick Cliente ── */}
        <Dialog open={quickClientOpen} onOpenChange={setQuickClientOpen}>
          <DialogContent className="max-w-[420px] w-[92vw] p-6">
            <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={quickClient.name} onChange={e => setQuickClient(f => ({ ...f, name: e.target.value }))} className="h-10" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={quickClient.email} onChange={e => setQuickClient(f => ({ ...f, email: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={quickClient.phone} onChange={e => setQuickClient(f => ({ ...f, phone: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={quickClient.type} onValueChange={v => setQuickClient(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{quickClient.type === 'pessoa_fisica' ? 'Pessoa Física' : 'Pessoa Jurídica'}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                    <SelectItem value="pessoa_juridica">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="pt-4 mx-0 mb-0 px-0 pb-0 border-t-0 bg-transparent">
              <Button variant="outline" onClick={() => setQuickClientOpen(false)}>Cancelar</Button>
              <Button onClick={saveQuickClient} disabled={saving || !quickClient.name.trim()}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Quick Processo ── */}
        <Dialog open={quickProcessOpen} onOpenChange={setQuickProcessOpen}>
          <DialogContent className="max-w-[420px] w-[92vw] p-6">
            <DialogHeader><DialogTitle>Novo Processo</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input value={quickProcess.title} onChange={e => setQuickProcess(f => ({ ...f, title: e.target.value }))} className="h-10" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <ClientCombobox clients={clientOptions} value={quickProcess.client_id} onChange={id => setQuickProcess(f => ({ ...f, client_id: id }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Área</Label>
                <Input value={quickProcess.area} onChange={e => setQuickProcess(f => ({ ...f, area: e.target.value }))} placeholder="Ex: Cível, Família..." className="h-10" />
              </div>
            </div>
            <DialogFooter className="pt-4 mx-0 mb-0 px-0 pb-0 border-t-0 bg-transparent">
              <Button variant="outline" onClick={() => setQuickProcessOpen(false)}>Cancelar</Button>
              <Button onClick={saveQuickProcess} disabled={saving || !quickProcess.title.trim()}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Quick Tarefa ── */}
        <Dialog open={quickTaskOpen} onOpenChange={setQuickTaskOpen}>
          <DialogContent className="max-w-[420px] w-[92vw] p-6">
            <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input value={quickTask.title} onChange={e => setQuickTask(f => ({ ...f, title: e.target.value }))} className="h-10" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={quickTask.due_date} onChange={e => setQuickTask(f => ({ ...f, due_date: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <ResponsibleSelect value={quickTask.responsible_ids} onChange={ids => setQuickTask(f => ({ ...f, responsible_ids: ids }))} />
              </div>
            </div>
            <DialogFooter className="pt-4 mx-0 mb-0 px-0 pb-0 border-t-0 bg-transparent">
              <Button variant="outline" onClick={() => setQuickTaskOpen(false)}>Cancelar</Button>
              <Button onClick={saveQuickTask} disabled={saving || !quickTask.title.trim()}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Main grid: content + sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Clientes Ativos"
              value={stats.clients}
              icon={Users}
              lightColor="#7a5500"
              darkColor="#f5d98a"
              bgColor="#D4A84388"
              onClick={openClients}
            />
            <StatCard
              title="Processos Ativos"
              value={stats.processes}
              subtitle={`${recentProcesses.length} consultivos`}
              icon={Scale}
              lightColor="#6b2010"
              darkColor="#f5b09a"
              bgColor="#C4604A88"
              onClick={openProcesses}
            />
            <StatCard
              title="Tarefas Pendentes"
              value={stats.tasks}
              subtitle={overdueTasks.length > 0 ? `${overdueTasks.length} atrasadas` : undefined}
              icon={ClipboardList}
              lightColor="#1e4020"
              darkColor="#a8d4a8"
              bgColor="#6B9E6B88"
              onClick={openTasks}
            />
            <StatCard
              title="Prazos Atrasados"
              value={stats.overdueDeadlines}
              subtitle={stats.overdueDeadlines > 0 ? 'atenção' : undefined}
              icon={AlertTriangle}
              lightColor="#2e1a5c"
              darkColor="#c8b8f0"
              bgColor="#8B7BB888"
              onClick={openDeadlines}
            />
          </div>

          {/* Attention section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">O que precisa da sua atenção hoje</h2>
              </div>
              <span className="text-xs text-muted-foreground">{fmtDate(new Date().toISOString().slice(0, 10))}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <AttentionColumn
                title="Atrasados"
                icon={AlertTriangle}
                items={overdueTasks}
                color="#f87171"
                bgColor="rgba(239,68,68,0.08)"
                count={overdueTasks.length}
                onItemClick={item => openAttentionItem(item, 'Tarefa Atrasada')}
              />
              <AttentionColumn
                title="Hoje"
                icon={Clock}
                items={todayTasks}
                color="#60a5fa"
                bgColor="rgba(59,130,246,0.08)"
                count={todayTasks.length}
                onItemClick={item => openAttentionItem(item, 'Tarefa para Hoje')}
              />
              <AttentionColumn
                title="Próximos 7 dias"
                icon={ChevronRight}
                items={upcomingTasks}
                color="#94a3b8"
                bgColor="rgba(148,163,184,0.06)"
                count={upcomingTasks.length}
                onItemClick={item => openAttentionItem(item, 'Próxima Tarefa')}
              />
            </div>
          </div>

          {/* Finance summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Receitas (mês)', value: fmtBRL(finance.receitas), color: 'text-green-600' },
              { label: 'Despesas (mês)', value: fmtBRL(finance.despesas), color: 'text-red-500' },
              { label: 'Lucro Líquido', value: fmtBRL(finance.receitas - finance.despesas), color: '' },
              { label: 'Inadimplência', value: fmtBRL(finance.inadimplencia), color: 'text-red-500', bell: true },
            ].map(({ label, value, color, bell }) => (
              <Card
                key={label}
                className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate('/financeiro')}
              >
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  {bell && <Bell className="h-3 w-3 text-muted-foreground" />}
                </div>
                <p className={`text-lg font-bold ${color}`}><Sensitive>{value}</Sensitive></p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Ver financeiro →</p>
              </Card>
            ))}
          </div>

          {/* Chart + Next tasks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/financeiro')}>
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Receitas vs Despesas (6 meses)</h3>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RTooltip
                      formatter={(value) => fmtBRL(Number(value))}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="receitas" fill="#86efac" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesas" fill="#fca5a5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Próximas Tarefas</h3>
                </div>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/tarefas')}>
                  Ver todas <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
              <div className="space-y-2">
                {nextTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma tarefa pendente</p>
                ) : (
                  nextTasks.map(t => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between cursor-pointer rounded-lg p-2 -mx-2 hover:bg-muted/50 transition-colors"
                      onClick={() => navigate('/tarefas')}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.responsible}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {t.priority === 'alta' || t.priority === 'urgente' ? (
                          <Badge variant="destructive" className="text-[10px]">
                            {t.priority?.toUpperCase()}
                          </Badge>
                        ) : null}
                        {t.due_date && (
                          <span className={`text-xs ${getDaysDiff(t.due_date) < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {getDaysDiff(t.due_date) < 0
                              ? `${Math.abs(getDaysDiff(t.due_date))}d atrás`
                              : fmtDate(t.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4 hidden xl:block">
          <MiniWeekCalendar />

          <PortalActivityCard />

          <Card className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Processos ativos</span>
              </div>
              <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => navigate('/processos')}>
                Ver todos <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <div className="space-y-3">
              {recentProcesses.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum processo ativo</p>
              ) : (
                recentProcesses.map(p => (
                  <div
                    key={p.id}
                    className="cursor-pointer rounded-lg p-1.5 -mx-1.5 hover:bg-muted/50 transition-colors"
                    onClick={() => navigate('/processos')}
                  >
                    <p className="text-sm font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.responsible}</p>
                    <Badge className="mt-1 text-[10px]" variant="outline">
                      {statusLabel[p.status] ?? p.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
