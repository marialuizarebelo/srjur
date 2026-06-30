import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useClient } from '@/contexts/ClientContext'
import { useAuth } from '@/contexts/AuthContext'
import { Link } from 'react-router-dom'
import { Scale, DollarSign, FileText, CalendarDays, MessageSquare, ArrowRight, Clock } from 'lucide-react'
import { fmtBRL, fmtDate, fmtDateLong, getDaysDiff } from '@/lib/format'

interface ProcessLite { id: string; title: string; number: string | null; phase: string; updated_at: string }
interface TaskLite { id: string; title: string; due_date: string | null }
interface MessageLite { id: string; title: string; created_at: string; read_at: string | null }

export default function PortalDashboard() {
  const { client } = useClient()
  const { profile } = useAuth()
  const [processes, setProcesses] = useState<ProcessLite[]>([])
  const [upcoming, setUpcoming] = useState<TaskLite[]>([])
  const [messages, setMessages] = useState<MessageLite[]>([])
  const [pendingValue, setPendingValue] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!client) return
    load()
  }, [client])

  async function load() {
    const [{ data: pr }, { data: tk }, { data: msg }, { data: fin }] = await Promise.all([
      supabase.from('processes').select('id,title,number,phase,updated_at').order('updated_at', { ascending: false }).limit(4),
      supabase.from('tasks').select('id,title,due_date').eq('status', 'pendente').order('due_date').limit(5),
      supabase.from('portal_messages').select('id,title,created_at,read_at').order('created_at', { ascending: false }).limit(3),
      supabase.from('finance').select('value').eq('type', 'receita').eq('paid', false),
    ])
    setProcesses((pr as ProcessLite[]) ?? [])
    setUpcoming((tk as TaskLite[]) ?? [])
    setMessages((msg as MessageLite[]) ?? [])
    setPendingValue((fin ?? []).reduce((s, f: any) => s + Number(f.value), 0))
    setLoading(false)
  }

  const firstName = (profile?.display_name ?? client?.name ?? '').split(' ')[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold capitalize">Olá, {firstName || 'bem-vindo(a)'}!</h1>
        <p className="text-sm text-muted-foreground capitalize">{fmtDateLong(new Date())}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Processos ativos', value: processes.length, icon: Scale, color: '#3B82F6' },
          { label: 'A pagar', value: fmtBRL(pendingValue), icon: DollarSign, color: '#10B981' },
          { label: 'Próximos compromissos', value: upcoming.length, icon: CalendarDays, color: '#8B5CF6' },
          { label: 'Mensagens', value: messages.filter(m => !m.read_at).length, icon: MessageSquare, color: '#EC4899' },
        ].map((s, i) => {
          const Icon = s.icon
          return (
            <div key={i} className="rounded-2xl border border-border/60 bg-card shadow-sm p-4">
              <div className="h-8 w-8 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: `${s.color}1A` }}>
                <Icon className="h-4 w-4" style={{ color: s.color }} />
              </div>
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Processos recentes */}
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Processos recentes</p>
            <Link to="/portal/processos" className="text-xs text-primary flex items-center gap-1 hover:underline">
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {processes.map(p => (
              <Link key={p.id} to="/portal/processos" className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/40 transition-colors">
                <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <Scale className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{p.title}</p>
                  <p className="text-[10px] text-muted-foreground">{p.number ?? 'Sem número'}</p>
                </div>
              </Link>
            ))}
            {processes.length === 0 && !loading && <p className="text-xs text-muted-foreground py-4 text-center">Nenhum processo visível ainda</p>}
          </div>
        </div>

        {/* Comunicados */}
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Comunicados recentes</p>
            <Link to="/portal/comunicados" className="text-xs text-primary flex items-center gap-1 hover:underline">
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {messages.map(m => (
              <div key={m.id} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-muted/40 transition-colors">
                <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${!m.read_at ? 'bg-amber-500' : 'bg-transparent'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{m.title}</p>
                  <p className="text-[10px] text-muted-foreground">{fmtDate(m.created_at)}</p>
                </div>
              </div>
            ))}
            {messages.length === 0 && !loading && <p className="text-xs text-muted-foreground py-4 text-center">Nenhum comunicado ainda</p>}
          </div>
        </div>
      </div>

      {/* Próximos compromissos */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Próximos compromissos</p>
        </div>
        <div className="space-y-2">
          {upcoming.map(t => {
            const days = t.due_date ? getDaysDiff(t.due_date) : null
            return (
              <div key={t.id} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30">
                <p className="text-xs font-medium">{t.title}</p>
                <span className="text-[10px] text-muted-foreground">
                  {t.due_date ? fmtDate(t.due_date) : 'Sem data'} {days !== null && days >= 0 ? `· ${days === 0 ? 'hoje' : `${days}d`}` : ''}
                </span>
              </div>
            )
          })}
          {upcoming.length === 0 && !loading && <p className="text-xs text-muted-foreground py-4 text-center">Nenhum compromisso agendado</p>}
        </div>
      </div>
    </div>
  )
}
