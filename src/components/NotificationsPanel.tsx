import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { Bell, AlertTriangle, Clock, CheckCircle2, Scale, ClipboardList } from 'lucide-react'

interface Notif {
  id: string
  type: 'prazo_atrasado' | 'prazo_hoje' | 'prazo_amanha' | 'tarefa_atrasada'
  title: string
  subtitle?: string
  date: string
  href: string
}

function today() { return new Date().toISOString().slice(0, 10) }
function addDays(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10)
}

async function loadNotifs(): Promise<Notif[]> {
  const t = today()
  const tom = addDays(1)
  const depois = addDays(2)

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
    notifs.push({ id: `d-${d.id}`, type, title: d.title, subtitle: d.type ?? undefined, date: d.date, href: '/prazos' })
  })

  tasks.data?.forEach(tk => {
    if (!tk.due_date) return
    notifs.push({
      id: `t-${tk.id}`, type: 'tarefa_atrasada',
      title: tk.title, subtitle: tk.type ?? undefined,
      date: tk.due_date, href: '/tarefas',
    })
  })

  notifs.sort((a, b) => a.date.localeCompare(b.date))
  return notifs
}

const TYPE_CONFIG = {
  prazo_atrasado: { icon: AlertTriangle, color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-950/30',    label: 'Prazo atrasado'  },
  prazo_hoje:     { icon: Clock,         color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-950/30', label: 'Vence hoje'      },
  prazo_amanha:   { icon: Clock,         color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950/30',   label: 'Vence amanhã'    },
  tarefa_atrasada:{ icon: ClipboardList, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/30',label: 'Tarefa atrasada'},
}

function fmtDate(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export function NotificationsPanel() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadNotifs().then(n => setNotifs(n))
  }, [])

  async function handleOpen(v: boolean) {
    setOpen(v)
    if (v) {
      setLoading(true)
      const n = await loadNotifs()
      setNotifs(n)
      setLoading(false)
    }
  }

  const count = notifs.filter(n => n.type === 'prazo_atrasado' || n.type === 'tarefa_atrasada' || n.type === 'prazo_hoje').length

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {count > 9 ? '9+' : count}
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
          {count > 0 && (
            <span className="text-[10px] font-medium bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 px-2 py-0.5 rounded-full">
              {count} urgente{count !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="max-h-[380px] overflow-y-auto">
          {loading && (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
          )}

          {!loading && notifs.length === 0 && (
            <div className="py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2 opacity-60" />
              <p className="text-sm font-medium">Tudo em dia!</p>
              <p className="text-xs text-muted-foreground mt-1">Sem prazos ou tarefas urgentes</p>
            </div>
          )}

          {!loading && notifs.map(n => {
            const cfg = TYPE_CONFIG[n.type]
            const Icon = cfg.icon
            return (
              <button
                key={n.id}
                onClick={() => { setOpen(false); navigate(n.href) }}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b last:border-0"
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
            )
          })}
        </div>

        {/* Footer */}
        {notifs.length > 0 && (
          <div className="border-t px-4 py-2.5 flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs rounded-lg" onClick={() => { setOpen(false); navigate('/prazos') }}>
              <Scale className="h-3 w-3 mr-1" />Ver prazos
            </Button>
            <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs rounded-lg" onClick={() => { setOpen(false); navigate('/tarefas') }}>
              <ClipboardList className="h-3 w-3 mr-1" />Ver tarefas
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
