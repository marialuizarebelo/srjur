import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Plus, Camera, Share2, Globe, FileText, Calendar,
  Image as ImageIcon, Trash2, LayoutGrid, List, ChevronUp, ChevronDown,
} from 'lucide-react'
import { fmtDate } from '@/lib/format'
import { ResponsibleSelect, ResponsibleAvatars, useProfilesMap } from '@/components/ResponsibleSelect'
import { DriveFolderPicker } from '@/components/DriveFolderPicker'
import { toast } from 'sonner'

interface MarketingItem {
  id: string
  title: string
  platform: string
  content_type: string
  status: string
  scheduled_date: string | null
  scheduled_time: string | null
  caption: string | null
  reference_url: string | null
  drive_folder_id: string | null
  drive_url: string | null
  responsible_ids: string[] | null
  tags: string | null
  notes: string | null
}

const STATUSES = [
  { value: 'ideia', label: 'Ideia', color: '#9CA3AF' },
  { value: 'roteiro', label: 'Roteiro', color: '#F59E0B' },
  { value: 'producao', label: 'Produção', color: '#3B82F6' },
  { value: 'agendado', label: 'Agendado', color: '#8B5CF6' },
  { value: 'publicado', label: 'Publicado', color: '#10B981' },
]

const PLATFORMS = ['Instagram', 'LinkedIn', 'Facebook', 'Site', 'Outro']
const CONTENT_TYPES = ['Post', 'Story', 'Reels', 'Artigo', 'Outro']

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  Instagram: Camera, LinkedIn: Share2, Facebook: Share2, Site: Globe, Outro: FileText,
}

export default function Marketing() {
  const [items, setItems] = useState<MarketingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(new Set())
  const toggleStatusCollapsed = (value: string) => {
    setCollapsedStatuses(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }
  const [platformFilter, setPlatformFilter] = useState('todas')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MarketingItem | null>(null)
  const profilesMap = useProfilesMap()

  const [mf, setMf] = useState({
    title: '', platform: 'Instagram', content_type: 'Post', status: 'ideia',
    scheduled_date: '', scheduled_time: '', caption: '', reference_url: '',
    drive_folder_id: '', drive_url: '', responsible_ids: [] as string[], tags: '', notes: '',
  })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data } = await supabase.from('marketing_content').select('*').order('scheduled_date', { ascending: true, nullsFirst: false })
    setItems((data as MarketingItem[]) ?? [])
    setLoading(false)
  }

  function resetMf() {
    setMf({
      title: '', platform: 'Instagram', content_type: 'Post', status: 'ideia',
      scheduled_date: '', scheduled_time: '', caption: '', reference_url: '',
      drive_folder_id: '', drive_url: '', responsible_ids: [], tags: '', notes: '',
    })
    setEditing(null)
  }

  function openNew() {
    resetMf()
    setDialogOpen(true)
  }

  function openEdit(item: MarketingItem) {
    setMf({
      title: item.title, platform: item.platform, content_type: item.content_type, status: item.status,
      scheduled_date: item.scheduled_date ?? '', scheduled_time: item.scheduled_time ?? '',
      caption: item.caption ?? '', reference_url: item.reference_url ?? '',
      drive_folder_id: item.drive_folder_id ?? '', drive_url: item.drive_url ?? '',
      responsible_ids: item.responsible_ids ?? [], tags: item.tags ?? '', notes: item.notes ?? '',
    })
    setEditing(item)
    setDialogOpen(true)
  }

  async function saveItem() {
    const payload = {
      title: mf.title, platform: mf.platform, content_type: mf.content_type, status: mf.status,
      scheduled_date: mf.scheduled_date || null, scheduled_time: mf.scheduled_time || null,
      caption: mf.caption || null, reference_url: mf.reference_url || null,
      drive_folder_id: mf.drive_folder_id || null, drive_url: mf.drive_url || null,
      responsible_ids: mf.responsible_ids, tags: mf.tags || null, notes: mf.notes || null,
      updated_at: new Date().toISOString(),
    }
    if (editing) await supabase.from('marketing_content').update(payload).eq('id', editing.id)
    else await supabase.from('marketing_content').insert(payload)
    setDialogOpen(false)
    resetMf()
    loadData()
  }

  async function deleteItem(id: string) {
    if (!confirm('Excluir este conteúdo?')) return
    await supabase.from('marketing_content').delete().eq('id', id)
    loadData()
  }

  async function moveStatus(id: string, status: string) {
    await supabase.from('marketing_content').update({ status }).eq('id', id)
    loadData()
  }

  const filtered = useMemo(() => items.filter(i => platformFilter === 'todas' || i.platform === platformFilter), [items, platformFilter])

  const byStatus = useMemo(() => {
    const map = new Map<string, MarketingItem[]>()
    STATUSES.forEach(s => map.set(s.value, []))
    filtered.forEach(i => { const arr = map.get(i.status) ?? []; arr.push(i); map.set(i.status, arr) })
    return map
  }, [filtered])

  function PlatformBadge({ platform }: { platform: string }) {
    const Icon = PLATFORM_ICONS[platform] ?? FileText
    return (
      <Badge variant="outline" className="text-[9px] gap-1">
        <Icon className="h-2.5 w-2.5" />{platform}
      </Badge>
    )
  }

  function ContentCard({ item }: { item: MarketingItem }) {
    const statusIdx = STATUSES.findIndex(s => s.value === item.status)
    const nextStatus = statusIdx < STATUSES.length - 1 ? STATUSES[statusIdx + 1] : null
    return (
      <div className="p-3 rounded-lg border bg-background hover:shadow-md transition-shadow cursor-pointer" onClick={() => openEdit(item)}>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-sm font-medium truncate flex-1">{item.title}</p>
          <ResponsibleAvatars ids={item.responsible_ids} profilesMap={profilesMap} size="xs" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
          <PlatformBadge platform={item.platform} />
          <Badge variant="secondary" className="text-[9px]">{item.content_type}</Badge>
        </div>
        {item.scheduled_date && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Calendar className="h-2.5 w-2.5" />
            {fmtDate(item.scheduled_date)}{item.scheduled_time ? ` às ${item.scheduled_time.slice(0,5)}` : ''}
          </p>
        )}
        {item.drive_folder_id && (
          <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-1">
            <ImageIcon className="h-2.5 w-2.5" />Tem arte vinculada
          </p>
        )}
        {nextStatus && (
          <Button variant="ghost" size="sm" className="w-full mt-2 h-6 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={e => { e.stopPropagation(); moveStatus(item.id, nextStatus.value) }}>
            Avançar → {nextStatus.label}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Marketing</h1>
          <p className="text-sm text-muted-foreground">{items.length} conteúdo(s) no calendário editorial</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted/40 rounded-xl p-0.5">
            <button onClick={() => setViewMode('kanban')} className={`h-8 w-8 rounded-lg flex items-center justify-center ${viewMode === 'kanban' ? 'bg-background shadow-sm' : ''}`}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setViewMode('list')} className={`h-8 w-8 rounded-lg flex items-center justify-center ${viewMode === 'list' ? 'bg-background shadow-sm' : ''}`}>
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1.5" />Novo conteúdo</Button>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <button onClick={() => setPlatformFilter('todas')}
          className={`h-7 px-3 rounded-full text-xs font-medium border transition-all ${platformFilter === 'todas' ? 'bg-foreground text-background border-foreground' : 'border-border/60 text-muted-foreground'}`}>
          Todas
        </button>
        {PLATFORMS.map(p => (
          <button key={p} onClick={() => setPlatformFilter(p)}
            className={`h-7 px-3 rounded-full text-xs font-medium border transition-all ${platformFilter === p ? 'bg-foreground text-background border-foreground' : 'border-border/60 text-muted-foreground'}`}>
            {p}
          </button>
        ))}
      </div>

      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {STATUSES.map(s => {
            const collapsed = collapsedStatuses.has(s.value)
            return (
              <div key={s.value} className="space-y-2">
                <button className="flex items-center gap-2 px-1 w-full md:cursor-default" onClick={() => toggleStatusCollapsed(s.value)}>
                  <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-xs font-semibold">{s.label}</span>
                  <Badge variant="secondary" className="text-[9px] ml-auto">{byStatus.get(s.value)?.length ?? 0}</Badge>
                  {collapsed ? <ChevronDown className="h-3.5 w-3.5 md:hidden" /> : <ChevronUp className="h-3.5 w-3.5 md:hidden" />}
                </button>
                {!collapsed && (
                  <div className="space-y-2 min-h-[80px] rounded-xl bg-muted/20 p-2">
                    {(byStatus.get(s.value) ?? []).map(item => <ContentCard key={item.id} item={item} />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const statusInfo = STATUSES.find(s => s.value === item.status)
            return (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => openEdit(item)}>
                <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: statusInfo?.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <PlatformBadge platform={item.platform} />
                    <Badge variant="secondary" className="text-[9px]">{item.content_type}</Badge>
                    <span className="text-[10px] text-muted-foreground">{statusInfo?.label}</span>
                  </div>
                </div>
                {item.scheduled_date && (
                  <span className="text-xs text-muted-foreground shrink-0">{fmtDate(item.scheduled_date)}</span>
                )}
                <ResponsibleAvatars ids={item.responsible_ids} profilesMap={profilesMap} />
                <button onClick={e => { e.stopPropagation(); deleteItem(item.id) }} className="p-1 hover:bg-muted rounded shrink-0">
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                </button>
              </div>
            )
          })}
          {filtered.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground text-center py-12">Nenhum conteúdo encontrado</p>
          )}
        </div>
      )}

      {/* ── Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) resetMf() }}>
        <DialogContent className="max-w-[640px] w-[96vw] max-h-[90vh] overflow-y-auto p-7">
          <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Novo'} conteúdo</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Título / tema</Label>
              <Input value={mf.title} onChange={e => setMf(f => ({ ...f, title: e.target.value }))} className="h-10"
                placeholder="Ex: Post sobre prazo do Imposto de Renda" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Plataforma</Label>
                <Select value={mf.platform} onValueChange={v => setMf(f => ({ ...f, platform: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{mf.platform}</SelectValue></SelectTrigger>
                  <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Formato</Label>
                <Select value={mf.content_type} onValueChange={v => setMf(f => ({ ...f, content_type: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{mf.content_type}</SelectValue></SelectTrigger>
                  <SelectContent>{CONTENT_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={mf.status} onValueChange={v => setMf(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{STATUSES.find(s => s.value === mf.status)?.label}</SelectValue></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data agendada</Label>
                <Input type="date" value={mf.scheduled_date} onChange={e => setMf(f => ({ ...f, scheduled_date: e.target.value }))} className="h-10" />
                <p className="text-[10px] text-muted-foreground">Aparece automaticamente no Calendário quando preenchida</p>
              </div>
              <div className="space-y-1.5">
                <Label>Horário (opcional)</Label>
                <Input type="time" value={mf.scheduled_time} onChange={e => setMf(f => ({ ...f, scheduled_time: e.target.value }))} className="h-10" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Responsável (pode selecionar mais de um)</Label>
              <ResponsibleSelect value={mf.responsible_ids} onChange={ids => setMf(f => ({ ...f, responsible_ids: ids }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Legenda / roteiro</Label>
              <Textarea value={mf.caption} onChange={e => setMf(f => ({ ...f, caption: e.target.value }))} rows={4}
                placeholder="Escreva aqui a legenda, copy ou roteiro do conteúdo..." />
            </div>

            <div className="space-y-1.5">
              <Label>Link de referência (opcional)</Label>
              <Input value={mf.reference_url} onChange={e => setMf(f => ({ ...f, reference_url: e.target.value }))}
                placeholder="https://..." className="h-10" />
            </div>

            <div className="space-y-1.5">
              <Label>Pasta de artes/arquivos (Drive)</Label>
              <DriveFolderPicker
                value={{ folder_id: mf.drive_folder_id, drive_url: mf.drive_url }}
                onChange={f => setMf(prev => ({ ...prev, drive_folder_id: f.folder_id, drive_url: f.drive_url }))}
                folderNameSuggestion={mf.title}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={mf.tags} onChange={e => setMf(f => ({ ...f, tags: e.target.value }))} placeholder="direito de família, dica" className="h-10" />
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={mf.notes} onChange={e => setMf(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter className="pt-4">
            {editing && <Button variant="destructive" className="mr-auto" onClick={() => { deleteItem(editing.id); setDialogOpen(false) }}>Excluir</Button>}
            <DialogClose asChild><Button variant="outline" size="lg">Cancelar</Button></DialogClose>
            <Button size="lg" onClick={saveItem} disabled={!mf.title}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
