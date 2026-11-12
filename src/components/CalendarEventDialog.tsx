import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, ExternalLink, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ActivityTimeline } from '@/components/ActivityTimeline'
import { ResponsibleAvatars } from '@/components/ResponsibleSelect'
import { ProcessRef } from '@/components/ProcessRef'
import { EntityLink, entityPath } from '@/components/EntityLink'
import { logActivity } from '@/lib/activityLog'
import { fmtDate } from '@/lib/format'

interface Detail {
  id: string
  title: string
  description: string | null
  due_date: string | null
  due_time: string | null
  status: string
  created_at: string
  created_by: string | null
  client_id: string | null
  process_id: string | null
  link: string | null
  tipo: string | null
  priority: string | null
  clientName: string | null
  process: { id: string; title: string; number: string | null } | null
}

// Pop-up do calendário: mostra tudo sobre a tarefa/compromisso/prazo, com histórico e comentários,
// atalhos para cliente e processo, e marcar como feito. A edição abre só se a pessoa pedir.
export function CalendarEventDialog({ kind, id, label, profilesMap, open, onClose, onEdit, onChanged }: {
  kind: 'task' | 'deadline'
  id: string
  label: string
  profilesMap: Record<string, { display_name: string | null; color: string | null; photo_url?: string | null }>
  open: boolean
  onClose: () => void
  onEdit: () => void
  onChanged: () => void
}) {
  const [d, setD] = useState<Detail | null>(null)
  const [responsibleIds, setResponsibleIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const doneStatus = kind === 'task' ? 'concluida' : 'cumprido'
  const table = kind === 'task' ? 'tasks' : 'deadlines'

  async function load() {
    const { data } = await supabase.from(table).select('*').eq('id', id).maybeSingle()
    if (!data) { setD(null); return }
    const row = data as Record<string, any>
    let clientName: string | null = null
    let process: Detail['process'] = null
    if (row.process_id) {
      const { data: p } = await supabase.from('processes').select('id, title, number, client_id').eq('id', row.process_id).maybeSingle()
      if (p) process = { id: p.id, title: p.title, number: p.number }
      if (!row.client_id && p?.client_id) row.client_id = p.client_id
    }
    if (row.client_id) {
      const { data: c } = await supabase.from('clients').select('name').eq('id', row.client_id).maybeSingle()
      clientName = c?.name ?? null
    }
    setResponsibleIds(row.responsible_ids ?? [])
    setD({
      id: row.id, title: row.title, description: row.description ?? row.notes ?? null,
      due_date: row.due_date ?? null, due_time: row.due_time ?? null, status: row.status,
      created_at: row.created_at, created_by: row.created_by ?? null,
      client_id: row.client_id ?? null, process_id: row.process_id ?? null,
      link: row.link ?? row.drive_url ?? null, tipo: row.tipo ?? row.type ?? null, priority: row.priority ?? null,
      clientName, process,
    })
  }

  useEffect(() => { if (open) { setD(null); void load() } }, [open, id])

  async function toggleDone() {
    if (!d || busy) return
    setBusy(true)
    const next = d.status === doneStatus ? 'pendente' : doneStatus
    const { error } = await supabase.from(table).update({ status: next }).eq('id', d.id)
    setBusy(false)
    if (error) { toast.error('Não foi possível atualizar: ' + error.message); return }
    const nome = next === 'pendente' ? 'Pendente' : kind === 'task' ? 'Concluída' : 'Cumprido'
    await logActivity(kind === 'task' ? 'task' : 'deadline', d.id, `Status alterado para "${nome}"`)
    toast.success(next === 'pendente' ? 'Reaberto' : kind === 'task' ? 'Concluída!' : 'Cumprido!')
    setD({ ...d, status: next })
    onChanged()
  }

  const done = d?.status === doneStatus
  const statusLabel = !d ? '' : d.status === doneStatus ? (kind === 'task' ? 'Concluída' : 'Cumprido') : d.status === 'pendente' ? 'Pendente' : d.status.charAt(0).toUpperCase() + d.status.slice(1)

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[560px] w-[96vw] max-h-[90vh] overflow-y-auto p-5 sm:p-6">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-6">
            <button type="button" onClick={toggleDone} disabled={!d || busy} className="shrink-0 mt-1" title={done ? 'Reabrir' : 'Marcar como feito'}>
              {done ? <CheckCircle2 className="h-6 w-6 text-green-500" /> : <Circle className="h-6 w-6 text-muted-foreground hover:text-primary" />}
            </button>
            <div className="min-w-0">
              <DialogTitle className={`text-lg break-words ${done ? 'line-through opacity-60' : ''}`}>{d?.title ?? 'Carregando...'}</DialogTitle>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <Badge variant="outline" className="text-[10px]">{label}</Badge>
                {d && <Badge variant="secondary" className="text-[10px]">{statusLabel}</Badge>}
              </div>
            </div>
          </div>
        </DialogHeader>

        {d && (
          <div className="space-y-4 min-w-0">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] text-muted-foreground">Data</p>
                <p className="font-medium">{d.due_date ? fmtDate(d.due_date) : '—'}{d.due_time ? ` · ${d.due_time.slice(0, 5)}` : ''}</p>
              </div>
              {responsibleIds.length > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground">Responsável</p>
                  <ResponsibleAvatars ids={responsibleIds} profilesMap={profilesMap} />
                </div>
              )}
              {d.clientName && d.client_id && (
                <div className="col-span-2 min-w-0">
                  <p className="text-[11px] text-muted-foreground">Cliente</p>
                  <EntityLink to={entityPath.cliente(d.client_id)} className="font-medium break-words">{d.clientName}</EntityLink>
                </div>
              )}
              {d.process && (
                <div className="col-span-2 min-w-0">
                  <p className="text-[11px] text-muted-foreground">Processo</p>
                  <ProcessRef number={d.process.number} title={d.process.title} className="text-sm font-medium" wrap />
                  <EntityLink to={entityPath.processo(d.process.id)} className="text-xs mt-0.5">Abrir processo</EntityLink>
                </div>
              )}
              {d.description && (
                <div className="col-span-2 min-w-0">
                  <p className="text-[11px] text-muted-foreground">{kind === 'task' ? 'Descrição' : 'Observações'}</p>
                  <p className="whitespace-pre-wrap break-words">{d.description}</p>
                </div>
              )}
              {d.link && (
                <div className="col-span-2 min-w-0">
                  <a href={d.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-sm">
                    Abrir link <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>

            <ActivityTimeline key={d.id + d.status} entityType={kind} entityId={d.id} createdAt={d.created_at} createdBy={d.created_by} />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <EntityLink to={kind === 'task' ? entityPath.tarefa(d.id) : entityPath.prazo(d.id)} className="text-xs">
                {kind === 'task' ? 'Abrir em Tarefas' : 'Abrir em Prazos'}
              </EntityLink>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="h-3.5 w-3.5 mr-1.5" />Editar</Button>
                <Button size="sm" onClick={toggleDone} disabled={busy}>{done ? 'Reabrir' : kind === 'task' ? 'Marcar como concluída' : 'Marcar como cumprido'}</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
