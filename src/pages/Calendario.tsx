import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Scale, RefreshCw, Loader2, Plus } from 'lucide-react'
import { fmtDateLong } from '@/lib/format'
import { syncGoogleCalendar, type SyncResult } from '@/lib/googleCalendar'
import { ResponsibleSelect, ResponsibleAvatars, useProfilesMap } from '@/components/ResponsibleSelect'
import { toast } from 'sonner'

type ViewMode = 'mes' | 'semana' | 'dia'

interface CalEvent {
  id: string
  type: 'tarefa' | 'prazo' | 'compromisso' | 'marketing'
  title: string
  date: string
  time?: string | null
  responsibleIds: string[]
  status: string
  processLabel?: string
}

const TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  tarefa:      { bg: 'bg-slate-100 dark:bg-slate-800',   text: 'text-slate-600 dark:text-slate-300' },
  prazo:       { bg: 'bg-red-50 dark:bg-red-900/30',     text: 'text-red-600 dark:text-red-400' },
  compromisso: { bg: 'bg-violet-50 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-400' },
  marketing:   { bg: 'bg-pink-50 dark:bg-pink-900/30',   text: 'text-pink-600 dark:text-pink-400' },
}

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const WEEKDAYS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const WEEKDAYS_FULL  = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function parseYMD(s: string) {
  const [y,m,d] = s.split('-').map(Number)
  return new Date(y, m-1, d)
}
function weekStart(d: Date) {
  const c = new Date(d); c.setDate(c.getDate() - c.getDay()); return c
}
function daysInMonth(y: number, m: number) { return new Date(y, m+1, 0).getDate() }

export default function Calendario() {
  const navigate = useNavigate()
  const [events, setEvents]   = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [qf, setQf] = useState({ tipo: 'tarefa' as 'tarefa' | 'compromisso' | 'prazo', title: '', date: '', time: '', responsible_ids: [] as string[] })
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CalEvent | null>(null)
  const [ef, setEf] = useState({ title: '', date: '', time: '', responsible_ids: [] as string[], status: '' })
  const [view, setView]       = useState<ViewMode>('mes')
  const today                  = useMemo(() => new Date(), [])
  const [cursor, setCursor]   = useState(new Date())
  const [selDate, setSelDate] = useState(toYMD(new Date()))
  const profilesMap = useProfilesMap()

  const [showT, setShowT] = useState(true)
  const [showP, setShowP] = useState(true)
  const [showC, setShowC] = useState(true)
  const [showM, setShowM] = useState(true)
  const [resp, setResp]   = useState('todos')

  useEffect(() => { load() }, [])

  function namesFor(ids: string[]) {
    const names = ids.map(id => profilesMap[id]?.display_name).filter(Boolean)
    return names.length > 1 ? 'Ambas' : (names[0] ?? null)
  }

  function openQuickCreate(date: string) {
    setQf({ tipo: 'tarefa', title: '', date, time: '', responsible_ids: [] })
    setQuickOpen(true)
  }

  async function saveQuickCreate() {
    if (!qf.title || !qf.date) return
    if (qf.tipo === 'prazo') {
      await supabase.from('deadlines').insert({
        title: qf.title, due_date: qf.date, status: 'pendente',
        responsible_ids: qf.responsible_ids, responsible: namesFor(qf.responsible_ids), source: 'Manual',
      })
    } else {
      await supabase.from('tasks').insert({
        title: qf.title, due_date: qf.date, due_time: qf.time || null,
        type: qf.tipo, status: 'pendente',
        responsible_ids: qf.responsible_ids, responsible: namesFor(qf.responsible_ids),
      })
    }
    toast.success('Criado!')
    setQuickOpen(false)
    load()
  }

  function openEditEvent(ev: CalEvent) {
    if (ev.type === 'marketing') { navigate('/marketing'); return }
    setEditTarget(ev)
    setEf({ title: ev.title, date: ev.date, time: ev.time ?? '', responsible_ids: ev.responsibleIds, status: ev.status })
    setEditOpen(true)
  }

  async function saveEditEvent() {
    if (!editTarget) return
    if (editTarget.type === 'prazo') {
      await supabase.from('deadlines').update({
        title: ef.title, due_date: ef.date, status: ef.status,
        responsible_ids: ef.responsible_ids, responsible: namesFor(ef.responsible_ids),
      }).eq('id', editTarget.id)
    } else {
      await supabase.from('tasks').update({
        title: ef.title, due_date: ef.date, due_time: ef.time || null, status: ef.status,
        responsible_ids: ef.responsible_ids, responsible: namesFor(ef.responsible_ids),
      }).eq('id', editTarget.id)
    }
    toast.success('Atualizado!')
    setEditOpen(false)
    load()
  }

  async function deleteEditEvent() {
    if (!editTarget) return
    if (!confirm('Excluir este evento?')) return
    const table = editTarget.type === 'prazo' ? 'deadlines' : 'tasks'
    await supabase.from(table).delete().eq('id', editTarget.id)
    toast.success('Excluído')
    setEditOpen(false)
    load()
  }

  const [syncReport, setSyncReport] = useState<SyncResult[] | null>(null)
  const [syncReportOpen, setSyncReportOpen] = useState(false)

  async function handleSyncGoogle() {
    setSyncing(true)
    try {
      const results = await syncGoogleCalendar()
      setSyncReport(results)
      setSyncReportOpen(true)
      load()
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao sincronizar com o Google')
    } finally {
      setSyncing(false)
    }
  }

  async function load() {
    setLoading(true)
    const [{ data: tasks }, { data: deadlines }, { data: processes }, { data: marketing }] = await Promise.all([
      supabase.from('tasks').select('id,title,due_date,due_time,responsible_ids,status,type,process_id').neq('status','cancelada'),
      supabase.from('deadlines').select('id,title,due_date,responsible_ids,status,process_id').neq('status','perdido'),
      supabase.from('processes').select('id,title,number'),
      supabase.from('marketing_content').select('id,title,scheduled_date,scheduled_time,responsible_ids,status,platform').not('scheduled_date', 'is', null),
    ])
    const pm = Object.fromEntries((processes??[]).map(p=>[p.id, p.number ? `${p.number} — ${p.title}` : p.title]))
    const evs: CalEvent[] = []
    for (const t of tasks??[]) {
      if (!t.due_date) continue
      const isComp = ['compromisso','reuniao','audiencia','diligencia'].includes(t.type)
      evs.push({ id:`t-${t.id}`, type: isComp ? 'compromisso' : 'tarefa',
        title:t.title, date:t.due_date, time:t.due_time, responsibleIds: t.responsible_ids ?? [],
        status:t.status, processLabel: t.process_id ? pm[t.process_id] : undefined })
    }
    for (const d of deadlines??[]) {
      if (!d.due_date) continue
      evs.push({ id:`d-${d.id}`, type:'prazo', title:d.title, date:d.due_date,
        responsibleIds: d.responsible_ids ?? [], status:d.status,
        processLabel: d.process_id ? pm[d.process_id] : undefined })
    }
    for (const m of marketing??[]) {
      if (!m.scheduled_date) continue
      evs.push({ id:`m-${m.id}`, type:'marketing', title:`[${m.platform}] ${m.title}`, date:m.scheduled_date,
        time: m.scheduled_time, responsibleIds: m.responsible_ids ?? [], status: m.status })
    }
    setEvents(evs)
    setLoading(false)
  }

  const filtered = useMemo(() => events.filter(e => {
    if (!showT && e.type==='tarefa') return false
    if (!showP && e.type==='prazo') return false
    if (!showC && e.type==='compromisso') return false
    if (!showM && e.type==='marketing') return false
    if (resp !== 'todos' && !e.responsibleIds.includes(resp)) return false
    return true
  }), [events, showT, showP, showC, showM, resp])

  const byDate = useMemo(() => {
    const m: Record<string, CalEvent[]> = {}
    for (const e of filtered) { if (!m[e.date]) m[e.date]=[]; m[e.date].push(e) }
    return m
  }, [filtered])

  function nav(dir: 1|-1) {
    const d = new Date(cursor)
    if (view==='mes') d.setMonth(d.getMonth()+dir)
    else if (view==='semana') d.setDate(d.getDate()+dir*7)
    else { d.setDate(d.getDate()+dir); setSelDate(toYMD(d)) }
    setCursor(d)
  }
  function goToday() { setCursor(new Date()); setSelDate(toYMD(new Date())) }

  const navLabel = () => {
    if (view==='mes') return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    if (view==='semana') {
      const ws = weekStart(cursor), we = new Date(ws); we.setDate(ws.getDate()+6)
      return `${ws.getDate()} ${MONTHS[ws.getMonth()].slice(0,3)} — ${we.getDate()} ${MONTHS[we.getMonth()].slice(0,3)} ${we.getFullYear()}`
    }
    return fmtDateLong(parseYMD(selDate))
  }

  // ── Event pill ────────────────────────────────────────────────────────────
  function Pill({ ev, mini = false }: { ev: CalEvent; mini?: boolean }) {
    const singleProfile = ev.responsibleIds.length === 1 ? profilesMap[ev.responsibleIds[0]] : null
    const tc = TYPE_COLOR[ev.type]
    const isOverdue = ev.type==='prazo' && new Date(ev.date+'T00:00:00') < today && ev.status==='pendente'
    const done = ev.status==='concluida' || ev.status==='cumprido' || ev.status==='publicado'

    const pillStyle = isOverdue
      ? undefined
      : singleProfile?.color
        ? { backgroundColor: `${singleProfile.color}1A`, color: singleProfile.color }
        : ev.responsibleIds.length > 1
          ? { backgroundColor: '#8B5CF61A', color: '#8B5CF6' }
          : undefined
    const pillClass = isOverdue
      ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
      : pillStyle ? '' : `${tc.bg} ${tc.text}`

    return (
      <div className={`rounded-lg px-2 py-0.5 text-[11px] font-medium truncate leading-5 cursor-pointer hover:brightness-95 transition-all
        ${pillClass} ${done ? 'opacity-40 line-through' : ''}`}
        style={pillStyle}
        title={ev.title}
        onClick={e => { e.stopPropagation(); openEditEvent(ev) }}>
        {!mini && ev.time && <span className="mr-1.5 opacity-60 font-normal">{ev.time.slice(0,5)}</span>}
        {ev.title}
      </div>
    )
  }

  // ── Month grid ────────────────────────────────────────────────────────────
  function MonthView() {
    const y = cursor.getFullYear(), m = cursor.getMonth()
    const fd = new Date(y,m,1).getDay()
    const dim = daysInMonth(y,m), dip = daysInMonth(y,m-1)
    const cells: {d:Date; in:boolean}[] = []
    for (let i=fd-1; i>=0; i--) cells.push({d:new Date(y,m-1,dip-i), in:false})
    for (let d=1; d<=dim; d++) cells.push({d:new Date(y,m,d), in:true})
    while (cells.length < 42) { const n=cells.length-fd-dim+1; cells.push({d:new Date(y,m+1,n), in:false}) }

    return (
      <div className="rounded-2xl border border-border/60 overflow-hidden shadow-sm">
        {/* weekday headers */}
        <div className="grid grid-cols-7 bg-muted/30">
          {WEEKDAYS_SHORT.map(w => (
            <div key={w} className="py-3 text-center text-[11px] font-semibold text-muted-foreground tracking-wide">
              {w}
            </div>
          ))}
        </div>
        {/* day cells */}
        <div className="grid grid-cols-7 bg-background">
          {cells.map((c,i) => {
            const ymd = toYMD(c.d)
            const isT = ymd === toYMD(today)
            const evs = byDate[ymd] ?? []
            const MAX = 3
            return (
              <div key={i}
                onClick={() => { setSelDate(ymd); setView('dia') }}
                className={`group relative min-h-[100px] p-2 border-r border-b border-border/40 cursor-pointer transition-colors
                  hover:bg-muted/20 last:border-r-0 ${!c.in ? 'bg-muted/10' : ''}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs font-semibold h-6 w-6 flex items-center justify-center rounded-full transition-colors
                    ${isT ? 'bg-primary text-primary-foreground' : !c.in ? 'text-muted-foreground/30' : 'text-foreground hover:bg-muted'}`}>
                    {c.d.getDate()}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); openQuickCreate(ymd) }}
                    className="opacity-0 group-hover:opacity-100 h-5 w-5 rounded-md hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-all text-muted-foreground"
                    title="Criar evento">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  {evs.length > MAX && (
                    <span className="text-[9px] text-muted-foreground font-medium">+{evs.length-MAX}</span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {evs.slice(0,MAX).map(ev => <Pill key={ev.id} ev={ev} mini />)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Week grid ─────────────────────────────────────────────────────────────
  function WeekView() {
    const ws = weekStart(cursor)
    const days = Array.from({length:7},(_,i) => { const d=new Date(ws); d.setDate(ws.getDate()+i); return d })
    return (
      <div className="rounded-2xl border border-border/60 overflow-hidden shadow-sm">
        <div className="grid grid-cols-7 bg-muted/30">
          {days.map((d,i) => {
            const ymd = toYMD(d), isT = ymd===toYMD(today)
            return (
              <div key={i} onClick={() => { setSelDate(ymd); setView('dia') }}
                className="py-4 text-center border-r border-border/40 last:border-r-0 cursor-pointer hover:bg-muted/30 transition-colors">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">{WEEKDAYS_FULL[d.getDay()]}</p>
                <span className={`text-xl font-bold inline-flex h-10 w-10 items-center justify-center rounded-full mx-auto transition-colors
                  ${isT ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                  {d.getDate()}
                </span>
              </div>
            )
          })}
        </div>
        <div className="grid grid-cols-7 bg-background min-h-[360px]">
          {days.map((d,i) => {
            const ymd = toYMD(d)
            const evs = (byDate[ymd]??[]).sort((a,b)=>(a.time??'').localeCompare(b.time??''))
            return (
              <div key={i} className="group relative border-r border-border/40 last:border-r-0 p-2 space-y-1 cursor-pointer hover:bg-muted/10 transition-colors min-h-[80px]"
                onClick={() => { setSelDate(ymd); setView('dia') }}>
                <button
                  onClick={e => { e.stopPropagation(); openQuickCreate(ymd) }}
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 h-5 w-5 rounded-md hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-all text-muted-foreground"
                  title="Criar evento">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                {evs.map(ev => <Pill key={ev.id} ev={ev} />)}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Day view ──────────────────────────────────────────────────────────────
  function DayView() {
    const evs = (byDate[selDate]??[]).sort((a,b)=>(a.time??'zz').localeCompare(b.time??'zz'))
    const timed = evs.filter(e=>e.time), allDay = evs.filter(e=>!e.time)

    function EventRow({ ev }: { ev: CalEvent }) {
      const singleProfile = ev.responsibleIds.length === 1 ? profilesMap[ev.responsibleIds[0]] : null
      const tc = TYPE_COLOR[ev.type]
      const isOverdue = ev.type==='prazo' && new Date(ev.date+'T00:00:00') < today && ev.status==='pendente'
      const done = ev.status==='concluida' || ev.status==='cumprido' || ev.status==='publicado'
      const dotColor = isOverdue ? '#EF4444' : singleProfile?.color ?? (ev.responsibleIds.length > 1 ? '#8B5CF6' : '#9CA3AF')

      return (
        <div className={`flex items-start gap-4 p-4 rounded-2xl border border-border/50 transition-colors hover:bg-muted/20 cursor-pointer
          ${done ? 'opacity-40' : ''}`}
          onClick={() => openEditEvent(ev)}>
          {ev.time && (
            <div className="text-center min-w-[48px] shrink-0">
              <p className="text-sm font-semibold text-foreground">{ev.time.slice(0,5)}</p>
            </div>
          )}
          <div className="flex items-center mt-0.5 shrink-0">
            <div className="h-2.5 w-2.5 rounded-full" style={{backgroundColor: dotColor}} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${done ? 'line-through' : ''} ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
              {ev.title}
            </p>
            {ev.processLabel && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <Scale className="h-3 w-3 shrink-0" />{ev.processLabel}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isOverdue ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' : `${tc.bg} ${tc.text}`}`}>
              {ev.type === 'tarefa' ? 'Tarefa' : ev.type === 'prazo' ? 'Prazo' : 'Compromisso'}
            </span>
            <ResponsibleAvatars ids={ev.responsibleIds} profilesMap={profilesMap} />
          </div>
        </div>
      )
    }

    if (evs.length === 0) return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
          <ChevronRight className="h-6 w-6 opacity-30" />
        </div>
        <p className="text-sm font-medium">Nenhum evento neste dia</p>
        <p className="text-xs mt-1 opacity-60">Aproveite o dia livre!</p>
      </div>
    )

    return (
      <div className="space-y-5">
        {timed.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1">Com horário</p>
            {timed.map(ev => <EventRow key={ev.id} ev={ev} />)}
          </div>
        )}
        {allDay.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1">Dia todo</p>
            {allDay.map(ev => <EventRow key={ev.id} ev={ev} />)}
          </div>
        )}
      </div>
    )
  }

  // ── Mini month (sidebar) ──────────────────────────────────────────────────
  function MiniMonth() {
    const y = cursor.getFullYear(), m = cursor.getMonth()
    const fd = new Date(y,m,1).getDay(), dim = daysInMonth(y,m), dip = daysInMonth(y,m-1)
    const cells: (number|null)[] = Array(fd).fill(null)
    for (let d=1; d<=dim; d++) cells.push(d)

    return (
      <div className="rounded-2xl border border-border/60 p-4 bg-card shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => { const d=new Date(cursor); d.setMonth(d.getMonth()-1); setCursor(d) }}
            className="h-6 w-6 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <p className="text-xs font-semibold">{MONTHS[m].slice(0,3)} {y}</p>
          <button onClick={() => { const d=new Date(cursor); d.setMonth(d.getMonth()+1); setCursor(d) }}
            className="h-6 w-6 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {['D','S','T','Q','Q','S','S'].map((d,i) => (
            <div key={i} className="text-center text-[9px] font-semibold text-muted-foreground pb-1">{d}</div>
          ))}
          {cells.map((d,i) => {
            if (!d) return <div key={i} />
            const ymd = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
            const isT = ymd===toYMD(today), isSel = ymd===selDate
            const hasEv = !!byDate[ymd]?.length
            return (
              <button key={i} onClick={() => { setSelDate(ymd); setCursor(parseYMD(ymd)) }}
                className={`text-[10px] h-6 w-6 mx-auto flex flex-col items-center justify-center rounded-lg transition-colors relative
                  ${isSel ? 'bg-primary text-primary-foreground' : isT ? 'bg-primary/15 text-primary font-bold' : 'hover:bg-muted text-foreground'}`}>
                {d}
                {hasEv && !isSel && (
                  <span className="absolute bottom-0.5 h-0.5 w-0.5 rounded-full bg-primary opacity-70" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Legend ────────────────────────────────────────────────────────────────
  function Legend() {
    return (
      <div className="rounded-2xl border border-border/60 p-4 bg-card shadow-sm space-y-4">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Responsável</p>
          {Object.values(profilesMap).map(p => (
            <div key={p.id} className="flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full shrink-0" style={{backgroundColor: p.color ?? '#6B7280'}} />
              <span className="text-xs text-foreground">{p.display_name}</span>
            </div>
          ))}
          <div className="flex items-center gap-2.5">
            <div className="h-2 w-2 rounded-full shrink-0" style={{backgroundColor: '#8B5CF6'}} />
            <span className="text-xs text-foreground">Escritório (2+)</span>
          </div>
        </div>
        <div className="space-y-2 pt-2 border-t border-border/40">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Tipo</p>
          {[
            { label: 'Tarefa', cls: 'bg-slate-200 dark:bg-slate-700' },
            { label: 'Prazo', cls: 'bg-red-200 dark:bg-red-800' },
            { label: 'Compromisso', cls: 'bg-violet-200 dark:bg-violet-800' },
          ].map(t => (
            <div key={t.label} className="flex items-center gap-2.5">
              <div className={`h-2 w-2 rounded-sm shrink-0 ${t.cls}`} />
              <span className="text-xs text-foreground">{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const hasSidebar = view === 'semana' || view === 'dia'

  return (
    <div className="space-y-5">

      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* nav */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" onClick={goToday}>Hoje</Button>
          <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" onClick={handleSyncGoogle} disabled={syncing}>
            {syncing ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
            {syncing ? 'Sincronizando...' : 'Google Agenda'}
          </Button>
          <div className="flex items-center gap-0.5 bg-muted/40 rounded-xl p-0.5">
            <button onClick={() => nav(-1)} className="h-7 w-7 rounded-lg hover:bg-background flex items-center justify-center transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => nav(1)} className="h-7 w-7 rounded-lg hover:bg-background flex items-center justify-center transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <h2 className="text-lg font-semibold capitalize tracking-tight">{navLabel()}</h2>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* type toggles */}
          {[
            { label:'Tarefas',       val:showT, set:setShowT, active:'bg-slate-200 text-slate-700 border-slate-200', inactive:'text-muted-foreground border-border/60' },
            { label:'Prazos',        val:showP, set:setShowP, active:'bg-rose-100 text-rose-600 border-rose-200',   inactive:'text-muted-foreground border-border/60' },
            { label:'Compromissos',  val:showC, set:setShowC, active:'bg-violet-100 text-violet-600 border-violet-200', inactive:'text-muted-foreground border-border/60' },
            { label:'Marketing',     val:showM, set:setShowM, active:'bg-pink-100 text-pink-600 border-pink-200', inactive:'text-muted-foreground border-border/60' },
          ].map(f => (
            <button key={f.label} onClick={() => f.set(!f.val)}
              className={`h-7 px-3 rounded-full text-[11px] font-medium border transition-all ${
                f.val ? f.active : `bg-transparent hover:border-border ${f.inactive}`
              }`}>
              {f.label}
            </button>
          ))}

          {/* responsible filter */}
          <select value={resp} onChange={e => setResp(e.target.value)}
            className="h-7 rounded-xl border border-border/60 bg-background px-2.5 text-xs text-muted-foreground focus:outline-none">
            <option value="todos">Todas</option>
            {Object.values(profilesMap).map(p => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>

          {/* view toggle */}
          <div className="flex items-center bg-muted/40 rounded-xl p-0.5">
            {(['mes','semana','dia'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 h-7 rounded-lg text-xs font-medium transition-all ${
                  view===v ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}>
                {v==='mes' ? 'Mês' : v==='semana' ? 'Semana' : 'Dia'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando eventos...</div>
      ) : (
        <div className={hasSidebar ? 'grid gap-4' : ''} style={hasSidebar ? {gridTemplateColumns:'1fr 196px'} : {}}>
          <div>
            {view === 'mes'    && <MonthView />}
            {view === 'semana' && <WeekView />}
            {view === 'dia'    && (
              <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <p className="text-base font-semibold capitalize text-foreground">
                    {fmtDateLong(parseYMD(selDate))}
                  </p>
                  <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={() => openQuickCreate(selDate)}>
                    <Plus className="h-3 w-3 mr-1" />Novo
                  </Button>
                </div>
                <DayView />
              </div>
            )}
          </div>
          {hasSidebar && (
            <div className="space-y-3">
              <MiniMonth />
              <Legend />
            </div>
          )}
        </div>
      )}

      {/* Legend below on month view */}
      {view === 'mes' && (
        <div className="flex flex-wrap gap-6 px-1">
          {Object.values(profilesMap).map(p => (
            <div key={p.id} className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full" style={{backgroundColor: p.color ?? '#6B7280'}} />
              <span className="text-xs text-muted-foreground">{p.display_name}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{backgroundColor: '#8B5CF6'}} />
            <span className="text-xs text-muted-foreground">Escritório (2+)</span>
          </div>
          <span className="text-muted-foreground/30 text-xs">·</span>
          {[{l:'Tarefa',c:'bg-slate-300'},{l:'Prazo',c:'bg-red-300'},{l:'Compromisso',c:'bg-violet-300'},{l:'Marketing',c:'bg-pink-300'}].map(t=>(
            <div key={t.l} className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-sm ${t.c}`} />
              <span className="text-xs text-muted-foreground">{t.l}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Edit event dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[420px] w-[96vw] p-6">
          <DialogHeader>
            <DialogTitle>
              Editar {editTarget?.type === 'prazo' ? 'prazo' : editTarget?.type === 'compromisso' ? 'compromisso' : 'tarefa'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={ef.title} onChange={e => setEf(f => ({ ...f, title: e.target.value }))} className="h-10" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={ef.date} onChange={e => setEf(f => ({ ...f, date: e.target.value }))} className="h-10" />
              </div>
              {editTarget?.type !== 'prazo' && (
                <div className="space-y-1.5">
                  <Label>Hora</Label>
                  <Input type="time" value={ef.time} onChange={e => setEf(f => ({ ...f, time: e.target.value }))} className="h-10" />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Responsável (selecionar mais de um envia ao escritório)</Label>
              <ResponsibleSelect value={ef.responsible_ids} onChange={ids => setEf(f => ({ ...f, responsible_ids: ids }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={ef.status} onValueChange={v => setEf(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {editTarget?.type === 'prazo' ? (
                    <>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="cumprido">Cumprido</SelectItem>
                      <SelectItem value="perdido">Perdido</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="concluida">Concluída</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button variant="destructive" className="mr-auto" onClick={deleteEditEvent}>Excluir</Button>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={saveEditEvent} disabled={!ef.title}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sync report dialog ── */}
      <Dialog open={syncReportOpen} onOpenChange={setSyncReportOpen}>
        <DialogContent className="max-w-[600px] w-[96vw] max-h-[85vh] overflow-y-auto p-6">
          <DialogHeader><DialogTitle>Relatório de sincronização</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            {(syncReport ?? []).length === 0 && (
              <p className="text-sm text-amber-600">Nenhuma conexão Google encontrada. Conecte uma agenda em Configurações.</p>
            )}
            {(syncReport ?? []).map((r, i) => (
              <div key={i} className="rounded-xl border border-border/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">
                    {r.owner_type === 'office' ? 'Escritório' : 'Pessoal'} {r.email ? `— ${r.email}` : '(sem e-mail registrado)'}
                  </p>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${r.error ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {r.error ? 'Erro' : 'OK'}
                  </span>
                </div>
                {!r.has_refresh_token && (
                  <p className="text-xs text-amber-600">⚠ Sem token salvo — precisa reconectar essa agenda.</p>
                )}
                {r.error ? (
                  <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{r.error}</p>
                ) : (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Importados do Google: <strong className="text-foreground">{r.pulled}</strong></p>
                    <p>Enviados ao Google: <strong className="text-foreground">{r.pushed}</strong> de {r.candidatesFound} candidato(s)</p>
                    <p>Removidos (não pertencem mais a esta agenda): <strong className="text-foreground">{r.removed ?? 0}</strong></p>
                    <p className="text-[10px]">({r.totalTasksInRange} tarefas + {r.totalDeadlinesInRange} prazos no período total considerado)</p>
                  </div>
                )}
                {r.pushErrors && r.pushErrors.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-border/40">
                    <p className="text-[10px] font-semibold text-red-600 uppercase">Falhas ao enviar:</p>
                    {r.pushErrors.map((pe, j) => (
                      <p key={j} className="text-[11px] text-red-600">"{pe.title}": {pe.error}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter className="pt-4">
            <DialogClose render={<Button variant="outline" />}>Fechar</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Quick create dialog ── */}
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="max-w-[420px] w-[96vw] p-6">
          <DialogHeader><DialogTitle>Novo evento — {qf.date && fmtDateLong(parseYMD(qf.date))}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex gap-1.5">
              {(['tarefa', 'compromisso', 'prazo'] as const).map(t => (
                <button key={t} onClick={() => setQf(f => ({ ...f, tipo: t }))}
                  className={`flex-1 h-9 rounded-xl text-xs font-medium border transition-all ${
                    qf.tipo === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border/60 text-muted-foreground hover:border-border'
                  }`}>
                  {t === 'tarefa' ? 'Tarefa' : t === 'compromisso' ? 'Compromisso' : 'Prazo'}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={qf.title} onChange={e => setQf(f => ({ ...f, title: e.target.value }))} className="h-10" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={qf.date} onChange={e => setQf(f => ({ ...f, date: e.target.value }))} className="h-10" />
              </div>
              {qf.tipo !== 'prazo' && (
                <div className="space-y-1.5">
                  <Label>Hora (opcional)</Label>
                  <Input type="time" value={qf.time} onChange={e => setQf(f => ({ ...f, time: e.target.value }))} className="h-10" />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Responsável (selecionar mais de um envia ao escritório)</Label>
              <ResponsibleSelect value={qf.responsible_ids} onChange={ids => setQf(f => ({ ...f, responsible_ids: ids }))} />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={saveQuickCreate} disabled={!qf.title}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
