import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AtSign, Check, History } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MentionText } from '@/components/MentionTextarea'
import { MentionsHistoryDialog } from '@/components/MentionsHistoryDialog'
import { fetchPendingMentions, getMyProfileId, markMentionDone, type PendingMention } from '@/lib/mentions'

function quando(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Painel inicial: o que mencionaram para esta pessoa e ela ainda não viu, com acesso ao histórico completo
// (recebidas e enviadas). Sem pendências, fica só um atalho discreto para o histórico.
export function MentionsCard() {
  const navigate = useNavigate()
  const [me, setMe] = useState<string | null>(null)
  const [items, setItems] = useState<PendingMention[]>([])
  const [historico, setHistorico] = useState(false)

  const load = useCallback(async (profileId: string) => setItems(await fetchPendingMentions(profileId)), [])

  useEffect(() => {
    let vivo = true
    getMyProfileId().then(id => { if (vivo && id) { setMe(id); void load(id) } })
    return () => { vivo = false }
  }, [load])

  async function visto(m: PendingMention) {
    if (!me) return
    setItems(list => list.filter(x => x.id !== m.id))
    const ok = await markMentionDone(m.id, me)
    if (!ok) { toast.error('Não foi possível marcar como visto'); void load(me) }
  }

  if (!me) return null
  const dialogo = <MentionsHistoryDialog me={me} open={historico} onClose={() => setHistorico(false)} onChanged={() => void load(me)} />

  if (items.length === 0) {
    return (
      <div className="flex justify-end -mb-3">
        <button type="button" onClick={() => setHistorico(true)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <AtSign className="h-3.5 w-3.5" />Histórico de menções
        </button>
        {dialogo}
      </div>
    )
  }

  return (
    <Card className="p-4 border-primary/40">
      <div className="flex items-center gap-2 mb-3">
        <AtSign className="h-4 w-4 text-primary" />
        <p className="font-semibold text-sm">Menções para você</p>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">{items.length}</span>
        <button type="button" onClick={() => setHistorico(true)} className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <History className="h-3.5 w-3.5" />Histórico
        </button>
      </div>
      <div className="space-y-2">
        {items.map(m => (
          <div key={m.id} className="flex items-start gap-3 rounded-xl border border-border/60 p-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">{m.author ?? 'Alguém'}</span> mencionou você em {m.label.toLowerCase()} · {quando(m.created_at)}
              </p>
              <p className="text-sm font-medium break-words mt-0.5">{m.title}</p>
              <p className="text-sm text-muted-foreground break-words mt-0.5 line-clamp-3"><MentionText text={m.text} /></p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <Button size="sm" variant="outline" className="h-8" onClick={() => navigate(m.path)}>Ver</Button>
              <Button size="sm" className="h-8" onClick={() => visto(m)} title="Marcar como visto">
                <Check className="h-3.5 w-3.5 mr-1" />Visto
              </Button>
            </div>
          </div>
        ))}
      </div>
      {dialogo}
    </Card>
  )
}
