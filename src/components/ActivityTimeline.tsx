import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { MentionTextarea, MentionText } from '@/components/MentionTextarea'
import { MessageSquare, Send, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import type { EntityType } from '@/lib/activityLog'
import { UserAvatar } from '@/components/UserAvatar'
import { useProfilesMap } from '@/components/ResponsibleSelect'
import { useOfficeLogo } from '@/hooks/useOfficeLogo'

export interface TimelineTag { label: string; color: string }

// Entrada "externa" (Andamento, Prazo, Tarefa, Financeiro...) que a página
// que usa o componente já buscou e monta pra entrar misturada na timeline —
// o componente só sabe renderizar e ordenar, não sabe de onde cada uma vem.
export interface ExternalEntry {
  id: string
  text: string
  author?: string | null
  created_at: string
  tag: TimelineTag
}

interface Entry {
  id: string
  kind: 'comment' | 'activity'
  text: string
  author: string | null
  user_id: string | null
  created_at: string
  deleted_at: string | null
}

function fmtWhen(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

// Nomes legíveis para códigos internos que ficaram gravados no histórico (ex.: "em_elaboracao_pre_protocolo").
const ROTULOS: Record<string, string> = {
  pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída', concluido: 'Concluído', cumprido: 'Cumprido',
  perdido: 'Perdido', cancelada: 'Cancelada', suspenso: 'Suspenso', arquivado: 'Arquivado', encerrado: 'Encerrado',
  ativo: 'Ativo', inativo: 'Encerrado', prospecto: 'Prospecto', backlog: 'Backlog', a_fazer: 'A fazer', fazendo: 'Fazendo',
  aguardando: 'Aguardando', inicial: 'Inicial', citacao: 'Citação', instrucao: 'Instrução', audiencia: 'Audiência',
  recurso: 'Recurso', execucao: 'Execução', notificacao: 'Notificação enviada', aguardando_resposta: 'Aguardando resposta',
  negociacao: 'Negociação', acordo: 'Acordo fechado', sem_acordo: 'Sem acordo / vai a juízo',
}
let etapasCache: Record<string, string> | null = null
function useEtapas() {
  const [map, setMap] = useState<Record<string, string>>(etapasCache ?? {})
  useEffect(() => {
    if (etapasCache) return
    supabase.from('process_stages').select('value, name').then(({ data }) => {
      etapasCache = Object.fromEntries(((data ?? []) as { value: string; name: string }[]).map(s => [s.value, s.name]))
      setMap(etapasCache)
    })
  }, [])
  return map
}
function bonito(text: string, etapas: Record<string, string>) {
  return text.replace(/"([a-z][a-z0-9_]*)"/g, (m, token: string) => {
    const nome = etapas[token] ?? ROTULOS[token] ?? (token.includes('_') ? token.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : null)
    return nome ? `"${nome}"` : m
  })
}

export function ActivityTimeline({ entityType, entityId, createdAt, createdBy, externalEntries, title = 'Histórico e comentários', defaultOpen = true }: {
  entityType: EntityType
  entityId: string
  createdAt?: string | null
  createdBy?: string | null
  externalEntries?: ExternalEntry[]
  title?: string
  defaultOpen?: boolean
}) {
  const { profile } = useAuth()
  const profilesMap = useProfilesMap()
  const officeLogo = useOfficeLogo()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [mentionIds, setMentionIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(defaultOpen)
  const etapas = useEtapas()

  // Dados antigos (andamentos importados, etc.) às vezes guardam o e-mail no
  // campo "author" em vez do nome — se o e-mail bater com o de uma usuária
  // cadastrada, troca pelo apelido dela em vez de mostrar o e-mail cru.
  const resolveAuthor = (raw: string | null | undefined) => {
    if (!raw) return raw ?? null
    const match = Object.values(profilesMap).find(p => p.raw_name === raw || p.display_name === raw)
    return match ? match.display_name : raw
  }

  const load = async () => {
    const { data, error } = await supabase
      .from('activity_log')
      .select('id, kind, text, author, user_id, created_at, deleted_at')
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
    const base = {
      entity_type: entityType,
      entity_id: entityId,
      kind: 'comment',
      text: text.trim(),
      author: profile?.nickname || profile?.display_name || 'Usuária',
      user_id: profile?.id ?? null,
    }
    const ids = mentionIds.filter(id => id !== profile?.id)
    let { error } = await supabase.from('activity_log').insert((ids.length > 0 ? { ...base, mentions: ids } : base) as never)
    // banco ainda sem a coluna de menções: salva o comentário sem elas
    if (error && /mentions/i.test(error.message)) ({ error } = await supabase.from('activity_log').insert(base))
    setSaving(false)
    if (error) { toast.error('Erro ao adicionar comentário: ' + error.message); return }
    if (ids.length > 0) toast.success(ids.length === 1 ? 'Pessoa mencionada vai ser avisada' : 'Pessoas mencionadas vão ser avisadas')
    setText('')
    setMentionIds([])
    load()
  }

  async function deleteComment(id: string) {
    const { error } = await supabase.from('activity_log').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) { toast.error('Erro ao excluir comentário: ' + error.message); return }
    load()
  }

  const merged = [
    ...entries.map(e => ({ sortAt: e.created_at, node: 'entry' as const, entry: e })),
    ...(externalEntries ?? []).map(e => ({ sortAt: e.created_at, node: 'external' as const, entry: e })),
  ].sort((a, b) => b.sortAt.localeCompare(a.sortAt))

  const isEmpty = merged.length === 0 && !createdAt

  return (
    <div className="space-y-3 min-w-0">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 w-full text-left">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex-1">{title}</p>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <>
          <div className="flex gap-2 min-w-0">
            <MentionTextarea
              value={text}
              onChange={(v, ids) => { setText(v); setMentionIds(ids) }}
              onSubmit={addComment}
              selfId={profile?.id}
              placeholder="Adicionar um comentário... (use @ para mencionar alguém)"
              rows={2}
              className="flex-1 min-w-0 text-sm"
            />
            <Button size="icon" className="h-10 w-10 shrink-0 self-end" onClick={addComment} disabled={!text.trim() || saving}>
              <Send className="h-4 w-4" />
            </Button>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground py-2">Carregando...</p>
          ) : isEmpty ? (
            <p className="text-xs text-muted-foreground py-2">Nenhuma movimentação ainda.</p>
          ) : (
            <div className="space-y-3 pt-1">
              {merged.map(m => {
                if (m.node === 'external') {
                  const e = m.entry as ExternalEntry
                  const authorName = resolveAuthor(e.author)
                  return (
                    <div key={`x-${e.id}`} className="flex gap-2.5 min-w-0">
                      <UserAvatar name={authorName || 'SRJUR'} photoUrl={authorName ? null : officeLogo} className="h-6 w-6 text-[10px] mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                            style={{ backgroundColor: e.tag.color + '22', color: e.tag.color }}
                          >
                            {e.tag.label}
                          </span>
                        </div>
                        <p className="text-sm mt-0.5 break-words">{e.text}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 break-words">
                          {authorName ? `${authorName} · ` : ''}{fmtWhen(e.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                }

                const e = m.entry as Entry
                const p = e.user_id ? profilesMap[e.user_id] : undefined
                const authorName = p?.display_name ?? resolveAuthor(e.author)
                const canDelete = e.kind === 'comment' && !e.deleted_at && e.user_id === profile?.id
                if (e.deleted_at) {
                  return (
                    <div key={e.id} className="flex gap-2.5 min-w-0">
                      <UserAvatar name={authorName} photoUrl={p?.photo_url} color={p?.color} className="h-6 w-6 text-[10px] mt-0.5 shrink-0 opacity-40" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-muted-foreground italic line-through opacity-60 break-words">{e.text}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 italic">
                          Excluído em {fmtWhen(e.deleted_at)}
                        </p>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={e.id} className="flex gap-2.5 group/entry min-w-0">
                    <UserAvatar
                      name={authorName || 'SRJUR'}
                      photoUrl={p?.photo_url ?? (authorName ? null : officeLogo)}
                      color={p?.color}
                      className="h-6 w-6 text-[10px] mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm break-words ${e.kind === 'activity' ? 'text-muted-foreground italic' : ''}`}>{e.kind === 'comment' ? <MentionText text={e.text} /> : bonito(e.text, etapas)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 break-words">
                        {authorName ? `${authorName} · ` : 'Sistema · '}{fmtWhen(e.created_at)}
                      </p>
                    </div>
                    {canDelete && (
                      <button
                        onClick={() => deleteComment(e.id)}
                        className="opacity-0 group-hover/entry:opacity-100 transition-opacity p-1 hover:bg-muted rounded shrink-0 h-fit"
                        title="Excluir comentário"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </div>
                )
              })}
              {createdAt && (() => {
                const creator = createdBy ? profilesMap[createdBy] : undefined
                return (
                  <div className="flex gap-2.5 min-w-0">
                    <UserAvatar
                      name={creator?.display_name || 'SRJUR'}
                      photoUrl={creator?.photo_url ?? (creator ? null : officeLogo)}
                      color={creator?.color}
                      className="h-6 w-6 text-[10px] mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground italic">
                        Criado{creator ? ` por ${creator.display_name}` : ''}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{fmtWhen(createdAt)}</p>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </>
      )}
    </div>
  )
}
