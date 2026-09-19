import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { DollarSign, Target, Plus, Pencil, Trash2, Trophy, NotebookText } from 'lucide-react'
import { fmtBRL, fmtDate } from '@/lib/format'
import { getAdminProfiles, type ProfileOption } from '@/components/ResponsibleSelect'
import { toast } from 'sonner'
import { MONTHS, ChartCard } from './shared'
import { useFinanceRows } from './Financeiro'

const CATEGORIES_RECEITA = ['Honorários Iniciais', 'Mensalidade', 'Acordo', 'Consultoria', 'Êxito', 'Outros']
const CATEGORIES_DESPESA = ['Operacional', 'Pessoal', 'Pró-labore/Salário', 'Impostos', 'Software', 'Marketing', 'Aluguel', 'Outros']

interface Meta {
  id: string; area: 'financeiro' | 'comercial'; tipo: string; label: string; valor_alvo: number
  periodo: 'mensal' | 'semestral' | 'anual'; ano: number; mes: number | null; semestre: number | null
  categoria: string | null; origem: string | null; prioridade: 'baixa' | 'media' | 'alta'
  observacoes: string | null; responsavel_id: string | null
}
type TipoMeta = { value: string; label: string; unit: 'BRL' | 'number' | 'percent'; direction: 'min' | 'max'; extraField?: 'categoria' | 'origem' }
const TIPO_OPTIONS: Record<'financeiro' | 'comercial', TipoMeta[]> = {
  financeiro: [
    { value: 'receita_minima', label: 'Meta de receita', unit: 'BRL', direction: 'min', extraField: 'categoria' },
    { value: 'despesa_maxima', label: 'Teto de despesa', unit: 'BRL', direction: 'max', extraField: 'categoria' },
    { value: 'saldo_minimo', label: 'Saldo mínimo', unit: 'BRL', direction: 'min' },
  ],
  comercial: [
    { value: 'novos_leads', label: 'Novos leads', unit: 'number', direction: 'min', extraField: 'origem' },
    { value: 'novos_clientes', label: 'Novos clientes', unit: 'number', direction: 'min' },
    { value: 'taxa_conversao', label: 'Taxa de conversão', unit: 'percent', direction: 'min' },
  ],
}
const PERIODO_LABELS: Record<Meta['periodo'], string> = { mensal: 'Mensal', semestral: 'Semestral', anual: 'Anual' }
const PRIORIDADE_LABELS: Record<Meta['prioridade'], string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' }
const PRIORIDADE_COLOR: Record<Meta['prioridade'], string> = { baixa: '#94a3b8', media: '#3B82F6', alta: '#ef4444' }

function metaPeriodRange(m: Meta) {
  if (m.periodo === 'mensal' && m.mes) {
    const start = `${m.ano}-${String(m.mes).padStart(2, '0')}-01`
    const end = new Date(m.ano, m.mes, 0).toISOString().slice(0, 10)
    return { start, end }
  }
  if (m.periodo === 'semestral' && m.semestre) {
    const startMonth = m.semestre === 1 ? 1 : 7
    const endMonth = m.semestre === 1 ? 6 : 12
    return { start: `${m.ano}-${String(startMonth).padStart(2, '0')}-01`, end: new Date(m.ano, endMonth, 0).toISOString().slice(0, 10) }
  }
  return { start: `${m.ano}-01-01`, end: `${m.ano}-12-31` }
}
function metaPeriodLabel(m: Meta) {
  if (m.periodo === 'mensal' && m.mes) return `${MONTHS[m.mes - 1]}/${m.ano}`
  if (m.periodo === 'semestral' && m.semestre) return `${m.semestre}º semestre/${m.ano}`
  return `${m.ano}`
}
function formatByUnit(v: number, unit: TipoMeta['unit']) {
  if (unit === 'BRL') return fmtBRL(v)
  if (unit === 'percent') return `${v.toFixed(0)}%`
  return String(Math.round(v))
}
function metaStatus(m: Meta, tipo: TipoMeta, atingido: number) {
  const { start, end } = metaPeriodRange(m)
  const today = new Date().toISOString().slice(0, 10)
  const achieved = tipo.direction === 'min' ? atingido >= m.valor_alvo : atingido <= m.valor_alvo
  if (achieved) return { label: 'Atingida', color: '#22c55e' }
  if (end < today) return { label: 'Não atingida', color: '#ef4444' }
  const totalDays = Math.max(1, (new Date(end).getTime() - new Date(start).getTime()) / 86400000)
  const elapsedDays = Math.max(0, (new Date(today).getTime() - new Date(start).getTime()) / 86400000)
  const elapsedPct = Math.min(1, elapsedDays / totalDays)
  const progressPct = tipo.direction === 'min' ? atingido / m.valor_alvo : 1 - (m.valor_alvo > 0 ? atingido / m.valor_alvo : 0)
  if (progressPct < elapsedPct * 0.7) return { label: 'Em risco', color: '#F59E0B' }
  return { label: 'No caminho', color: '#3B82F6' }
}
function daysRemaining(m: Meta): number | null {
  const { end } = metaPeriodRange(m)
  const today = new Date().toISOString().slice(0, 10)
  if (end < today) return null
  return Math.ceil((new Date(end).getTime() - new Date(today).getTime()) / 86400000)
}

/* ---------- Form ---------- */
function MetaFormDialog({ open, onClose, area, editing, onSaved, profiles }: {
  open: boolean; onClose: () => void; area: 'financeiro' | 'comercial'; editing: Meta | null; onSaved: () => void
  profiles: ProfileOption[]
}) {
  const opts = TIPO_OPTIONS[area]
  const empty = {
    label: '', tipo: opts[0].value, valor_alvo: '', periodo: 'mensal' as Meta['periodo'],
    ano: new Date().getFullYear(), mes: new Date().getMonth() + 1, semestre: 1,
    categoria: '', origem: '', prioridade: 'media' as Meta['prioridade'], observacoes: '', responsavel_id: '',
  }
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editing) {
      setForm({
        label: editing.label, tipo: editing.tipo, valor_alvo: String(editing.valor_alvo),
        periodo: editing.periodo, ano: editing.ano, mes: editing.mes ?? new Date().getMonth() + 1, semestre: editing.semestre ?? 1,
        categoria: editing.categoria ?? '', origem: editing.origem ?? '', prioridade: editing.prioridade ?? 'media',
        observacoes: editing.observacoes ?? '', responsavel_id: editing.responsavel_id ?? '',
      })
    } else {
      setForm({ ...empty, tipo: opts[0].value })
    }
  }, [editing, open])

  const selectedTipo = opts.find(o => o.value === form.tipo)!
  const categoriaOptions = selectedTipo.value === 'receita_minima' ? CATEGORIES_RECEITA : selectedTipo.value === 'despesa_maxima' ? CATEGORIES_DESPESA : []

  async function save() {
    if (!form.label.trim() || !form.valor_alvo) { toast.error('Preencha nome e valor da meta'); return }
    setSaving(true)
    const payload = {
      area, tipo: form.tipo, label: form.label.trim(), valor_alvo: Number(form.valor_alvo),
      periodo: form.periodo, ano: form.ano,
      mes: form.periodo === 'mensal' ? form.mes : null,
      semestre: form.periodo === 'semestral' ? form.semestre : null,
      categoria: selectedTipo.extraField === 'categoria' && form.categoria ? form.categoria : null,
      origem: selectedTipo.extraField === 'origem' && form.origem ? form.origem : null,
      prioridade: form.prioridade,
      observacoes: form.observacoes.trim() || null,
      responsavel_id: form.responsavel_id || null,
    }
    if (editing) {
      const { error } = await supabase.from('metas').update(payload).eq('id', editing.id)
      setSaving(false)
      if (error) { toast.error('Erro ao salvar meta: ' + error.message); return }
      await supabase.from('meta_notas').insert({ meta_id: editing.id, texto: 'Meta editada.' })
      toast.success('Meta atualizada!')
    } else {
      const { data: novaMeta, error } = await supabase.from('metas').insert(payload).select().single()
      setSaving(false)
      if (error) { toast.error('Erro ao salvar meta: ' + error.message); return }
      if (novaMeta) await supabase.from('meta_notas').insert({ meta_id: novaMeta.id, texto: 'Meta criada.' })
      toast.success('Meta criada!')
    }
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Nova'} meta {area === 'financeiro' ? 'financeira' : 'comercial'}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label>Nome da meta</Label>
            <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex: Meta de receita do trimestre" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => v && setForm(f => ({ ...f, tipo: v, categoria: '', origem: '' }))}>
                <SelectTrigger className="h-10"><SelectValue>{selectedTipo.label}</SelectValue></SelectTrigger>
                <SelectContent>{opts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor alvo{selectedTipo.unit === 'percent' ? ' (%)' : ''}</Label>
              <Input type="number" value={form.valor_alvo} onChange={e => setForm(f => ({ ...f, valor_alvo: e.target.value }))}
                placeholder={selectedTipo.unit === 'BRL' ? 'Ex: 15000' : 'Ex: 10'} />
            </div>
          </div>

          {selectedTipo.extraField === 'categoria' && (
            <div className="space-y-1.5">
              <Label>Categoria (opcional — deixe vazio para todas)</Label>
              <Select value={form.categoria || '__todas__'} onValueChange={v => setForm(f => ({ ...f, categoria: v === '__todas__' ? '' : (v ?? '') }))}>
                <SelectTrigger className="h-10"><SelectValue>{form.categoria || 'Todas as categorias'}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas__">Todas as categorias</SelectItem>
                  {categoriaOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {selectedTipo.extraField === 'origem' && (
            <div className="space-y-1.5">
              <Label>Origem do lead (opcional — deixe vazio para todas)</Label>
              <Input value={form.origem} onChange={e => setForm(f => ({ ...f, origem: e.target.value }))} placeholder="Ex: Instagram, Google, Indicação..." />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Período</Label>
              <Select value={form.periodo} onValueChange={v => v && setForm(f => ({ ...f, periodo: v as Meta['periodo'] }))}>
                <SelectTrigger className="h-10"><SelectValue>{PERIODO_LABELS[form.periodo]}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="semestral">Semestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.periodo === 'mensal' && (
              <div className="space-y-1.5">
                <Label>Mês</Label>
                <Select value={String(form.mes)} onValueChange={v => v && setForm(f => ({ ...f, mes: Number(v) }))}>
                  <SelectTrigger className="h-10"><SelectValue>{MONTHS[form.mes - 1]}</SelectValue></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {form.periodo === 'semestral' && (
              <div className="space-y-1.5">
                <Label>Semestre</Label>
                <Select value={String(form.semestre)} onValueChange={v => v && setForm(f => ({ ...f, semestre: Number(v) }))}>
                  <SelectTrigger className="h-10"><SelectValue>{form.semestre}º semestre</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1º semestre</SelectItem>
                    <SelectItem value="2">2º semestre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Input type="number" value={form.ano} onChange={e => setForm(f => ({ ...f, ano: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsável (opcional)</Label>
              <Select value={form.responsavel_id || '__nenhum__'} onValueChange={v => setForm(f => ({ ...f, responsavel_id: v === '__nenhum__' ? '' : (v ?? '') }))}>
                <SelectTrigger className="h-10"><SelectValue>{profiles.find(p => p.id === form.responsavel_id)?.display_name ?? 'Sem responsável definido'}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">Sem responsável definido</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={form.prioridade} onValueChange={v => v && setForm(f => ({ ...f, prioridade: v as Meta['prioridade'] }))}>
                <SelectTrigger className="h-10"><SelectValue>{PRIORIDADE_LABELS[form.prioridade]}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observações (opcional)</Label>
            <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2}
              placeholder="Contexto, motivo da meta, o que está sendo feito pra alcançar..." />
          </div>
        </div>
        <DialogFooter className="pt-3">
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar meta'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- Card ---------- */
function MetaCard({ m, tipo, atingido, profiles, onEdit, onDelete, onDetails }: {
  m: Meta; tipo: TipoMeta; atingido: number; profiles: ProfileOption[]
  onEdit: () => void; onDelete: () => void; onDetails: () => void
}) {
  const pct = m.valor_alvo > 0 ? Math.min(100, (atingido / m.valor_alvo) * 100) : 0
  const status = metaStatus(m, tipo, atingido)
  const restam = daysRemaining(m)
  const responsavel = profiles.find(p => p.id === m.responsavel_id)
  return (
    <Card className="p-4 space-y-3 border-l-4 group" style={{ borderLeftColor: status.color }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{m.label}</p>
          <p className="text-[11px] text-muted-foreground">{tipo.label}{m.categoria ? ` · ${m.categoria}` : ''}{m.origem ? ` · ${m.origem}` : ''} · {metaPeriodLabel(m)}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onDetails} className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center" title="Diário e ações"><NotebookText className="h-3 w-3 text-muted-foreground" /></button>
          <button onClick={onEdit} className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
          <button onClick={onDelete} className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center"><Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-500" /></button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold" style={{ color: status.color }}>{formatByUnit(atingido, tipo.unit)}</span>
        <span className="text-xs text-muted-foreground">/ {formatByUnit(m.valor_alvo, tipo.unit)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: status.color }} />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="inline-flex items-center rounded-full text-[10px] px-2 py-0.5 font-medium" style={{ backgroundColor: status.color + '1a', color: status.color }}>
          {status.label}
        </span>
        <span className="inline-flex items-center rounded-full text-[10px] px-2 py-0.5 font-medium" style={{ backgroundColor: PRIORIDADE_COLOR[m.prioridade] + '1a', color: PRIORIDADE_COLOR[m.prioridade] }}>
          Prioridade {PRIORIDADE_LABELS[m.prioridade].toLowerCase()}
        </span>
        {restam !== null && <span className="text-[10px] text-muted-foreground">{restam === 0 ? 'termina hoje' : `${restam}d restantes`}</span>}
      </div>
      {responsavel && <p className="text-[11px] text-muted-foreground">Responsável: {responsavel.display_name}</p>}
      {m.observacoes && <p className="text-[11px] text-muted-foreground italic">"{m.observacoes}"</p>}
    </Card>
  )
}

/* ---------- Diário + ações da meta ---------- */
interface MetaNota { id: string; texto: string; created_at: string }
interface MetaAcao { id: string; texto: string; concluida: boolean; created_at: string }

function MetaDetalhesDialog({ open, onClose, meta }: { open: boolean; onClose: () => void; meta: Meta | null }) {
  const [notas, setNotas] = useState<MetaNota[]>([])
  const [acoes, setAcoes] = useState<MetaAcao[]>([])
  const [novaNota, setNovaNota] = useState('')
  const [novaAcao, setNovaAcao] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!meta) return
    setLoading(true)
    const [{ data: n }, { data: a }] = await Promise.all([
      supabase.from('meta_notas').select('*').eq('meta_id', meta.id).order('created_at', { ascending: false }),
      supabase.from('meta_acoes').select('*').eq('meta_id', meta.id).order('created_at'),
    ])
    setNotas((n as MetaNota[]) ?? [])
    setAcoes((a as MetaAcao[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { if (open && meta) load() }, [open, meta?.id])

  async function addNota() {
    if (!novaNota.trim() || !meta) return
    await supabase.from('meta_notas').insert({ meta_id: meta.id, texto: novaNota.trim() })
    setNovaNota('')
    load()
  }
  async function addAcao() {
    if (!novaAcao.trim() || !meta) return
    await supabase.from('meta_acoes').insert({ meta_id: meta.id, texto: novaAcao.trim() })
    setNovaAcao('')
    load()
  }
  async function toggleAcao(a: MetaAcao) {
    await supabase.from('meta_acoes').update({ concluida: !a.concluida }).eq('id', a.id)
    load()
  }
  async function removeAcao(id: string) { await supabase.from('meta_acoes').delete().eq('id', id); load() }
  async function removeNota(id: string) { await supabase.from('meta_notas').delete().eq('id', id); load() }

  if (!meta) return null
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{meta.label}</DialogTitle></DialogHeader>
        {loading ? <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p> : (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label className="text-xs">Ações para alcançar a meta</Label>
              <div className="flex gap-2">
                <Input value={novaAcao} onChange={e => setNovaAcao(e.target.value)} placeholder="Ex: enviar 15 propostas"
                  className="h-8 text-xs" onKeyDown={e => e.key === 'Enter' && addAcao()} />
                <Button size="sm" className="h-8 text-xs shrink-0" onClick={addAcao}>Adicionar</Button>
              </div>
              <div className="space-y-1">
                {acoes.map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-xs rounded-lg border px-2.5 py-1.5 group">
                    <input type="checkbox" checked={a.concluida} onChange={() => toggleAcao(a)} className="h-3.5 w-3.5 accent-primary shrink-0" />
                    <span className={`flex-1 ${a.concluida ? 'line-through text-muted-foreground' : ''}`}>{a.texto}</span>
                    <button onClick={() => removeAcao(a.id)} className="opacity-0 group-hover:opacity-100 shrink-0"><Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-500" /></button>
                  </div>
                ))}
                {acoes.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma ação cadastrada ainda.</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Diário da meta</Label>
              <div className="flex gap-2">
                <Input value={novaNota} onChange={e => setNovaNota(e.target.value)} placeholder="Ex: nova parceria comercial iniciada"
                  className="h-8 text-xs" onKeyDown={e => e.key === 'Enter' && addNota()} />
                <Button size="sm" className="h-8 text-xs shrink-0" onClick={addNota}>Registrar</Button>
              </div>
              <div className="space-y-1">
                {notas.map(n => (
                  <div key={n.id} className="flex items-center justify-between gap-2 text-xs rounded-lg border px-2.5 py-1.5 group">
                    <span><strong>{fmtDate(n.created_at)}</strong> — {n.texto}</span>
                    <button onClick={() => removeNota(n.id)} className="opacity-0 group-hover:opacity-100 shrink-0"><Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-500" /></button>
                  </div>
                ))}
                {notas.length === 0 && <p className="text-xs text-muted-foreground">Nenhum registro ainda.</p>}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ---------- Section ---------- */
function MetasSection({ area, icon, metas, profiles, computeAtingido, onChanged }: {
  area: 'financeiro' | 'comercial'; icon: React.ElementType; metas: Meta[]; profiles: ProfileOption[]
  computeAtingido: (m: Meta) => number; onChanged: () => void
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Meta | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsMeta, setDetailsMeta] = useState<Meta | null>(null)

  async function remove(id: string) {
    if (!confirm('Excluir esta meta?')) return
    await supabase.from('metas').delete().eq('id', id)
    onChanged()
  }

  return (
    <ChartCard title={area === 'financeiro' ? 'Metas financeiras' : 'Metas comerciais'} icon={icon} extra={
      <Button size="sm" variant="outline" onClick={() => { setEditing(null); setFormOpen(true) }}>
        <Plus className="h-3.5 w-3.5 mr-1" />Nova meta
      </Button>
    }>
      {metas.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma meta {area === 'financeiro' ? 'financeira' : 'comercial'} cadastrada ainda</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {metas.map(m => {
            const tipo = TIPO_OPTIONS[area].find(o => o.value === m.tipo)!
            return (
              <MetaCard key={m.id} m={m} tipo={tipo} atingido={computeAtingido(m)} profiles={profiles}
                onEdit={() => { setEditing(m); setFormOpen(true) }} onDelete={() => remove(m.id)}
                onDetails={() => { setDetailsMeta(m); setDetailsOpen(true) }} />
            )
          })}
        </div>
      )}
      <MetaFormDialog open={formOpen} onClose={() => setFormOpen(false)} area={area} editing={editing} onSaved={onChanged} profiles={profiles} />
      <MetaDetalhesDialog open={detailsOpen} onClose={() => setDetailsOpen(false)} meta={detailsMeta} />
    </ChartCard>
  )
}

/* ---------- Main ---------- */
interface LeadLite { status: string; created_at: string; client_id: string | null; source: string | null }
interface ClientLite { created_at: string }

export default function MetasTab() {
  const { rows: financeRows, loading: loadingFinance } = useFinanceRows()
  const [leads, setLeads] = useState<LeadLite[]>([])
  const [clients, setClients] = useState<ClientLite[]>([])
  const [metas, setMetas] = useState<Meta[]>([])
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [{ data: l }, { data: c }, { data: m }, profs] = await Promise.all([
      supabase.from('leads').select('status, created_at, client_id, source'),
      supabase.from('clients').select('created_at'),
      supabase.from('metas').select('*').order('created_at', { ascending: false }),
      getAdminProfiles(),
    ])
    setLeads((l as LeadLite[]) ?? [])
    setClients((c as ClientLite[]) ?? [])
    setMetas((m as Meta[]) ?? [])
    setProfiles(profs)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const saldoTotal = financeRows.reduce((s, r) => {
    if (!r.paid || r.impacts_cash === false) return s
    return s + (r.type === 'receita' ? Number(r.value) : -Number(r.value))
  }, 0)

  function computeAtingidoFinanceiro(m: Meta): number {
    const { start, end } = metaPeriodRange(m)
    if (m.tipo === 'saldo_minimo') return saldoTotal
    const inRange = financeRows.filter(r => r.date >= start && r.date <= end && (!m.categoria || r.category === m.categoria))
    if (m.tipo === 'receita_minima') return inRange.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0)
    if (m.tipo === 'despesa_maxima') return inRange.filter(r => r.type === 'despesa' && r.impacts_cash !== false).reduce((s, r) => s + Number(r.value), 0)
    return 0
  }
  function computeAtingidoComercial(m: Meta): number {
    const { start, end } = metaPeriodRange(m)
    const inRange = leads.filter(l => l.created_at >= start && l.created_at <= end + 'T23:59:59' && (!m.origem || (l.source ?? '') === m.origem))
    if (m.tipo === 'novos_leads') return inRange.length
    if (m.tipo === 'novos_clientes') return clients.filter(c => c.created_at >= start && c.created_at <= end + 'T23:59:59').length
    if (m.tipo === 'taxa_conversao') {
      const conv = inRange.filter(l => l.status === 'convertido' || l.client_id).length
      return inRange.length > 0 ? (conv / inRange.length) * 100 : 0
    }
    return 0
  }

  const metasFinanceiro = metas.filter(m => m.area === 'financeiro')
  const metasComercial = metas.filter(m => m.area === 'comercial')

  const today = new Date().toISOString().slice(0, 10)
  const activeMetas = metas.filter(m => { const { start, end } = metaPeriodRange(m); return start <= today && today <= end })
  const activeAtingidas = activeMetas.filter(m => {
    const tipo = TIPO_OPTIONS[m.area].find(o => o.value === m.tipo)!
    const atingido = m.area === 'financeiro' ? computeAtingidoFinanceiro(m) : computeAtingidoComercial(m)
    return tipo.direction === 'min' ? atingido >= m.valor_alvo : atingido <= m.valor_alvo
  })

  if (loading || loadingFinance) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="h-4 w-4 text-amber-500" />
          <h3 className="font-semibold text-sm">Resumo geral</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {activeMetas.length === 0 ? 'Nenhuma meta em andamento no momento.' : (
            <><strong className="text-foreground">{activeAtingidas.length} de {activeMetas.length}</strong> metas em andamento já atingidas — {metasFinanceiro.length} financeira(s), {metasComercial.length} comercial(is) no total cadastradas.</>
          )}
        </p>
      </Card>

      <MetasSection area="financeiro" icon={DollarSign} metas={metasFinanceiro} profiles={profiles} computeAtingido={computeAtingidoFinanceiro} onChanged={load} />
      <MetasSection area="comercial" icon={Target} metas={metasComercial} profiles={profiles} computeAtingido={computeAtingidoComercial} onChanged={load} />
    </div>
  )
}
