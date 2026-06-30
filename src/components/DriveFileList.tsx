import { useEffect, useState } from 'react'
import { listDriveFiles, type DriveFile } from '@/lib/googleDrive'
import { FileText, ExternalLink, Loader2, FolderOpen, RefreshCw } from 'lucide-react'

function fmtSize(bytes?: string) {
  if (!bytes) return ''
  const n = parseInt(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function DriveFileList({ folderId }: { folderId: string | null }) {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!folderId) return
    setLoading(true)
    setError(null)
    try {
      const f = await listDriveFiles(folderId)
      setFiles(f)
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar arquivos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [folderId])

  if (!folderId) return (
    <p className="text-xs text-muted-foreground py-3">Nenhuma pasta vinculada ainda.</p>
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Arquivos da pasta</p>
        <button onClick={load} disabled={loading} className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 text-muted-foreground" />}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {!loading && !error && files.length === 0 && (
        <p className="text-xs text-muted-foreground py-3">Pasta vazia.</p>
      )}

      <div className="space-y-1">
        {files.map(f => {
          const isFolder = f.mimeType === 'application/vnd.google-apps.folder'
          return (
            <a key={f.id} href={f.webViewLink} target="_blank" rel="noreferrer"
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/40 transition-colors group">
              {isFolder
                ? <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                : f.iconLink
                  ? <img src={f.iconLink} alt="" className="h-4 w-4 shrink-0" />
                  : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />}
              <span className="text-xs flex-1 truncate">{f.name}</span>
              {f.size && <span className="text-[10px] text-muted-foreground shrink-0">{fmtSize(f.size)}</span>}
              <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </a>
          )
        })}
      </div>
    </div>
  )
}
