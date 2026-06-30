import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Badge } from '@/components/ui/badge'
import { CalendarDays, AlertTriangle } from 'lucide-react'
import { fmtDate, getDaysDiff, humanize } from '@/lib/format'

interface TaskItem { id: string; title: string; due_date: string | null; type: string; status: string }
interface DeadlineItem { id: string; title: string; due_date: string; status: string }

export default function PortalAgenda() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('tasks').select('id,title,due_date,type,status').order('due_date'),
      supabase.from('deadlines').select('id,title,due_date,status').order('due_date'),
    ]).then(([{ data: t }, { data: d }]) => {
      setTasks((t as TaskItem[]) ?? [])
      setDeadlines((d as DeadlineItem[]) ?? [])
      setLoading(false)
    })
  }, [])

  const items = [
    ...tasks.map(t => ({ id: t.id, title: t.title, date: t.due_date, kind: 'Compromisso', type: humanize(t.type), status: t.status })),
    ...deadlines.map(d => ({ id: d.id, title: d.title, date: d.due_date, kind: 'Prazo', type: 'Prazo processual', status: d.status })),
  ].filter(i => i.date).sort((a, b) => (a.date! < b.date! ? -1 : 1))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <p className="text-sm text-muted-foreground">Compromissos e prazos relacionados ao seu caso</p>
      </div>

      <div className="space-y-2">
        {items.map(i => {
          const days = i.date ? getDaysDiff(i.date) : null
          const isOverdue = days !== null && days < 0 && i.status === 'pendente'
          return (
            <div key={i.id} className={`rounded-2xl border bg-card shadow-sm p-4 flex items-center gap-3 ${
              isOverdue ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20' : 'border-border/60'
            }`}>
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                i.kind === 'Prazo' ? 'bg-red-50 dark:bg-red-900/30' : 'bg-violet-50 dark:bg-violet-900/30'
              }`}>
                {i.kind === 'Prazo'
                  ? <AlertTriangle className="h-4 w-4 text-red-500" />
                  : <CalendarDays className="h-4 w-4 text-violet-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{i.title}</p>
                <p className="text-[11px] text-muted-foreground">{i.type}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-medium">{i.date && fmtDate(i.date)}</p>
                {i.status !== 'pendente' && <Badge variant="secondary" className="text-[9px] mt-1">{humanize(i.status)}</Badge>}
              </div>
            </div>
          )
        })}
      </div>

      {items.length === 0 && !loading && (
        <div className="py-16 text-center text-muted-foreground">
          <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum evento agendado no momento</p>
        </div>
      )}
    </div>
  )
}
