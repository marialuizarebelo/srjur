import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AtSign, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { MentionText } from '@/components/MentionTextarea'
import { useProfilesMap } from '@/components/ResponsibleSelect'
import { fetchMentionHistory, markMentionDone, type MentionHistoryItem } from '@/lib/mentions'

function quando(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Tudo que a pessoa recebeu (visto ou não) e tudo que ela mesma mencionou
export function MentionsHistoryDialog({ me, open, onClose, onChanged }: {
  me: string
  open: boolean
  onClose: () => void
  onChanged?: () => void
}) {
  const navigate = useNavigate()
  const profilesMap = useProfilesMap()
  const [aba, setAba] = useState<'recebidas' | 'enviadas'>('recebidas')
  const [received, setReceived] = useState<MentionHistoryItem[]>([])
  const [sent, setSent] = useState<MentionHistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const h = await fetchMentionHistory(me)
    setReceived(h.received); setSent(h.sent); setLoading(false)
  }, [me])

  useEffect(() => { if (open) void load() }, [open, load])

  const nome = (id: string) => profilesMap[id]?.display_name ?? 'Alguém'
  const lista = aba === 'recebidas' ? received : sent
  const pendentes = useMemo(() => received.filter(r => !r.mentions_done.includes(me)).length, [received, me])

  async function visto(m: MentionHistoryItem) {
    if (await markMentionDone(m.id, me)) {
      setReceived(list => list.map(x => x.id === m.id ? { ...x, mentions_done: [...x.mentions_done, me] } : x))
      onChanged?.()
    } else toast.error('Não foi possível marcar como visto')
  }

  const abaBtn = (id: 'recebidas' | 'enviadas', texto: string, n: number) => (
    <button
      type="button"
      onClick={() => setAba(id)}
      className={`flex-1 h-9 rounded-full text-[13px] font-semibold transition-colors ${aba === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {texto} ({n})
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[640px] w-[96vw] max-h-[88vh] overflow-y-auto p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg"><AtSign className="h-4 w-4 text-primary" />Histórico de menções</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-surface)] p-[3px]">
          {abaBtn('recebidas', 'Recebidas', received.length)}
          {abaBtn('enviadas', 'Enviadas', sent.length)}
        </div>
        {aba === 'recebidas' && pendentes > 0 && (
          <p className="text-xs text-muted-foreground">{pendentes} ainda não {pendentes === 1 ? 'foi vista' : 'foram vistas'}.</p>
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {aba === 'recebidas' ? 'Ninguém mencionou você ainda.' : 'Você ainda não mencionou ninguém. Use @ num comentário.'}
          </p>
        ) : (
          <div className="space-y-2 min-w-0">
            {lista.map(m => {
              const visto_ = m.mentions_done.includes(me)
              return (
                <div key={m.id} className="rounded-xl border border-border/60 p-3 min-w-0">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-muted-foreground break-words">
                        {aba === 'recebidas'
                          ? <><span className="font-semibold text-foreground">{m.author ?? 'Alguém'}</span> mencionou você em {m.label.toLowerCase()}</>
                          : <>Você mencionou <span className="font-semibold text-foreground">{m.mentions.map(nome).join(', ')}</span> em {m.label.toLowerCase()}</>}
                        {' · '}{quando(m.created_at)}
                      </p>
                      <p className="text-sm font-medium break-words mt-0.5">{m.title}</p>
                      <p className="text-sm text-muted-foreground break-words mt-0.5 line-clamp-3"><MentionText text={m.text} /></p>
                      {aba === 'enviadas' && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {m.mentions.map(id => (
                            <span key={id} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.mentions_done.includes(id) ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'}`}>
                              {nome(id)} · {m.mentions_done.includes(id) ? 'viu' : 'ainda não viu'}
                            </span>
                          ))}
                        </div>
                      )}
                      {aba === 'recebidas' && (
                        <span className={`inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${visto_ ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'}`}>
                          {visto_ ? 'Visto' : 'Pendente'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => { onClose(); navigate(m.path) }}>Ver</Button>
                      {aba === 'recebidas' && !visto_ && (
                        <Button size="sm" className="h-8" onClick={() => visto(m)}><Check className="h-3.5 w-3.5 mr-1" />Visto</Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
