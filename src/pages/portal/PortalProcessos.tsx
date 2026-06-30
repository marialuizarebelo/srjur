import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Scale, ChevronDown, ChevronUp, ExternalLink, Calendar } from 'lucide-react'
import { fmtDate, humanize } from '@/lib/format'

interface Process {
  id: string; title: string; number: string | null; area: string | null
  phase: string; status: string; court: string | null; court_url: string | null
  updated_at: string
}
interface Update { id: string; process_id: string; text: string; created_at: string }

export default function PortalProcessos() {
  const [processes, setProcesses] = useState<Process[]>([])
  const [updates, setUpdates] = useState<Record<string, Update[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('processes').select('*').order('updated_at', { ascending: false })
    setProcesses((data as Process[]) ?? [])
    setLoading(false)
  }

  async function toggle(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!updates[id]) {
      const { data } = await supabase.from('process_updates').select('*').eq('process_id', id).order('created_at', { ascending: false })
      setUpdates(prev => ({ ...prev, [id]: (data as Update[]) ?? [] }))
    }
  }

  const PHASE_COLORS: Record<string, string> = {
    inicial: '#6B7280', citacao: '#3B82F6', instrucao: '#8B5CF6',
    audiencia: '#F59E0B', recurso: '#EF4444', execucao: '#14B8A6', encerrado: '#10B981',
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Meus Processos</h1>
        <p className="text-sm text-muted-foreground">{processes.length} processo(s) acompanhado(s)</p>
      </div>

      <div className="space-y-3">
        {processes.map(p => (
          <div key={p.id} className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
            <button onClick={() => toggle(p.id)} className="w-full text-left p-5 hover:bg-muted/20 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <Badge variant="outline" className="text-[10px]" style={{ borderColor: PHASE_COLORS[p.phase], color: PHASE_COLORS[p.phase] }}>
                      {humanize(p.phase)}
                    </Badge>
                    {p.area && <Badge variant="secondary" className="text-[10px]">{p.area}</Badge>}
                  </div>
                  <p className="text-sm font-semibold">{p.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.number ?? 'Sem número'} {p.court ? `· ${p.court}` : ''}</p>
                </div>
                {expanded === p.id ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
              </div>
            </button>

            {expanded === p.id && (
              <div className="border-t border-border/40 p-5 space-y-3 bg-muted/10">
                {p.court_url && (
                  <a href={p.court_url} target="_blank" rel="noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline w-fit">
                    <ExternalLink className="h-3 w-3" />Acompanhar no tribunal
                  </a>
                )}
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Andamentos</p>
                <div className="space-y-2">
                  {(updates[p.id] ?? []).map(u => (
                    <div key={u.id} className="flex gap-3">
                      <div className="flex flex-col items-center pt-1">
                        <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                        <div className="w-px flex-1 bg-border/60 mt-1" />
                      </div>
                      <div className="pb-3">
                        <p className="text-xs text-foreground">{u.text}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Calendar className="h-2.5 w-2.5" />{fmtDate(u.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {(updates[p.id] ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">Nenhum andamento publicado ainda</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {processes.length === 0 && !loading && (
          <div className="py-16 text-center text-muted-foreground">
            <Scale className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum processo disponível no momento</p>
          </div>
        )}
      </div>
    </div>
  )
}
