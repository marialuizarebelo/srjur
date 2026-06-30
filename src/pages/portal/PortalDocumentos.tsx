import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { FileText, ExternalLink, FolderOpen } from 'lucide-react'
import { fmtDate } from '@/lib/format'

interface Doc { id: string; title: string; drive_url: string; type: string | null; created_at: string }

export default function PortalDocumentos() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('documents').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      setDocs((data as Doc[]) ?? [])
      setLoading(false)
    })
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Documentos</h1>
        <p className="text-sm text-muted-foreground">Arquivos compartilhados pelo escritório</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {docs.map(d => (
          <a key={d.id} href={d.drive_url} target="_blank" rel="noreferrer"
            className="rounded-2xl border border-border/60 bg-card shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{d.title}</p>
              <p className="text-[11px] text-muted-foreground">{d.type ?? 'Documento'} · {fmtDate(d.created_at)}</p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </a>
        ))}
      </div>

      {docs.length === 0 && !loading && (
        <div className="py-16 text-center text-muted-foreground">
          <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum documento compartilhado ainda</p>
        </div>
      )}
    </div>
  )
}
