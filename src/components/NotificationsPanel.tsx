import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Bell, AlertTriangle, Clock, CheckCircle2, Scale, ClipboardList, X, CheckCheck } from 'lucide-react'

interface Notif {
  id: string
  type: 'prazo_atrasado' | 'prazo_hoje' | 'prazo_amanha' | 'tarefa_atrasada'
  title: string
  subtitle?: string
  date: string
  href: string
}

const STORAGE_KEY = 'srjur_dismissed_notifs'

function getDismissed(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } catch { return {} }
}

function saveDismissed(map: Record<string, number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

function isDismissed(id: string): boolean {
  const map = getDismissed()
  const ts = map[id]
  if (!ts) return false
  // Expira em 24h para itens que continuam atrasados voltarem no dia seguinte
  return Date.now() - ts < 24 * 60 * 60 * 1000
}

function dismiss(id: string) {
  const map = getDismissed()
  map[id] = Date.now()
  // Limpa entradas velhas
  const cutoff = Date.now() - 48 * 60 * 60 * 1000
  for (const k of Object.keys(map)) { if (map[k] < cutoff) delete map[k] }
  saveDismissed(map)
}

function today() { return new Date().toISOString().slice(0, 10) }
function addDays(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10)
}

async function loadNotifs(): Promise<Notif[]> {
  const t = today(), tom = addDays(1), depois = addDays(2)

  const [deadlines, tasks] = await Promise.all([
    supabase.from('deadlines').select('id, title, date, type').lte('date', depois).order('date'),
    supabase.from('tasks').select('id, title, due_date, type').eq('status', 'pendente').lte('due_date', t).order('due_date'),
  ])

  const notifs: Notif[] = []

  deadlines.data?.forEach(d => {
    let type: Notif['type']
    if (d.date < t) type = 'prazo_atrasado'
    else if (d.date === t) type = 'prazo_hoje'
    else if (d.date === tom) type = 'prazo_amanha'
    else return
    const id = `d-${d.id}`
    if (!isDismissed(id))
      notifs.push({ id, type, title: d.title, subtitle: d.type ?? undefined, date: d.date, href: '/prazos' })
  })

  tasks.data?.forEach(tk => {
    if (!tk.due_date) return
    const id = `t-${tk.id}`
    if (!isDismissed(id))
      notifs.push({ id, type: 'tarefa_atrasada', title: tk.title, subtitle: tk.type ?? undefined, date: tk.due_date, href: '/tarefas' })
  })

  notifs.sort((a, b) => a.date.localeCompare(b.date))
  return notifs
}

const TYPE_CONFIG = {
  prazo_atrasado: { icon: AlertTriangle, color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-950/30',     label: 'Prazo atrasado'  },
  prazo_hoje:     { icon: Clock,         color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-950/30', label: 'Vence hoje'      },
  prazo_amanha:   { icon: Clock,         color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950/30',   label: 'Vence amanhã'    },
  tarefa_atrasada:{ icon: ClipboardList, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/30',label: 'Tarefa atrasada'},
}

function fmtDate(s: string) {
  const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`
}

// ── Item com swipe para dispensar ─────────────────────────────────────────────
function NotifItem({ n, onDismiss, onNavigate }: {
  n: Notif
  onDismiss: (id: string) => void
  onNavigate: (href: string) => void
}) {
  const cfg = TYPE_CONFIG[n.type]
  const Icon = cfg.icon
  const ref = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const [offset, setOffset] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  function handleDismiss() {
    setDismissed(true)
    setTimeout(() => onDismiss(n.id), 250)
  }

  // Touch swipe
  function onTouchStart(e: React.TouchEvent) { startX.current = e.touches[0].clientX }
  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - startX.current
    if (dx < 0) setOffset(Math.max(dx, -120))
  }
  function onTouchEnd() {
    if (offset < -60) handleDismiss()
    else setOffset(0)
  }

  return (
    <div
      className="relative overflow-hidden border-b last:border-0"
      style={{ transition: dismissed ? 'max-height 0.25s, opacity 0.25s' : undefined,
               maxHeight: dismissed ? 0 : 200, opacity: dismissed ? 0 : 1 }}
    >
      {/* Fundo vermelho revelado no swipe */}
      <div className="absolute inset-y-0 right-0 w-24 bg-red-500 flex items-center justify-center">
        <CheckCheck className="h-5 w-5 text-white" />
      </div>

      <div
        ref={ref}
        className="relative flex items-start gap-3 px-4 py-3 bg-background hover:bg-muted/40 transition-colors"
        style={{ transform: `translateX(${offset}px)`, transition: offset === 0 ? 'transform 0.2s' : 'none' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <button
          className="flex items-start gap-3 flex-1 min-w-0 text-left"
          onClick={() => onNavigate(n.href)}
        >
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${cfg.bg}`}>
            <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{n.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] font-semibold ${cfg.color}`}>{cfg.label}</span>
              {n.subtitle && <span className="text-[10px] text-muted-foreground truncate">{n.subtitle}</span>}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(n.date)}</p>
          </div>
        </button>

        {/* Botão OK */}
        <button
          onClick={handleDismiss}
          className="shrink-0 h-6 w-6 rounded-full hover:bg-muted flex items-center justify-center transition-colors mt-1"
          title="Marcar como lida"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}

// ── Painel principal ───────────────────────────────────────────────────────────
export function NotificationsPanel() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [loading, setLoading] = useState(false)

  async function refresh() {
    setLoading(true)
    setNotifs(await loadNotifs())
    setLoading(false)
  }

  useEffect(() => { loadNotifs().then(setNotifs) }, [])

  function handleOpen(v: boolean) {
    setOpen(v)
    if (v) refresh()
  }

  function handleDismiss(id: string) {
    dismiss(id)
    setNotifs(prev => prev.filter(n => n.id !== id))
  }

  function dismissAll() {
    notifs.forEach(n => dismiss(n.id))
    setNotifs([])
  }

  const urgentCount = notifs.filter(n =>
    n.type === 'prazo_atrasado' || n.type === 'tarefa_atrasada' || n.type === 'prazo_hoje'
  ).length

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="h-4 w-4" />
          {urgentCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {urgentCount > 9 ? '9+' : urgentCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[340px] p-0 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Notificações</p>
          </div>
          {notifs.length > 0 && (
            <button onClick={dismissAll} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              Marcar todas como lidas
            </button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-[380px] overflow-y-auto">
          {loading && <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>}

          {!loading && notifs.length === 0 && (
            <div className="py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2 opacity-60" />
              <p className="text-sm font-medium">Tudo em dia!</p>
              <p className="text-xs text-muted-foreground mt-1">Sem prazos ou tarefas urgentes</p>
            </div>
          )}

          {!loading && notifs.map(n => (
            <NotifItem
              key={n.id}
              n={n}
              onDismiss={handleDismiss}
              onNavigate={href => { setOpen(false); navigate(href) }}
            />
          ))}
        </div>

        {/* Dica de swipe no mobile */}
        {notifs.length > 0 && (
          <div className="border-t px-4 py-2 flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground">← arraste para dispensar</p>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg" onClick={() => { setOpen(false); navigate('/prazos') }}>
                <Scale className="h-3 w-3 mr-1" />Prazos
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg" onClick={() => { setOpen(false); navigate('/tarefas') }}>
                <ClipboardList className="h-3 w-3 mr-1" />Tarefas
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
