import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getDriveAccessToken, createDriveFolder, listDriveFiles, type DriveFolder } from '@/lib/googleDrive'
import { FolderOpen, FolderPlus, Loader2, ExternalLink, X } from 'lucide-react'
import { toast } from 'sonner'

const PICKER_API_KEY = import.meta.env.VITE_GOOGLE_PICKER_API_KEY as string | undefined

declare global {
  interface Window { gapi: any; google: any }
}

let gapiLoaded = false
function loadGapi(): Promise<void> {
  return new Promise(resolve => {
    if (gapiLoaded && window.gapi?.picker) return resolve()
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.onload = () => {
      window.gapi.load('picker', () => { gapiLoaded = true; resolve() })
    }
    document.body.appendChild(script)
  })
}

interface DriveFolderPickerProps {
  value: { folder_id: string | null; drive_url: string | null }
  onChange: (folder: { folder_id: string; drive_url: string; name?: string }) => void
  folderNameSuggestion?: string
  parentFolderId?: string | null
  /** Quando definido, o nome sugerido vira "NN. <label>" com NN numerado
   * automaticamente conforme as pastas já existentes dentro de parentFolderId
   * (ex: "01. MEDIDA PROTETIVA - 5158257-68.2026.8.21.0001"). */
  autoNumberLabel?: string
  /** Cor da pasta ao criar (paleta oficial do Drive, ex: DRIVE_COLOR_RED) */
  createColor?: string
}

export function DriveFolderPicker({ value, onChange, folderNameSuggestion, parentFolderId, autoNumberLabel, createColor }: DriveFolderPickerProps) {
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [namingLoading, setNamingLoading] = useState(false)
  const [newFolderName, setNewFolderName] = useState(folderNameSuggestion ?? '')
  const [showCreate, setShowCreate] = useState(false)

  async function toggleCreate() {
    const opening = !showCreate
    setShowCreate(opening)
    if (!opening) return

    if (autoNumberLabel && parentFolderId) {
      setNamingLoading(true)
      try {
        const files = await listDriveFiles(parentFolderId)
        const folderCount = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').length
        const nextNum = String(folderCount + 1).padStart(2, '0')
        setNewFolderName(`${nextNum}. ${autoNumberLabel}`)
      } catch {
        setNewFolderName(autoNumberLabel)
      } finally {
        setNamingLoading(false)
      }
    } else if (folderNameSuggestion) {
      setNewFolderName(folderNameSuggestion)
    }
  }

  async function openPicker() {
    if (!PICKER_API_KEY) {
      toast.error('Chave do Google Picker não configurada (VITE_GOOGLE_PICKER_API_KEY)')
      return
    }
    setLoading(true)
    try {
      await loadGapi()
      const token = await getDriveAccessToken()

      const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMimeTypes('application/vnd.google-apps.folder')
      if (parentFolderId) view.setParent(parentFolderId)

      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(PICKER_API_KEY)
        .setCallback((data: any) => {
          if (data.action === window.google.picker.Action.PICKED) {
            const doc = data.docs[0]
            onChange({ folder_id: doc.id, drive_url: doc.url, name: doc.name })
            toast.success(`Pasta "${doc.name}" vinculada!`)
          }
        })
        .build()
      picker.setVisible(true)
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao abrir seletor do Drive')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newFolderName.trim()) return
    setCreating(true)
    try {
      const folder: DriveFolder = await createDriveFolder(newFolderName, parentFolderId, createColor)
      onChange({ folder_id: folder.id, drive_url: folder.url, name: folder.name })
      toast.success(`Pasta "${folder.name}" criada e vinculada!`)
      setShowCreate(false)
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao criar pasta')
    } finally {
      setCreating(false)
    }
  }

  if (value.folder_id && value.drive_url) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
        <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
        <a href={value.drive_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex-1 truncate flex items-center gap-1">
          Abrir pasta no Drive <ExternalLink className="h-3 w-3" />
        </a>
        <button type="button" onClick={() => onChange({ folder_id: '', drive_url: '' })} className="p-1 hover:bg-muted rounded">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={openPicker} disabled={loading} className="flex-1">
          {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5 mr-1.5" />}
          Selecionar pasta existente
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={toggleCreate} className="flex-1">
          <FolderPlus className="h-3.5 w-3.5 mr-1.5" />Criar nova pasta
        </Button>
      </div>
      {showCreate && (
        <div className="flex gap-2">
          <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
            placeholder={namingLoading ? 'Calculando numeração...' : 'Nome da pasta'}
            disabled={namingLoading} className="h-9 text-xs" />
          <Button type="button" size="sm" onClick={handleCreate} disabled={creating || namingLoading || !newFolderName.trim()}>
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Criar'}
          </Button>
        </div>
      )}
    </div>
  )
}
