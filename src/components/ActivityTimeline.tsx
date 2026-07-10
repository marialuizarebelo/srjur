import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MessageSquare, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { EntityType } from '@/lib/activityLog'

interface Entry {
  id: string
  kind: 'comment' | 'activity'
  text: string
  author: string | null
  created_at: string
}

function fmtWhen(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export function ActivityTimeline({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const { profile, user } = useAuth()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data, error } = await supabase
      .from('activity_log')
      .select('id, kind, text, author, created_at')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
    if (error) { console.error('ActivityTimeline load failed:', error.message); setLoading(false); return }
    setEntries((data as Entry[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true)
    load()
  }, [entityType, entityId])

  async function addComment() {
    if (!text.trim() || saving) return
    setSaving(true)
    const { error } = await supabase.from('activity_log').insert({
      entity_type: entityType,
      entity_id: entityId,
      kind: 'comment',
      text: text.trim(),
      author: profile?.nickname || profile?.display_name || 'Usuária',
      user_id: user?.id ?? null,
    })
    setSaving(false)
    if (error) { toast.error('Erro ao adicionar comentário: ' + error.message); return }
    setText('')
    load()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Histórico e comentários</p>
      </div>

      <div className="flex gap-2">
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Adicionar um comentário..."
          rows={2}
          className="flex-1 text-sm"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment() }}
        />
        <Button size="icon" className="h-10 w-10 shrink-0 self-end" onClick={addComment} disabled={!text.trim() || saving}>
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground py-2">Carregando...</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Nenhuma movimentação ainda.</p>
      ) : (
        <div className="space-y-3 pt-1">
          {entries.map(e => (
            <div key={e.id} className="flex gap-2.5">
              {e.kind === 'comment' ? (
                <div className="h-6 w-6 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {getInitials(e.author ?? '?')}
                </div>
              ) : (
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${e.kind === 'activity' ? 'text-muted-foreground italic' : ''}`}>{e.text}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {e.kind === 'comment' && e.author ? `${e.author} · ` : ''}{fmtWhen(e.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
