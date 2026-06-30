import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { MessageSquare } from 'lucide-react'
import { fmtDate } from '@/lib/format'

interface Message { id: string; title: string; body: string; sent_by: string | null; read_at: string | null; created_at: string }

export default function PortalComunicados() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('portal_messages').select('*').order('created_at', { ascending: false })
    setMessages((data as Message[]) ?? [])
    setLoading(false)
    // Marca todas como lidas ao visualizar
    const unreadIds = (data ?? []).filter((m: any) => !m.read_at).map((m: any) => m.id)
    if (unreadIds.length > 0) {
      await supabase.from('portal_messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Comunicados</h1>
        <p className="text-sm text-muted-foreground">Mensagens enviadas pelo escritório</p>
      </div>

      <div className="space-y-3">
        {messages.map(m => (
          <div key={m.id} className={`rounded-2xl border bg-card shadow-sm p-5 ${!m.read_at ? 'border-primary/40' : 'border-border/60'}`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-sm font-semibold">{m.title}</p>
              <span className="text-[11px] text-muted-foreground shrink-0">{fmtDate(m.created_at)}</span>
            </div>
            <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{m.body}</p>
            {m.sent_by && <p className="text-[10px] text-muted-foreground mt-3">— {m.sent_by}</p>}
          </div>
        ))}
      </div>

      {messages.length === 0 && !loading && (
        <div className="py-16 text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum comunicado recebido ainda</p>
        </div>
      )}
    </div>
  )
}
