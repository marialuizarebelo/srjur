import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  DollarSign, TrendingUp, Users, Scale, ClipboardList, Bell,
  BarChart3, Target, Calendar, AlertTriangle, Plus, Pencil, Trash2,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip as RTooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts'
import { fmtBRL, fmtDate } from '@/lib/format'
import { Sensitive } from '@/components/Sensitive'
import { getAdminProfiles, type ProfileOption } from '@/components/ResponsibleSelect'
import { toast } from 'sonner'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
// Paleta mais "estratégica": tons distintos e saturados o bastante pra
// diferenciar fatias pequenas, sem repetir matiz entre categorias vizinhas.
const CATEGORY_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#14B8A6', '#EF4444', '#6366F1', '#84CC16', '#F97316']

function monthsBack(n: number) {
  const out: { start: string; end: string; label: string }[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
    out.push({ start, end, label: `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` })
  }
  return out
}

/* ---------- Period picker (compartilhado entre abas) ---------- */
type PeriodKey = 'mes_atual' | '3m' | '6m' | 'ano_atual' | 'personalizado'
const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'mes_atual', label: 'Este mês' },
  { key: '3m', label: 'Últimos 3 meses' },
  { key: '6m', label: 'Últimos 6 meses' },
  { key: 'ano_atual', label: 'Este ano' },
  { key: 'personalizado', label: 'Personalizado' },
]

function resolvePeriod(key: PeriodKey, customStart: string, customEnd: string) {
  const now = new Date()
  if (key === 'mes_atual') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
    }
  }
  if (key === '3m') {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
    }
  }
  if (key === '6m') {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
    }
  }
  if (key === 'ano_atual') {
    return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` }
  }
  return { start: customStart || now.toISOString().slice(0, 10), end: customEnd || now.toISOString().slice(0, 10) }
}

function usePeriod() {
  const [periodKey, setPeriodKey] = useState<PeriodKey>('mes_atual')
  const [customStart, setCustomStart] = useState(() => new Date().toISOString().slice(0, 10))
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10))
  const range = useMemo(() => resolvePeriod(periodKey, customStart, customEnd), [periodKey, customStart, customEnd])
  return { periodKey, setPeriodKey, customStart, setCustomStart, customEnd, setCustomEnd, range }
}

function PeriodPicker({ p }: { p: ReturnType<typeof usePeriod> }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PERIOD_OPTIONS.map(o => (
        <button key={o.key} onClick={() => p.setPeriodKey(o.key)}
          className={`h-7 px-3 rounded-full text-xs font-medium border transition-all ${p.periodKey === o.key ? 'bg-foreground text-background border-foreground' : 'border-border/60 text-muted-foreground hover:border-border'}`}>
          {o.label}
        </button>
      ))}
      {p.periodKey === 'personalizado' && (
        <div className="flex items-center gap-1.5 ml-1">
          <Input type="date" value={p.customStart} onChange={e => p.setCustomStart(e.target.value)} className="h-7 text-xs w-36" />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" value={p.customEnd} onChange={e => p.setCustomEnd(e.target.value)} className="h-7 text-xs w-36" />
        </div>
      )}
    </div>
  )
}

/* ---------- KPI / Chart cards ---------- */
function KpiCard({ title, value, icon: Icon, color, sensitive, onClick }: {
  title: string; value: string | number; icon: React.ElementType; color: string; sensitive?: boolean; onClick?: () => void
}) {
  return (
    <Card className={`p-4 relative overflow-hidden border-l-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      style={{ borderLeftColor: color, backgroundColor: color + '0a' }} onClick={onClick}>
      <div className="flex items-center gap-2 mb-2">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '1a' }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <p className="text-2xl font-bold text-foreground">
        {sensitive ? <Sensitive>{value}</Sensitive> : value}
      </p>
    </Card>
  )
}

function ChartCard({ title, icon: Icon, children, className, extra }: {
  title: string; icon: React.ElementType; children: React.ReactNode; className?: string; extra?: React.ReactNode
}) {
  return (
    <Card className={`p-5 ${className ?? ''}`}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />{title}
        </h3>
        {extra}
      </div>
      {children}
    </Card>
  )
}

/* ---------- Legenda clicável (substitui rótulos colados na pizza) ---------- */
function PieLegendList({ data, colors, formatValue, onSelect }: {
  data: { name: string; value: number }[]; colors: string[]; formatValue: (v: number) => string
  onSelect?: (name: string) => void
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="space-y-1">
      {data.map((d, i) => (
        <button key={d.name} type="button" onClick={() => onSelect?.(d.name)}
          className="w-full flex items-center justify-between gap-2 text-xs rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors text-left">
          <span className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="truncate">{d.name}</span>
          </span>
          <span className="shrink-0 font-medium">
            {formatValue(d.value)} <span className="text-muted-foreground">({total > 0 ? ((d.value / total) * 100).toFixed(0) : 0}%)</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function DonutWithLegend({ data, formatValue, onSelect }: {
  data: { name: string; value: number }[]; formatValue: (v: number) => string; onSelect?: (name: string) => void
}) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-14">Sem dados neste período</p>
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value"
              onClick={(_, i) => onSelect?.(data[i].name)} cursor={onSelect ? 'pointer' : undefined}>
              {data.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
            </Pie>
            <RTooltip formatter={(v) => formatValue(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <PieLegendList data={data} colors={CATEGORY_COLORS} formatValue={formatValue} onSelect={onSelect} />
    </div>
  )
}

/* ---------- Popup de detalhamento ---------- */
interface DetailRow { id: string; label: string; sublabel?: string; value?: string }
function DetailDialog({ open, onClose, title, rows }: { open: boolean; onClose: () => void; title: string; rows: DetailRow[] }) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 pt-1">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro neste período</p>
          ) : rows.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.label}</p>
                {r.sublabel && <p className="text-xs text-muted-foreground">{r.sublabel}</p>}
              </div>
              {r.value && <span className="shrink-0 font-semibold">{r.value}</span>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
function useDetail() {
  const [state, setState] = useState<{ open: boolean; title: string; rows: DetailRow[] }>({ open: false, title: '', rows: [] })
  return {
    ...state,
    show: (title: string, rows: DetailRow[]) => setState({ open: true, title, rows }),
    close: () => setState(s => ({ ...s, open: false })),
  }
}

/* ---------- Pontos de atenção ---------- */
interface Attention { text: string; level: 'info' | 'warn' | 'danger' }
function AttentionPanel({ items }: { items: Attention[] }) {
  if (items.length === 0) return null
  const style: Record<Attention['level'], string> = {
    danger: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400',
    warn: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400',
    info: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400',
  }
  return (
    <Card className="p-4 space-y-2">
      <h3 className="font-semibold text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Pontos de atenção</h3>
      <div className="space-y-1.5">
        {items.map((a, i) => <div key={i} className={`text-xs rounded-lg px-3 py-2 border ${style[a.level]}`}>{a.text}</div>)}
      </div>
    </Card>
  )
}

/* ---------- Metas ---------- */
interface Meta {
  id: string; area: 'financeiro' | 'comercial'; tipo: string; label: string; valor_alvo: number
  periodo: 'mensal' | 'semestral' | 'anual'; ano: number; mes: number | null; semestre: number | null
}
type TipoMeta = { value: string; label: string; unit: 'BRL' | 'number' | 'percent'; direction: 'min' | 'max' }
const TIPO_OPTIONS: Record<'financeiro' | 'comercial', TipoMeta[]> = {
  financeiro: [
    { value: 'receita_minima', label: 'Meta de receita', unit: 'BRL', direction: 'min' },
    { value: 'despesa_maxima', label: 'Teto de despesa', unit: 'BRL', direction: 'max' },
    { value: 'saldo_minimo', label: 'Saldo mínimo', unit: 'BRL', direction: 'min' },
  ],
  comercial: [
    { value: 'novos_leads', label: 'Novos leads', unit: 'number', direction: 'min' },
    { value: 'novos_clientes', label: 'Novos clientes', unit: 'number', direction: 'min' },
    { value: 'taxa_conversao', label: 'Taxa de conversão', unit: 'percent', direction: 'min' },
  ],
}
const PERIODO_LABELS: Record<Meta['periodo'], string> = { mensal: 'Mensal', semestral: 'Semestral', anual: 'Anual' }

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

function MetaFormDialog({ open, onClose, area, editing, onSaved }: {
  open: boolean; onClose: () => void; area: 'financeiro' | 'comercial'; editing: Meta | null; onSaved: () => void
}) {
  const opts = TIPO_OPTIONS[area]
  const [form, setForm] = useState({
    label: '', tipo: opts[0].value, valor_alvo: '', periodo: 'mensal' as Meta['periodo'],
    ano: new Date().getFullYear(), mes: new Date().getMonth() + 1, semestre: 1,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editing) {
      setForm({
        label: editing.label, tipo: editing.tipo, valor_alvo: String(editing.valor_alvo),
        periodo: editing.periodo, ano: editing.ano, mes: editing.mes ?? new Date().getMonth() + 1, semestre: editing.semestre ?? 1,
      })
    } else {
      setForm({ label: '', tipo: opts[0].value, valor_alvo: '', periodo: 'mensal', ano: new Date().getFullYear(), mes: new Date().getMonth() + 1, semestre: 1 })
    }
  }, [editing, open])

  async function save() {
    if (!form.label.trim() || !form.valor_alvo) { toast.error('Preencha nome e valor da meta'); return }
    setSaving(true)
    const payload = {
      area, tipo: form.tipo, label: form.label.trim(), valor_alvo: Number(form.valor_alvo),
      periodo: form.periodo, ano: form.ano,
      mes: form.periodo === 'mensal' ? form.mes : null,
      semestre: form.periodo === 'semestral' ? form.semestre : null,
    }
    const { error } = editing
      ? await supabase.from('metas').update(payload).eq('id', editing.id)
      : await supabase.from('metas').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro ao salvar meta: ' + error.message); return }
    toast.success(editing ? 'Meta atualizada!' : 'Meta criada!')
    onSaved()
    onClose()
  }

  const selectedTipo = opts.find(o => o.value === form.tipo)

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Nova'} meta</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label>Nome da meta</Label>
            <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex: Meta de receita do trimestre" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => v && setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger className="h-10"><SelectValue>{opts.find(o => o.value === form.tipo)?.label}</SelectValue></SelectTrigger>
                <SelectContent>{opts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor alvo{selectedTipo?.unit === 'percent' ? ' (%)' : ''}</Label>
              <Input type="number" value={form.valor_alvo} onChange={e => setForm(f => ({ ...f, valor_alvo: e.target.value }))}
                placeholder={selectedTipo?.unit === 'BRL' ? 'Ex: 15000' : 'Ex: 10'} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Período</Label>
              <Select value={form.periodo} onValueChange={v => setForm(f => ({ ...f, periodo: v as Meta['periodo'] }))}>
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
                <Select value={String(form.mes)} onValueChange={v => setForm(f => ({ ...f, mes: Number(v) }))}>
                  <SelectTrigger className="h-10"><SelectValue>{MONTHS[form.mes - 1]}</SelectValue></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {form.periodo === 'semestral' && (
              <div className="space-y-1.5">
                <Label>Semestre</Label>
                <Select value={String(form.semestre)} onValueChange={v => setForm(f => ({ ...f, semestre: Number(v) }))}>
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
        </div>
        <DialogFooter className="pt-3">
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar meta'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MetasPanel({ area, computeAtingido }: {
  area: 'financeiro' | 'comercial'; computeAtingido: (m: Meta) => number
}) {
  const [metas, setMetas] = useState<Meta[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Meta | null>(null)

  async function load() {
    const { data } = await supabase.from('metas').select('*').eq('area', area).order('created_at', { ascending: false })
    setMetas((data as Meta[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function remove(id: string) {
    if (!confirm('Excluir esta meta?')) return
    await supabase.from('metas').delete().eq('id', id)
    load()
  }

  return (
    <ChartCard title="Metas" icon={Target} extra={
      <Button size="sm" variant="outline" onClick={() => { setEditing(null); setFormOpen(true) }}>
        <Plus className="h-3.5 w-3.5 mr-1" />Nova meta
      </Button>
    }>
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>
      ) : metas.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma meta cadastrada ainda</p>
      ) : (
        <div className="space-y-3">
          {metas.map(m => {
            const tipo = TIPO_OPTIONS[area].find(o => o.value === m.tipo)!
            const atingido = computeAtingido(m)
            const pct = Math.min(100, (atingido / m.valor_alvo) * 100)
            const over = atingido > m.valor_alvo
            const barColor = tipo.direction === 'max'
              ? (over ? '#ef4444' : '#22c55e')
              : (pct >= 100 ? '#22c55e' : pct >= 60 ? '#F59E0B' : '#ef4444')
            return (
              <div key={m.id} className="space-y-1.5 group">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.label}</p>
                    <p className="text-[11px] text-muted-foreground">{tipo.label} · {metaPeriodLabel(m)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs font-semibold" style={{ color: barColor }}>
                      {formatByUnit(atingido, tipo.unit)} / {formatByUnit(m.valor_alvo, tipo.unit)}
                    </span>
                    <button onClick={() => { setEditing(m); setFormOpen(true) }} className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button onClick={() => remove(m.id)} className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
      <MetaFormDialog open={formOpen} onClose={() => setFormOpen(false)} area={area} editing={editing} onSaved={load} />
    </ChartCard>
  )
}

/* ---------- Financeiro ---------- */
interface FinanceRow {
  type: 'receita' | 'despesa'
  category: string | null
  description: string
  value: number
  date: string
  due_date: string | null
  paid: boolean
  impacts_cash: boolean
}

function FinanceiroTab() {
  const [rows, setRows] = useState<FinanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [projectionMonths, setProjectionMonths] = useState(3)
  const period = usePeriod()
  const detail = useDetail()

  useEffect(() => {
    supabase.from('finance').select('type, category, description, value, date, due_date, paid, impacts_cash').then(({ data }) => {
      setRows((data as FinanceRow[]) ?? [])
      setLoading(false)
    })
  }, [])

  const trendMonths = useMemo(() => monthsBack(12), [])
  const evolution = useMemo(() => trendMonths.map(m => {
    const mRows = rows.filter(r => r.date >= m.start && r.date <= m.end)
    return {
      month: m.label,
      receitas: mRows.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0),
      despesas: mRows.filter(r => r.type === 'despesa' && r.impacts_cash !== false).reduce((s, r) => s + Number(r.value), 0),
    }
  }), [rows, trendMonths])

  const saldoTotal = useMemo(() => rows.reduce((s, r) => {
    if (!r.paid || r.impacts_cash === false) return s
    return s + (r.type === 'receita' ? Number(r.value) : -Number(r.value))
  }, 0), [rows])

  const rowsNoPeriodo = useMemo(() => rows.filter(r => r.date >= period.range.start && r.date <= period.range.end), [rows, period.range])
  const receitasPeriodo = useMemo(() => rowsNoPeriodo.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0), [rowsNoPeriodo])
  const despesasPeriodo = useMemo(() => rowsNoPeriodo.filter(r => r.type === 'despesa' && r.impacts_cash !== false).reduce((s, r) => s + Number(r.value), 0), [rowsNoPeriodo])

  function categoryBreakdown(type: 'receita' | 'despesa') {
    const map = new Map<string, number>()
    rowsNoPeriodo.filter(r => r.type === type && (type === 'receita' || r.impacts_cash !== false)).forEach(r => {
      const cat = r.category ?? 'Outros'
      map.set(cat, (map.get(cat) ?? 0) + Number(r.value))
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }
  const receitaCategoryData = useMemo(() => categoryBreakdown('receita'), [rowsNoPeriodo])
  const despesaCategoryData = useMemo(() => categoryBreakdown('despesa'), [rowsNoPeriodo])

  function openCategoryDetail(type: 'receita' | 'despesa', category: string) {
    const list = rowsNoPeriodo.filter(r => r.type === type && r.category === category)
    detail.show(`${category} — ${type === 'receita' ? 'Receitas' : 'Despesas'}`,
      list.map((r, i) => ({ id: String(i), label: r.description, sublabel: fmtDate(r.date), value: fmtBRL(Number(r.value)) })))
  }

  const projection = useMemo(() => {
    const result: { month: string; aReceber: number; aPagar: number; saldo: number }[] = []
    let saldoAcumulado = saldoTotal
    const today = new Date()
    for (let i = 0; i <= projectionMonths; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
      const start = i === 0 ? today.toISOString().slice(0, 10) : new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
      const monthRows = rows.filter(r => r.due_date && r.due_date >= start && r.due_date <= end && !r.paid && r.impacts_cash !== false)
      const rec = monthRows.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0)
      const desp = monthRows.filter(r => r.type === 'despesa').reduce((s, r) => s + Number(r.value), 0)
      saldoAcumulado += rec - desp
      result.push({ month: `${MONTHS[d.getMonth()]}/${d.getFullYear() % 100}`, aReceber: rec, aPagar: desp, saldo: saldoAcumulado })
    }
    return result
  }, [rows, projectionMonths, saldoTotal])

  const attention = useMemo(() => {
    const items: Attention[] = []
    if (saldoTotal < 0) items.push({ text: 'Saldo total está negativo.', level: 'danger' })
    if (receitasPeriodo > 0 && despesasPeriodo > receitasPeriodo) items.push({ text: 'Despesas superaram receitas no período selecionado.', level: 'warn' })
    const totalDesp = despesaCategoryData.reduce((s, d) => s + d.value, 0)
    if (despesaCategoryData.length > 0 && totalDesp > 0) {
      const maior = despesaCategoryData[0]
      if (maior.value / totalDesp > 0.4) items.push({ text: `"${maior.name}" concentra ${((maior.value / totalDesp) * 100).toFixed(0)}% das despesas do período.`, level: 'info' })
    }
    return items
  }, [saldoTotal, receitasPeriodo, despesasPeriodo, despesaCategoryData])

  function computeMetaAtingido(m: Meta): number {
    const { start, end } = metaPeriodRange(m)
    if (m.tipo === 'saldo_minimo') return saldoTotal
    const inRange = rows.filter(r => r.date >= start && r.date <= end)
    if (m.tipo === 'receita_minima') return inRange.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0)
    if (m.tipo === 'despesa_maxima') return inRange.filter(r => r.type === 'despesa' && r.impacts_cash !== false).reduce((s, r) => s + Number(r.value), 0)
    return 0
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-4">
      <PeriodPicker p={period} />

      <AttentionPanel items={attention} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard title="Saldo total" value={fmtBRL(saldoTotal)} icon={DollarSign} color="#8B5CF6" sensitive />
        <KpiCard title="Receitas (período)" value={fmtBRL(receitasPeriodo)} icon={TrendingUp} color="#22c55e" sensitive />
        <KpiCard title="Despesas (período)" value={fmtBRL(despesasPeriodo)} icon={TrendingUp} color="#ef4444" sensitive />
      </div>

      <MetasPanel area="financeiro" computeAtingido={computeMetaAtingido} />

      <ChartCard title="Evolução (12 meses)" icon={BarChart3}>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={evolution}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <RTooltip formatter={(v) => fmtBRL(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="receitas" name="Receitas" stroke="#22c55e" fill="#22c55e20" strokeWidth={2} />
              <Area type="monotone" dataKey="despesas" name="Despesas" stroke="#ef4444" fill="#ef444420" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Receitas por categoria" icon={DollarSign}>
          <DonutWithLegend data={receitaCategoryData} formatValue={fmtBRL} onSelect={name => openCategoryDetail('receita', name)} />
        </ChartCard>
        <ChartCard title="Despesas por categoria" icon={DollarSign}>
          <DonutWithLegend data={despesaCategoryData} formatValue={fmtBRL} onSelect={name => openCategoryDetail('despesa', name)} />
        </ChartCard>
      </div>

      <ChartCard title="Projeção futura" icon={Calendar}>
        <div className="flex items-center gap-1 mb-3">
          {[3, 6, 12].map(n => (
            <Button key={n} variant={projectionMonths === n ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setProjectionMonths(n)}>
              {n} meses
            </Button>
          ))}
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={projection}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <RTooltip formatter={(v) => fmtBRL(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="aReceber" name="A Receber" fill="#86efac" radius={[4, 4, 0, 0]} />
              <Bar dataKey="aPagar" name="A Pagar" fill="#fca5a5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}

/* ---------- Comercial ---------- */
interface Lead { name: string; status: string; potential_value: number | null; created_at: string; signed_at: string | null; client_id: string | null; next_followup: string | null }
interface ClientRow { name: string; status: string; created_at: string }
interface Stage { label: string; value: string; position: number }

function ComercialTab() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const period = usePeriod()
  const detail = useDetail()

  useEffect(() => {
    Promise.all([
      supabase.from('leads').select('name, status, potential_value, created_at, signed_at, client_id, next_followup'),
      supabase.from('clients').select('name, status, created_at'),
      supabase.from('pipeline_stages').select('label, value, position').order('position'),
    ]).then(([l, c, s]) => {
      setLeads((l.data as Lead[]) ?? [])
      setClients((c.data as ClientRow[]) ?? [])
      setStages((s.data as Stage[]) ?? [])
      setLoading(false)
    })
  }, [])

  const trendMonths = useMemo(() => monthsBack(12), [])

  const leadsAtivos = leads.filter(l => l.status !== 'perdido' && l.status !== 'convertido' && !l.client_id).length
  const leadsNoPeriodo = useMemo(() => leads.filter(l => l.created_at >= period.range.start && l.created_at <= period.range.end + 'T23:59:59'), [leads, period.range])
  const convertidosPeriodo = leadsNoPeriodo.filter(l => l.status === 'convertido' || l.client_id).length
  const taxaConversao = leadsNoPeriodo.length > 0 ? (convertidosPeriodo / leadsNoPeriodo.length) * 100 : 0
  const clientesNoPeriodo = useMemo(() => clients.filter(c => c.created_at >= period.range.start && c.created_at <= period.range.end + 'T23:59:59'), [clients, period.range])

  const funil = useMemo(() => stages.map(s => ({
    stage: s.label, value: s.value,
    total: leads.filter(l => l.status === s.value).length,
  })).filter(s => s.total > 0), [stages, leads])

  function openStageDetail(stageValue: string, stageLabel: string) {
    const list = leads.filter(l => l.status === stageValue)
    detail.show(`Leads — ${stageLabel}`, list.map((l, i) => ({
      id: String(i), label: l.name, sublabel: fmtDate(l.created_at),
      value: l.potential_value ? fmtBRL(Number(l.potential_value)) : undefined,
    })))
  }

  const novosLeadsPorMes = useMemo(() => trendMonths.map(m => ({
    month: m.label,
    leads: leads.filter(l => l.created_at >= m.start && l.created_at <= m.end + 'T23:59:59').length,
  })), [leads, trendMonths])

  const novosClientesPorMes = useMemo(() => trendMonths.map(m => ({
    month: m.label,
    clientes: clients.filter(c => c.created_at >= m.start && c.created_at <= m.end + 'T23:59:59').length,
  })), [clients, trendMonths])

  function openMonthDetail(kind: 'leads' | 'clientes', m: { start: string; end: string; label: string }) {
    if (kind === 'leads') {
      const list = leads.filter(l => l.created_at >= m.start && l.created_at <= m.end + 'T23:59:59')
      detail.show(`Novos leads — ${m.label}`, list.map((l, i) => ({ id: String(i), label: l.name, sublabel: fmtDate(l.created_at) })))
    } else {
      const list = clients.filter(c => c.created_at >= m.start && c.created_at <= m.end + 'T23:59:59')
      detail.show(`Novos clientes — ${m.label}`, list.map((c, i) => ({ id: String(i), label: c.name, sublabel: fmtDate(c.created_at) })))
    }
  }

  const hoje = new Date().toISOString().slice(0, 10)
  const attention = useMemo(() => {
    const items: Attention[] = []
    const semFollowup = leads.filter(l => l.status !== 'perdido' && l.status !== 'convertido' && !l.client_id && (!l.next_followup || l.next_followup < hoje)).length
    if (semFollowup > 0) items.push({ text: `${semFollowup} lead(s) sem follow-up agendado ou com follow-up atrasado.`, level: 'warn' })
    return items
  }, [leads, hoje])

  function computeMetaAtingido(m: Meta): number {
    const { start, end } = metaPeriodRange(m)
    const inRange = leads.filter(l => l.created_at >= start && l.created_at <= end + 'T23:59:59')
    if (m.tipo === 'novos_leads') return inRange.length
    if (m.tipo === 'novos_clientes') return clients.filter(c => c.created_at >= start && c.created_at <= end + 'T23:59:59').length
    if (m.tipo === 'taxa_conversao') {
      const conv = inRange.filter(l => l.status === 'convertido' || l.client_id).length
      return inRange.length > 0 ? (conv / inRange.length) * 100 : 0
    }
    return 0
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-4">
      <PeriodPicker p={period} />

      <AttentionPanel items={attention} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard title="Leads ativos" value={leadsAtivos} icon={Target} color="#3B82F6" />
        <KpiCard title="Taxa de conversão (período)" value={`${taxaConversao.toFixed(0)}%`} icon={TrendingUp} color="#22c55e" />
        <KpiCard title="Novos clientes (período)" value={clientesNoPeriodo.length} icon={Users} color="#8B5CF6" />
      </div>

      <MetasPanel area="comercial" computeAtingido={computeMetaAtingido} />

      <ChartCard title="Funil de leads" icon={Target}>
        <div className="h-64">
          {funil.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-20">Sem leads cadastrados</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funil} layout="vertical" margin={{ left: 24 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="stage" tick={{ fontSize: 10 }} width={140} />
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="total" name="Leads" fill="#3B82F6" radius={[0, 4, 4, 0]} cursor="pointer"
                  onClick={(d: any) => openStageDetail(d.value, d.stage)} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Novos leads por mês" icon={Target}>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={novosLeadsPorMes}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="leads" name="Leads" fill="#3B82F6" radius={[4, 4, 0, 0]} cursor="pointer"
                  onClick={(_: any, i: number) => openMonthDetail('leads', trendMonths[i])} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Novos clientes por mês" icon={Users}>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={novosClientesPorMes}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="clientes" name="Clientes" fill="#8B5CF6" radius={[4, 4, 0, 0]} cursor="pointer"
                  onClick={(_: any, i: number) => openMonthDetail('clientes', trendMonths[i])} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}

/* ---------- Produtividade ---------- */
interface Task { title: string; status: string; due_date: string | null; responsible_ids: string[] | null }
interface Deadline { title: string; status: string; due_date: string; responsible_ids: string[] | null }
interface ProcessRow { title: string; status: string }

const PROCESS_STATUS_LABELS: Record<string, string> = {
  em_andamento: 'Em andamento', concluido: 'Concluído', arquivado: 'Arquivado', suspenso: 'Suspenso',
}

function ProdutividadeTab() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [processes, setProcesses] = useState<ProcessRow[]>([])
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [loading, setLoading] = useState(true)
  const detail = useDetail()

  useEffect(() => {
    Promise.all([
      supabase.from('tasks').select('title, status, due_date, responsible_ids'),
      supabase.from('deadlines').select('title, status, due_date, responsible_ids'),
      supabase.from('processes').select('title, status'),
      getAdminProfiles(),
    ]).then(([t, d, p, profs]) => {
      setTasks((t.data as Task[]) ?? [])
      setDeadlines((d.data as Deadline[]) ?? [])
      setProcesses((p.data as ProcessRow[]) ?? [])
      setProfiles(profs)
      setLoading(false)
    })
  }, [])

  const todayStr = new Date().toISOString().slice(0, 10)
  const tarefasPendentes = tasks.filter(t => t.status === 'pendente').length
  const tarefasAtrasadas = tasks.filter(t => t.status === 'pendente' && t.due_date && t.due_date < todayStr).length
  const prazosPendentes = deadlines.filter(d => d.status === 'pendente').length
  const prazosAtrasados = deadlines.filter(d => d.status === 'pendente' && d.due_date < todayStr).length

  const trendMonths = useMemo(() => monthsBack(12), [])
  const tarefasPorMes = useMemo(() => trendMonths.map(m => {
    const mTasks = tasks.filter(t => t.due_date && t.due_date >= m.start && t.due_date <= m.end)
    return {
      month: m.label,
      concluidas: mTasks.filter(t => t.status === 'concluida').length,
      atrasadas: mTasks.filter(t => t.status === 'pendente' && t.due_date! < todayStr).length,
    }
  }), [tasks, trendMonths])

  const prazosStatus = useMemo(() => ([
    { name: 'Cumpridos', value: deadlines.filter(d => d.status === 'cumprido').length },
    { name: 'Perdidos', value: deadlines.filter(d => d.status === 'perdido').length },
    { name: 'Pendentes', value: deadlines.filter(d => d.status === 'pendente').length },
  ].filter(s => s.value > 0)), [deadlines])

  function openPrazoStatusDetail(name: string) {
    const statusKey = name === 'Cumpridos' ? 'cumprido' : name === 'Perdidos' ? 'perdido' : 'pendente'
    const list = deadlines.filter(d => d.status === statusKey)
    detail.show(`Prazos — ${name}`, list.map((d, i) => ({ id: String(i), label: d.title, sublabel: fmtDate(d.due_date) })))
  }

  const processosPorStatus = useMemo(() => {
    const map = new Map<string, number>()
    processes.forEach(p => map.set(p.status, (map.get(p.status) ?? 0) + 1))
    return Array.from(map.entries()).map(([status, total]) => ({ status: PROCESS_STATUS_LABELS[status] ?? status, statusKey: status, total }))
  }, [processes])

  function openProcessStatusDetail(statusKey: string, label: string) {
    const list = processes.filter(p => p.status === statusKey)
    detail.show(`Processos — ${label}`, list.map((p, i) => ({ id: String(i), label: p.title })))
  }

  const cargaPorResponsavel = useMemo(() => {
    const map = new Map<string, { total: number; itens: DetailRow[] }>()
    const openTasks = tasks.filter(t => t.status === 'pendente')
    const openDeadlines = deadlines.filter(d => d.status === 'pendente')
    for (const t of openTasks) for (const id of t.responsible_ids ?? []) {
      const cur = map.get(id) ?? { total: 0, itens: [] }
      cur.total++; cur.itens.push({ id: `t${cur.itens.length}`, label: t.title, sublabel: t.due_date ? `Tarefa · ${fmtDate(t.due_date)}` : 'Tarefa' })
      map.set(id, cur)
    }
    for (const d of openDeadlines) for (const id of d.responsible_ids ?? []) {
      const cur = map.get(id) ?? { total: 0, itens: [] }
      cur.total++; cur.itens.push({ id: `d${cur.itens.length}`, label: d.title, sublabel: `Prazo · ${fmtDate(d.due_date)}` })
      map.set(id, cur)
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, name: profiles.find(p => p.id === id)?.display_name ?? 'Sem nome', total: v.total, itens: v.itens }))
      .sort((a, b) => b.total - a.total)
  }, [tasks, deadlines, profiles])

  function openResponsavelDetail(name: string, itens: DetailRow[]) {
    detail.show(`Pendências — ${name}`, itens)
  }

  const attention = useMemo(() => {
    const items: Attention[] = []
    if (prazosAtrasados > 0) items.push({ text: `${prazosAtrasados} prazo(s) vencido(s) ainda pendente(s).`, level: 'danger' })
    if (tarefasAtrasadas > 0) items.push({ text: `${tarefasAtrasadas} tarefa(s) atrasada(s).`, level: 'warn' })
    if (cargaPorResponsavel.length > 1) {
      const media = cargaPorResponsavel.reduce((s, r) => s + r.total, 0) / cargaPorResponsavel.length
      const sobrecarregado = cargaPorResponsavel[0]
      if (sobrecarregado.total > media * 1.8) items.push({ text: `${sobrecarregado.name} concentra bem mais pendências que a média da equipe (${sobrecarregado.total} vs ${media.toFixed(0)}).`, level: 'info' })
    }
    return items
  }, [prazosAtrasados, tarefasAtrasadas, cargaPorResponsavel])

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-4">
      <AttentionPanel items={attention} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Tarefas pendentes" value={tarefasPendentes} icon={ClipboardList} color="#3B82F6" />
        <KpiCard title="Tarefas atrasadas" value={tarefasAtrasadas} icon={ClipboardList} color="#ef4444" />
        <KpiCard title="Prazos pendentes" value={prazosPendentes} icon={Bell} color="#F59E0B" />
        <KpiCard title="Prazos atrasados" value={prazosAtrasados} icon={Bell} color="#ef4444" />
      </div>

      <ChartCard title="Tarefas concluídas x atrasadas por mês" icon={ClipboardList}>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tarefasPorMes}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="concluidas" name="Concluídas" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="atrasadas" name="Atrasadas" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Prazos: cumpridos x perdidos" icon={Bell}>
          {prazosStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-14">Sem dados</p>
          ) : (
            <DonutWithLegend data={prazosStatus} formatValue={v => String(v)} onSelect={openPrazoStatusDetail} />
          )}
        </ChartCard>
        <ChartCard title="Processos por status" icon={Scale}>
          <div className="h-52">
            {processosPorStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-14">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={processosPorStatus}>
                  <XAxis dataKey="status" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="total" name="Processos" fill="#6366F1" radius={[4, 4, 0, 0]} cursor="pointer"
                    onClick={(d: any) => openProcessStatusDetail(d.statusKey, d.status)} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Carga por responsável (pendências abertas)" icon={Users}>
        <div className="h-56">
          {cargaPorResponsavel.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">Sem pendências atribuídas</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cargaPorResponsavel} layout="vertical" margin={{ left: 24 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="total" name="Pendências" fill="#14B8A6" radius={[0, 4, 4, 0]} cursor="pointer"
                  onClick={(d: any) => openResponsavelDetail(d.name, d.itens)} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      <DetailDialog open={detail.open} onClose={detail.close} title={detail.title} rows={detail.rows} />
    </div>
  )
}

/* ---------- Métricas (main) ---------- */
const TABS = [
  { key: 'financeiro', label: 'Financeiro', icon: DollarSign },
  { key: 'comercial', label: 'Comercial', icon: Target },
  { key: 'produtividade', label: 'Produtividade', icon: ClipboardList },
] as const

type TabKey = typeof TABS[number]['key']

export default function Metricas() {
  const [tab, setTab] = useState<TabKey>('financeiro')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Métricas</h1>
        <p className="text-sm text-muted-foreground">Indicadores comerciais, financeiros e de produtividade do escritório</p>
      </div>

      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 flex-wrap w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'financeiro' && <FinanceiroTab />}
      {tab === 'comercial' && <ComercialTab />}
      {tab === 'produtividade' && <ProdutividadeTab />}
    </div>
  )
}
